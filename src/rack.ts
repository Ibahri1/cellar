// Image-space coordinates measured against the supplied twelve-row 1536 × 1024
// image. Row centers follow the actual bottle silhouettes, not the whole image.
// Both interaction and camera targeting use this map; storage IDs stay unchanged.
export const rack = {
  width: 1536, height: 1024, depths: ['Front', 'Middle', 'Back'],
  columns: [{x:173,width:212},{x:450,width:178},{x:682,width:174},{x:921,width:181},{x:1157,width:211}],
  rows: [{y:138,height:48},{y:192,height:48},{y:246,height:48},{y:300,height:48},{y:357,height:49},{y:413,height:48},{y:468,height:49},{y:525,height:48},{y:581,height:48},{y:637,height:48},{y:693,height:49},{y:750,height:55}],
  bottom: {x:60,y:821,width:1410,height:84,id:'BOTTOM'},
  calibrationRequired: false
};
export const positions = rack.columns.flatMap((column,c) => rack.rows.map((row,r) => ({...column,...row,row:r+1,column:c+1,id:`R${r+1}-C${c+1}`})));
export function targetForLocation(address:string){
 if(address==='BOTTOM')return rack.bottom;
 const match=address.match(/^R(\d+)-C(\d+)-D([1-3])$/);
 return match?positions.find(p=>p.row===+match[1]&&p.column===+match[2])??null:null;
}
export function cameraOffset(target:{x:number;y:number;width:number;height:number},width:number,height:number,scale:number){
 return {x:-(target.x+target.width/2-rack.width/2)/rack.width*width*scale,y:-(target.y+target.height/2-rack.height/2)/rack.height*height*scale,scale};
}
