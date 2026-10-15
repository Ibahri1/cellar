import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rack,positions} from '../src/rack.ts';
import {allRackPositions,availablePositions,bottom,locationLabel,statistics,blockedBy} from '../src/domain.ts';

test('60 calibrated logical rack targets and a separate full-width bottom target',()=>{
 assert.equal(positions.length,60);assert.equal(new Set(positions.map(p=>p.id)).size,60);
 assert.equal(allRackPositions().length,180);assert.equal(new Set(allRackPositions().map(locationLabel)).size,180);
 for(const p of positions){assert.ok(p.x>=0&&p.x+p.width<=rack.width);assert.ok(p.y>=0&&p.y+p.height<rack.bottom.y);}
 assert.ok(rack.bottom.x<rack.columns[0].x);assert.ok(rack.bottom.x+rack.bottom.width>rack.columns.at(-1).x+rack.columns.at(-1).width);
 assert.equal(rack.rows.length,12);assert.equal(rack.calibrationRequired,false);
});
test('bottom counts never reduce rack availability and removed bottles free positions',()=>{
 const wine={wine_type:'Red'};
 const bottles=[{...allRackPositions()[0],id:'a',status:'In Cellar',wine},{...bottom,id:'b',status:'In Cellar',wine},{...bottom,id:'c',status:'In Cellar',wine},{...allRackPositions()[1],id:'d',status:'Drank',wine},{...bottom,id:'e',status:'Gifted',wine}];
 const s=statistics(bottles);assert.equal(s.capacity,180);assert.equal(s.main,1);assert.equal(s.bottom,2);assert.equal(s.available,179);assert.equal(s.total,3);assert.equal(s.drank,1);assert.equal(s.gifted,1);assert.equal(s.types.Red,3);
 assert.equal(availablePositions(bottles).length,179);assert.equal(availablePositions(bottles,'a').length,180);
});
test('depth access warns about active bottles in front, never bottom bottles',()=>{
 const bottles=[{...allRackPositions()[0],status:'In Cellar'}, {...allRackPositions()[1],status:'Drank'}];
 assert.equal(blockedBy(allRackPositions()[2],bottles).length,1);assert.equal(blockedBy(bottom,bottles).length,0);
});
