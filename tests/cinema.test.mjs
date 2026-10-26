import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rackScenePlan,sceneFrame,sceneDuration,REMOVE_MS,PHOTO_ZOOM_MS,PHOTO_SCENE_MS,producerHeading,sceneCamera,sceneBounds,bayBounds} from '../src/rack-scene.ts';
const bottle=(depth,extra={})=>({id:'exact-'+depth,status:'In Cellar',location_type:'RACK',row_number:5,column_number:3,depth_number:depth,wine:{producer:'Same producer',name:'Identical wine',vintage:2021},...extra});
test('all front/middle/back occupancy combinations animate only real blockers, in order, without writes',()=>{
 for(let selected=1;selected<=3;selected++)for(let mask=0;mask<8;mask++){
  if(!(mask&(1<<(selected-1))))continue;
  const inventory=Object.freeze([1,2,3].filter(d=>mask&(1<<(d-1))).map(d=>Object.freeze(bottle(d))));const before=JSON.stringify(inventory),plan=rackScenePlan('exact-'+selected,inventory);
  assert.equal(plan.depth,selected);assert.deepEqual(plan.blockers.map(b=>b.depth_number),[1,2,3].filter(d=>d<selected&&(mask&(1<<(d-1)))));
  assert.equal(plan.slots[selected-1].id,'exact-'+selected);assert.equal(plan.slots.filter(Boolean).length,inventory.length);
  const final=sceneFrame(plan,sceneDuration(plan.blockers.length));assert.equal(final.camera,1);assert.equal(final.done,true);assert.ok(final.staged.every(s=>s.pull===1&&s.aside===1&&s.done));
  if(plan.blockers.length===2){const during=sceneFrame(plan,650+REMOVE_MS);assert.equal(during.staged[0].done,true);assert.equal(during.staged[1].pull,0);assert.equal(during.camera,0);}
  assert.equal(JSON.stringify(inventory),before);
 }
});
test('scene uses stable IDs, exact row/column, excludes inactive bottles and refuses ambiguous slots or BOTTOM depths',()=>{
 const selected=bottle(3),others=[bottle(1,{status:'Drank'}),bottle(2,{column_number:4}),bottle(1,{row_number:4}),bottle(2,{location_type:'BOTTOM'})];
 const plan=rackScenePlan(selected.id,[selected,...others]);assert.deepEqual(plan.blockers,[]);assert.deepEqual(plan.slots.map(b=>b?.id??null),[null,null,selected.id]);
 assert.equal(rackScenePlan(selected.id,[selected,bottle(3,{id:'duplicate'})]),null);assert.equal(rackScenePlan('missing',[selected]),null);assert.equal(rackScenePlan(selected.id,[{...selected,status:'Gifted'}]),null);assert.equal(rackScenePlan('bottom',[bottle(null,{id:'bottom',location_type:'BOTTOM'})]),null);
});
test('pull clears rack before sideways staging and camera starts only after all blockers',()=>{
 const plan=rackScenePlan('exact-3',[1,2,3].map(d=>bottle(d)));
 const early=sceneFrame(plan,900);assert.ok(early.staged[0].pull>0);assert.equal(early.staged[0].aside,0);assert.equal(early.staged[1].pull,0);assert.equal(early.camera,0);
 assert.equal(sceneFrame(plan,-1).camera,0);assert.equal(sceneFrame(plan,Infinity).done,true);
 assert.equal(PHOTO_ZOOM_MS,1500*1.3);assert.equal(PHOTO_SCENE_MS,3300);
});
test('perspective camera fits rack and full staging bounds at tablet, phone and desktop aspects throughout pan',()=>{
 for(const [w,h] of [[820,700],[650,600],[520,530],[540,280],[360,210],[1100,750],[850,250]])for(const staging of [true,false])for(let t=0;t<=1;t+=.1){const pose=sceneCamera(w/h,t,staging),bounds=staging?sceneBounds:bayBounds;for(const x of bounds.x)for(const y of bounds.y)for(const z of bounds.z){const p=[x-pose.aim[0],y-pose.aim[1],z-pose.aim[2]],dot=v=>p.reduce((s,n,i)=>s+n*v[i],0),distance=pose.distance-dot(pose.direction);assert.ok(distance>.1);assert.ok(Math.abs(dot(pose.right)/(distance*pose.tanH))<=.88001);assert.ok(Math.abs(dot(pose.up)/(distance*pose.tanV))<=.80001);}}
});
test('producer heading preserves names and has useful fallbacks',()=>{assert.equal(producerHeading(' Caymus Vineyards ','Cabernet Sauvignon'),'Caymus Vineyards');assert.equal(producerHeading('','Cabernet Sauvignon'),'Cabernet Sauvignon');assert.equal(producerHeading('',''),'Unidentified wine');});
