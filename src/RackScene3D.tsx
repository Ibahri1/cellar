import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {sceneCamera,sceneDuration,sceneFrame,type RackScenePlan} from './rack-scene';

/** Small, procedural WebGL scene: no textures, external models, controls or physics. */
export default function RackScene3D({plan,skip,onComplete}:{plan:RackScenePlan;skip:boolean;onComplete:()=>void}){
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const callbacks=useRef({onComplete});callbacks.current={onComplete};
 const runtime=useRef<{finish:()=>void}|null>(null),skipRef=useRef(skip);skipRef.current=skip;
 const [error,setError]=useState(''),[finished,setFinished]=useState(skip);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  const element=host.current,surface=canvas.current;if(!element||!surface)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({canvas:surface,antialias:true,alpha:false,powerPreference:'low-power'});}catch{setError('3D rendering is unavailable. The inventory depth guide below still identifies your bottle.');callbacks.current.onComplete();return;}
  setError('');setFinished(skipRef.current);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#100e0b');
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  const geometry=<T extends THREE.BufferGeometry>(g:T)=>{geometries.add(g);return g;};
  const material=(color:string,metalness=0,roughness=.65)=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness});materials.add(m);return m;};
  const wood=material('#2d2118',.05,.8),brass=material('#b59657',.65,.3),stone=material('#4a4034',0,.95),glass=material('#13251d',.3,.2),foil=material('#631c26',.4,.36),label=material('#d3c09b',0,.9),gold=material('#f0c66e',.5,.25);
  gold.emissive.set('#ad6e17');gold.emissiveIntensity=.65;
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(geometry(new THREE.BoxGeometry(w,h,d)),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh;};
  scene.add(new THREE.HemisphereLight('#ffe4b0','#352b22',2));
  const key=new THREE.DirectionalLight('#ffdc9e',3.2);key.position.set(1,7,5);key.castShadow=true;key.shadow.mapSize.set(512,512);key.shadow.camera.left=-7;key.shadow.camera.right=7;key.shadow.camera.top=7;key.shadow.camera.bottom=-7;key.shadow.normalBias=.03;scene.add(key);
  const rim=new THREE.DirectionalLight('#d6e2dd',2);rim.position.set(-4,3,-4);scene.add(rim);
  box(0,-.62,0,3.6,.2,6.6,wood);box(0,.28,-3.25,3.6,1.8,.14,stone);
  for(const x of [-1.72,1.72]){box(x,-.4,0,.14,.22,6.6,wood);box(x,.98,0,.08,.06,6.6,brass);for(const z of [-3.1,3.1])box(x,.23,z,.12,1.7,.12,wood);}
  // One open-sided cutaway bay. Supports identify the same three recorded depths.
  for(const z of [2,0,-2])for(const x of [-.75,.75])box(x,-.35,z,.12,.33,.72,brass);
  if(plan.blockers.length)box(-3.9,-.62,3.6,3.2,.18,2.9,wood); // Visual staging shelf, never a storage address.
  const profile=[[0,-1.42],[.26,-1.42],[.32,-1.36],[.33,-.95],[.33,.48],[.31,.65],[.18,.85],[.115,.95],[.115,1.4],[0,1.4]].map(([x,y])=>new THREE.Vector2(x,y));
  const bottleGeometry=geometry(new THREE.LatheGeometry(profile,24));
  const neckGeometry=geometry(new THREE.CylinderGeometry(.124,.124,.39,20));
  const labelGeometry=geometry(new THREE.CylinderGeometry(.335,.335,.75,24,1,true));
  const ringGeometry=geometry(new THREE.TorusGeometry(.36,.018,8,40));
  const models=new Map<string,THREE.Group>();
  for(let i=0;i<3;i++){
   const labelCanvas=document.createElement('canvas');labelCanvas.width=384;labelCanvas.height=80;const ctx=labelCanvas.getContext('2d');
   if(ctx){ctx.fillStyle='#16130feb';ctx.fillRect(0,0,384,80);ctx.strokeStyle=i+1===plan.depth?'#e8c679':'#84734f';ctx.lineWidth=3;ctx.strokeRect(2,2,380,76);ctx.fillStyle=i+1===plan.depth?'#f2d496':'#c7b48f';ctx.font='bold 28px Arial';ctx.textAlign='center';ctx.fillText(['FRONT · D1','MIDDLE · D2','BACK · D3'][i],192,51);const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);const m=new THREE.SpriteMaterial({map:texture,depthTest:false});materials.add(m);const marker=new THREE.Sprite(m);marker.position.set(1.45,-.3,2-i*2);marker.scale.set(1.3,.27,1);scene.add(marker);}
  }
  for(const [i,bottle] of plan.slots.entries()){
   if(!bottle)continue;
   const group=new THREE.Group();group.position.set(0,.02,2-i*2);group.userData.bottleId=bottle.id;
   const body=new THREE.Mesh(bottleGeometry,glass);body.rotation.z=Math.PI/2;body.castShadow=true;body.receiveShadow=true;group.add(body);
   const cap=new THREE.Mesh(neckGeometry,foil);cap.rotation.z=Math.PI/2;cap.position.x=-1.22;group.add(cap);
   const paper=new THREE.Mesh(labelGeometry,label);paper.rotation.z=Math.PI/2;paper.position.x=.3;group.add(paper);
   if(bottle.id===plan.selectedId)for(const x of [-.6,.85]){const ring=new THREE.Mesh(ringGeometry,gold);ring.rotation.y=Math.PI/2;ring.position.x=x;group.add(ring);}
   models.set(bottle.id,group);scene.add(group);
  }
  const camera=new THREE.PerspectiveCamera(34,1,.1,100);
  let pixelCap=Math.min(devicePixelRatio||1,1.5),frame=0,lastTime=0,elapsed=skipRef.current?sceneDuration(plan.blockers.length):0,completed=false,lost=false,slowFrames=0,disposed=false;
  const duration=sceneDuration(plan.blockers.length);
  const visible=()=>!document.hidden&&!document.documentElement.classList.contains('device-portrait');
  const draw=()=>{
   if(disposed||lost)return;
   const state=sceneFrame(plan,elapsed);
   for(const stage of state.staged){const group=models.get(stage.id)!;const b=plan.blockers.find(b=>b.id===stage.id)!;const z=2-(b.depth_number!-1)*2;group.position.z=z+(4.15-z)*stage.pull;group.position.x=-3.9*stage.aside;group.position.y=.02+(plan.blockers.indexOf(b)*.8-0.02)*stage.aside;}
   const pose=sceneCamera(camera.aspect,state.camera,plan.blockers.length>0);
   camera.position.set(pose.position[0],pose.position[1],pose.position[2]);camera.lookAt(pose.aim[0],pose.aim[1],pose.aim[2]);
   renderer.render(scene,camera);
   if(state.done&&!completed){completed=true;setFinished(true);callbacks.current.onComplete();}
  };
  const tick=(time:number)=>{
   frame=0;if(disposed||lost||!visible()){lastTime=0;return;}
   const delta=lastTime?time-lastTime:0;lastTime=time;elapsed=Math.min(duration,elapsed+Math.min(delta,80));
   if(delta>34&&delta<250&&++slowFrames===12){pixelCap=Math.max(.75,pixelCap*.75);resize();}
   draw();if(elapsed<duration)frame=requestAnimationFrame(tick);
  };
  const wake=()=>{lastTime=0;if(!visible()){cancelAnimationFrame(frame);frame=0;return;}if(!frame&&!lost){draw();if(elapsed<duration)frame=requestAnimationFrame(tick);}};
  function resize(){if(disposed||lost)return;const w=element!.clientWidth,h=element!.clientHeight;if(!w||!h)return;const ratio=Math.min(pixelCap,Math.sqrt(1_600_000/(w*h)));renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(visible())draw();}
  runtime.current={finish:()=>{elapsed=duration;cancelAnimationFrame(frame);frame=0;if(visible())draw();}};
  const observer=new ResizeObserver(resize);observer.observe(element);
  const orientation=new MutationObserver(wake);orientation.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  const contextLost=(event:Event)=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;setError('The 3D view was interrupted. Your bottle and depth are still identified below.');callbacks.current.onComplete();};
  const contextRestored=()=>{lost=false;elapsed=duration;setError('');resize();wake();};
  surface.addEventListener('webglcontextlost',contextLost);surface.addEventListener('webglcontextrestored',contextRestored);document.addEventListener('visibilitychange',wake);
  resize();wake();
  return()=>{disposed=true;cancelAnimationFrame(frame);runtime.current=null;observer.disconnect();orientation.disconnect();document.removeEventListener('visibilitychange',wake);surface.removeEventListener('webglcontextlost',contextLost);surface.removeEventListener('webglcontextrestored',contextRestored);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());key.shadow.dispose();renderer.dispose();scene.clear();};
 },[plan.signature,retry]);
 useEffect(()=>{if(skip)runtime.current?.finish();},[skip]);
 return <div ref={host} className="rack-3d-canvas" data-scene-state={error?'fallback':finished?'complete':'animating'}>
  <canvas key={retry} ref={canvas} aria-label={`Three dimensional rack row ${plan.row}, column ${plan.column}; selected depth ${plan.depth}`} hidden={Boolean(error)}/>
  {error&&<div className="scene-fallback" role="status"><p>{error}</p><button className="secondary" onClick={()=>setRetry(n=>n+1)}>Retry 3D view</button></div>}
  {!error&&plan.blockers.length>0&&<span className="scene-staging-label">Temporary staging · visual only</span>}
 </div>;
}
