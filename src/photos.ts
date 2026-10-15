// Thumbnails only: <= ~80 KiB encoded JPEG, stored separately from bottle records.
export const MAX_PHOTO_CHARS=110000;
export function validPhotoData(value:unknown):value is string{return typeof value==='string'&&value.length<=MAX_PHOTO_CHARS&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value);}
export async function imageCanvas(file:File,maxEdge=640){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPG, PNG or WebP image.');
 if(file.size>25*1024*1024)throw Error('Choose a photo smaller than 25 MB.');
 let image:ImageBitmap;
 try{image=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw Error('This image could not be opened. Try a JPG, PNG or WebP photo.');}
 try{
  if(image.width*image.height>50000000)throw Error('Choose a photo smaller than 50 megapixels.');
  const ratio=Math.min(1,maxEdge/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
  const context=canvas.getContext('2d');if(!context)throw Error('Photo processing is unavailable in this browser.');
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
 }finally{image.close();}
}
export async function compressPhoto(file:File){
 const canvas=await imageCanvas(file);
 for(const quality of [.78,.65,.5,.35]){const data=canvas.toDataURL('image/jpeg',quality);if(validPhotoData(data))return data;}
 const small=document.createElement('canvas');small.width=Math.max(1,Math.round(canvas.width*.65));small.height=Math.max(1,Math.round(canvas.height*.65));small.getContext('2d')!.drawImage(canvas,0,0,small.width,small.height);
 const data=small.toDataURL('image/jpeg',.4);if(!validPhotoData(data))throw Error('This photo could not be compressed enough. Choose a simpler or smaller image.');return data;
}
