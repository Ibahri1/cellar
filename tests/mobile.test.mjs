import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundView,zoomAt,mobileTarget,fullView} from '../src/viewer.ts';
import {positions,rack} from '../src/rack.ts';
const frame=(width,height)=>{const imageWidth=Math.min(width,height*1.5);return {width,height,imageWidth,imageHeight:imageWidth/1.5};};
test('mobile zoom and pan stay bounded, and reset restores the complete image',()=>{
 for(const f of [frame(375,360),frame(390,480),frame(430,560),frame(360,450),frame(768,650),frame(544,240)]){
  assert.deepEqual(boundView(fullView,f),fullView);
  for(const scale of [.2,1,2,4,8,100])for(const x of [-100000,0,100000]){
   const v=boundView({scale,x,y:x},f);assert.ok(v.scale>=1&&v.scale<=8);
   assert.ok(Math.abs(v.x)<=Math.max(0,(f.imageWidth*v.scale-f.width)/2));
   assert.ok(Math.abs(v.y)<=Math.max(0,(f.imageHeight*v.scale-f.height)/2));
  }
 }
});
test('pinch and double-tap zoom preserve the point under the fingers when bounds permit',()=>{
 const f=frame(390,260),v={scale:3,x:10,y:10},point={x:30,y:20};
 const zoom=zoomAt(v,4,point,f);
 assert.ok(Math.abs((point.x-v.x)/v.scale-(point.x-zoom.x)/zoom.scale)<1e-9);
 assert.ok(Math.abs((point.y-v.y)/v.scale-(point.y-zoom.y)/zoom.scale)<1e-9);
 assert.deepEqual(zoomAt(fullView,.5,point,f),fullView);
});
test('mobile camera uses the same 60 rack targets, centers them, and never pans past image bounds',()=>{
 for(const f of [frame(375,300),frame(390,390),frame(430,480),frame(360,350),frame(768,600),frame(544,240)])for(const target of positions){
  const v=mobileTarget(target,f);
  assert.ok(Math.abs((target.x+target.width/2-rack.width/2)/rack.width*f.imageWidth*v.scale+v.x)<1e-7);
  assert.ok(Math.abs((target.y+target.height/2-rack.height/2)/rack.height*f.imageHeight*v.scale+v.y)<1e-7);
  assert.deepEqual(boundView(v,f),v);
 }
 assert.deepEqual(mobileTarget(rack.bottom,frame(390,390),true),fullView);
});
