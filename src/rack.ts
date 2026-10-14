// Coordinates in the original 1536 × 1024 image. Edit each column/row independently.
// The supplied image shows only eleven clear horizontal bottle rows. These twelve
// LOGICAL rack bands divide the actual rack zone evenly; they are not claimed to
// match twelve visible shelves. Calibrate against the physical cellar before use.
// Bottom storage is a separate full-width target, never part of the rack grid.
export const rack = {
  width: 1536, height: 1024, depths: ['Front', 'Middle', 'Back'],
  columns: [{x:170,width:225},{x:450,width:185},{x:680,width:180},{x:920,width:190},{x:1155,width:220}],
  rows: [{y:145,height:52},{y:199,height:52},{y:253,height:52},{y:307,height:52},{y:361,height:52},{y:415,height:52},{y:469,height:52},{y:523,height:52},{y:577,height:52},{y:631,height:52},{y:685,height:52},{y:739,height:46}],
  bottom: {x:60,y:795,width:1410,height:100,id:'BOTTOM'},
  calibrationRequired: true
};
export const positions = rack.columns.flatMap((column,c) => rack.rows.map((row,r) => ({...column,...row,row:r+1,column:c+1,id:`R${r+1}-C${c+1}`})));
