import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseUsdCents,usdPrice,centsInput,statistics,allRackPositions,locationLabel} from '../src/domain.ts';
import {rack,targetForLocation,cameraOffset} from '../src/rack.ts';
import {validPhotoData,MAX_PHOTO_CHARS} from '../src/photos.ts';
import {decodeWine,decodeBottle,encodeWine} from '../src/firestore.ts';

test('USD prices use exact integer cents and unspecified is distinct from zero',()=>{
 for(const [input,cents] of [['19.99',1999],['75.00',7500],['250.50',25050],['0',0],[' 19.99 ',1999],['',null]])assert.equal(parseUsdCents(input),cents);
 assert.equal(usdPrice(null),'Not specified');assert.equal(usdPrice(1999),'$19.99');assert.equal(usdPrice(0),'$0.00');assert.equal(centsInput(25050),'250.50');
 for(const invalid of ['-1','1.999','1e3','NaN','Infinity','9999999999999999999'])assert.throws(()=>parseUsdCents(invalid));
});
test('camera geometry centers all 180 addresses at desktop, tablet and mobile landscape sizes',()=>{
 for(const address of allRackPositions().map(locationLabel))for(const [w,h] of [[1152,768],[900,600],[585,390]]){
  const target=targetForLocation(address);assert.ok(target);const camera=cameraOffset(target,w,h,2.8);
  assert.ok(Math.abs(((target.x+target.width/2)/rack.width-.5)*w*2.8+camera.x)<1e-9);
  assert.ok(Math.abs(((target.y+target.height/2)/rack.height-.5)*h*2.8+camera.y)<1e-9);
 }
 assert.deepEqual(targetForLocation('R7-C3-D1'),targetForLocation('R7-C3-D3'));
 assert.equal(targetForLocation('BOTTOM'),rack.bottom);assert.equal(targetForLocation('R13-C1-D1'),null);
});
test('new image target centers follow all twelve visible bottle rows',()=>{
 const centers=[162,216,270,324,381.5,437,492.5,549,605,661,717.5,777.5];
 assert.deepEqual(rack.rows.map(r=>r.y+r.height/2),centers);
 for(const c of [1,2,3,4,5])for(const r of [1,7,12]){const target=targetForLocation(`R${r}-C${c}-D1`);assert.equal(target.row,r);assert.equal(target.column,c);}
});
test('custom wine types are trimmed and included in statistics; legacy windows stay outside the model',()=>{
 const wire={id:'legacy',name:'Example',producer:'Producer',vintage:2020,wineType:'Red Blend',country:'France',region:'Bordeaux',grapeVariety:'Blend',bottleSize:750,tastingNotes:'',imageUrl:null,drinkingWindowStart:2022,drinkingWindowEnd:2030};
 const wine=decodeWine(wire);assert.equal(wine.drinking_window_start,undefined);
 const encoded=encodeWine({...wine,wine_type:'  My Custom Wine  '},'new-wine');assert.equal(encoded.wineType,'My Custom Wine');assert.equal(encoded.drinkingWindowStart,undefined);
 const timestamp={toDate:()=>new Date('2026-10-14T00:00:00Z')};const bottle=decodeBottle({id:'old-bottle',wineId:'legacy',locationType:'BOTTOM',row:null,column:null,depth:null,status:'In Cellar',personalRating:null,personalNotes:'',version:1,createdAt:timestamp,removedAt:null},wine);
 assert.equal(bottle.price_cents,null);assert.equal(bottle.photo_id,null);assert.equal(statistics([bottle]).types['Red Blend'],1);
});
test('photo payloads are bounded JPEG thumbnails, not arbitrary URLs or originals',async()=>{
 const data='data:image/jpeg;base64,'+(await readFile(new URL('./fixtures/test-bottle.jpg',import.meta.url))).toString('base64');
 assert.ok(validPhotoData(data));assert.ok(!validPhotoData('data:image/svg+xml,<svg/>'));assert.ok(!validPhotoData('https://example.test/photo.jpg'));assert.ok(!validPhotoData('data:image/jpeg;base64,/9j/'+ 'A'.repeat(MAX_PHOTO_CHARS)));
});
