import {rack} from './rack.ts';
export type View={scale:number;x:number;y:number};
export type Frame={width:number;height:number;imageWidth:number;imageHeight:number};
export const fullView:View={scale:1,x:0,y:0};
export function boundView(view:View,frame:Frame):View{
 const scale=Math.max(1,Math.min(8,view.scale));
 const x=Math.max(0,(frame.imageWidth*scale-frame.width)/2),y=Math.max(0,(frame.imageHeight*scale-frame.height)/2);
 return {scale,x:Math.max(-x,Math.min(x,view.x)),y:Math.max(-y,Math.min(y,view.y))};
}
export function zoomAt(view:View,scale:number,point:{x:number;y:number},frame:Frame){
 const next=Math.max(1,Math.min(8,scale)),ratio=next/view.scale;
 return boundView({scale:next,x:point.x-(point.x-view.x)*ratio,y:point.y-(point.y-view.y)*ratio},frame);
}
export function mobileTarget(target:{x:number;y:number;width:number;height:number},frame:Frame,bottom=false):View{
 if(bottom)return fullView; // Show the entire shared region without invented placement.
 const cx=(target.x+target.width/2)/rack.width,cy=(target.y+target.height/2)/rack.height;
 const scale=Math.min(8,Math.max(3,frame.width/(2*Math.min(cx,1-cx)*frame.imageWidth),frame.height/(2*Math.min(cy,1-cy)*frame.imageHeight)));
 return boundView({scale,x:(.5-cx)*frame.imageWidth*scale,y:(.5-cy)*frame.imageHeight*scale},frame);
}
