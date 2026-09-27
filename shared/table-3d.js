import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/+esm";

const SUIT_SYMBOL={S:'♠',H:'♥',D:'♦',C:'♣',X:'★'};
const SUIT_NAME={S:'pique',H:'cœur',D:'carreau',C:'trèfle',X:'joker'};
const RANK_NAME={1:'A',11:'V',12:'D',13:'R'};
const CARD_W=1.22,CARD_H=1.78,CARD_D=.045;
const TABLE_Y=.28;
const visualHash=str=>{
  let h=2166136261;
  for(const ch of String(str)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
  return (h>>>0)/4294967295;
};
const motionAllowed=()=>document.documentElement.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
const targetPixelRatio=()=>{
  const dpr=Math.max(1,Number(globalThis.devicePixelRatio)||1),coarse=matchMedia('(pointer: coarse)').matches,memory=Number(globalThis.navigator?.deviceMemory||8);
  return Math.min(dpr,(coarse||memory<=4)?1.5:2);
};

function canvasTexture(draw,w=512,h=720){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');draw(ctx,w,h);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  return tex;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);
  ctx.closePath();
}
function cardFaceTexture(card){
  return canvasTexture((g,w,h)=>{
    const red=card?.suit==='H'||card?.suit==='D',symbol=card?.joker?'★':SUIT_SYMBOL[card?.suit]||'';
    const rank=card?.joker?'JK':(RANK_NAME[card?.rank]||String(card?.rank??''));
    g.clearRect(0,0,w,h);g.fillStyle='#fbf8ee';roundRect(g,5,5,w-10,h-10,30);g.fill();
    g.strokeStyle='#d6cfbf';g.lineWidth=6;g.stroke();
    g.fillStyle=red?'#a8323d':'#18201c';g.textAlign='center';
    g.font='700 88px Georgia,serif';g.fillText(rank,72,108);
    g.font='72px Georgia,serif';g.fillText(symbol,73,182);
    g.font=card?.joker?'130px Georgia,serif':'170px Georgia,serif';g.fillText(symbol,w/2,h/2+55);
    if(card?.joker){g.font='700 44px system-ui,sans-serif';g.fillText('JOKER',w/2,h/2+135)}
    g.save();g.translate(w,h);g.rotate(Math.PI);g.font='700 88px Georgia,serif';g.fillText(rank,72,108);g.font='72px Georgia,serif';g.fillText(symbol,73,182);g.restore();
  });
}
function cardBackTexture(){
  return canvasTexture((g,w,h)=>{
    g.fillStyle='#142920';roundRect(g,5,5,w-10,h-10,30);g.fill();
    g.strokeStyle='#dbea9e';g.lineWidth=7;g.stroke();
    g.strokeStyle='#8faf80';g.lineWidth=3;roundRect(g,28,28,w-56,h-56,23);g.stroke();
    g.fillStyle='#dbea9e';g.textAlign='center';g.font='700 56px Georgia,serif';g.fillText('LE SALON',w/2,h/2-6);
    g.font='38px Georgia,serif';g.fillText('♣  ♦  ♥  ♠',w/2,h/2+62);
  });
}

export function createTable3DRenderer({onFatal}={}){
  let renderer=null,scene=null,camera=null,host=null,canvas=null,resizeObserver=null;
  let active=false,current=null,drag=null,hovered=null;
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),dragPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-1.02);
  const interactive=[],faceTextures=new Map(),frontMaterials=new Map();
  const disposableTextures=[];
  const cardGeometry=new THREE.BoxGeometry(CARD_W,CARD_H,CARD_D,1,1,1);
  const tileGeometry=new THREE.BoxGeometry(.88,.12,.64);
  const pawnGeometry=new THREE.CylinderGeometry(.16,.24,.46,18);
  const dieGeometry=new THREE.BoxGeometry(.68,.68,.68);
  const rummiTileGeometry=new THREE.BoxGeometry(.62,.9,.085);
  const grainGeometry=new THREE.SphereGeometry(.10,10,8);
  const heldPadGeometry=new THREE.CylinderGeometry(.5,.5,.08,28);
  const codeGemGeometry=new THREE.SphereGeometry(.5,28,20);
  const intrusDotGeometry=new THREE.SphereGeometry(.055,12,8);
  const balloonGeometry=new THREE.SphereGeometry(1,40,28);
  const golfBallGeometry=new THREE.SphereGeometry(.13,20,14);
  const cityTileGeometry=new THREE.BoxGeometry(1.28,.16,.88);
  const cityHouseGeometry=new THREE.BoxGeometry(.19,.25,.19);
  const cityPegGeometry=new THREE.CylinderGeometry(.07,.09,.22,12);
  const edgeMaterial=new THREE.MeshStandardMaterial({color:0xe9e2d1,roughness:.72,metalness:0});
  const tileMaterials=new Map(),rummiTileMaterials=new Map(),pawnMaterials=new Map(),dieFaceMaterials=new Map(),cellLabelMaterials=new Map(),boxTileMaterials=new Map(),cellLabelTextures=[];
  const neutralDieMaterial=new THREE.MeshStandardMaterial({color:0xd8d3c4,roughness:.82,metalness:0});
  let animationRaf=0,diceAnimations=[],pawnAnimations=[],cardAnimations=[],lastDiceKey='',lastMoveKey='';
  let wordSelection=[],wordDraftKey='';
  let codeDraft=[0,1,2],codeDraftKey='';
  let golfAim={angle:0,power:50},golfAimKey='',lastGolfKey='';
  const backTexture=cardBackTexture();disposableTextures.push(backTexture);
  const backMaterial=new THREE.MeshStandardMaterial({map:backTexture,roughness:.64,metalness:0});
  let objects=new THREE.Group(),cardFx=new THREE.Group(),dropMarker=null,tableMesh=null,cameraPose=null,lastEightSnapshot=null,remoteCardGestures=new Map();

  function applyCameraFit(){
    if(!camera||!cameraPose)return;
    const aspect=Math.max(.32,Number(camera.aspect)||1),portraitBoost=aspect<.82?Math.min(1.95,.82/aspect):1;
    const {px,py,pz,lx,ly,lz}=cameraPose,dx=px-lx,dy=py-ly,dz=pz-lz;
    camera.position.set(lx+dx*portraitBoost,ly+dy*portraitBoost,lz+dz*portraitBoost);
    camera.lookAt(lx,ly,lz);
    camera.fov=aspect<.62?42:aspect<.82?40:aspect<.95?39:aspect>1.8?37:39;
    camera.updateProjectionMatrix();
  }
  function setCameraPose(px,py,pz,lx,ly,lz){
    cameraPose={px,py,pz,lx,ly,lz};applyCameraFit();
  }

  function frontMaterial(card){
    const key=card?.joker?'joker':(card?.suit||'X')+'-'+(card?.rank??0);
    if(frontMaterials.has(key))return frontMaterials.get(key);
    const tex=cardFaceTexture(card);disposableTextures.push(tex);faceTextures.set(key,tex);
    const mat=new THREE.MeshStandardMaterial({map:tex,roughness:.66,metalness:0});
    frontMaterials.set(key,mat);return mat;
  }
  function cardMesh(card,{back=false,id=null,interactiveCard=false,playable=false}={}){
    const mats=[edgeMaterial,edgeMaterial,edgeMaterial,edgeMaterial,back?backMaterial:frontMaterial(card),backMaterial];
    const mesh=new THREE.Mesh(cardGeometry,mats);
    mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.userData={kind:'card',cardId:id,interactive:interactiveCard,playable};
    if(interactiveCard)interactive.push(mesh);
    return mesh;
  }
  function makeLabel(text,accent='#dbea9e'){
    const tex=canvasTexture((g,w,h)=>{
      g.clearRect(0,0,w,h);g.fillStyle='rgba(8,14,11,.84)';roundRect(g,8,8,w-16,h-16,42);g.fill();
      g.strokeStyle='rgba(255,255,255,.13)';g.lineWidth=3;g.stroke();
      g.fillStyle=accent;g.textAlign='center';g.textBaseline='middle';g.font='700 42px system-ui,sans-serif';g.fillText(text,w/2,h/2);
    },768,160);
    const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false});
    const sp=new THREE.Sprite(mat);sp.scale.set(4.2,.88,1);sp.userData.temporaryMaterial=mat;sp.userData.temporaryTexture=tex;return sp;
  }
  function init(){
    if(renderer)return;
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(targetPixelRatio());
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    canvas=renderer.domElement;canvas.setAttribute('aria-label','Table de jeu 3D interactive');canvas.tabIndex=0;

    scene=new THREE.Scene();scene.background=new THREE.Color(0x0b110e);
    scene.fog=new THREE.Fog(0x0b110e,16,31);
    camera=new THREE.PerspectiveCamera(39,1,.1,60);setCameraPose(0,7.25,9.25,0,.25,.2);

    const hemi=new THREE.HemisphereLight(0xe9f3e7,0x162019,1.42);scene.add(hemi);
    const key=new THREE.DirectionalLight(0xfff5df,2.05);key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-8;key.shadow.camera.right=8;key.shadow.camera.top=7;key.shadow.camera.bottom=-7;scene.add(key);
    const rim=new THREE.DirectionalLight(0xb8d8c5,1.0);rim.position.set(6,3,-5);scene.add(rim);
    const farFill=new THREE.DirectionalLight(0xe3f0df,1.25);farFill.position.set(0,6,-7);scene.add(farFill);
    const farGlow=new THREE.PointLight(0xbfd9c8,.62,18);farGlow.position.set(0,4,-4.2);scene.add(farGlow);

    const tableMat=new THREE.MeshStandardMaterial({color:0x294335,roughness:.88,metalness:0});
    tableMesh=new THREE.Mesh(new THREE.BoxGeometry(12,.5,8),tableMat);tableMesh.position.y=0;tableMesh.receiveShadow=true;tableMesh.castShadow=true;scene.add(tableMesh);
    const felt=new THREE.Mesh(new THREE.PlaneGeometry(11.55,7.55),new THREE.MeshStandardMaterial({color:0x3b624b,roughness:1}));
    felt.rotation.x=-Math.PI/2;felt.position.y=TABLE_Y+.005;felt.receiveShadow=true;scene.add(felt);
    scene.add(objects);scene.add(cardFx);

    const ring=new THREE.RingGeometry(.86,1.03,56);
    dropMarker=new THREE.Mesh(ring,new THREE.MeshBasicMaterial({color:0xdbea9e,transparent:true,opacity:.2,side:THREE.DoubleSide}));
    dropMarker.rotation.x=-Math.PI/2;dropMarker.position.set(1.25,TABLE_Y+.025,0);scene.add(dropMarker);

    canvas.addEventListener('pointerdown',onPointerDown);
    canvas.addEventListener('pointermove',onPointerMove);
    canvas.addEventListener('pointerup',onPointerUp);
    canvas.addEventListener('pointercancel',onPointerCancel);
    canvas.addEventListener('lostpointercapture',onLostPointerCapture);
    canvas.addEventListener('pointerleave',()=>setHover(null));
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onFatal?.(new Error('Contexte WebGL perdu'));});
    window.addEventListener('blur',onWindowBlur);
    window.addEventListener('salon:remote-card-gesture',onRemoteCardGesture);
    document.addEventListener('visibilitychange',onVisibilityChange);
  }
  function ensureHost(){
    const column=document.querySelector('.table-column');if(!column)return null;
    if(!host?.isConnected){
      host=document.createElement('section');host.className='table-3d-host';host.setAttribute('aria-label','Vue 3D de la table');
      host.innerHTML='<div class="table-3d-window-controls" aria-label="Affichage 3D"><button type="button" class="table-3d-window-button table-3d-minimize" data-table-3d-window="embedded" aria-label="Réduire la vue 3D dans la page" title="Réduire la vue 3D">↙</button><button type="button" class="table-3d-window-button table-3d-expand" data-table-3d-window="full" aria-label="Agrandir la vue 3D" title="Plein écran">⛶</button><button type="button" class="table-3d-window-button table-3d-close" data-table-view-mode="2d" aria-label="Revenir à la vue 2D" title="Revenir à la vue 2D">×</button></div><div class="table-3d-hud"><span class="table-3d-accent" data-table-3d-title>VUE 3D</span><span data-table-3d-status>Table synchronisée</span></div><div class="table-3d-help" data-table-3d-help>Vue immersive synchronisée avec la partie</div>';
      host.querySelectorAll('[data-table-3d-window]').forEach(button=>button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();window.dispatchEvent(new CustomEvent('salon:table-3d-window',{detail:{mode:button.dataset.table3dWindow}}))}));
      const banner=column.querySelector('.turn-banner');banner?.after(host);if(!banner)column.prepend(host);
      host.append(canvas);
      resizeObserver?.disconnect();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();
    }
    return host;
  }
  function resize(){
    if(!renderer||!host)return;
    const r=host.getBoundingClientRect(),w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height)),aspect=w/h;
    renderer.setPixelRatio(targetPixelRatio());
    renderer.setSize(w,h,false);camera.aspect=aspect;applyCameraFit();draw();
  }
  function clearObjects(){
    interactive.length=0;diceAnimations.length=0;pawnAnimations.length=0;cardAnimations.length=0;
    if(animationRaf){cancelAnimationFrame(animationRaf);animationRaf=0}
    for(const child of [...objects.children]){
      objects.remove(child);
      child.traverse?.(o=>{o.userData?.temporaryGeometry?.dispose?.();o.userData?.temporaryMaterial?.dispose?.();o.userData?.temporaryTexture?.dispose?.()});
    }
    for(const child of [...cardFx.children])cardFx.remove(child);
    remoteCardGestures.clear();
  }
  function placeCard(mesh,x,z,y=TABLE_Y+.07,rot=0,scale=1){
    mesh.position.set(x,y,z);mesh.rotation.set(-Math.PI/2,0,rot);mesh.scale.setScalar(scale);objects.add(mesh);return mesh;
  }
  function handCardSlot(count,index){
    const total=Math.max(1,count),rows=total<=8?1:total<=16?2:3,perRow=Math.ceil(total/rows),row=Math.floor(index/perRow),start=row*perRow,rowCount=Math.min(perRow,total-start),local=index-start;
    const baseScale=rows===1?Math.max(.82,1-Math.max(0,total-6)*.04):rows===2?.88:.64;
    const fitScale=rowCount<=1?baseScale:Math.min(baseScale,(8.8-(rowCount-1)*.10)/(rowCount*CARD_W));
    const scale=Math.max(.56,fitScale),spacing=rowCount<=1?0:CARD_W*scale+.10,t=rowCount<=1?.5:local/(rowCount-1);
    const x=(local-(rowCount-1)/2)*spacing,fan=(t-.5)*-.08;
    const z=rows===1?2.66+Math.abs(t-.5)*.08:rows===2?1.35+row*1.60:1.0+row*1.10;
    return{x,z,fan,scale,row,local,yOffset:row*.012+local*.0015};
  }
  function eightOpponentSeat(total,index){
    if(total<=1)return{x:0,z:-2.34};
    const step=Math.min(3.0,6.0/Math.max(1,total-1));
    return{x:(index-(total-1)/2)*step,z:-2.34+Math.abs(index-(total-1)/2)*.06};
  }
  function pickCardSlot(count,index){
    const total=Math.max(1,count),rows=Math.max(1,Math.min(3,Math.ceil(total/8))),perRow=Math.ceil(total/rows),row=Math.floor(index/perRow),start=row*perRow,rowCount=Math.min(perRow,total-start),local=index-start;
    const scale=rows===1?.76:rows===2?.70:.64,spacing=CARD_W*scale+.12,t=rowCount<=1?.5:local/(rowCount-1);
    return{x:(local-(rowCount-1)/2)*spacing,z:-.82+row*.82,rot:(t-.5)*.10,scale,yOffset:row*.01+local*.002};
  }
  function emitLocalCardGesture(phase,progress=0,lateral=0){
    if(current?.gameId!=='huit')return;
    const detail={phase,progress:Math.max(0,Math.min(1,Number(progress)||0)),lateral:Math.max(-1,Math.min(1,Number(lateral)||0))};
    window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail}));
  }
  function eightGestureCoordinates(mesh,home){
    const target=new THREE.Vector3(1.25,1.02,.05),origin=home||mesh?.userData?.home?.position;if(!origin||!mesh)return{progress:0,lateral:0};
    const vx=target.x-origin.x,vz=target.z-origin.z,wx=mesh.position.x-origin.x,wz=mesh.position.z-origin.z,den=Math.max(.0001,vx*vx+vz*vz),len=Math.sqrt(den);
    const progress=Math.max(0,Math.min(1,(wx*vx+wz*vz)/den)),lateral=Math.max(-1,Math.min(1,(wx*vz-wz*vx)/(len*1.7)));
    return{progress,lateral};
  }
  function currentEightOpponentSeat(actor){
    const state=current?.state,viewer=Number.isInteger(current?.privateIndex)?current.privateIndex:0;
    if(!state?.players?.length||!Number.isInteger(actor)||actor===viewer)return null;
    const opponents=state.players.map((p,i)=>({p,i})).filter(x=>x.i!==viewer),index=opponents.findIndex(x=>x.i===actor);
    if(index<0)return null;return eightOpponentSeat(opponents.length,index);
  }
  function onRemoteCardGesture(event){
    if(!active||!motionAllowed()||current?.gameId!=='huit')return;
    const d=event?.detail||{},actor=Number(d.actor),seat=currentEightOpponentSeat(actor);if(!seat)return;
    const phase=['start','move','cancel','commit'].includes(d.phase)?d.phase:null;if(!phase)return;
    let gesture=remoteCardGestures.get(actor);
    if(!gesture||phase==='start'){
      if(gesture?.mesh)cardFx.remove(gesture.mesh);
      const mesh=cardMesh(null,{back:true});mesh.scale.setScalar(.74);mesh.rotation.set(-Math.PI/2,0,0);cardFx.add(mesh);
      gesture={mesh,actor,from:new THREE.Vector3(seat.x,TABLE_Y+.28,seat.z+.10),to:new THREE.Vector3(1.25,TABLE_Y+.26,.05),progress:0,target:0,lateral:0,targetLateral:0,lastAt:performance.now(),returning:false,committed:false};
      mesh.position.copy(gesture.from);remoteCardGestures.set(actor,gesture);
    }
    gesture.target=Math.max(0,Math.min(1,Number(d.progress)||0));gesture.targetLateral=Math.max(-1,Math.min(1,Number(d.lateral)||0));gesture.lastAt=performance.now();
    if(phase==='cancel'){gesture.target=0;gesture.targetLateral=0;gesture.returning=true;gesture.committed=false}
    else if(phase==='commit'){gesture.target=1;gesture.targetLateral=0;gesture.committed=true;gesture.returning=false}
    else{gesture.returning=false;gesture.committed=false}
    startMotion();
  }
  function eightSnapshot(payload,deckCount,top){
    const s=payload?.state,viewer=Number.isInteger(payload?.privateIndex)?payload.privateIndex:0;
    return{key:[s?.startedAt||'',viewer,(s?.players||[]).map(p=>p?.name||'').join('|')].join('~'),viewer,deckCount,topId:top?.id||null,top:top?{id:top.id,suit:top.suit,rank:top.rank,joker:!!top.joker}:null,handCounts:(s?.players||[]).map(p=>p?.hand?.length||0)};
  }
  function queueCardFlight(mesh,from,to,{duration=620,delay=0,lift=.8,onDone=null,fromRot=0,toRot=0}={}){
    mesh.position.copy(from);mesh.rotation.set(-Math.PI/2,0,fromRot);cardFx.add(mesh);
    cardAnimations.push({mesh,from:from.clone(),to:to.clone(),start:performance.now(),duration,delay,lift,onDone,fromRot,toRot,done:false});startMotion();
  }
  function tileMaterial(kind='normal',highlight=false){
    const key=kind+(highlight?'-hot':'');if(tileMaterials.has(key))return tileMaterials.get(key);
    const colors={normal:0xd8d3b5,goose:0xaabd8a,trap:0xc4a36e,danger:0x9e6b5e,goal:0xdbea9e};
    const mat=new THREE.MeshStandardMaterial({color:colors[kind]||colors.normal,roughness:.9,emissive:highlight?0x6b7240:0x000000,emissiveIntensity:highlight ? .42 : 0});
    tileMaterials.set(key,mat);return mat;
  }
  function pawnMaterial(color){
    const key=String(color||'#dbea9e');if(pawnMaterials.has(key))return pawnMaterials.get(key);
    const mat=new THREE.MeshStandardMaterial({color:key,roughness:.58,metalness:.04});pawnMaterials.set(key,mat);return mat;
  }
  function dieFaceMaterial(value){
    const n=Math.max(1,Math.min(6,Number(value)||1));if(dieFaceMaterials.has(n))return dieFaceMaterials.get(n);
    const tex=canvasTexture((g,w,h)=>{
      g.fillStyle='#f7f3e7';roundRect(g,6,6,w-12,h-12,42);g.fill();g.strokeStyle='#d7cfbb';g.lineWidth=8;g.stroke();
      const pts={1:[[.5,.5]],2:[[.28,.28],[.72,.72]],3:[[.27,.27],[.5,.5],[.73,.73]],4:[[.28,.28],[.72,.28],[.28,.72],[.72,.72]],5:[[.27,.27],[.73,.27],[.5,.5],[.27,.73],[.73,.73]],6:[[.28,.22],[.72,.22],[.28,.5],[.72,.5],[.28,.78],[.72,.78]]}[n];
      g.fillStyle='#18201c';for(const [x,y] of pts){g.beginPath();g.arc(x*w,y*h,34,0,Math.PI*2);g.fill()}
    },512,512);cellLabelTextures.push(tex);
    const mat=new THREE.MeshStandardMaterial({map:tex,roughness:.72});dieFaceMaterials.set(n,mat);return mat;
  }
  function dieMesh(value){
    const v=Math.max(1,Math.min(6,Number(value)||1)),sides=[2,5,v,7-v,3,4].map(dieFaceMaterial);
    const mesh=new THREE.Mesh(dieGeometry,sides);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
  }
  function cellLabelMaterial(n){
    if(cellLabelMaterials.has(n))return cellLabelMaterials.get(n);
    const tex=canvasTexture((g,w,h)=>{g.clearRect(0,0,w,h);g.fillStyle='#26372d';g.textAlign='center';g.textBaseline='middle';g.font='800 76px system-ui,sans-serif';g.fillText(String(n),w/2,h/2)},160,112);
    cellLabelTextures.push(tex);const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:true});cellLabelMaterials.set(n,mat);return mat;
  }
  function cellLabel(n){const sp=new THREE.Sprite(cellLabelMaterial(n));sp.scale.set(.48,.34,1);return sp}
  function actionSprite(text,kind,data={},accent='#dbea9e'){
    const sp=makeLabel(text,accent);sp.scale.set(2.55,.58,1);sp.userData={...sp.userData,kind,interactive:true,...data};interactive.push(sp);return sp;
  }
  function blankDieMesh(){
    const mesh=new THREE.Mesh(dieGeometry,neutralDieMaterial);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
  }
  function boxTileMaterial(closed=false,selected=false){
    const key=(closed?'closed':'open')+(selected?'-selected':'');if(boxTileMaterials.has(key))return boxTileMaterials.get(key);
    const mat=new THREE.MeshStandardMaterial({color:closed?0x3a433d:selected?0xdbea9e:0xc8b98e,roughness:.86,emissive:selected?0x58622e:0x000000,emissiveIntensity:selected?.42:0});
    boxTileMaterials.set(key,mat);return mat;
  }
  function rummiTileMaterial(tile,selected=false){
    const key=(tile?.joker?'joker':String(tile?.color)+'-'+String(tile?.num))+(selected?'-selected':'');if(rummiTileMaterials.has(key))return rummiTileMaterials.get(key);
    const palette=['#a8323d','#315e9b','#c08a24','#202522'],ink=tile?.joker?'#7b4a84':palette[tile?.color]||'#202522';
    const tex=canvasTexture((g,w,h)=>{
      g.fillStyle=selected?'#eef5c5':'#f4edd9';roundRect(g,8,8,w-16,h-16,34);g.fill();g.strokeStyle=selected?'#a7b85b':'#c8bea7';g.lineWidth=10;g.stroke();
      g.fillStyle=ink;g.textAlign='center';g.textBaseline='middle';g.font=tile?.joker?'800 96px system-ui,sans-serif':'900 170px system-ui,sans-serif';g.fillText(tile?.joker?'✳':String(tile?.num??''),w/2,h*.45);
      g.font='800 48px system-ui,sans-serif';g.fillText(tile?.joker?'JOKER':['●','◆','▲','■'][tile?.color]||'',w/2,h*.78);
    },420,620);cellLabelTextures.push(tex);
    const mat=new THREE.MeshStandardMaterial({map:tex,roughness:.76,emissive:selected?0x33370d:0x000000,emissiveIntensity:selected?.28:0});rummiTileMaterials.set(key,mat);return mat;
  }
  function rummiTileMesh(tile,selected=false,interactiveTile=false){
    const mesh=new THREE.Mesh(rummiTileGeometry,rummiTileMaterial(tile,selected));mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={kind:'rummi-tile',tileId:tile.id,interactive:interactiveTile};if(interactiveTile)interactive.push(mesh);return mesh;
  }
  function worldForCell(n,coords){
    if(!Number.isInteger(n)||n<=0)return new THREE.Vector3(-4.75,TABLE_Y+.42,3.15);
    const p=coords?.[n-1]||[4,3];return new THREE.Vector3((p[0]-4)*1.07,TABLE_Y+.42,(p[1]-3)*.87);
  }
  function startMotion(){
    if(animationRaf||!motionAllowed())return;
    animationRaf=requestAnimationFrame(motionFrame);
  }
  function motionFrame(now){
    animationRaf=0;let running=false;
    for(const a of diceAnimations){
      const t=Math.min(1,(now-a.start)/a.duration),ease=1-Math.pow(1-t,3),spin=(1-ease);
      a.mesh.rotation.set(spin*a.rx,spin*a.ry,spin*a.rz);
      if(t<1)running=true;else a.mesh.rotation.set(0,0,0);
    }
    for(const a of pawnAnimations){
      const t=Math.min(1,(now-a.start)/a.duration),scaled=t*Math.max(1,a.points.length-1),i=Math.min(a.points.length-2,Math.floor(scaled)),u=Math.min(1,scaled-i),p0=a.points[i]||a.points[0],p1=a.points[i+1]||a.points.at(-1);
      a.mesh.position.lerpVectors(p0,p1,u);a.mesh.position.y+=Math.sin(u*Math.PI)*(a.lift??.12);
      if(t<1)running=true;else a.mesh.position.copy(a.points.at(-1));
    }
    for(const a of cardAnimations){
      if(a.done)continue;
      const elapsed=now-a.start-(a.delay||0);
      if(elapsed<0){running=true;continue}
      const t=Math.min(1,Math.max(0,elapsed/a.duration)),ease=1-Math.pow(1-t,3);
      a.mesh.position.lerpVectors(a.from,a.to,ease);a.mesh.position.y+=Math.sin(t*Math.PI)*(a.lift??.8);
      a.mesh.rotation.z=THREE.MathUtils.lerp(a.fromRot||0,a.toRot||0,ease);
      if(t<1)running=true;else{a.mesh.position.copy(a.to);a.done=true;cardFx.remove(a.mesh);a.onDone?.()}
    }
    if(cardAnimations.some(a=>a.done))cardAnimations=cardAnimations.filter(a=>!a.done);
    for(const [actor,g] of remoteCardGestures){
      const age=now-g.lastAt;if(age>950&&!g.committed){g.target=0;g.targetLateral=0;g.returning=true}
      g.progress+=(g.target-g.progress)*.24;g.lateral+=(g.targetLateral-g.lateral)*.22;
      const p=Math.max(0,Math.min(1,g.progress)),ease=p*p*(3-2*p);
      g.mesh.position.lerpVectors(g.from,g.to,ease);
      const dx=g.to.x-g.from.x,dz=g.to.z-g.from.z,len=Math.max(.001,Math.hypot(dx,dz)),side=.58*g.lateral*Math.sin(Math.PI*p);
      g.mesh.position.x+=(-dz/len)*side;g.mesh.position.z+=(dx/len)*side;g.mesh.position.y+=Math.sin(Math.PI*p)*.82;
      g.mesh.rotation.z=g.lateral*.10+(p-.5)*-.03;
      if(g.returning&&p<.018&&Math.abs(g.target-g.progress)<.02){cardFx.remove(g.mesh);remoteCardGestures.delete(actor);continue}
      if(g.committed&&p>.985&&age>420){cardFx.remove(g.mesh);remoteCardGestures.delete(actor);continue}
      running=true;
    }
    draw();if(running)animationRaf=requestAnimationFrame(motionFrame);
  }
  function syncGoose(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,coords=payload.viewData?.boardCoords||[],geese=new Set(payload.viewData?.gooseCells||[]),choices=new Set(payload.viewData?.choiceTargets||[]),choiceByTarget=new Map((payload.viewData?.gooseChoices||[]).map(x=>[x.target,x.steps])),grains=new Set(s?.gooseGrains||[]);
    const specials=payload.viewData?.specialCells||{};
    setCameraPose(0,8.7,8.25,0,.15,0);

    for(let n=1;n<=Math.min(63,coords.length);n++){
      const p=worldForCell(n,coords);let kind='normal';
      if(n===specials.goal)kind='goal';else if(n===specials.skull)kind='danger';else if(geese.has(n))kind='goose';else if(Object.values(specials).includes(n))kind='trap';
      const tile=new THREE.Mesh(tileGeometry,tileMaterial(kind,choices.has(n)));tile.position.set(p.x,TABLE_Y+.08,p.z);tile.castShadow=true;tile.receiveShadow=true;
      if(choices.has(n)&&payload.canInteract){tile.userData={kind:'goose-choice',steps:choiceByTarget.get(n),interactive:true};interactive.push(tile)}
      objects.add(tile);
      const label=cellLabel(n);label.position.set(p.x,TABLE_Y+.18,p.z);label.rotation.x=-Math.PI/2;objects.add(label);
      if(grains.has(n)){const grain=new THREE.Mesh(grainGeometry,new THREE.MeshStandardMaterial({color:0xf2cf67,emissive:0x8b6b18,emissiveIntensity:.45}));grain.position.set(p.x+.27,TABLE_Y+.34,p.z-.16);grain.userData.temporaryMaterial=grain.material;objects.add(grain)}
    }

    const colors=payload.viewData?.playerColors||[];
    const moveKey=(s?.moves||0)+'|'+(s?.movedPlayer??-1)+'|'+(s?.path||[]).join('-'),animateMove=moveKey!==lastMoveKey&&Array.isArray(s?.path)&&s.path.length>1;
    if(animateMove)lastMoveKey=moveKey;
    (s?.players||[]).forEach((pl,i)=>{
      const pawn=new THREE.Mesh(pawnGeometry,pawnMaterial(colors[i]||['#dbea9e','#aacdf7','#e4ad91','#c9afe7'][i%4]));pawn.castShadow=true;
      const target=worldForCell(pl.pos,coords),offset=new THREE.Vector3(((i%3)-1)*.13,.12,Math.floor(i/3)*.12);target.add(offset);
      if(animateMove&&i===s.movedPlayer){
        const points=s.path.map(n=>worldForCell(n,coords).add(offset.clone()));pawn.position.copy(points[0]);pawnAnimations.push({mesh:pawn,points,start:performance.now(),duration:Math.min(1700,Math.max(480,points.length*105))});
      }else pawn.position.copy(target);
      objects.add(pawn);
    });

    const values=Array.isArray(s?.dice)&&s.dice.length===2?s.dice:[1,1],diceKey=values.join('-')+'|'+(s?.turn??0)+'|'+(s?.goosePending?.rerolls??0)+'|'+(s?.players?.[s?.turn]?.gooseRolls??0),animateDice=diceKey!==lastDiceKey;
    if(animateDice)lastDiceKey=diceKey;
    values.forEach((value,i)=>{
      const die=dieMesh(value);die.position.set(-.52+i*1.04,TABLE_Y+.72,.05);
      if(payload.canInteract&&!s.goosePending){die.userData={kind:'goose-roll',interactive:true};interactive.push(die)}
      objects.add(die);
      if(animateDice&&motionAllowed()){const h=visualHash(diceKey+'|'+i);die.rotation.set(5+h*4,7+h*5,4+h*6);diceAnimations.push({mesh:die,start:performance.now(),duration:620+i*80,rx:die.rotation.x,ry:die.rotation.y,rz:die.rotation.z})}
    });

    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · JEU DE L’OIE';
    if(status)status.textContent=s?.goosePending?'Choisissez '+s.goosePending.dice.join(' ou ')+' · somme '+(s.goosePending.dice[0]+s.goosePending.dice[1]):(s?.players?.[s.turn]?.name||'Joueur')+' joue';
    if(help)help.textContent=s?.goosePending?'Cliquez une destination éclairée · les boutons 2D restent disponibles dessous':'Cliquez les dés pour lancer · le résultat vient toujours du moteur de jeu';
    if(diceAnimations.length||pawnAnimations.length)startMotion();
  }

  function syncYam(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,dice=payload.viewData?.yamDice||s?.dice||[1,1,1,1,1],held=payload.viewData?.yamHeld||s?.held||[],rolls=Number(payload.viewData?.yamRolls??s?.rolls??0);
    setCameraPose(0,6.75,8.6,0,.25,.15);
    const key='yam|'+(s?.turn??0)+'|'+rolls+'|'+dice.join('-'),animate=rolls>0&&key!==lastDiceKey;if(animate)lastDiceKey=key;
    dice.forEach((value,i)=>{
      const die=rolls?dieMesh(value):blankDieMesh(),x=(i-2)*1.35,z=held[i]?.42:0;
      die.position.set(x,TABLE_Y+.78,z);die.scale.setScalar(held[i]?1.06:1);
      if(payload.canInteract&&rolls>0&&rolls<3){die.userData={kind:'yam-hold',index:i,interactive:true};interactive.push(die)}
      objects.add(die);
      if(held[i]){
        const pad=new THREE.Mesh(heldPadGeometry,tileMaterial('goose',true));pad.position.set(x,TABLE_Y+.36,z);objects.add(pad);
      }
      if(animate&&!held[i]&&motionAllowed()){const h=visualHash(key+'|'+i);die.rotation.set(5+h*4,7+h*5,4+h*6);diceAnimations.push({mesh:die,start:performance.now(),duration:610+i*55,rx:die.rotation.x,ry:die.rotation.y,rz:die.rotation.z})}
    });
    if(payload.canInteract&&rolls<3&&held.filter(Boolean).length<5){
      const roll=actionSprite(rolls?'RELANCER':'LANCER','yam-roll');roll.position.set(0,1.05,2.25);objects.add(roll);
    }
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · YAM';
    if(status)status.textContent=rolls?'Lancer '+rolls+' / 3 · '+held.filter(Boolean).length+' dé'+(held.filter(Boolean).length>1?'s':'')+' conservé'+(held.filter(Boolean).length>1?'s':''):'Cinq dés prêts';
    if(help)help.textContent=rolls&&rolls<3?'Touchez un dé pour le conserver · catégories et score restent synchronisés dessous':rolls>=3?'Trois lancers joués · choisissez une catégorie dessous':'Lancez les cinq dés';
    if(diceAnimations.length)startMotion();
  }

  function syncBox(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,dice=payload.viewData?.boxDice||s?.boxDice||[],open=new Set(payload.viewData?.boxNumbers||s?.boxNumbers||[]),selected=new Set(payload.viewData?.boxSelected||[]),stage=payload.viewData?.boxStage||s?.boxStage||'roll';
    setCameraPose(0,6.9,8.4,0,.28,.05);
    for(let n=1;n<=9;n++){
      const isOpen=open.has(n),isSelected=selected.has(n),x=(n-5)*1.05;
      const tile=new THREE.Mesh(tileGeometry,boxTileMaterial(!isOpen,isSelected));tile.scale.set(1,.22,1.18);tile.position.set(x,TABLE_Y+(isOpen?.42:.31),-1.15);tile.rotation.x=isOpen?-.34:0;tile.castShadow=true;tile.receiveShadow=true;
      if(isOpen&&stage==='choose'&&payload.canInteract){tile.userData={kind:'box-toggle',number:n,interactive:true};interactive.push(tile)}
      objects.add(tile);const label=cellLabel(n);label.scale.set(.58,.4,1);label.position.set(x,TABLE_Y+(isOpen?.62:.39),-1.12);objects.add(label);
    }
    const key='box|'+(s?.moves??0)+'|'+dice.join('-'),animate=dice.length>0&&key!==lastDiceKey;if(animate)lastDiceKey=key;
    dice.forEach((value,i)=>{
      const die=dieMesh(value);die.position.set((i-(dice.length-1)/2)*1.1,TABLE_Y+.82,.45);objects.add(die);
      if(animate&&motionAllowed()){const h=visualHash(key+'|'+i);die.rotation.set(5+h*4,7+h*5,4+h*6);diceAnimations.push({mesh:die,start:performance.now(),duration:600+i*70,rx:die.rotation.x,ry:die.rotation.y,rz:die.rotation.z})}
    });
    if(stage==='roll'&&payload.canInteract){
      const two=actionSprite('LANCER 2 DÉS','box-roll',{count:2});two.position.set(-1.45,1.05,2.3);objects.add(two);
      if(payload.viewData?.boxCanOne){const one=actionSprite('LANCER 1 DÉ','box-roll',{count:1},'#b7d5ee');one.position.set(1.45,1.05,2.3);objects.add(one)}
    }else if(stage==='choose'&&payload.canInteract){
      const total=dice.reduce((a,b)=>a+b,0),sum=[...selected].reduce((a,b)=>a+b,0),confirm=actionSprite('FERMER · '+sum+' / '+total,'box-close',{},sum===total&&sum>0?'#dbea9e':'#9ca69e');confirm.position.set(0,1.05,2.3);confirm.userData.enabled=sum===total&&sum>0;objects.add(confirm);
    }
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · FERME LA BOÎTE';
    if(status)status.textContent=stage==='choose'?'Total '+dice.reduce((a,b)=>a+b,0)+' · '+open.size+' volets ouverts':'Passage '+(s?.boxRound||1)+' / 3';
    if(help)help.textContent=stage==='choose'?'Touchez les volets dont la somme égale les dés puis confirmez':'Lancez deux dés · un seul devient disponible quand 7, 8 et 9 sont fermés';
    if(diceAnimations.length)startMotion();
  }

  function syncSpecialCards(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,data=payload.viewData||{},game=data.specialCardGame||payload.gameId,viewer=Number.isInteger(payload.privateIndex)?payload.privateIndex:0;
    if(!s?.players?.length)return;
    setCameraPose(0,7.35,9.05,0,.24,.15);
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');

    if(game==='pouilleux'){
      const own=payload.spectator?[]:(s.players[viewer]?.hand||[]),n=own.length;
      own.forEach((card,i)=>{const slot=handCardSlot(n,i),mesh=cardMesh(card,{back:!!card.hidden});placeCard(mesh,slot.x,slot.z,TABLE_Y+.11+slot.yOffset,slot.fan,slot.scale)});
      const maid=data.maid||{},count=Number(maid.targetCount)||0,visible=Math.min(24,count);
      for(let i=0;i<visible;i++){
        const slot=pickCardSlot(visible,i),mesh=cardMesh(null,{back:true});placeCard(mesh,slot.x,slot.z,TABLE_Y+.13+slot.yOffset,slot.rot,slot.scale);
        if(payload.canInteract){mesh.userData={kind:'maid-pick',index:i,interactive:true};mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};interactive.push(mesh)}
      }
      if(title)title.textContent='VUE 3D · POUILLEUX';
      if(status)status.textContent='Piochez chez '+(maid.targetName||'le joueur suivant')+' · '+count+' carte'+(count>1?'s':'');
      if(help)help.textContent=payload.canInteract?'Touchez un dos de carte au centre · la paire éventuelle sera retirée par le moteur':(maid.pairs||0)+' paire'+((maid.pairs||0)>1?'s':'')+' déjà formée'+((maid.pairs||0)>1?'s':'');
      return;
    }

    if(game==='quatrevingtdixneuf'){
      const ninety=data.ninety||{},selected=new Set(ninety.selectedIds||[]),selectable=new Set(ninety.selectableIds||[]),legal=new Set(ninety.legalIds||[]),own=payload.spectator?[]:(s.players[viewer]?.hand||[]),n=own.length;
      own.forEach((card,i)=>{
        const slot=handCardSlot(n,i),chosen=selected.has(card.id),isLegal=legal.has(card.id),mesh=cardMesh(card,{back:!!card.hidden,id:card.id,interactiveCard:selectable.has(card.id),playable:selectable.has(card.id)});
        mesh.userData.kind='special-select';mesh.userData.cardId=card.id;mesh.userData.home={position:new THREE.Vector3(slot.x,TABLE_Y+.12+slot.yOffset+(chosen?.25:isLegal?.08:0),slot.z),rotation:new THREE.Euler(-Math.PI/2,0,slot.fan),scale:new THREE.Vector3(1,1,1).multiplyScalar(slot.scale*(chosen?1.07:isLegal?1.025:.98))};
        mesh.position.copy(mesh.userData.home.position);mesh.rotation.copy(mesh.userData.home.rotation);mesh.scale.copy(mesh.userData.home.scale);objects.add(mesh);
      });
      if(ninety.last){const top=cardMesh(ninety.last,{back:!!ninety.last.hidden});placeCard(top,1.5,.05,TABLE_Y+.13,0,.9)}
      const counter=makeLabel('TOTAL '+Number(ninety.total||0)+' / 99',Number(ninety.total)>=85?'#f0b3a6':'#dbea9e');counter.scale.set(3.1,.72,1);counter.position.set(-.35,1.08,-.05);objects.add(counter);
      const opponents=s.players.map((p,i)=>({p,i})).filter(x=>x.i!==viewer&&!x.p.out);
      opponents.forEach(({p,i},k)=>{const label=makeLabel((p.name||'Joueur')+' · '+(p.hand?.length||0)+' cartes',i===s.turn?'#dbea9e':'#d8ded9');label.position.set((k-(opponents.length-1)/2)*2.7,.98,-2.55);label.scale.set(2.5,.52,1);objects.add(label)});
      if(title)title.textContent='VUE 3D · 99';
      if(status)status.textContent=(ninety.dir===-1?'↺':'↻')+' · '+(ninety.deckCount||0)+' cartes en pioche';
      if(help)help.textContent=ninety.lastEffect||'Sélectionnez une carte puis confirmez son effet dessous';
      return;
    }

    if(game==='vingtetun'){
      const bj=data.blackjack||{},dealer=bj.dealer||[],own=bj.hand||[];
      dealer.forEach((card,i)=>{const mesh=cardMesh(card,{back:!!card.hidden});placeCard(mesh,(i-(dealer.length-1)/2)*.82,-.9,TABLE_Y+.13+i*.012,(i-(dealer.length-1)/2)*.04,.78)});
      const dn=own.length;
      own.forEach((card,i)=>{const slot=handCardSlot(dn,i),mesh=cardMesh(card,{back:!!card.hidden});placeCard(mesh,slot.x,slot.z,TABLE_Y+.13+slot.yOffset,slot.fan,slot.scale*.92)});
      const dealerLabel=makeLabel('BANQUE · '+(dealer.length?(bj.dealerRevealed?bj.dealerValue:bj.dealerValue+' + ?'):'—'),'#e6d7b4');dealerLabel.position.set(0,1.02,-2.1);dealerLabel.scale.set(3,.62,1);objects.add(dealerLabel);
      if(bj.phase==='bet'){const bet=makeLabel('FAITES VOS JEUX','#dbea9e');bet.position.set(0,1.05,.2);bet.scale.set(3.6,.8,1);objects.add(bet)}
      if(title)title.textContent='VUE 3D · VINGT-ET-UN';
      if(status)status.textContent=bj.phase==='bet'?(bj.chips||0)+' jetons disponibles':own.length?(bj.playerValue||0)+' points · mise '+(bj.bet||0):'La banque distribue';
      if(help)help.textContent=bj.phase==='bet'?'Choisissez votre mise dans le panneau dessous':bj.phase==='play'?'Tirer, rester ou doubler avec les commandes dessous':'Les cartes de la banque restent masquées jusqu’à la révélation';
      return;
    }

    if(game==='bataille'){
      const battle=data.battle||{},counts=battle.counts||[],players=s.players||[],radius=3.25;
      players.forEach((p,i)=>{
        const angle=(Math.PI*2*i/Math.max(1,players.length))-Math.PI/2,x=Math.cos(angle)*radius,z=Math.sin(angle)*2.25,count=counts[i]??p.hand?.length??0,total=Math.min(5,count);
        for(let c=0;c<total;c++){const mesh=cardMesh(null,{back:true});placeCard(mesh,x+c*.025,z-c*.025,TABLE_Y+.11+c*.025,angle+.08,.58)}
        const label=makeLabel((p.name||'Joueur')+' · '+count,i===s.turn?'#dbea9e':'#d8ded9');label.scale.set(2.2,.48,1);label.position.set(x,.95,z+(z>0 ? .65 : -.65));objects.add(label);
      });
      const reveals=battle.reveals||[];
      reveals.forEach((r,i)=>{
        const ownerIndex=Math.max(0,players.findIndex((_,k)=>k===r.owner)),angle=(Math.PI*2*ownerIndex/Math.max(1,players.length))-Math.PI/2,offset=(i%4)*.18;
        const mesh=cardMesh(r.card||null,{back:!!r.hidden});placeCard(mesh,Math.cos(angle)*(1.1+offset),Math.sin(angle)*(.82+offset),TABLE_Y+.16+i*.01,angle,.64);
      });
      if(payload.canInteract){const action=actionSprite('RETOURNER LE PLI','battle-action');action.position.set(0,1.02,2.45);objects.add(action)}
      if(title)title.textContent='VUE 3D · BATAILLE';
      if(status)status.textContent='Pli '+(Number(battle.number||0)+1)+' / 200'+(battle.winner>=0?' · '+(players[battle.winner]?.name||'')+' gagne':'');
      if(help)help.textContent=payload.canInteract?'Touchez « Retourner le pli » ou utilisez le bouton dessous':'Les paquets restent face cachée';
    }
  }

  function syncCardFamily(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,data=payload.viewData||{},viewer=Number.isInteger(payload.privateIndex)?payload.privateIndex:0,game=data.cardGame||payload.gameId;
    if(!s?.players?.length)return;
    setCameraPose(0,7.4,9.1,0,.22,.15);
    const selected=new Set(data.selectedIds||[]),selectable=new Set(data.selectableIds||[]),playable=new Set(data.cardPlayableIds||[]);
    const own=payload.spectator?[]:(s.players[viewer]?.hand||[]),n=own.length;
    own.forEach((card,i)=>{
      const slot=handCardSlot(n,i),chosen=selected.has(card.id),canSelect=selectable.has(card.id),legal=playable.has(card.id);
      const mesh=cardMesh(card,{back:!!card.hidden,id:card.id,interactiveCard:canSelect,playable:canSelect});
      mesh.userData.kind='card-select';mesh.userData.cardId=card.id;mesh.userData.playable=canSelect;mesh.userData.legal=legal;
      mesh.position.set(slot.x,TABLE_Y+.12+slot.yOffset+(chosen?.26:legal?.09:0),slot.z);mesh.rotation.set(-Math.PI/2,0,slot.fan);mesh.scale.setScalar(slot.scale*(chosen?1.075:legal?1.025:.98));
      mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};objects.add(mesh);
    });
    const opponents=s.players.map((p,i)=>({p,i})).filter(x=>x.i!==viewer);
    opponents.forEach(({p,i},k)=>{
      const count=p.hand?.length||0,total=Math.min(8,count),seat=eightOpponentSeat(opponents.length,k),span=total<=1?0:Math.min(2.8,(total-1)*.40);
      for(let c=0;c<total;c++){const t=total<=1?.5:c/(total-1),mesh=cardMesh(null,{back:true});placeCard(mesh,seat.x+(t-.5)*span,seat.z+Math.abs(t-.5)*.09,TABLE_Y+.15+c*.006,(t-.5)*-.16,.70)}
      const label=makeLabel((p.name||'Joueur')+' · '+count+' carte'+(count>1?'s':''),i===s.turn?'#dbea9e':'#eef2e8');label.position.set(seat.x,1.12,seat.z-.70);label.scale.set(3.0,.62,1);objects.add(label);
    });
    const center=data.cardCenter||{};
    if(game==='president'){
      (center.cards||[]).forEach((card,i)=>{const mesh=cardMesh(card,{back:!!card.hidden});placeCard(mesh,(i-(center.cards.length-1)/2)*.72,.05,TABLE_Y+.13+i*.01,(i-(center.cards.length-1)/2)*.05,.82)});
    }else if(game==='menteur'){
      const count=Math.min(7,Number(center.backCount)||0);
      for(let i=0;i<count;i++){const mesh=cardMesh(null,{back:true});placeCard(mesh,(i-count/2)*.045,.08-i*.018,TABLE_Y+.1+i*.025,(i-count/2)*.02,.82)}
      (center.cards||[]).forEach((card,i)=>{const mesh=cardMesh(card,{back:!!card.hidden});placeCard(mesh,(i-(center.cards.length-1)/2)*.72,-.65,TABLE_Y+.16+i*.01,(i-(center.cards.length-1)/2)*.04,.72)});
    }else if(game==='suites'){
      setCameraPose(0,8.9,7.2,0,.18,0);
      const suits=['S','H','D','C'];
      suits.forEach((suit,row)=>{
        const cards=center.lanes?.[suit]||[];
        cards.forEach(card=>{const x=(Number(card.rank)-7)*.62,z=(row-1.5)*1.25,mesh=cardMesh(card,{back:!!card.hidden});placeCard(mesh,x,z,TABLE_Y+.12,0,.48)});
        const label=makeLabel((SUIT_NAME[suit]||suit).toUpperCase(),['H','D'].includes(suit)?'#eab3ad':'#dbea9e');label.scale.set(1.6,.42,1);label.position.set(-4.65,.92,(row-1.5)*1.25);objects.add(label);
      });
    }else if(game==='plis'){
      (center.entries||[]).forEach((entry,i)=>{
        const a=(Math.PI*2*i/Math.max(1,center.entries.length))-Math.PI/2,x=Math.cos(a)*1.45,z=Math.sin(a)*1.1,mesh=cardMesh(entry.card,{back:!!entry.card?.hidden});
        placeCard(mesh,x,z,TABLE_Y+.16,i*.06,.78);
      });
    }else if(game==='encheres'){
      if(center.prize){const prize=cardMesh(center.prize,{back:!!center.prize.hidden});placeCard(prize,0,-.55,TABLE_Y+.15,0,.88)}
      const bids=center.bids||[];
      bids.forEach((card,i)=>{
        if(!card)return;const x=(i-(bids.length-1)/2)*1.18,mesh=cardMesh(card,{back:!!card.hidden});
        placeCard(mesh,x,.75,TABLE_Y+.13+i*.008,(i-(bids.length-1)/2)*.03,.64);
      });
    }
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    const names={president:'PRÉSIDENT',menteur:'MENTEUR',suites:'QUATRE SUITES',plis:'CHASSE AUX PLIS',encheres:'ENCHÈRES'};
    if(title)title.textContent='VUE 3D · '+(names[game]||'CARTES');
    if(status){
      if(game==='president')status.textContent=center.revolution?'Révolution · ordre inversé':center.cards?.length?center.cards.length+' carte'+(center.cards.length>1?'s':'')+' au pli':'Nouveau pli';
      else if(game==='menteur')status.textContent=center.claim?'Annonce : '+center.claim.count+' × '+(RANK_NAME[center.claim.rank]||center.claim.rank):'Valeur demandée : '+(RANK_NAME[center.required]||center.required);
      else if(game==='suites')status.textContent=center.opening?'Le 7 de cœur doit ouvrir':'Prolongez les quatre familles';
      else if(game==='plis')status.textContent='Atout '+(SUIT_SYMBOL[center.trump]||center.trump)+' · pli '+Math.min(6,(center.completedTricks||0)+1)+'/6';
      else if(game==='encheres')status.textContent='Tour '+(center.bidRound||1)+' · '+(center.pot||0)+' points à remporter';
    }
    if(help)help.textContent=payload.canInteract?'Touchez une carte pour la sélectionner · validez ensuite avec les commandes habituelles':'La table 3D suit la partie · les commandes restent synchronisées dessous';
  }

  function syncEight(payload){
    clearObjects();dropMarker.visible=true;
    setCameraPose(0,7.25,9.25,0,.25,.2);
    const s=payload.state,viewer=Number.isInteger(payload.privateIndex)?payload.privateIndex:0;
    if(!s?.players?.length){lastEightSnapshot=null;return}
    const own=payload.spectator?[]:(s.players[viewer]?.hand||[]),playable=new Set(payload.viewData?.playableIds||[]),previous=lastEightSnapshot;

    const n=own.length;
    own.forEach((card,i)=>{
      const slot=handCardSlot(n,i),mesh=cardMesh(card,{id:card.id,interactiveCard:playable.has(card.id),playable:playable.has(card.id)});
      const lift=playable.has(card.id)?.14:0,scale=slot.scale*(playable.has(card.id)?1.025:1);
      placeCard(mesh,slot.x,slot.z,TABLE_Y+.12+slot.yOffset+lift,slot.fan,scale);
      mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};
    });

    const deckCount=Array.isArray(s.deck)?s.deck.length:Number(s.deckCount||0);
    for(let i=0;i<Math.min(5,Math.max(1,deckCount));i++){
      const mesh=cardMesh(null,{back:true,interactiveCard:i===Math.min(5,Math.max(1,deckCount))-1});
      mesh.userData.kind=i===Math.min(5,Math.max(1,deckCount))-1?'deck':'card';
      if(mesh.userData.kind==='deck')mesh.userData.interactive=!!payload.canInteract;
      placeCard(mesh,-1.25,.05,TABLE_Y+.07+i*.035,-.025+i*.012,1);
    }
    const top=s.discard?.at?.(-1);let discardMesh=null;
    if(top){discardMesh=cardMesh(top);placeCard(discardMesh,1.25,.05,TABLE_Y+.12,(visualHash(top.id)-.5)*.18,1);}
    dropMarker.material.opacity=.2;

    const opponents=s.players.map((p,i)=>({p,i})).filter(x=>x.i!==viewer),opponentVisuals=new Map();
    opponents.forEach(({p,i},k)=>{
      const count=p.hand?.length||0,total=Math.min(8,count),seat=eightOpponentSeat(opponents.length,k),span=total<=1?0:Math.min(3.0,(total-1)*.42),meshes=[];
      for(let c=0;c<total;c++){
        const t=total<=1?.5:c/(total-1),x=seat.x+(t-.5)*span,mesh=cardMesh(null,{back:true});
        placeCard(mesh,x,seat.z+Math.abs(t-.5)*.10,TABLE_Y+.16+c*.006,(t-.5)*-.18,.74);meshes.push(mesh);
      }
      const label=makeLabel((p.name||'Joueur')+' · '+count+' carte'+(count>1?'s':''),i===s.turn?'#dbea9e':'#eef2e8');
      label.position.set(seat.x,1.16,seat.z-.74);label.scale.set(3.25,.68,1);objects.add(label);
      opponentVisuals.set(i,{...seat,meshes,count});
    });

    const snapshot=eightSnapshot(payload,deckCount,top);
    if(previous&&previous.key===snapshot.key&&motionAllowed()){
      const opponentIndices=snapshot.handCounts.map((_,i)=>i).filter(i=>i!==viewer);
      const discardChanged=!!top&&snapshot.topId!==previous.topId;
      const played=discardChanged?opponentIndices.find(i=>snapshot.handCounts[i]===previous.handCounts[i]-1):undefined;
      if(Number.isInteger(played)){
        const visual=opponentVisuals.get(played);
        if(visual){
          const from=new THREE.Vector3(visual.x,TABLE_Y+.34,visual.z+.12),to=new THREE.Vector3(1.25,TABLE_Y+.23,.05),flight=cardMesh(top);
          if(discardMesh)discardMesh.visible=false;
          queueCardFlight(flight,from,to,{duration:700,lift:1.0,fromRot:.04,toRot:(visualHash(top.id)-.5)*.18,onDone:()=>{if(discardMesh)discardMesh.visible=true}});
        }
      }else if(snapshot.deckCount<previous.deckCount){
        const drawn=opponentIndices.find(i=>snapshot.handCounts[i]>previous.handCounts[i]);
        if(Number.isInteger(drawn)){
          const visual=opponentVisuals.get(drawn),amount=Math.min(3,Math.max(1,snapshot.handCounts[drawn]-previous.handCounts[drawn]));
          if(visual){
            const arrivals=visual.meshes.slice(-Math.min(amount,visual.meshes.length));arrivals.forEach(mesh=>mesh.visible=false);
            for(let q=0;q<amount;q++){
              const flight=cardMesh(null,{back:true}),from=new THREE.Vector3(-1.25,TABLE_Y+.28,.05),to=new THREE.Vector3(visual.x+(q-(amount-1)/2)*.18,TABLE_Y+.25,visual.z+.08);
              queueCardFlight(flight,from,to,{duration:610,delay:q*115,lift:.82,fromRot:-.02,toRot:(q-(amount-1)/2)*.05,onDone:()=>{if(arrivals[q])arrivals[q].visible=true}});
            }
          }
        }
      }
    }
    lastEightSnapshot=snapshot;

    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · 8 AMÉRICAIN';
    if(status){const requested=SUIT_NAME[s.suit]||'',attack=s.pendingDraw>0?' · attaque +'+s.pendingDraw:'';status.textContent=(requested?requested+' demandé':'')+attack}
    if(help)help.textContent='Cliquez ou glissez une carte vers la défausse · cliquez la pioche pour piocher';
  }
  function syncRummikub(payload){
    clearObjects();dropMarker.visible=false;
    setCameraPose(0,8.15,10.2,0,.15,-.15);
    const data=payload.viewData?.rummi;if(!data)return;
    const selected=new Set(data.selectedIds||[]),oldIds=new Set(data.refTableIds||[]);
    const groups=data.table||[],cols=4;
    groups.forEach((group,gi)=>{
      if(!group?.length)return;
      const col=gi%cols,row=Math.floor(gi/cols),baseX=(col-(cols-1)/2)*2.45,baseZ=-2.15+row*1.12;
      group.forEach((tile,ti)=>{
        const movable=data.canMove&&(data.canMoveOld||!oldIds.has(tile.id)),mesh=rummiTileMesh(tile,selected.has(tile.id),movable);
        mesh.position.set(baseX+(ti-(group.length-1)/2)*.54,TABLE_Y+.37,baseZ);mesh.rotation.x=-Math.PI/2;mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};objects.add(mesh);
      });
      if(data.canMove&&selected.size){
        const target=actionSprite('AJOUTER','rummi-dest',{dest:gi},'#dbea9e');target.position.set(baseX,TABLE_Y+.82,baseZ+.62);target.scale.set(1.5,.38,1);objects.add(target);
      }
    });
    const hand=data.hand||[],span=Math.min(8.2,Math.max(2,(hand.length-1)*.52));
    hand.forEach((tile,i)=>{
      const t=hand.length<=1?.5:i/(hand.length-1),x=(t-.5)*span,mesh=rummiTileMesh(tile,selected.has(tile.id),!!data.canMove);
      mesh.position.set(x,TABLE_Y+.42,2.72+Math.abs(t-.5)*.15);mesh.rotation.x=-Math.PI/2;mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};objects.add(mesh);
    });
    if(data.canMove&&selected.size){
      const fresh=actionSprite('NOUVEAU GROUPE','rummi-dest',{dest:'new'},'#dbea9e');fresh.position.set(-2.15,1.02,1.55);objects.add(fresh);
      const toHand=actionSprite('AU CHEVALET','rummi-dest',{dest:'hand'},'#d8ded9');toHand.position.set(2.15,1.02,1.55);objects.add(toHand);
    }
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · RUMMIKUB';
    if(status)status.textContent=data.diagnostic?.text||((data.deckCount||0)+' tuiles dans la pioche');
    if(help)help.textContent=data.canMove?'Sélectionnez des tuiles, puis choisissez un groupe ou le chevalet':'Le chevalet actif reste privé · table commune synchronisée';
  }
  function syncCactus(payload){
    clearObjects();dropMarker.visible=false;
    setCameraPose(0,7.7,9.7,0,.2,.15);
    const data=payload.viewData?.cactus,s=payload.state;if(!data||!s)return;
    const viewer=data.viewer,players=data.players||[],count=Math.max(1,players.length);
    players.forEach((p,i)=>{
      const mine=i===viewer,angle=mine?Math.PI/2:(i/(count-1||1))*Math.PI-Math.PI/2;
      const cx=mine?0:Math.sin(angle)*4.2,cz=mine?2.45:-2.15+Math.cos(angle)*.72;
      (p.hand||[]).forEach((card,index)=>{
        if(!card)return;
        const col=index%2,row=Math.floor(index/2),x=cx+(col-.5)*1.02,z=cz+(row-.5)*.78;
        const visible=!card.hidden,quick=!!p.quick&&mine,turnAction=mine&&i===data.turn&&payload.canInteract&&(['swap','power'].includes(data.phase));
        const interactiveCard=quick||turnAction;
        const mesh=cardMesh(visible?card:null,{back:!visible,id:card.id,interactiveCard,playable:false});
        mesh.userData.kind=quick?'cactus-quick':turnAction?(data.phase==='swap'?'cactus-swap':'cactus-target'):'cactus-card';
        mesh.userData.index=index;mesh.userData.owner=i;mesh.userData.interactive=interactiveCard;
        placeCard(mesh,x,z,TABLE_Y+.11,(col-.5)*.035,mine?0.76:0.62);
        mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};
      });
      const label=makeLabel((p.name||'Joueur')+' · '+p.score+' pts'+(data.caller===i?' · CACTUS !':''),i===data.turn?'#dbea9e':'#d8ded9');
      label.position.set(cx,1.08,cz+(mine?.95:-.88));label.scale.set(mine?3.4:2.65,mine?.72:.58,1);objects.add(label);
    });
    const deck=Math.max(0,Number(data.deckCount)||0);
    for(let i=0;i<Math.min(5,Math.max(1,deck));i++){
      const top=i===Math.min(5,Math.max(1,deck))-1,mesh=cardMesh(null,{back:true,interactiveCard:top&&payload.canInteract&&data.phase==='draw'});
      mesh.userData.kind=top&&payload.canInteract&&data.phase==='draw'?'cactus-draw':'cactus-card';mesh.userData.interactive=top&&payload.canInteract&&data.phase==='draw';
      placeCard(mesh,-1.35,.1,TABLE_Y+.07+i*.035,-.02+i*.01,.82);
    }
    if(data.discard){const mesh=cardMesh(data.discard,{interactiveCard:payload.canInteract&&data.phase==='draw'});mesh.userData.kind=payload.canInteract&&data.phase==='draw'?'cactus-take':'cactus-card';mesh.userData.interactive=payload.canInteract&&data.phase==='draw';placeCard(mesh,0,.1,TABLE_Y+.12,(visualHash(data.discard.id)-.5)*.12,.82);}
    if(data.drawn){const mesh=cardMesh(data.drawn);mesh.userData.kind='cactus-drawn';placeCard(mesh,1.35,.1,TABLE_Y+.14,0,.88);}
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · CACTUS';
    if(status)status.textContent=data.caller!==null?'Dernier tour · Cactus annoncé':data.phase==='peek'?'Mémorisez vos deux cartes':data.phase==='draw'?'Pioche ou défausse':data.phase==='swap'?'Échangez une carte':data.phase==='power'?'Pouvoir du 8':data.phase==='reveal'?'Mémorisez la carte':'Table synchronisée';
    if(help)help.textContent=data.phase==='peek'||data.phase==='reveal'?'Utilisez « C’est mémorisé » sous la table':data.phase==='draw'?'Cliquez la pioche ou la défausse · vos cartes permettent aussi le jet rapide':data.phase==='swap'?'Cliquez une de vos cartes pour l’échanger':data.phase==='power'?'Cliquez une de vos cartes pour la regarder':'Les cartes restent cachées comme dans la vue 2D';
  }
  function syncEcho(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,data=payload.viewData?.echo||{},phase=data.phase||s?.phase||'watch',sequence=Array.isArray(data.sequence)?data.sequence:[],input=Array.isArray(data.input)?data.input:[],colors=['#b5e4a4','#aacdf7','#edbe86','#e7aaca'],symbols=['●','◆','▲','■'];
    setCameraPose(0,6.7,8.3,0,.35,.15);
    const baseGeo=new THREE.BoxGeometry(9,.18,5.4),baseMat=new THREE.MeshStandardMaterial({color:0x203b34,roughness:.92,metalness:.01}),base=new THREE.Mesh(baseGeo,baseMat);base.position.set(0,TABLE_Y-.01,.1);base.receiveShadow=true;base.userData.temporaryGeometry=baseGeo;base.userData.temporaryMaterial=baseMat;objects.add(base);
    for(let i=0;i<4;i++){
      const activePad=phase==='repeat'&&payload.canInteract,mat=new THREE.MeshStandardMaterial({color:new THREE.Color(colors[i]),roughness:.62,metalness:.03,emissive:new THREE.Color(colors[i]),emissiveIntensity:activePad?.34:.12});
      const pad=new THREE.Mesh(tileGeometry,mat);pad.scale.set(1.62,.72,1.65);pad.position.set((i-1.5)*2.05,TABLE_Y+.43,.75);pad.castShadow=true;pad.receiveShadow=true;pad.userData.temporaryMaterial=mat;
      if(activePad){pad.userData={...pad.userData,kind:'echo-pad',index:i,interactive:true};interactive.push(pad)}
      objects.add(pad);
      const label=makeLabel((i+1)+' '+symbols[i],colors[i]);label.scale.set(1.3,.4,1);label.position.set(pad.position.x,TABLE_Y+.72,.73);objects.add(label);
    }
    const expected=Math.max(0,Number(data.stage||s?.stage||1)+2);
    for(let i=0;i<expected;i++){
      const value=sequence[i],known=Number.isInteger(value)&&value>=0&&value<4,answered=i<input.length;
      const mat=new THREE.MeshStandardMaterial({color:known?new THREE.Color(colors[value]):answered?0x88a896:0x56685e,roughness:.7,emissive:known?new THREE.Color(colors[value]):0x000000,emissiveIntensity:known?.42:0});
      const lamp=new THREE.Mesh(dieGeometry,mat);lamp.scale.set(.42,.18,.42);lamp.position.set((i-(expected-1)/2)*.92,TABLE_Y+.63,-1.12);lamp.userData.temporaryMaterial=mat;objects.add(lamp);
      if(phase==='result'&&known&&answered){
        const ok=input[i]===value,mark=makeLabel(ok?'✓':'×',ok?'#b5e4a4':'#efaaa0');mark.scale.set(.58,.28,1);mark.position.set(lamp.position.x,TABLE_Y+.9,-1.12);objects.add(mark);
      }
    }
    if(phase==='watch'&&payload.canInteract){const go=actionSprite('À MOI · CACHER','echo-memorized');go.position.set(0,1.12,2.35);objects.add(go)}
    if(phase==='result'&&payload.canInteract){const next=actionSprite('CONTINUER','echo-continue');next.position.set(0,1.12,2.35);objects.add(next)}
    (data.players||[]).forEach((p,i)=>{const tag=makeLabel((p.name||'Joueur')+' · '+Number(p.score||0),i===s?.turn?'#dbea9e':'#d8ded9');tag.scale.set(1.7,.34,1);tag.position.set((i-(data.players.length-1)/2)*2.15,.93,-2.32);objects.add(tag)});
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · ÉCHO NÉON';
    if(status)status.textContent='Manche '+(data.stage||1)+' / 5 · '+(phase==='watch'?'mémorisation':phase==='repeat'?'reproduction '+input.length+' / '+expected:phase==='result'?'résultat':'partie terminée');
    if(help)help.textContent=phase==='watch'?'Mémorisez les lumières dans l’ordre puis cachez la séquence':phase==='repeat'?'Touchez les quatre pads dans le bon ordre':phase==='result'?(data.feedback||'Séquence terminée'):'Scores synchronisés avec le moteur';
  }

  function golfWorld(point,y=TABLE_Y+.5){
    const x=Array.isArray(point)?Number(point[0]):Number(point?.x),z=Array.isArray(point)?Number(point[1]):Number(point?.y);
    return new THREE.Vector3((x-330)/68,y,(z-150)/52);
  }

  function syncGolf(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,data=payload.viewData?.golf3d||{},phase=data.phase||s?.phase||'play',course=data.course||{hole:{x:330,y:150},obstacles:[]},pos=data.pos||{x:65,y:220},path=Array.isArray(data.path)?data.path:[],stroke=Math.max(0,Number(data.stroke||0)),sunk=!!data.sunk;
    const direct=Math.round(Math.atan2(Number(course.hole?.y||150)-Number(pos.y||0),Number(course.hole?.x||330)-Number(pos.x||0))*180/Math.PI),aimKey=[s?.turn??0,data.stage||1,stroke,phase].join('|');
    if(golfAimKey!==aimKey){golfAimKey=aimKey;golfAim={angle:direct,power:50}}
    setCameraPose(0,7.45,8.65,0,.15,0);
    const courseGeo=new THREE.BoxGeometry(10.15,.18,6.15),courseMat=new THREE.MeshStandardMaterial({color:0x234553,roughness:.93,metalness:.02}),courseMesh=new THREE.Mesh(courseGeo,courseMat);courseMesh.position.set(0,TABLE_Y-.02,0);courseMesh.receiveShadow=true;courseMesh.userData.temporaryGeometry=courseGeo;courseMesh.userData.temporaryMaterial=courseMat;objects.add(courseMesh);
    for(const obstacle of course.obstacles||[]){
      const r=Math.max(.18,Number(obstacle.r||20)/58),geo=new THREE.DodecahedronGeometry(r,1),mat=new THREE.MeshStandardMaterial({color:0x69708c,roughness:.94,metalness:.03}),rock=new THREE.Mesh(geo,mat),p=golfWorld(obstacle,TABLE_Y+.24+r*.45);
      rock.position.copy(p);rock.scale.y=.62;rock.castShadow=true;rock.receiveShadow=true;rock.userData.temporaryGeometry=geo;rock.userData.temporaryMaterial=mat;objects.add(rock);
    }
    const hole=golfWorld(course.hole,TABLE_Y+.31),portalGeo=new THREE.TorusGeometry(.31,.065,12,36),portalMat=new THREE.MeshStandardMaterial({color:0xbdebdc,roughness:.35,metalness:.08,emissive:0x3d8a7d,emissiveIntensity:sunk?.8:.45}),portal=new THREE.Mesh(portalGeo,portalMat);
    portal.rotation.x=Math.PI/2;portal.position.copy(hole);portal.userData.temporaryGeometry=portalGeo;portal.userData.temporaryMaterial=portalMat;objects.add(portal);
    const innerGeo=new THREE.CylinderGeometry(.18,.18,.035,30),innerMat=new THREE.MeshStandardMaterial({color:0x102a34,roughness:.72,emissive:0x285a58,emissiveIntensity:.22}),inner=new THREE.Mesh(innerGeo,innerMat);inner.position.copy(hole);inner.position.y-=.04;inner.userData.temporaryGeometry=innerGeo;inner.userData.temporaryMaterial=innerMat;objects.add(inner);
    if(path.length>1){
      const pts=path.map(p=>golfWorld(p,TABLE_Y+.34)),geo=new THREE.BufferGeometry().setFromPoints(pts),mat=new THREE.LineBasicMaterial({color:0xe7d88f,transparent:true,opacity:.72}),trail=new THREE.Line(geo,mat);trail.userData.temporaryGeometry=geo;trail.userData.temporaryMaterial=mat;objects.add(trail);
    }
    const ballMat=new THREE.MeshStandardMaterial({color:0xfff2ca,roughness:.5,metalness:.02}),ball=new THREE.Mesh(golfBallGeometry,ballMat),ballTarget=golfWorld(pos,TABLE_Y+.47);
    ball.position.copy(ballTarget);ball.castShadow=true;ball.userData.temporaryMaterial=ballMat;objects.add(ball);
    const shotKey=[s?.turn??0,data.stage||1,stroke,path.length,path.at(-1)?.join(',')||''].join('|');
    if(stroke>0&&path.length>1&&shotKey!==lastGolfKey&&motionAllowed()){lastGolfKey=shotKey;const pts=path.map(p=>golfWorld(p,TABLE_Y+.47));ball.position.copy(pts[0]);pawnAnimations.push({mesh:ball,points:pts,start:performance.now(),duration:Math.min(1500,Math.max(650,pts.length*34)),lift:.025})}
    if(phase==='play'&&payload.canInteract){
      const len=.85+golfAim.power/100*1.15,rad=golfAim.angle*Math.PI/180,aimGeo=new THREE.BoxGeometry(len,.045,.07),aimMat=new THREE.MeshStandardMaterial({color:0xf1dea0,roughness:.5,emissive:0x5a4d20,emissiveIntensity:.28}),aim=new THREE.Mesh(aimGeo,aimMat);
      aim.rotation.y=-rad;aim.position.copy(ballTarget);aim.position.x+=Math.cos(rad)*len*.5;aim.position.z+=Math.sin(rad)*len*.5;aim.position.y=TABLE_Y+.34;aim.userData.temporaryGeometry=aimGeo;aim.userData.temporaryMaterial=aimMat;objects.add(aim);
      const controls=[
        {x:-3.25,text:'↶ 5°',kind:'golf-adjust',control:'angle',delta:-5,accent:'#b8d9e2'},
        {x:-1.65,text:'− 5%',kind:'golf-adjust',control:'power',delta:-5,accent:'#d9d0e4'},
        {x:0,text:'TIRER · '+golfAim.power+'%',kind:'golf-shoot',accent:'#dbea9e'},
        {x:1.65,text:'+ 5%',kind:'golf-adjust',control:'power',delta:5,accent:'#d9d0e4'},
        {x:3.25,text:'5° ↷',kind:'golf-adjust',control:'angle',delta:5,accent:'#b8d9e2'}
      ];
      controls.forEach(cfg=>{const action=actionSprite(cfg.text,cfg.kind,{control:cfg.control,delta:cfg.delta},cfg.accent);action.scale.set(cfg.kind==='golf-shoot'?1.7:1.28,.48,1);action.position.set(cfg.x,1.02,2.52);objects.add(action)});
    }else if(phase==='result'&&payload.canInteract){const next=actionSprite('CONTINUER','golf-continue');next.position.set(0,1.02,2.52);objects.add(next)}
    (data.players||[]).forEach((p,i)=>{const tag=makeLabel((p.name||'Joueur')+' · '+Number(p.score||0),i===s?.turn?'#dbea9e':'#d8ded9');tag.scale.set(1.7,.34,1);tag.position.set((i-(data.players.length-1)/2)*2.15,.9,-2.82);objects.add(tag)});
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · MINI-GOLF COSMIQUE';
    if(status)status.textContent='Secteur '+(data.stage||1)+' / 5 · '+stroke+' / 4 coup'+(stroke>1?'s':'')+(phase==='play'?' · '+golfAim.angle+'° · '+golfAim.power+' %':'');
    if(help)help.textContent=phase==='play'?'Réglez direction et puissance · la trajectoire et les collisions sont calculées uniquement par le moteur':phase==='result'?(data.feedback||'Portail terminé'):'Scores synchronisés';
    if(pawnAnimations.length)startMotion();
  }

  function syncCode(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,data=payload.viewData?.code3d||{},phase=data.phase||s?.phase||'play',history=Array.isArray(data.history)?data.history:[],secret=Array.isArray(data.secret)?data.secret:[],symbols=['●','◆','▲','■','✦','☾'],colors=['#f0a6b7','#93d4ec','#e6d58c','#bbaceb','#a8ddb8','#efbc88'];
    const key=[s?.turn??0,data.stage||1,history.length,phase].join('|');if(codeDraftKey!==key){codeDraftKey=key;codeDraft=[0,1,2]}
    setCameraPose(0,6.65,8.45,0,.45,.1);
    const vaultGeo=new THREE.BoxGeometry(6.8,.28,3.7),vaultMat=new THREE.MeshStandardMaterial({color:phase==='result'?0x3c4b38:0x332c43,roughness:.8,metalness:.1,emissive:phase==='result'?0x26331d:0x171320,emissiveIntensity:.25}),vault=new THREE.Mesh(vaultGeo,vaultMat);
    vault.position.set(0,TABLE_Y+.12,.05);vault.receiveShadow=true;vault.castShadow=true;vault.userData.temporaryGeometry=vaultGeo;vault.userData.temporaryMaterial=vaultMat;objects.add(vault);
    const shown=phase==='result'&&secret.length===3?secret:codeDraft;
    for(let i=0;i<3;i++){
      const value=Math.max(0,Math.min(5,Number(shown[i]??i))),mat=new THREE.MeshStandardMaterial({color:new THREE.Color(colors[value]),roughness:.38,metalness:.12,emissive:new THREE.Color(colors[value]),emissiveIntensity:phase==='result'?.38:.18}),gem=new THREE.Mesh(codeGemGeometry,mat);
      gem.position.set((i-1)*1.72,TABLE_Y+1.15,.15);gem.scale.set(1,1.12,.72);gem.castShadow=true;gem.userData.temporaryMaterial=mat;
      if(phase==='play'&&payload.canInteract){gem.userData={...gem.userData,kind:'code-cycle',index:i,interactive:true,home:{scale:gem.scale.clone()}};interactive.push(gem)}
      objects.add(gem);
      const label=makeLabel((i+1)+' · '+symbols[value],colors[value]);label.scale.set(1.2,.42,1);label.position.set(gem.position.x,TABLE_Y+1.83,.15);objects.add(label);
    }
    const recent=history.slice(-4);
    recent.forEach((h,j)=>{
      const row=history.length-recent.length+j+1,guess=(h.colors||[]).map(n=>symbols[n]||'?').join(' '),label=makeLabel(row+' · '+guess+'   '+Number(h.exact||0)+' ✓  '+Number(h.near||0)+' ↔','#d9d0e4');
      label.scale.set(4.4,.42,1);label.position.set(0,.78,-1.2-j*.48);objects.add(label);
    });
    if(phase==='play'&&payload.canInteract){const submit=actionSprite('TESTER LE CODE','code-submit',{},'#d2b6fa');submit.position.set(0,1.02,2.42);objects.add(submit)}
    else if(phase==='result'&&payload.canInteract){const next=actionSprite('CONTINUER','code-continue',{},'#dbea9e');next.position.set(0,1.02,2.42);objects.add(next)}
    (data.players||[]).forEach((p,i)=>{const tag=makeLabel((p.name||'Joueur')+' · '+Number(p.score||0),i===s?.turn?'#dbea9e':'#d8ded9');tag.scale.set(1.7,.34,1);tag.position.set((i-(data.players.length-1)/2)*2.15,.9,-2.75);objects.add(tag)});
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]'),left=Math.max(0,6-history.length);
    if(title)title.textContent='VUE 3D · CODE SECRET';
    if(status)status.textContent='Coffre '+(data.stage||1)+' / 5 · '+(phase==='play'?left+' proposition'+(left>1?'s':'')+' restante'+(left>1?'s':''):phase==='result'?(data.feedback||'Coffre terminé'):'partie terminée');
    if(help)help.textContent=phase==='play'?'Touchez chaque gemme pour changer son symbole puis testez la combinaison':phase==='result'?'Le code est maintenant révélé · continuez pour le coffre suivant':'Scores synchronisés';
  }

  function syncIntrus(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,data=payload.viewData?.intrus||{},phase=data.phase||s?.phase||'play',count=Math.max(0,Number(data.count||0)),tiles=Array.isArray(data.tiles)?data.tiles:[],tried=new Set(Array.isArray(data.tried)?data.tried:[]),stage=Math.max(1,Math.min(5,Number(data.stage||1))),revealed=phase==='result'||phase==='over';
    const cols=count<=9?3:count<=16?4:5,rows=Math.max(1,Math.ceil(count/cols)),xGap=1.42,zGap=1.08;
    setCameraPose(0,7.1,8.8,0,.28,-.15);
    const baseGeo=new THREE.BoxGeometry(9.4,.16,5.75),baseMat=new THREE.MeshStandardMaterial({color:0x253a35,roughness:.95}),base=new THREE.Mesh(baseGeo,baseMat);base.position.set(0,TABLE_Y-.015,-.15);base.receiveShadow=true;base.userData.temporaryGeometry=baseGeo;base.userData.temporaryMaterial=baseMat;objects.add(base);
    const symbols=['⊙','◇','◌','✦','⬡'],normalOffsets=[[.22,.15],[-.2,.17],[.18,.14],[0,.2],[-.16,-.16]],oddOffsets=[[.22,-.15],[.2,.17],[.29,.02],[0,.08],[-.16,.16]];
    for(let i=0;i<count;i++){
      const row=Math.floor(i/cols),col=i%cols,rowCount=Math.min(cols,count-row*cols),x=(col-(rowCount-1)/2)*xGap,z=(row-(rows-1)/2)*zGap-.18,different=!!tiles[i],wasTried=tried.has(i),found=revealed&&different;
      const mat=new THREE.MeshStandardMaterial({color:found?0x657844:wasTried?0x49383a:0x314943,roughness:.84,metalness:.02,emissive:found?0x48552c:0x000000,emissiveIntensity:found?.4:0}),tile=new THREE.Mesh(tileGeometry,mat);
      tile.scale.set(1.28,.34,1.3);tile.position.set(x,TABLE_Y+.38,z);tile.castShadow=true;tile.receiveShadow=true;tile.userData.temporaryMaterial=mat;
      if(phase==='play'&&payload.canInteract&&!wasTried){tile.userData={...tile.userData,kind:'intrus-spot',index:i,interactive:true,home:{scale:tile.scale.clone()}};interactive.push(tile)}
      objects.add(tile);
      const label=makeLabel(symbols[stage-1],wasTried?'#aa9791':found?'#f5ebb0':'#e2cd96');label.scale.set(.72,.52,1);label.position.set(x,TABLE_Y+.7,z);objects.add(label);
      const offset=(different?oddOffsets:normalOffsets)[stage-1],dotMat=new THREE.MeshStandardMaterial({color:found?0xf4e4ae:0xe4d29d,roughness:.55,emissive:found?0x766c37:0x241f12,emissiveIntensity:found?.55:.18}),dot=new THREE.Mesh(intrusDotGeometry,dotMat);
      dot.position.set(x+offset[0],TABLE_Y+.69,z+offset[1]);dot.userData.temporaryMaterial=dotMat;objects.add(dot);
      if(found){const check=makeLabel('✓','#f4e4ae');check.scale.set(.46,.3,1);check.position.set(x+.43,TABLE_Y+.9,z-.34);objects.add(check)}
    }
    if(phase==='result'&&payload.canInteract){const next=actionSprite('CONTINUER','intrus-continue');next.position.set(0,1.05,2.5);objects.add(next)}
    (data.players||[]).forEach((p,i)=>{const tag=makeLabel((p.name||'Joueur')+' · '+Number(p.score||0),i===s?.turn?'#dbea9e':'#d8ded9');tag.scale.set(1.72,.34,1);tag.position.set((i-(data.players.length-1)/2)*2.18,.92,-2.7);objects.add(tag)});
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]'),remaining=Math.max(0,3-tried.size);
    if(title)title.textContent='VUE 3D · L’INTRUS';
    if(status)status.textContent='Manche '+stage+' / 5 · '+(phase==='play'?remaining+' essai'+(remaining>1?'s':'')+' restant'+(remaining>1?'s':''):phase==='result'?(data.feedback||'Constellation terminée'):'partie terminée');
    if(help)help.textContent=phase==='play'?'Repérez le seul petit détail différent puis touchez son symbole':phase==='result'?'L’intrus est révélé · continuez pour la constellation suivante':'Scores synchronisés';
  }

  function syncAnagram(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,data=payload.viewData?.anagram||{},phase=data.phase||s?.phase||'play',letters=Array.isArray(data.letters)?data.letters:[],attempts=Math.max(0,Number(data.attempts||0));
    const key=[s?.turn??0,data.stage||1,attempts,phase].join('|');if(wordDraftKey!==key){wordDraftKey=key;wordSelection=[]}
    setCameraPose(0,6.55,8.35,0,.35,.05);
    const clue=makeLabel(data.clue||'Remettez les lettres dans l’ordre','#f2d6b8');clue.scale.set(5.6,.72,1);clue.position.set(0,2.68,-1.95);objects.add(clue);
    const span=Math.min(8.2,Math.max(2.2,(letters.length-1)*.92));
    letters.forEach((letter,i)=>{
      const t=letters.length<=1?.5:i/(letters.length-1),selected=wordSelection.includes(i),mat=new THREE.MeshStandardMaterial({color:selected?0x514b43:0xd9c7a5,roughness:.82,emissive:selected?0x000000:0x44351f,emissiveIntensity:selected?0:.12}),tile=new THREE.Mesh(tileGeometry,mat);
      tile.scale.set(.96,.4,1.08);tile.position.set((t-.5)*span,TABLE_Y+.43,.68);tile.castShadow=true;tile.receiveShadow=true;tile.userData.temporaryMaterial=mat;
      if(phase==='play'&&payload.canInteract&&!selected){tile.userData={...tile.userData,kind:'word-letter',index:i,interactive:true};interactive.push(tile)}
      objects.add(tile);const label=makeLabel(String(letter||''),selected?'#8e918b':'#2b241c');label.scale.set(.68,.46,1);label.position.set(tile.position.x,TABLE_Y+.72,.67);objects.add(label);
    });
    const draft=wordSelection.map(i=>letters[i]||'').join('');
    const answerSpan=Math.min(8.2,Math.max(2.2,(Math.max(letters.length,1)-1)*.92));
    for(let order=0;order<letters.length;order++){
      const x=(letters.length<=1?.5:order/(letters.length-1)-.5)*answerSpan,filled=order<wordSelection.length,mat=new THREE.MeshStandardMaterial({color:filled?0x9dbb8f:0x33423a,roughness:.86,emissive:filled?0x273c21:0x000000,emissiveIntensity:filled?.18:0}),slot=new THREE.Mesh(tileGeometry,mat);
      slot.scale.set(.96,.32,1.02);slot.position.set(x,TABLE_Y+.37,-.72);slot.userData.temporaryMaterial=mat;
      if(filled&&phase==='play'&&payload.canInteract){slot.userData={...slot.userData,kind:'word-answer',index:order,interactive:true};interactive.push(slot)}
      objects.add(slot);if(filled){const label=makeLabel(String(letters[wordSelection[order]]||''),'#eef0dc');label.scale.set(.68,.44,1);label.position.set(x,TABLE_Y+.65,-.73);objects.add(label)}
    }
    if(phase==='play'&&payload.canInteract){
      if(wordSelection.length){const clear=actionSprite('EFFACER','word-clear',{},'#d5d8d3');clear.position.set(-2.5,1.02,2.28);objects.add(clear);const submit=actionSprite('VALIDER · '+draft,'word-submit',{},'#dbea9e');submit.position.set(0,1.02,2.28);objects.add(submit)}
      const give=actionSprite('PASSER','word-giveup',{},'#efbc88');give.position.set(2.5,1.02,2.28);objects.add(give);
    }else if(phase==='result'&&payload.canInteract){const next=actionSprite('CONTINUER','word-continue');next.position.set(0,1.02,2.28);objects.add(next)}
    (data.players||[]).forEach((p,i)=>{const tag=makeLabel((p.name||'Joueur')+' · '+Number(p.score||0),i===s?.turn?'#dbea9e':'#d8ded9');tag.scale.set(1.72,.34,1);tag.position.set((i-(data.players.length-1)/2)*2.18,.92,-2.62);objects.add(tag)});
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · LETTRES EN FOLIE';
    if(status)status.textContent='Manche '+(data.stage||1)+' / 5 · '+(phase==='play'?(3-attempts)+' essai'+(3-attempts>1?'s':'')+' restant'+(3-attempts>1?'s':''):phase==='result'?(data.feedback||'Mot terminé'):'partie terminée');
    if(help)help.textContent=phase==='play'?'Touchez les lettres pour composer le mot · touchez une lettre de la réponse pour la retirer':phase==='result'?(data.feedback||'Résultat validé par le moteur'):'Scores synchronisés';
  }

  function syncBalloon(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,data=payload.viewData?.balloon||{},phase=data.phase||s?.phase||'play',pumps=Math.max(0,Number(data.pumps||0)),pot=Math.max(0,Number(data.pot||0)),risk=Math.max(10,Math.min(90,Number(data.risk||10))),burst=!!data.burst;
    setCameraPose(0,6.35,8.2,0,.6,.2);
    const pedestalMat=new THREE.MeshStandardMaterial({color:0x3e3343,roughness:.9}),pedestal=new THREE.Mesh(tileGeometry,pedestalMat);pedestal.scale.set(3.8,.65,2.5);pedestal.position.set(0,TABLE_Y+.13,.35);pedestal.userData.temporaryMaterial=pedestalMat;objects.add(pedestal);
    if(!burst){
      const mat=new THREE.MeshStandardMaterial({color:0xe9aacb,roughness:.48,metalness:.02,emissive:0x5d2946,emissiveIntensity:.16+.025*pumps}),balloon=new THREE.Mesh(balloonGeometry,mat);
      const grow=1+Math.min(8,pumps)*.075;balloon.scale.set(grow,grow*1.18,grow);balloon.position.set(0,TABLE_Y+1.55,.15);balloon.castShadow=true;balloon.userData.temporaryMaterial=mat;objects.add(balloon);
      const knotGeo=new THREE.ConeGeometry(.16,.3,18),knotMat=new THREE.MeshStandardMaterial({color:0xc982aa,roughness:.68}),knot=new THREE.Mesh(knotGeo,knotMat);knot.rotation.z=Math.PI;knot.position.set(0,TABLE_Y+.47+grow*.12,.15);knot.userData.temporaryGeometry=knotGeo;knot.userData.temporaryMaterial=knotMat;objects.add(knot);
    }else{
      for(let i=0;i<10;i++){const h=visualHash('balloon-burst|'+(s?.moves||0)+'|'+i),mat=new THREE.MeshStandardMaterial({color:i%2?0xe9aacb:0xf2c6df,roughness:.66,emissive:0x5d2946,emissiveIntensity:.18}),piece=new THREE.Mesh(dieGeometry,mat);const a=h*Math.PI*2,r=.9+visualHash(i+'r')*1.4;piece.scale.set(.18+.12*h,.08+.08*(1-h),.24);piece.position.set(Math.cos(a)*r,TABLE_Y+.9+visualHash(i+'y')*1.7,.15+Math.sin(a)*r*.7);piece.rotation.set(h*4,h*7,h*5);piece.userData.temporaryMaterial=mat;objects.add(piece)}
    }
    const potLabel=makeLabel(burst?'POP · 0':pot+' POINT'+(pot>1?'S':''),burst?'#efaaa0':'#f4d5e7');potLabel.scale.set(2.5,.62,1);potLabel.position.set(0,3.05,.15);objects.add(potLabel);
    const riskLabel=makeLabel('RISQUE '+risk+' %',risk>=70?'#efaaa0':risk>=40?'#edbe86':'#b5e4a4');riskLabel.scale.set(2.2,.52,1);riskLabel.position.set(0,.92,-1.55);objects.add(riskLabel);
    for(let i=0;i<9;i++){const hot=i<Math.ceil(risk/10),mat=new THREE.MeshStandardMaterial({color:hot?(risk>=70?0xc56f75:risk>=40?0xc99a5f:0x83af82):0x44534b,roughness:.82,emissive:hot?0x352617:0x000000,emissiveIntensity:hot?.25:0}),bar=new THREE.Mesh(tileGeometry,mat);bar.scale.set(.48,.24,.48);bar.position.set((i-4)*.72,TABLE_Y+.36,-1.42);bar.userData.temporaryMaterial=mat;objects.add(bar)}
    if(phase==='play'&&payload.canInteract){
      const pump=actionSprite('GONFLER · +10','balloon-pump',{},'#f4d5e7');pump.position.set(-1.55,1.08,2.5);objects.add(pump);
      if(pot>0){const bank=actionSprite('ENCAISSER '+pot,'balloon-bank',{},'#dbea9e');bank.position.set(1.55,1.08,2.5);objects.add(bank)}
    }else if(phase==='result'&&payload.canInteract){const next=actionSprite('CONTINUER','balloon-continue');next.position.set(0,1.08,2.5);objects.add(next)}
    (data.players||[]).forEach((p,i)=>{const tag=makeLabel((p.name||'Joueur')+' · '+Number(p.score||0),i===s?.turn?'#dbea9e':'#d8ded9');tag.scale.set(1.72,.34,1);tag.position.set((i-(data.players.length-1)/2)*2.18,.92,-2.45);objects.add(tag)});
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · BULLE OU DOUBLE';
    if(status)status.textContent='Manche '+(data.stage||1)+' / 5 · '+(phase==='play'?'cagnotte '+pot+' · '+pumps+' souffle'+(pumps>1?'s':''):phase==='result'?(data.feedback||'Tour terminé'):'partie terminée');
    if(help)help.textContent=phase==='play'?'Le moteur décide seul si le prochain souffle éclate · la 3D ne fait qu’afficher le résultat':phase==='result'?'Continuez pour passer au joueur suivant':'Scores synchronisés';
  }

  function cityWorld(index){
    const side=Math.floor(index/6),step=index%6;
    if(side===0)return new THREE.Vector3(-4.35+step*1.45,TABLE_Y+.13,3.05);
    if(side===1)return new THREE.Vector3(4.35,TABLE_Y+.13,3.05-step*1.02);
    if(side===2)return new THREE.Vector3(4.35-step*1.45,TABLE_Y+.13,-3.05);
    return new THREE.Vector3(-4.35,TABLE_Y+.13,-3.05+step*1.02);
  }
  function cityCellMaterial(cell,owner,mortgaged,colors){
    const color=cell?.type==='property'?(colors?.[cell.group]||'#8c9a86'):cell?.type==='chance'?'#9d7fb1':cell?.type==='tax'?'#b16f67':cell?.type==='gojail'?'#8e5b5b':cell?.type==='jail'?'#8b806c':'#718277';
    return new THREE.MeshStandardMaterial({color:new THREE.Color(color),roughness:.86,metalness:.02,emissive:mortgaged?0x351d1d:owner>=0?0x172018:0x000000,emissiveIntensity:mortgaged?.42:owner>=0?.18:0});
  }
  function syncMetropole(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,data=payload.viewData?.city||{},board=data.board||[],owners=data.owners||[],houses=data.houses||[],mortgaged=data.mortgaged||[],colors=data.colors||[],playerColors=data.playerColors||[];
    setCameraPose(0,9.35,9.9,0,.1,0);
    const boardGeo=new THREE.BoxGeometry(10.4,.18,7.45),boardBase=new THREE.Mesh(boardGeo,new THREE.MeshStandardMaterial({color:0x243a30,roughness:.94}));boardBase.position.y=TABLE_Y-.02;boardBase.receiveShadow=true;boardBase.userData.temporaryGeometry=boardGeo;boardBase.userData.temporaryMaterial=boardBase.material;objects.add(boardBase);
    board.forEach((cell,i)=>{
      const p=cityWorld(i),owner=owners[i]??-1,mat=cityCellMaterial(cell,owner,!!mortgaged[i],colors),tile=new THREE.Mesh(cityTileGeometry,mat);
      tile.position.copy(p);tile.castShadow=true;tile.receiveShadow=true;tile.userData.temporaryMaterial=mat;objects.add(tile);
      const label=makeLabel((i===0?'DÉPART · ':'')+(cell.name||('Case '+i)),mortgaged[i]?'#d69b96':owner>=0?(playerColors[owner]||'#dbea9e'):'#e5e9e3');label.scale.set(1.2,.26,1);label.position.set(p.x,TABLE_Y+.34,p.z);objects.add(label);
      const count=Math.min(3,Number(houses[i]||0));for(let h=0;h<count;h++){const houseMat=new THREE.MeshStandardMaterial({color:0xdbea9e,roughness:.72}),house=new THREE.Mesh(cityHouseGeometry,houseMat);house.position.set(p.x+(h-1)*.24,TABLE_Y+.34,p.z-.27);house.userData.temporaryMaterial=houseMat;objects.add(house)}
      if(owner>=0){const ownMat=new THREE.MeshStandardMaterial({color:new THREE.Color(playerColors[owner]||'#dbea9e'),roughness:.72}),peg=new THREE.Mesh(cityPegGeometry,ownMat);peg.position.set(p.x+.47,TABLE_Y+.34,p.z+.25);peg.userData.temporaryMaterial=ownMat;objects.add(peg)}
    });
    (data.players||[]).forEach((pl,i)=>{
      if(pl.out)return;const p=cityWorld(Number(pl.pos)||0),pawn=new THREE.Mesh(pawnGeometry,pawnMaterial(playerColors[i]||['#dbea9e','#aacdf7','#e4ad91','#c9afe7'][i%4]));pawn.position.set(p.x+((i%2)? .17:-.17),TABLE_Y+.48,p.z+(i>1?.17:-.17));pawn.castShadow=true;objects.add(pawn);
      const tag=makeLabel((pl.name||'Joueur')+' · '+pl.cash+' ¤'+(pl.jailed?' · détenu':''),i===s.turn?'#dbea9e':'#d8ded9');tag.scale.set(1.65,.31,1);tag.position.set(pawn.position.x,TABLE_Y+.92,pawn.position.z);objects.add(tag);
    });
    const dice=Array.isArray(data.dice)?data.dice:[1,1],key='city|'+(s?.moves??0)+'|'+dice.join('-'),animate=s?.moves>0&&key!==lastDiceKey;if(animate)lastDiceKey=key;
    dice.forEach((value,i)=>{const die=dieMesh(value);die.position.set(-.52+i*1.04,TABLE_Y+.78,.05);objects.add(die);if(animate&&motionAllowed()){const h=visualHash(key+'|'+i);die.rotation.set(5+h*4,7+h*5,4+h*6);diceAnimations.push({mesh:die,start:performance.now(),duration:620+i*70,rx:die.rotation.x,ry:die.rotation.y,rz:die.rotation.z})}});
    if(payload.canInteract&&data.phase==='roll'){const roll=actionSprite('LANCER LES DÉS','city-roll');roll.position.set(0,1.05,1.45);objects.add(roll)}
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · MÉTROPOLE';
    if(status)status.textContent='Tour '+(data.lap||1)+' / 20 · '+(data.players?.[s.turn]?.name||'Joueur')+' · '+(data.phase==='debt'?'dette '+(data.debt?.amount||0)+' ¤':data.phase==='buy'?'achat proposé':data.phase==='roll'?'prêt à lancer':'gestion');
    if(help)help.textContent=data.phase==='roll'&&payload.canInteract?'Cliquez pour lancer · achats, constructions et finances restent dans le panneau 2D':'Le plateau 3D reflète exactement les propriétés, maisons et positions du moteur';
    if(diceAnimations.length)startMotion();
  }

  function syncCurrent(payload){
    if(payload?.gameId==='golf')syncGolf(payload);
    else if(payload?.gameId==='code')syncCode(payload);
    else if(payload?.gameId==='intrus')syncIntrus(payload);
    else if(payload?.gameId==='anagrammes')syncAnagram(payload);
    else if(payload?.gameId==='ballon')syncBalloon(payload);
    else if(payload?.gameId==='echo')syncEcho(payload);
    else if(payload?.gameId==='metropole')syncMetropole(payload);
    else if(payload?.gameId==='rummikub')syncRummikub(payload);
    else if(payload?.gameId==='cactus')syncCactus(payload);
    else if(payload?.gameId==='huit')syncEight(payload);
    else if(payload?.gameId==='oie')syncGoose(payload);
    else if(payload?.gameId==='yam')syncYam(payload);
    else if(payload?.gameId==='boite')syncBox(payload);
    else if(['president','menteur','suites','plis','encheres'].includes(payload?.gameId))syncCardFamily(payload);
    else if(['pouilleux','quatrevingtdixneuf','vingtetun','bataille'].includes(payload?.gameId))syncSpecialCards(payload);
  }
  function render(payload){
    current=payload;if(!active)return;
    init();
    if(payload.gated){
      resizeObserver?.disconnect();resizeObserver=null;host?.remove();host=null;
      document.documentElement.removeAttribute('data-table-3d-game');document.documentElement.removeAttribute('data-table-3d-phase');return;
    }
    ensureHost();document.documentElement.dataset.table3dGame=payload.gameId||'';document.documentElement.dataset.table3dPhase=payload.state?.phase||'';
    syncCurrent(payload);draw();
  }
  function draw(){if(active&&renderer&&scene&&camera)renderer.render(scene,camera)}
  function updatePointer(e){
    if(!canvas)return;
    const r=canvas.getBoundingClientRect();pointer.x=((e.clientX-r.left)/Math.max(1,r.width))*2-1;pointer.y=-((e.clientY-r.top)/Math.max(1,r.height))*2+1;raycaster.setFromCamera(pointer,camera);
  }
  function hit(e){
    updatePointer(e);return raycaster.intersectObjects(interactive,false)[0]?.object||null;
  }
  function setHover(mesh){
    if(hovered===mesh)return;
    if(hovered&&!drag){const h=hovered.userData.home;if(h)hovered.scale.copy(h.scale);}
    hovered=mesh;
    if(hovered&&!drag&&['card','card-select','maid-pick','special-select','cactus-quick','cactus-swap','cactus-target','cactus-draw','cactus-take','rummi-tile','rummi-dest','intrus-spot','code-cycle'].includes(hovered.userData.kind)){const h=hovered.userData.home;if(h)hovered.scale.copy(h.scale).multiplyScalar(1.055)}
    draw();
  }
  function capturePointer(id){try{canvas?.setPointerCapture?.(id)}catch(_){}}
  function cardDropRadius(d){return d?.pointerType==='touch'||matchMedia('(pointer: coarse)').matches?1.9:1.5}
  function onPointerDown(e){
    if(!active||!current?.canInteract)return;
    const obj=hit(e);setHover(obj);if(!obj)return;
    if(obj.userData.kind==='deck'){drag={pointerId:e.pointerId,pointerType:e.pointerType||'mouse',kind:'deck',startX:e.clientX,startY:e.clientY};capturePointer(e.pointerId);return}
    if(obj.userData.kind==='card-select'){drag={pointerId:e.pointerId,pointerType:e.pointerType||'mouse',kind:'card-select',cardId:obj.userData.cardId,startX:e.clientX,startY:e.clientY};capturePointer(e.pointerId);return}
    if(['maid-pick','special-select','battle-action','cactus-quick','cactus-swap','cactus-target','cactus-draw','cactus-take','rummi-tile','rummi-dest'].includes(obj.userData.kind)){drag={pointerId:e.pointerId,pointerType:e.pointerType||'mouse',kind:obj.userData.kind,index:obj.userData.index,owner:obj.userData.owner,cardId:obj.userData.cardId,tileId:obj.userData.tileId,dest:obj.userData.dest,startX:e.clientX,startY:e.clientY};capturePointer(e.pointerId);return}
    if(['goose-roll','goose-choice','yam-roll','yam-hold','box-roll','box-toggle','box-close','city-roll','echo-pad','echo-memorized','echo-continue','balloon-pump','balloon-bank','balloon-continue','word-letter','word-answer','word-clear','word-submit','word-giveup','word-continue','intrus-spot','intrus-continue','code-cycle','code-submit','code-continue','golf-adjust','golf-shoot','golf-continue'].includes(obj.userData.kind)){
      if(obj.userData.kind==='box-close'&&obj.userData.enabled===false)return;
      drag={pointerId:e.pointerId,pointerType:e.pointerType||'mouse',kind:obj.userData.kind,steps:obj.userData.steps,index:obj.userData.index,count:obj.userData.count,number:obj.userData.number,control:obj.userData.control,delta:obj.userData.delta,startX:e.clientX,startY:e.clientY};capturePointer(e.pointerId);return;
    }
    if(obj.userData.kind!=='card'||!obj.userData.playable)return;
    drag={pointerId:e.pointerId,pointerType:e.pointerType||'mouse',kind:'card',mesh:obj,cardId:obj.userData.cardId,startX:e.clientX,startY:e.clientY,moved:false,overDrop:false,gestureHome:obj.userData.home?.position?.clone?.()||obj.position.clone()};
    emitLocalCardGesture('start',0,0);host?.classList.add('is-dragging');capturePointer(e.pointerId);e.preventDefault();
  }
  function onPointerMove(e){
    if(!active)return;
    if(!drag){setHover(hit(e));return}
    if(e.pointerId!==drag.pointerId||drag.kind!=='card')return;
    const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(!drag.moved&&Math.hypot(dx,dy)>6)drag.moved=true;
    if(!drag.moved)return;
    updatePointer(e);const p=new THREE.Vector3();if(raycaster.ray.intersectPlane(dragPlane,p)){drag.mesh.position.set(p.x,1.02,p.z);drag.mesh.rotation.set(-Math.PI/2,0,(dx*.0025));}
    const near=Math.hypot(drag.mesh.position.x-1.25,drag.mesh.position.z-.05)<cardDropRadius(drag);drag.overDrop=near;dropMarker.material.opacity=near ? .82 : .2;
    const gesture=eightGestureCoordinates(drag.mesh,drag.gestureHome);emitLocalCardGesture('move',gesture.progress,gesture.lateral);draw();e.preventDefault();
  }
  function finishDrag(e,cancelled=false){
    if(!drag||e.pointerId!==drag.pointerId)return;
    const d=drag;drag=null;host?.classList.remove('is-dragging');dropMarker.material.opacity=.2;
    if(cancelled){if(d.kind==='card')emitLocalCardGesture('cancel',0,0);syncCurrent(current);draw();return}
    const tap=Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<8;
    if(d.kind==='card-select'){if(tap)current?.interactions?.cardSelect?.(d.cardId);return}
    if(d.kind==='maid-pick'){if(tap)current?.interactions?.specialCard?.('pick',d.index);return}
    if(d.kind==='special-select'){if(tap)current?.interactions?.specialCard?.('select',d.cardId);return}
    if(d.kind==='battle-action'){if(tap)current?.interactions?.specialCard?.('battle');return}
    if(d.kind==='cactus-quick'){if(tap)current?.interactions?.cactus?.('quick',d.index);return}
    if(d.kind==='cactus-swap'){if(tap)current?.interactions?.cactus?.('swap',d.index);return}
    if(d.kind==='cactus-target'){if(tap)current?.interactions?.cactus?.('target',d.index);return}
    if(d.kind==='cactus-draw'){if(tap)current?.interactions?.cactus?.('draw');return}
    if(d.kind==='cactus-take'){if(tap)current?.interactions?.cactus?.('take');return}
    if(d.kind==='rummi-tile'){if(tap)current?.interactions?.rummi?.('select',d.tileId);return}
    if(d.kind==='rummi-dest'){if(tap)current?.interactions?.rummi?.('move',d.dest);return}
    if(d.kind==='deck'){if(tap)current?.interactions?.draw?.();return}
    if(d.kind==='goose-roll'||d.kind==='goose-choice'){if(tap)current?.interactions?.goose?.(d.kind==='goose-roll'?'roll':'choose',d.steps);return}
    if(d.kind==='golf-adjust'){if(tap){if(d.control==='angle')golfAim.angle=Math.max(-180,Math.min(180,golfAim.angle+Number(d.delta||0)));else if(d.control==='power')golfAim.power=Math.max(5,Math.min(100,golfAim.power+Number(d.delta||0)));syncGolf(current);draw()}return}
    if(d.kind==='golf-shoot'){if(tap)current?.interactions?.golf?.('shoot',{angle:Math.round(golfAim.angle),power:Math.round(golfAim.power)});return}
    if(d.kind==='golf-continue'){if(tap)current?.interactions?.golf?.('continue');return}
    if(d.kind==='code-cycle'){if(tap){codeDraft[d.index]=(Number(codeDraft[d.index]||0)+1)%6;syncCode(current);draw()}return}
    if(d.kind==='code-submit'){if(tap)current?.interactions?.codePuzzle?.('guess',[...codeDraft]);return}
    if(d.kind==='code-continue'){if(tap)current?.interactions?.codePuzzle?.('continue');return}
    if(d.kind==='intrus-spot'){if(tap)current?.interactions?.intrus?.('spot',d.index);return}
    if(d.kind==='intrus-continue'){if(tap)current?.interactions?.intrus?.('continue');return}
    if(d.kind==='word-letter'){if(tap&&!wordSelection.includes(d.index)){wordSelection.push(d.index);syncAnagram(current);draw()}return}
    if(d.kind==='word-answer'){if(tap&&d.index>=0&&d.index<wordSelection.length){wordSelection.splice(d.index,1);syncAnagram(current);draw()}return}
    if(d.kind==='word-clear'){if(tap){wordSelection=[];syncAnagram(current);draw()}return}
    if(d.kind==='word-submit'){if(tap){const letters=current?.viewData?.anagram?.letters||[],word=wordSelection.map(i=>letters[i]||'').join('');wordSelection=[];if(word)current?.interactions?.anagram?.('submit',word);else{syncAnagram(current);draw()}}return}
    if(d.kind==='word-giveup'){if(tap){wordSelection=[];current?.interactions?.anagram?.('giveup')}return}
    if(d.kind==='word-continue'){if(tap){wordSelection=[];current?.interactions?.anagram?.('continue')}return}
    if(d.kind==='balloon-pump'){if(tap)current?.interactions?.balloon?.('pump');return}
    if(d.kind==='balloon-bank'){if(tap)current?.interactions?.balloon?.('bank');return}
    if(d.kind==='balloon-continue'){if(tap)current?.interactions?.balloon?.('continue');return}
    if(d.kind==='echo-memorized'){if(tap)current?.interactions?.echo?.('memorized');return}
    if(d.kind==='echo-pad'){if(tap)current?.interactions?.echo?.('pad',d.index);return}
    if(d.kind==='echo-continue'){if(tap)current?.interactions?.echo?.('continue');return}
    if(d.kind==='city-roll'){if(tap)current?.interactions?.city?.('roll');return}
    if(d.kind==='yam-roll'||d.kind==='yam-hold'){if(tap)current?.interactions?.yam?.(d.kind==='yam-hold'?'hold':'roll',d.index);return}
    if(d.kind==='box-roll'||d.kind==='box-toggle'||d.kind==='box-close'){
      if(tap)current?.interactions?.box?.(d.kind==='box-roll'?'roll':d.kind==='box-toggle'?'toggle':'close',d.kind==='box-roll'?d.count:d.number);return;
    }
    const near=d.moved&&(d.overDrop||Math.hypot(d.mesh.position.x-1.25,d.mesh.position.z-.05)<cardDropRadius(d));
    if(!d.moved||near){emitLocalCardGesture('commit',1,0);current?.interactions?.playCard?.(d.cardId);return}
    emitLocalCardGesture('cancel',0,0);syncEight(current);draw();
  }
  function cancelActiveDrag(pointerId=null){
    if(!drag||(pointerId!==null&&drag.pointerId!==pointerId))return;
    const wasCard=drag.kind==='card';if(wasCard)emitLocalCardGesture('cancel',0,0);drag=null;host?.classList.remove('is-dragging');if(dropMarker)dropMarker.material.opacity=.2;
    if(wasCard&&current){syncEight(current);draw()}
  }
  function onPointerUp(e){finishDrag(e,false)}
  function onPointerCancel(e){cancelActiveDrag(e.pointerId)}
  function onLostPointerCapture(e){cancelActiveDrag(e.pointerId)}
  function onWindowBlur(){cancelActiveDrag()}
  function onVisibilityChange(){if(document.hidden)cancelActiveDrag()}

  function activate(){active=true;init()}
  function deactivate(){
    cancelActiveDrag();active=false;hovered=null;wordSelection=[];wordDraftKey='';codeDraft=[0,1,2];codeDraftKey='';golfAim={angle:0,power:50};golfAimKey='';lastGolfKey='';diceAnimations.length=0;pawnAnimations.length=0;
    if(animationRaf){cancelAnimationFrame(animationRaf);animationRaf=0}
    resizeObserver?.disconnect();resizeObserver=null;host?.remove();host=null;
    document.documentElement.removeAttribute('data-table-3d-game');document.documentElement.removeAttribute('data-table-3d-phase');
  }
  function destroy(){
    deactivate();clearObjects();
    canvas?.removeEventListener('pointerdown',onPointerDown);canvas?.removeEventListener('pointermove',onPointerMove);canvas?.removeEventListener('pointerup',onPointerUp);canvas?.removeEventListener('pointercancel',onPointerCancel);canvas?.removeEventListener('lostpointercapture',onLostPointerCapture);window.removeEventListener('blur',onWindowBlur);window.removeEventListener('salon:remote-card-gesture',onRemoteCardGesture);document.removeEventListener('visibilitychange',onVisibilityChange);
    cardGeometry.dispose();tileGeometry.dispose();pawnGeometry.dispose();dieGeometry.dispose();rummiTileGeometry.dispose();grainGeometry.dispose();heldPadGeometry.dispose();codeGemGeometry.dispose();intrusDotGeometry.dispose();balloonGeometry.dispose();golfBallGeometry.dispose();cityTileGeometry.dispose();cityHouseGeometry.dispose();cityPegGeometry.dispose();edgeMaterial.dispose();backMaterial.dispose();for(const m of frontMaterials.values())m.dispose();for(const m of tileMaterials.values())m.dispose();for(const m of rummiTileMaterials.values())m.dispose();for(const m of pawnMaterials.values())m.dispose();for(const m of dieFaceMaterials.values())m.dispose();for(const m of cellLabelMaterials.values())m.dispose();for(const m of boxTileMaterials.values())m.dispose();neutralDieMaterial.dispose();for(const t of disposableTextures)t.dispose();for(const t of cellLabelTextures)t.dispose();
    tableMesh?.geometry?.dispose();tableMesh?.material?.dispose();dropMarker?.geometry?.dispose();dropMarker?.material?.dispose();renderer?.dispose();
    renderer=scene=camera=canvas=null;current=null;
  }
  return{activate,render,deactivate,destroy};
}
