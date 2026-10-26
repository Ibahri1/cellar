import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bottleFocusId,inventoryBottleUrl,firstOccupiedDepth,defaultBrowse,readBrowse,rememberBrowse,selectionScrollBehavior} from '../src/bottle-navigation.ts';
import {replayReturnTarget} from '../src/bottle-navigation.ts';
test('replay returns to the originating page and exact bottle, with a safe full-cellar fallback',()=>{
 assert.deepEqual(replayReturnTarget({pathname:'/cellar',search:'?bottle=old&other=keep'},'exact-back'),{pathname:'/cellar',search:'?bottle=exact-back&other=keep'});
 assert.deepEqual(replayReturnTarget({pathname:'/history',search:'?action=Added'},'exact-back'),{pathname:'/history',search:'?action=Added'});
 assert.deepEqual(replayReturnTarget(undefined,'exact back'),{pathname:'/',search:'?bottle=exact%20back'});
 assert.equal(replayReturnTarget({pathname:'https://unrelated.invalid'},'id').pathname,'/');
});
test('navigation round-trips the exact stable ID, including identical wines',()=>{for(const id of ['request-uuid_0','request-uuid_1','an id & value']){const url=inventoryBottleUrl(id);assert.equal(bottleFocusId(url.slice(url.indexOf('?'))),id);}assert.equal(bottleFocusId(''),null);});
test('mobile initial depth uses only occupied active positions in that exact rack',()=>{const bottles=[{id:'back',status:'In Cellar',location_type:'RACK',row_number:7,column_number:3,depth_number:3},{id:'removed',status:'Drank',location_type:'RACK',row_number:7,column_number:3,depth_number:1},{id:'other',status:'In Cellar',location_type:'RACK',row_number:1,column_number:1,depth_number:1}];assert.equal(firstOccupiedDepth(bottles,7,3),2);bottles.push({...bottles[0],id:'middle',depth_number:2});assert.equal(firstOccupiedDepth(bottles,7,3),1);assert.equal(firstOccupiedDepth(bottles,12,5),null);});
test('previous filters survive a temporary target view and remain scoped by owner/page',()=>{const saved={query:'Cabernet',filters:{country:'France'},sort:'oldest'};rememberBrowse('owner/cellar',saved);assert.deepEqual(defaultBrowse(),{query:'',filters:{},sort:'name'});assert.deepEqual(readBrowse('owner/cellar'),saved);assert.deepEqual(readBrowse('other/cellar'),defaultBrowse());assert.deepEqual(readBrowse('owner/search'),defaultBrowse());});
test('reduced motion uses immediate scrolling; ordinary selection uses smooth scrolling',()=>{assert.equal(selectionScrollBehavior(true),'instant');assert.equal(selectionScrollBehavior(false),'smooth');});
