import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/+esm";

const SUIT_SYMBOL={S:'♠',H:'♥',D:'♦',C:'♣',X:'★'};
const SUIT_NAME={S:'pique',H:'cœur',D:'carreau',C:'trèfle',X:'joker'};
const RANK_NAME={1:'A',11:'V',12:'D',13:'R'};
const CARD_W=1.22,CARD_H=1.78,CARD_D=.045;
const TABLE_Y=.28;
const LIVE_CARD_GAMES=new Set(['huit','president','menteur','suites','plis','encheres','quatrevingtdixneuf','cactus']);
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
  let renderer=null,scene=null,camera=null,host=null,canvas=null,resizeObserver=null,assetUnsubscribe=null;
  let active=false,current=null,drag=null,hovered=null;
  const externalAssets=window.SalonTable3DAssets||null;
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
  const rummiBackMaterial=new THREE.MeshStandardMaterial({color:0x46574b,roughness:.86,metalness:.01});
  let animationRaf=0,diceAnimations=[],pawnAnimations=[],cardAnimations=[],manipAnimations=[],tossAnimations=[],lastDiceKey='',lastMoveKey='';
  let wordSelection=[],wordDraftKey='';
  let codeDraft=[0,1,2],codeDraftKey='';
  let golfAim={angle:0,power:50},golfAimKey='',lastGolfKey='',cityFocusIndex=null;
  const backTexture=cardBackTexture();disposableTextures.push(backTexture);
  const backMaterial=new THREE.MeshStandardMaterial({map:backTexture,roughness:.64,metalness:0});
  let objects=new THREE.Group(),cardFx=new THREE.Group(),dropMarker=null,tableMesh=null,cameraPose=null,lastEightSnapshot=null,lastCactusSnapshot=null,lastNinetySnapshot=null,lastRummiSnapshot=null,lastMaidSnapshot=null,lastBlackjackSnapshot=null,lastBattleSnapshot=null,pendingMaidPickOrigin=null,pendingBattleOrigin=null,lastCardFamilySnapshots=new Map(),remoteCardGestures=new Map();
  const localPoses=new Map();let activePoseScope='',poseSeen=new Set(),localPoseOrder=0;

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
  function externalAsset(kind,context,userData={}){
    const obj=externalAssets?.create?.(kind,{THREE,...context});if(!obj?.isObject3D)return null;
    obj.userData={...obj.userData,...userData,externalAssetKind:kind};
    obj.traverse?.(child=>{
      if(child.isMesh){child.castShadow=true;child.receiveShadow=true}
      if(child!==obj)child.userData={...child.userData,table3dRoot:obj};
    });
    return obj;
  }
  function cardMesh(card,{back=false,id=null,interactiveCard=false,playable=false}={}){
    const userData={kind:'card',cardId:id,interactive:interactiveCard,playable};
    const visual=card?Object.freeze({suit:card.suit,rank:card.rank,joker:!!card.joker,hidden:!!card.hidden}):null;
    const external=externalAsset('card',{card:visual,back,id,playable,canonicalSize:{width:CARD_W,height:CARD_H,depth:CARD_D}},userData);
    if(external){if(interactiveCard)interactive.push(external);return external}
    const mats=[edgeMaterial,edgeMaterial,edgeMaterial,edgeMaterial,back?backMaterial:frontMaterial(card),backMaterial];
    const mesh=new THREE.Mesh(cardGeometry,mats);
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData=userData;
    if(interactiveCard)interactive.push(mesh);
    return mesh;
  }
  function cloneTransform(t){const out={position:t.position.clone(),rotation:t.rotation.clone(),scale:t.scale.clone()};if(Number.isFinite(t.order))out.order=t.order;return out}
  function meshTransform(mesh){return{position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()}}
  function poseScope(payload=current){
    const state=payload?.state,viewer=Number.isInteger(payload?.privateIndex)?payload.privateIndex:0;
    return [payload?.gameId||'',state?.startedAt||'',viewer].join('~');
  }
  function localPoseKey(mesh){
    if(!activePoseScope||!mesh)return null;
    const tileId=mesh.userData?.tileId,cardId=mesh.userData?.cardId,id=tileId||cardId;
    return id?activePoseScope+'|'+(tileId?'tile':'card')+'|'+id:null;
  }
  function localPoseDisplay(key,pose){
    const display=cloneTransform(pose),prefix=activePoseScope+'|',kind=key.slice(prefix.length).split('|')[0];
    let below=0;
    for(const [otherKey,other] of localPoses){
      if(otherKey===key||!otherKey.startsWith(prefix)||otherKey.slice(prefix.length).split('|')[0]!==kind)continue;
      if(!Number.isFinite(other.order)||!Number.isFinite(pose.order)||other.order>=pose.order)continue;
      if(Math.abs(other.position.x-pose.position.x)<.58&&Math.abs(other.position.z-pose.position.z)<.78)below++;
    }
    display.position.y+=Math.min(.12,below*(kind==='tile'?.010:.014));return display;
  }
  function applyLocalPose(mesh,{floorY=null}={}){
    if(!mesh)return null;
    mesh.userData.home??=meshTransform(mesh);
    const key=localPoseKey(mesh);if(!key)return null;
    mesh.userData.persistLocalPose=true;mesh.userData.localPoseKey=key;mesh.userData.localPoseFloorY=Number.isFinite(floorY)?floorY:(mesh.userData.tileId?TABLE_Y+.37:TABLE_Y+.12);
    poseSeen.add(key);
    const saved=localPoses.get(key);
    if(saved){const display=localPoseDisplay(key,saved);mesh.position.copy(display.position);mesh.rotation.copy(display.rotation);mesh.scale.copy(display.scale);mesh.userData.home=cloneTransform(display)}
    return key;
  }
  function freePoseForMesh(mesh,home=mesh?.userData?.home){
    if(!mesh||!home)return null;
    const y=Number(mesh.userData?.localPoseFloorY??TABLE_Y+.12),position=new THREE.Vector3(clampMotion(mesh.position.x,-5.05,5.05),y,clampMotion(mesh.position.z,-3.08,3.08));
    return{position,rotation:new THREE.Euler(-Math.PI/2,0,mesh.rotation.z),scale:home.scale.clone()};
  }
  function saveLocalPose(mesh,home=mesh?.userData?.home,{order=null}={}){
    const key=mesh?.userData?.localPoseKey;if(!key)return null;
    const pose=freePoseForMesh(mesh,home);if(!pose)return null;
    pose.order=Number.isFinite(order)?order:++localPoseOrder;if(Number.isFinite(order))localPoseOrder=Math.max(localPoseOrder,order);
    localPoses.set(key,cloneTransform(pose));poseSeen.add(key);
    const display=localPoseDisplay(key,pose);mesh.userData.home=cloneTransform(display);return display;
  }
  function hasActiveLocalPoses(){
    if(!activePoseScope)return false;const prefix=activePoseScope+'|';
    for(const key of localPoses.keys())if(key.startsWith(prefix))return true;
    return false;
  }
  function updateLocalPoseResetButton(){
    const button=host?.querySelector?.('[data-table-3d-reset-poses]');if(button)button.hidden=!hasActiveLocalPoses();
  }
  function resetActiveLocalPoses(){
    if(!activePoseScope)return false;const prefix=activePoseScope+'|';let changed=false;
    for(const key of [...localPoses.keys()])if(key.startsWith(prefix)){localPoses.delete(key);changed=true}
    if(!changed)return false;
    poseSeen=new Set();if(current){syncCurrent(current);pruneLocalPoses()}updateLocalPoseResetButton();draw();return true;
  }
  function pruneLocalPoses(){
    if(!activePoseScope)return;
    const prefix=activePoseScope+'|';
    for(const key of [...localPoses.keys()])if(key.startsWith(prefix)&&!poseSeen.has(key))localPoses.delete(key);
  }
  function makeLooseManipulable(mesh,{kind=mesh.userData.kind,tapEnabled=false,persistPose=false,poseFloorY=null,...data}={}){
    mesh.userData={...mesh.userData,...data,kind,interactive:true,looseManip:true,tapEnabled:!!tapEnabled};
    if(persistPose)applyLocalPose(mesh,{floorY:poseFloorY});
    if(!interactive.includes(mesh))interactive.push(mesh);
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
    canvas.addEventListener('wheel',onWheel,{passive:false});
    canvas.addEventListener('pointerleave',()=>setHover(null));
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onFatal?.(new Error('Contexte WebGL perdu'));});
    window.addEventListener('blur',onWindowBlur);
    window.addEventListener('salon:remote-card-gesture',onRemoteCardGesture);
    document.addEventListener('visibilitychange',onVisibilityChange);
    assetUnsubscribe??=externalAssets?.subscribe?.(()=>{if(active&&current){syncCurrent(current);draw()}})||null;
  }
  function ensureHost(){
    const column=document.querySelector('.table-column');if(!column)return null;
    if(!host?.isConnected){
      host=document.createElement('section');host.className='table-3d-host';host.setAttribute('aria-label','Vue 3D de la table');
      host.innerHTML='<div class="table-3d-window-controls" aria-label="Affichage 3D"><button type="button" class="table-3d-window-button table-3d-reset" data-table-3d-reset-poses hidden aria-label="Ranger mes objets selon la disposition du jeu" title="Ranger mes objets · local uniquement">↺</button><button type="button" class="table-3d-window-button table-3d-minimize" data-table-3d-window="embedded" aria-label="Réduire la vue 3D dans la page" title="Réduire la vue 3D">↙</button><button type="button" class="table-3d-window-button table-3d-expand" data-table-3d-window="full" aria-label="Agrandir la vue 3D" title="Plein écran">⛶</button><button type="button" class="table-3d-window-button table-3d-close" data-table-view-mode="2d" aria-label="Revenir à la vue 2D" title="Revenir à la vue 2D">×</button></div><div class="table-3d-hud"><span class="table-3d-accent" data-table-3d-title>VUE 3D</span><span data-table-3d-status>Table synchronisée</span></div><div class="table-3d-help" data-table-3d-help>Vue immersive synchronisée avec la partie</div>';
      host.querySelectorAll('[data-table-3d-window]').forEach(button=>button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();window.dispatchEvent(new CustomEvent('salon:table-3d-window',{detail:{mode:button.dataset.table3dWindow}}))}));
      host.querySelector('[data-table-3d-reset-poses]')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();resetActiveLocalPoses()});
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
    interactive.length=0;diceAnimations.length=0;pawnAnimations.length=0;cardAnimations.length=0;manipAnimations.length=0;tossAnimations.length=0;
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
  function cardGestureTarget(game,y=1.02){
    const target={
      huit:[1.25,.05],
      president:[0,.05],
      menteur:[0,.08],
      suites:[0,0],
      plis:[0,0],
      encheres:[0,.75],
      quatrevingtdixneuf:[1.5,.05],
      cactus:[0,.1]
    }[game]||[0,.05];
    return new THREE.Vector3(target[0],y,target[1]);
  }
  function emitLocalCardGesture(phase,progress=0,lateral=0){
    const gameId=current?.gameId;if(!LIVE_CARD_GAMES.has(gameId))return;
    const detail={gameId,phase,progress:Math.max(0,Math.min(1,Number(progress)||0)),lateral:Math.max(-1,Math.min(1,Number(lateral)||0))};
    window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail}));
  }
  function cardGestureCoordinates(mesh,home,game=current?.gameId){
    const target=cardGestureTarget(game),origin=home||mesh?.userData?.home?.position;if(!origin||!mesh)return{progress:0,lateral:0};
    const vx=target.x-origin.x,vz=target.z-origin.z,wx=mesh.position.x-origin.x,wz=mesh.position.z-origin.z,den=Math.max(.0001,vx*vx+vz*vz),len=Math.sqrt(den);
    const progress=Math.max(0,Math.min(1,(wx*vx+wz*vz)/den)),lateral=Math.max(-1,Math.min(1,(wx*vz-wz*vx)/(len*1.7)));
    return{progress,lateral};
  }
  function eightGestureCoordinates(mesh,home){return cardGestureCoordinates(mesh,home,'huit')}
  function cactusSeat(viewer,count,index){
    const mine=index===viewer,angle=mine?Math.PI/2:(index/(count-1||1))*Math.PI-Math.PI/2;
    return{mine,x:mine?0:Math.sin(angle)*4.2,z:mine?2.45:-2.15+Math.cos(angle)*.72};
  }
  function currentCardOpponentSeat(actor){
    const state=current?.state,viewer=Number.isInteger(current?.privateIndex)?current.privateIndex:0,game=current?.gameId;
    if(!state?.players?.length||!Number.isInteger(actor)||actor===viewer)return null;
    if(game==='cactus'){
      const players=current?.viewData?.cactus?.players||state.players,count=Math.max(1,players.length),seat=cactusSeat(viewer,count,actor);
      return{x:seat.x,z:seat.z};
    }
    const opponents=state.players.map((p,i)=>({p,i})).filter(x=>x.i!==viewer&&!(game==='quatrevingtdixneuf'&&x.p?.out)),index=opponents.findIndex(x=>x.i===actor);
    if(index<0)return null;return eightOpponentSeat(opponents.length,index);
  }
  function currentEightOpponentSeat(actor){return currentCardOpponentSeat(actor)}
  function onRemoteCardGesture(event){
    const game=current?.gameId,d=event?.detail||{};
    if(!active||!motionAllowed()||!LIVE_CARD_GAMES.has(game)||(d.gameId&&d.gameId!==game))return;
    const actor=Number(d.actor),seat=currentCardOpponentSeat(actor);if(!seat)return;
    const phase=['start','move','cancel','commit'].includes(d.phase)?d.phase:null;if(!phase)return;
    let gesture=remoteCardGestures.get(actor);
    if(!gesture||phase==='start'){
      if(gesture?.mesh)cardFx.remove(gesture.mesh);
      const mesh=cardMesh(null,{back:true});mesh.scale.setScalar(.74);mesh.rotation.set(-Math.PI/2,0,0);cardFx.add(mesh);
      gesture={mesh,actor,game,from:new THREE.Vector3(seat.x,TABLE_Y+.28,seat.z+.10),to:cardGestureTarget(game,TABLE_Y+.26),progress:0,target:0,lateral:0,targetLateral:0,lastAt:performance.now(),returning:false,committed:false};
      mesh.position.copy(gesture.from);remoteCardGestures.set(actor,gesture);
    }
    gesture.target=Math.max(0,Math.min(1,Number(d.progress)||0));gesture.targetLateral=Math.max(-1,Math.min(1,Number(d.lateral)||0));gesture.lastAt=performance.now();
    if(phase==='cancel'){gesture.target=0;gesture.targetLateral=0;gesture.returning=true;gesture.committed=false}
    else if(phase==='commit'){gesture.target=1;gesture.targetLateral=0;gesture.committed=true;gesture.returning=false}
    else{gesture.returning=false;gesture.committed=false}
    startMotion();
  }
  function visualCardSnapshot(card){
    return card?{id:card.id,suit:card.suit,rank:card.rank,joker:!!card.joker,hidden:!!card.hidden}:null;
  }
  function cardFamilySnapshot(payload,center){
    const state=payload?.state,game=payload?.viewData?.cardGame||payload?.gameId,viewer=Number.isInteger(payload?.privateIndex)?payload.privateIndex:0,players=state?.players||[],own=payload?.spectator?[]:(players[viewer]?.hand||[]);
    const base={game,key:[game,state?.startedAt||'',players.map(p=>p?.name||'').join('|')].join('~'),viewer,turn:Number(state?.turn??0),phase:String(state?.phase||''),ownIds:own.map(c=>c?.id).filter(Boolean),handCounts:players.map(p=>p?.hand?.length||0)};
    if(game==='president'){
      base.centerIds=(center.cards||[]).map(c=>c?.id).filter(Boolean);base.centerCards=(center.cards||[]).map(visualCardSnapshot).filter(Boolean);
    }else if(game==='menteur'){
      base.backCount=Number(center.backCount)||0;base.centerIds=(center.cards||[]).map(c=>c?.id).filter(Boolean);
      base.centerCards=(center.cards||[]).map(visualCardSnapshot).filter(Boolean);
      base.claimOwner=Number.isInteger(center.claim?.owner)?center.claim.owner:null;
      base.claimCount=Number(center.claim?.count)||0;
    }else if(game==='suites')base.centerIds=Object.values(center.lanes||{}).flat().map(c=>c?.id).filter(Boolean);
    else if(game==='plis'){
      const physicalEntries=Array.isArray(state?.trickCards)&&state.trickCards.length?(center.entries||[]):(['trickResult','over'].includes(String(state?.phase||''))?(center.entries||[]):[]);
      base.centerIds=physicalEntries.map(e=>e?.card?.id).filter(Boolean);
      base.entries=physicalEntries.map(e=>({owner:e.owner,card:visualCardSnapshot(e.card)})).filter(e=>e.card);
      base.dealNumber=Number(center.dealNumber)||0;base.completedTricks=Number(center.completedTricks)||0;
    }else if(game==='encheres'){
      base.bidIds=(center.bids||[]).map(c=>c?.id||null);base.bidCards=(center.bids||[]).map(visualCardSnapshot);
      base.bidRound=Number(center.bidRound)||0;base.prize=visualCardSnapshot(center.prize);base.lastWinner=Number.isInteger(center.lastAuction?.winner)?center.lastAuction.winner:null;
    }
    return base;
  }
  function cardFamilyOrigin(actor,viewer,opponentVisuals){
    if(actor===viewer)return new THREE.Vector3(0,TABLE_Y+.30,2.45);
    const seat=opponentVisuals.get(actor);return seat?new THREE.Vector3(seat.x,TABLE_Y+.30,seat.z+.08):new THREE.Vector3(0,TABLE_Y+.30,-2.25);
  }
  function storedLocalPose(id,type='card'){
    return id&&activePoseScope?localPoses.get(activePoseScope+'|'+type+'|'+id)||null:null;
  }
  function exactLocalCardOrigin(previous,id,index=0){
    const direct=previous?.dragOrigins?.get?.(id);if(direct?.position)return direct.position.clone();
    const posed=storedLocalPose(id);if(posed?.position)return posed.position.clone();
    const at=previous?.ownIds?.indexOf(id);if(at<0)return null;
    const slot=handCardSlot(previous.ownIds.length,at);return new THREE.Vector3(slot.x,TABLE_Y+.30+slot.yOffset,slot.z);
  }
  function rememberCardDropOrigin(game,id,mesh){
    const snapshot=lastCardFamilySnapshots.get(game);if(!snapshot||!id||!mesh)return;
    snapshot.dragOrigins??=new Map();snapshot.dragOrigins.set(id,{position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()});
  }
  function rememberNinetyDropOrigin(id,mesh){
    if(!lastNinetySnapshot||!id||!mesh)return;
    lastNinetySnapshot.dragOrigins??=new Map();lastNinetySnapshot.dragOrigins.set(id,{position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()});
  }
  function rememberRummiDropOrigin(id,mesh){
    const entry=lastRummiSnapshot?.positions?.get?.(id);if(!entry||!mesh)return;
    entry.position=mesh.position.clone();entry.scale=mesh.scale.clone();entry.rotation=mesh.rotation.z;
  }
  function rememberGroupedCardDropOrigins(d){
    rememberCardDropOrigin(current?.gameId,d.cardId,d.mesh);
    (d.companions||[]).forEach(c=>rememberCardDropOrigin(current?.gameId,c.id,c.mesh));
  }
  function rememberGroupedRummiDropOrigins(d){
    rememberRummiDropOrigin(d.tileId,d.mesh);
    (d.companions||[]).forEach(c=>rememberRummiDropOrigin(c.id,c.mesh));
  }
  function rememberTrickCollectOrigins(d){
    const snapshot=lastCardFamilySnapshots.get('plis');if(!snapshot)return;
    snapshot.trickOrigins??=new Map();
    const remember=(id,mesh)=>{if(id&&mesh)snapshot.trickOrigins.set(id,{position:mesh.position.clone(),rotation:mesh.rotation.z,scale:mesh.scale.clone()})};
    remember(d.cardId,d.mesh);(d.companions||[]).forEach(c=>remember(c.id,c.mesh));
  }
  function animateCardFamilyConfirmed(game,payload,center,previous,currentSnapshot,opponentVisuals,centerVisuals,ownVisuals){
    if(!previous||previous.key!==currentSnapshot.key||!motionAllowed())return;
    const viewer=currentSnapshot.viewer,discardCorner=new THREE.Vector3(4.35,TABLE_Y+.24,-1.85);

    if(game==='menteur'&&previous.phase==='challenge'&&currentSnapshot.phase==='play'&&previous.backCount>0&&currentSnapshot.backCount===0){
      const receivers=currentSnapshot.handCounts.map((count,i)=>({i,delta:count-(previous.handCounts?.[i]??count)})).filter(x=>x.delta>0).sort((a,b)=>b.delta-a.delta);
      const receiver=receivers[0]?.i;
      if(Number.isInteger(receiver)){
        const target=cardFamilyOrigin(receiver,viewer,opponentVisuals),visibleCards=currentSnapshot.centerCards||[],addedIds=receiver===viewer?(currentSnapshot.ownIds||[]).filter(id=>!(previous.ownIds||[]).includes(id)):[],pileCount=Math.min(12,Math.max(previous.backCount,visibleCards.length));
        for(let i=0;i<pileCount;i++){
          const publicIndex=i-(pileCount-visibleCards.length),publicCard=publicIndex>=0?visibleCards[publicIndex]:null,localVisual=receiver===viewer?ownVisuals?.get?.(addedIds[i]):null,flightCard=localVisual?.card||publicCard,from=new THREE.Vector3((i-pileCount/2)*.045,TABLE_Y+.24,.08-i*.018),mesh=cardMesh(flightCard,{back:!flightCard}),to=localVisual?.position?.clone?.()||target.clone().add(new THREE.Vector3((i-(pileCount-1)/2)*.035,i*.002,-i*.012));
          if(localVisual?.mesh)localVisual.mesh.visible=false;
          queueCardFlight(mesh,from,to,{
            duration:470+Math.min(120,i*12),delay:120+i*42,lift:.55,
            fromRot:(i-pileCount/2)*.02,toRot:localVisual?.rotation||0,bank:.10,roll:(i%2?-.08:.08),
            fromScale:new THREE.Vector3(.82,.82,.82),toScale:localVisual?.scale||new THREE.Vector3(.69,.69,.69),
            onDone:()=>{if(localVisual?.mesh)localVisual.mesh.visible=true}
          });
        }
      }
    }

    if(game==='president'&&(previous.centerIds||[]).length&&!(currentSnapshot.centerIds||[]).length){
      const cards=previous.centerCards||[];
      cards.slice(0,6).forEach((card,i)=>{
        const from=new THREE.Vector3((i-(cards.length-1)/2)*.72,TABLE_Y+.23,.05),mesh=cardMesh(card,{back:!!card?.hidden});
        queueCardFlight(mesh,from,discardCorner.clone().add(new THREE.Vector3(i*.035,0,-i*.025)),{duration:430+i*30,delay:i*35,lift:.42,fromRot:(i-(cards.length-1)/2)*.05,toRot:.14,bank:.09,roll:.08});
      });
    }

    if(game==='plis'&&previous.phase==='trickResult'&&currentSnapshot.phase==='play'&&previous.entries?.length){
      const target=cardFamilyOrigin(previous.turn,viewer,opponentVisuals);
      previous.entries.forEach((entry,i)=>{
        const count=previous.entries.length,a=(Math.PI*2*i/Math.max(1,count))-Math.PI/2,direct=previous.trickOrigins?.get?.(entry.card.id);
        const from=direct?.position?.clone?.()||new THREE.Vector3(Math.cos(a)*1.45,TABLE_Y+.26,Math.sin(a)*1.1);
        const mesh=cardMesh(entry.card,{back:!!entry.card.hidden});
        queueCardFlight(mesh,from,target.clone().add(new THREE.Vector3((i-(count-1)/2)*.08,0,0)),{duration:440+i*30,delay:i*38,lift:.54,fromRot:direct?.rotation??i*.06,toRot:0,bank:.11,roll:(i%2?-.09:.09),fromScale:direct?.scale||null,toScale:new THREE.Vector3(.72,.72,.72)});
      });
    }

    if(game==='encheres'&&previous.bidRound&&currentSnapshot.bidRound>previous.bidRound){
      const bids=(previous.bidCards||[]).filter(Boolean),winner=previous.lastWinner;
      bids.forEach((card,i)=>{
        const from=new THREE.Vector3((i-((previous.bidCards||[]).length-1)/2)*1.18,TABLE_Y+.23,.75),mesh=cardMesh(card,{back:!!card.hidden});
        queueCardFlight(mesh,from,discardCorner.clone().add(new THREE.Vector3(i*.04,0,-i*.025)),{duration:440+i*30,delay:i*38,lift:.48,fromRot:(i-1)*.03,toRot:.12,bank:.09,roll:(i%2?-.08:.08)});
      });
      if(previous.prize){
        const target=Number.isInteger(winner)?cardFamilyOrigin(winner,viewer,opponentVisuals):discardCorner.clone().add(new THREE.Vector3(.35,0,.10));
        const prize=cardMesh(previous.prize,{back:!!previous.prize.hidden});
        queueCardFlight(prize,new THREE.Vector3(0,TABLE_Y+.25,-.55),target,{duration:580,delay:90,lift:.82,fromRot:0,toRot:0,bank:.14,roll:.10});
      }
    }

    const actors=currentSnapshot.handCounts.map((count,i)=>({i,delta:(previous.handCounts?.[i]??count)-count})).filter(x=>x.delta>0);
    if(!actors.length)return;
    const actor=actors[0].i,amount=Math.min(4,actors[0].delta),fallback=cardFamilyOrigin(actor,viewer,opponentVisuals),removedIds=actor===viewer?(previous.ownIds||[]).filter(id=>!(currentSnapshot.ownIds||[]).includes(id)):[];
    const oldIds=new Set(previous.centerIds||[]),newIds=(currentSnapshot.centerIds||[]).filter(id=>!oldIds.has(id));
    const source=(id,index)=>actor===viewer?(exactLocalCardOrigin(previous,id,index)||exactLocalCardOrigin(previous,removedIds[index],index)||fallback):fallback.clone().add(new THREE.Vector3((index-(amount-1)/2)*.10,0,0));
    const queue=(card,target,index,back=false,finalMesh=null,id=null)=>{
      if(!target)return;const mesh=cardMesh(back?null:card,{back});if(finalMesh)finalMesh.visible=false;
      queueCardFlight(mesh,source(id||card?.id,index),target.clone(),{duration:560+index*45,delay:index*70,lift:.78,fromRot:.03*(index-(amount-1)/2),toRot:0,bank:.12,roll:(index%2?-.09:.09),onDone:()=>{if(finalMesh)finalMesh.visible=true}});
    };
    if(game==='menteur'){
      const diff=Math.max(0,(currentSnapshot.backCount||0)-(previous.backCount||0));
      for(let i=0;i<Math.min(amount,diff);i++)queue(null,new THREE.Vector3((i-(diff-1)/2)*.05,TABLE_Y+.24,.08-i*.018),i,true,null,removedIds[i]);
      return;
    }
    if(game==='encheres'){
      const bids=center.bids||[],prev=previous.bidIds||[];
      bids.forEach((card,i)=>{if(!card||prev[i]===card.id)return;const visual=centerVisuals.get('bid-'+i);queue(card,visual?.position||new THREE.Vector3((i-(bids.length-1)/2)*1.18,TABLE_Y+.23,.75),0,!!card.hidden,visual?.mesh||null,card.id)});
      return;
    }
    newIds.slice(0,amount).forEach((id,i)=>{
      const visual=centerVisuals.get(id);if(!visual)return;
      queue(visual.card,visual.position,i,!!visual.card?.hidden,visual.mesh,id);
    });
  }
  function rummiMotionSnapshot(payload,data,visuals){
    const s=payload?.state,viewer=Number.isInteger(payload?.privateIndex)?payload.privateIndex:0;
    const positions=new Map();
    for(const [id,v] of visuals)positions.set(id,{position:v.position.clone(),scale:v.scale.clone(),rotation:v.rotation||0,zone:v.zone,tile:{id:v.tile.id,num:v.tile.num,color:v.tile.color,joker:!!v.tile.joker}});
    return{
      key:[s?.startedAt||'',viewer,(s?.players||[]).map(p=>p?.name||'').join('|')].join('~'),
      viewer,turn:Number(data?.turn??s?.turn??0),deckCount:Math.max(0,Number(data?.deckCount)||0),
      handIds:(data?.hand||[]).map(t=>t?.id).filter(Boolean),positions
    };
  }
  function rummiBoardLayout(groups){
    const active=(groups||[]).map((group,index)=>({group,index})).filter(x=>x.group?.length),count=Math.max(1,active.length),maxLen=Math.max(1,...active.map(x=>x.group.length));
    let cols=count<=2?count:maxLen>=10?2:count>=7?3:Math.min(3,Math.ceil(Math.sqrt(count*1.25)));
    cols=Math.max(1,cols);const rows=Math.max(1,Math.ceil(count/cols)),width=9.35,depth=3.55,cellW=width/cols,cellD=depth/rows;
    return{active,cols,rows,cellW,cellD,baseZ:-2.05,width,depth};
  }
  function rummiGroupSlot(layout,order,length,tileIndex){
    const col=order%layout.cols,row=Math.floor(order/layout.cols),baseX=(col-(layout.cols-1)/2)*layout.cellW,baseZ=layout.baseZ+row*layout.cellD;
    const natural=.66,scale=Math.max(.48,Math.min(.96,(layout.cellW-.28)/(Math.max(1,length)*natural))),spacing=natural*scale;
    return{x:baseX+(tileIndex-(length-1)/2)*spacing,z:baseZ,scale,row,col};
  }
  function rummiRackSlot(count,index){
    const total=Math.max(1,count),rows=total<=10?1:total<=20?2:3,perRow=Math.ceil(total/rows),row=Math.floor(index/perRow),start=row*perRow,rowCount=Math.min(perRow,total-start),local=index-start;
    const scale=rows===1?.92:rows===2?.82:.72,spacing=.68*scale,t=rowCount<=1?.5:local/(rowCount-1);
    return{x:(local-(rowCount-1)/2)*spacing,z:2.05+row*.78+Math.abs(t-.5)*.04,scale,row,yOffset:row*.012+local*.001};
  }
  function eightSnapshot(payload,deckCount,top){
    const s=payload?.state,viewer=Number.isInteger(payload?.privateIndex)?payload.privateIndex:0,own=s?.players?.[viewer]?.hand||[];
    return{key:[s?.startedAt||'',viewer,(s?.players||[]).map(p=>p?.name||'').join('|')].join('~'),viewer,deckCount,topId:top?.id||null,top:top?{id:top.id,suit:top.suit,rank:top.rank,joker:!!top.joker}:null,ownIds:own.map(c=>c?.id).filter(Boolean),handCounts:(s?.players||[]).map(p=>p?.hand?.length||0)};
  }
  function cactusSnapshot(payload,data){
    const s=payload?.state,viewer=Number.isInteger(data?.viewer)?data.viewer:(Number.isInteger(payload?.privateIndex)?payload.privateIndex:0),players=data?.players||[],own=players[viewer]?.hand||[],discard=data?.discard;
    return{
      key:[s?.startedAt||'',viewer,players.map(p=>p?.name||'').join('|')].join('~'),
      viewer,turn:Number(data?.turn??s?.turn??0),phase:String(data?.phase||s?.phase||''),source:data?.source||null,
      deckCount:Math.max(0,Number(data?.deckCount)||0),
      discardId:discard?.id||null,discard:discard?{id:discard.id,suit:discard.suit,rank:discard.rank,joker:!!discard.joker}:null,
      drawnId:data?.drawn?.id||null,
      ownIds:own.map(c=>c?.id).filter(Boolean),
      handCounts:players.map(p=>(p?.hand||[]).filter(Boolean).length)
    };
  }
  function ninetySnapshot(payload,ninety,own){
    const s=payload?.state,viewer=Number.isInteger(payload?.privateIndex)?payload.privateIndex:0,players=s?.players||[];
    return{
      key:[s?.startedAt||'',viewer,players.map(p=>p?.name||'').join('|')].join('~'),
      viewer,turn:Number(s?.turn??0),deckCount:Math.max(0,Number(ninety?.deckCount)||0),
      lastId:ninety?.last?.id||null,last:visualCardSnapshot(ninety?.last),
      ownIds:(own||[]).map(c=>c?.id).filter(Boolean),handCounts:players.map(p=>p?.hand?.length||0)
    };
  }
  function maidSnapshot(payload,maid,own){
    const s=payload?.state,viewer=Number.isInteger(payload?.privateIndex)?payload.privateIndex:0;
    return{
      key:[s?.startedAt||'',viewer,(s?.players||[]).map(p=>p?.name||'').join('|')].join('~'),
      viewer,turn:Number(s?.turn??0),target:Number(maid?.target??-1),targetCount:Number(maid?.targetCount||0),
      discardCount:Array.isArray(s?.discard)?s.discard.length:0,
      ownIds:(own||[]).map(c=>c?.id).filter(Boolean)
    };
  }
  function blackjackSnapshot(payload,bj){
    const s=payload?.state,viewer=Number.isInteger(payload?.privateIndex)?payload.privateIndex:0;
    return{
      key:[s?.startedAt||'',viewer,Number(s?.round||0)].join('~'),
      viewer,phase:String(bj?.phase||s?.phase||''),turn:Number(s?.turn??0),deckCount:Math.max(0,Number(bj?.deckCount)||0),
      hand:(bj?.hand||[]).map(visualCardSnapshot).filter(Boolean),
      dealer:(bj?.dealer||[]).map(visualCardSnapshot).filter(Boolean)
    };
  }
  function battleSeat(count,index,radius=3.25){
    const angle=(Math.PI*2*index/Math.max(1,count))-Math.PI/2;
    return{angle,x:Math.cos(angle)*radius,z:Math.sin(angle)*2.25};
  }
  function battleRevealSlot(count,reveal,index){
    const owner=Math.max(0,Number(reveal?.owner)||0),seat=battleSeat(count,owner,1.1),offset=(index%4)*.18;
    return{angle:seat.angle,x:Math.cos(seat.angle)*(1.1+offset),z:Math.sin(seat.angle)*(.82+offset)};
  }
  function battleSnapshot(payload,battle){
    const s=payload?.state,viewer=Number.isInteger(payload?.privateIndex)?payload.privateIndex:0;
    return{
      key:[s?.startedAt||'',viewer,(s?.players||[]).map(p=>p?.name||'').join('|')].join('~'),
      viewer,turn:Number(s?.turn??0),number:Number(battle?.number||0),winner:Number.isInteger(battle?.winner)?battle.winner:-1,pot:Number(battle?.pot||0),
      counts:[...(battle?.counts||[])],
      reveals:(battle?.reveals||[]).map(r=>r?.hidden?{owner:r.owner,hidden:true}:{owner:r.owner,hidden:false,card:visualCardSnapshot(r.card)})
    };
  }
  function queueCardFlight(mesh,from,to,{duration=620,delay=0,lift=.8,onStart=null,onDone=null,hideUntilStart=false,fromRot=0,toRot=0,bank=.10,roll=.08,fromScale=null,toScale=null}={}){
    mesh.position.copy(from);mesh.rotation.set(-Math.PI/2,0,fromRot);
    if(fromScale)mesh.scale.copy(fromScale);
    if(hideUntilStart)mesh.visible=false;
    cardFx.add(mesh);
    cardAnimations.push({mesh,from:from.clone(),to:to.clone(),start:performance.now(),duration,delay,lift,onStart,onDone,hideUntilStart,started:false,fromRot,toRot,bank,roll,fromScale:fromScale?.clone?.()||null,toScale:toScale?.clone?.()||null,done:false});startMotion();
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
  function pawnMesh(color){
    const key=String(color||'#dbea9e'),external=externalAsset('pawn',{color:key,canonicalSize:{radius:.24,height:.46}});
    if(external)return external;
    const mesh=new THREE.Mesh(pawnGeometry,pawnMaterial(key));mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
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
    const v=Math.max(1,Math.min(6,Number(value)||1)),external=externalAsset('die',{value:v,blank:false,canonicalSize:{edge:.68}});
    if(external)return external;
    const sides=[2,5,v,7-v,3,4].map(dieFaceMaterial),mesh=new THREE.Mesh(dieGeometry,sides);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
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
    const external=externalAsset('die',{value:null,blank:true,canonicalSize:{edge:.68}});if(external)return external;
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
    const userData={kind:'rummi-tile',tileId:tile.id,interactive:interactiveTile},visual=Object.freeze({num:tile?.num,color:tile?.color,joker:!!tile?.joker});
    const external=externalAsset('rummikub-tile',{tile:visual,selected,hidden:false,canonicalSize:{width:.62,height:.9,depth:.085}},userData);
    if(external){if(interactiveTile)interactive.push(external);return external}
    const mesh=new THREE.Mesh(rummiTileGeometry,rummiTileMaterial(tile,selected));mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData=userData;if(interactiveTile)interactive.push(mesh);return mesh;
  }
  function rummiHiddenTileMesh(){
    const external=externalAsset('rummikub-tile',{tile:null,selected:false,hidden:true,canonicalSize:{width:.62,height:.9,depth:.085}},{kind:'rummi-hidden',interactive:false});
    if(external)return external;
    const mesh=new THREE.Mesh(rummiTileGeometry,rummiBackMaterial);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={kind:'rummi-hidden',interactive:false};return mesh;
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
      if(!a.started){a.started=true;if(a.hideUntilStart)a.mesh.visible=true;a.onStart?.()}
      const t=Math.min(1,Math.max(0,elapsed/a.duration)),ease=1-Math.pow(1-t,3);
      a.mesh.position.lerpVectors(a.from,a.to,ease);a.mesh.position.y+=Math.sin(t*Math.PI)*(a.lift??.8);
      const arc=Math.sin(t*Math.PI);
      a.mesh.rotation.x=-Math.PI/2+arc*(a.bank??.10);
      a.mesh.rotation.y=arc*(a.roll??.08);
      a.mesh.rotation.z=THREE.MathUtils.lerp(a.fromRot||0,a.toRot||0,ease);
      if(a.fromScale&&a.toScale)a.mesh.scale.lerpVectors(a.fromScale,a.toScale,ease);
      if(t<1)running=true;else{a.mesh.position.copy(a.to);a.mesh.rotation.set(-Math.PI/2,0,a.toRot||0);if(a.toScale)a.mesh.scale.copy(a.toScale);a.done=true;cardFx.remove(a.mesh);a.onDone?.()}
    }
    if(cardAnimations.some(a=>a.done))cardAnimations=cardAnimations.filter(a=>!a.done);
    for(const a of manipAnimations){
      if(a.done)continue;
      const t=Math.min(1,Math.max(0,(now-a.start)/a.duration)),ease=1-Math.pow(1-t,3),u=1-ease;
      a.mesh.position.set(
        u*u*a.from.x+2*u*ease*a.control.x+ease*ease*a.to.x,
        u*u*a.from.y+2*u*ease*a.control.y+ease*ease*a.to.y,
        u*u*a.from.z+2*u*ease*a.control.z+ease*ease*a.to.z
      );
      a.mesh.rotation.set(
        THREE.MathUtils.lerp(a.fromRot.x,a.toRot.x,ease),
        THREE.MathUtils.lerp(a.fromRot.y,a.toRot.y,ease),
        THREE.MathUtils.lerp(a.fromRot.z,a.toRot.z,ease)
      );
      a.mesh.scale.lerpVectors(a.fromScale,a.toScale,ease);
      if(t<1)running=true;else{a.mesh.position.copy(a.to);a.mesh.rotation.copy(a.toRot);a.mesh.scale.copy(a.toScale);a.done=true}
    }
    if(manipAnimations.some(a=>a.done))manipAnimations=manipAnimations.filter(a=>!a.done);
    for(const a of tossAnimations){
      if(a.done)continue;
      if(now<a.start){running=true;continue}
      const dt=Math.max(.25,Math.min(2,(now-(a.lastAt||now))/16.67));a.lastAt=now;
      const drag=Math.pow(.925,dt),spinDrag=Math.pow(.91,dt);
      a.velocity.multiplyScalar(drag);a.spin*=spinDrag;
      a.mesh.position.x+=a.velocity.x*dt;a.mesh.position.z+=a.velocity.z*dt;
      const floorY=Number(a.mesh.userData?.localPoseFloorY??TABLE_Y+.12);
      const ageY=Math.max(0,now-a.start),settle=Math.min(1,ageY/230),settleEase=1-Math.pow(1-settle,3);
      a.mesh.position.y=THREE.MathUtils.lerp(a.startY??floorY,floorY,settleEase)+Math.sin(Math.min(1,ageY/300)*Math.PI)*Math.min(.28,.06+a.speed*.09);
      a.mesh.rotation.x=-Math.PI/2+clampMotion(-a.velocity.z*.055,-.16,.16);
      a.mesh.rotation.y=clampMotion(a.velocity.x*.045,-.14,.14);
      a.mesh.rotation.z+=a.spin*dt;
      const xLimit=5.05,zLimit=3.08;
      if(a.mesh.position.x>xLimit){a.mesh.position.x=xLimit;a.velocity.x=-Math.abs(a.velocity.x)*.54;a.spin+=.012}
      else if(a.mesh.position.x<-xLimit){a.mesh.position.x=-xLimit;a.velocity.x=Math.abs(a.velocity.x)*.54;a.spin-=.012}
      if(a.mesh.position.z>zLimit){a.mesh.position.z=zLimit;a.velocity.z=-Math.abs(a.velocity.z)*.54;a.spin-=.010}
      else if(a.mesh.position.z<-zLimit){a.mesh.position.z=-zLimit;a.velocity.z=Math.abs(a.velocity.z)*.54;a.spin+=.010}
      const speed=a.velocity.length(),age=now-a.start;
      if((speed<.012&&age>260)||age>a.duration){
        a.done=true;a.mesh.position.y=floorY;a.mesh.rotation.x=-Math.PI/2;a.mesh.rotation.y=0;a.mesh.scale.copy(a.home.scale);
        if(a.mesh.userData?.persistLocalPose){
          const pose=saveLocalPose(a.mesh,a.home,{order:a.poseOrder});if(pose){a.mesh.position.copy(pose.position);a.mesh.rotation.copy(pose.rotation);a.mesh.scale.copy(pose.scale)}
        }else restoreManipulatedMesh(a.mesh,a.home,{velocityX:0,velocityY:0},{index:a.index||0});
        running=true;
      }else running=true;
    }
    if(tossAnimations.some(a=>a.done))tossAnimations=tossAnimations.filter(a=>!a.done);
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
      const pawn=pawnMesh(colors[i]||['#dbea9e','#aacdf7','#e4ad91','#c9afe7'][i%4]);
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
      const own=payload.spectator?[]:(s.players[viewer]?.hand||[]),n=own.length,ownVisuals=new Map();
      own.forEach((card,i)=>{
        const slot=handCardSlot(n,i),mesh=cardMesh(card,{back:!!card.hidden});
        placeCard(mesh,slot.x,slot.z,TABLE_Y+.11+slot.yOffset,slot.fan,slot.scale);makeLooseManipulable(mesh,{kind:'loose-card',cardId:card.id,persistPose:true});
        if(card?.id)ownVisuals.set(card.id,{mesh,card,position:mesh.position.clone(),rotation:mesh.rotation.z,scale:mesh.scale.clone()});
      });
      const maid=data.maid||{},count=Number(maid.targetCount)||0,visible=Math.min(24,count);
      for(let i=0;i<visible;i++){
        const slot=pickCardSlot(visible,i),mesh=cardMesh(null,{back:true});placeCard(mesh,slot.x,slot.z,TABLE_Y+.13+slot.yOffset,slot.rot,slot.scale);
        if(payload.canInteract){mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};makeLooseManipulable(mesh,{kind:'maid-pick',tapEnabled:true,index:i})}
      }

      const discard=(s.discard||[]),discardVisuals=[],discardPos=new THREE.Vector3(3.55,TABLE_Y+.23,.25);
      discard.slice(-4).forEach((card,i,arr)=>{
        const mesh=cardMesh(card,{back:!!card?.hidden});placeCard(mesh,discardPos.x+i*.035,discardPos.z-i*.025,TABLE_Y+.10+i*.022,.06*(i-(arr.length-1)/2),.66);
        discardVisuals.push({mesh,card,position:mesh.position.clone()});
      });
      if(discard.length){
        const pileLabel=makeLabel('PAIRES · '+Math.floor(discard.length/2),'#e6d7b4');pileLabel.position.set(discardPos.x,1.0,discardPos.z-.72);pileLabel.scale.set(2.0,.44,1);objects.add(pileLabel);
      }

      const snapshot=maidSnapshot(payload,maid,own),previous=lastMaidSnapshot;
      if(previous&&previous.key===snapshot.key&&motionAllowed()&&pendingMaidPickOrigin){
        const added=(snapshot.ownIds||[]).find(id=>!(previous.ownIds||[]).includes(id)),pairMade=snapshot.discardCount>=previous.discardCount+2;
        const from=pendingMaidPickOrigin.position?.clone?.()||new THREE.Vector3(0,TABLE_Y+.28,-.2);
        if(added){
          const visual=ownVisuals.get(added);
          if(visual){
            visual.mesh.visible=false;
            queueCardFlight(cardMesh(null,{back:true}),from,visual.position,{duration:480,lift:.66,fromRot:pendingMaidPickOrigin.rotation||0,toRot:visual.rotation,bank:.13,roll:.10,fromScale:pendingMaidPickOrigin.scale||null,toScale:visual.scale,onDone:()=>{visual.mesh.visible=true}});
          }
        }else if(pairMade){
          const handTarget=new THREE.Vector3(0,TABLE_Y+.28,2.18);
          queueCardFlight(cardMesh(null,{back:true}),from,handTarget,{duration:390,lift:.56,fromRot:pendingMaidPickOrigin.rotation||0,toRot:0,bank:.12,roll:-.10,fromScale:pendingMaidPickOrigin.scale||null,toScale:new THREE.Vector3(.72,.72,.72)});
          const pair=discard.slice(-2),finals=discardVisuals.slice(-2);
          pair.forEach((card,i)=>{
            if(finals[i]?.mesh)finals[i].mesh.visible=false;
            queueCardFlight(cardMesh(card,{back:!!card?.hidden}),handTarget,finals[i]?.position||discardPos.clone().add(new THREE.Vector3(i*.05,0,-i*.03)),{duration:450+i*35,delay:390+i*70,lift:.52,fromRot:(i-.5)*.04,toRot:.04*(i-.5),bank:.10,roll:(i?-.08:.08),fromScale:new THREE.Vector3(.72,.72,.72),toScale:new THREE.Vector3(.66,.66,.66),onDone:()=>{if(finals[i]?.mesh)finals[i].mesh.visible=true}});
          });
        }
        pendingMaidPickOrigin=null;
      }
      lastMaidSnapshot=snapshot;

      if(title)title.textContent='VUE 3D · POUILLEUX';
      if(status)status.textContent='Piochez chez '+(maid.targetName||'le joueur suivant')+' · '+count+' carte'+(count>1?'s':'');
      if(help)help.textContent=payload.canInteract?'Touchez une carte ou glissez-la jusqu’à votre main · une paire part ensuite physiquement à la défausse':(maid.pairs||0)+' paire'+((maid.pairs||0)>1?'s':'')+' déjà formée'+((maid.pairs||0)>1?'s':'');
      return;
    }

    if(game==='quatrevingtdixneuf'){
      const ninety=data.ninety||{},selected=new Set(ninety.selectedIds||[]),selectable=new Set(ninety.selectableIds||[]),legal=new Set(ninety.legalIds||[]),own=payload.spectator?[]:(s.players[viewer]?.hand||[]),n=own.length,ownVisuals=new Map();
      const ninetyDrop=cardGestureTarget('quatrevingtdixneuf',TABLE_Y+.025);dropMarker.visible=!!(payload.canInteract&&selectable.size);dropMarker.position.set(ninetyDrop.x,TABLE_Y+.025,ninetyDrop.z);dropMarker.material.opacity=.2;
      own.forEach((card,i)=>{
        const slot=handCardSlot(n,i),chosen=selected.has(card.id),isLegal=legal.has(card.id),mesh=cardMesh(card,{back:!!card.hidden,id:card.id,interactiveCard:selectable.has(card.id),playable:selectable.has(card.id)});
        mesh.userData.kind='special-select';mesh.userData.cardId=card.id;mesh.userData.home={position:new THREE.Vector3(slot.x,TABLE_Y+.12+slot.yOffset+(chosen?.25:isLegal?.08:0),slot.z),rotation:new THREE.Euler(-Math.PI/2,0,slot.fan),scale:new THREE.Vector3(1,1,1).multiplyScalar(slot.scale*(chosen?1.07:isLegal?1.025:.98))};
        mesh.position.copy(mesh.userData.home.position);mesh.rotation.copy(mesh.userData.home.rotation);mesh.scale.copy(mesh.userData.home.scale);makeLooseManipulable(mesh,{kind:'special-select',tapEnabled:selectable.has(card.id),cardId:card.id,persistPose:true});objects.add(mesh);
        ownVisuals.set(card.id,{mesh,card,position:mesh.position.clone(),rotation:mesh.rotation.z,scale:mesh.scale.clone()});
      });

      const deckCount=Math.max(0,Number(ninety.deckCount)||0),deckPos=new THREE.Vector3(-2.1,TABLE_Y+.22,.05);
      for(let i=0;i<Math.min(4,Math.max(1,deckCount));i++){
        const mesh=cardMesh(null,{back:true});placeCard(mesh,deckPos.x,deckPos.z,TABLE_Y+.07+i*.028,-.025+i*.012,.78);
      }
      let top=null;
      if(ninety.last){top=cardMesh(ninety.last,{back:!!ninety.last.hidden});placeCard(top,1.5,.05,TABLE_Y+.13,0,.9)}
      const counter=makeLabel('TOTAL '+Number(ninety.total||0)+' / 99',Number(ninety.total)>=85?'#f0b3a6':'#dbea9e');counter.scale.set(3.1,.72,1);counter.position.set(-.35,1.08,-.05);objects.add(counter);

      const opponents=s.players.map((p,i)=>({p,i})).filter(x=>x.i!==viewer&&!x.p.out),opponentVisuals=new Map();
      opponents.forEach(({p,i},k)=>{
        const seat=eightOpponentSeat(opponents.length,k),count=p.hand?.length||0,total=Math.min(5,count),span=total<=1?0:Math.min(2.2,(total-1)*.36),meshes=[];
        for(let c=0;c<total;c++){const t=total<=1?.5:c/(total-1),mesh=cardMesh(null,{back:true});placeCard(mesh,seat.x+(t-.5)*span,seat.z+Math.abs(t-.5)*.08,TABLE_Y+.15+c*.006,(t-.5)*-.13,.64);meshes.push(mesh)}
        const label=makeLabel((p.name||'Joueur')+' · '+count+' carte'+(count>1?'s':''),i===s.turn?'#dbea9e':'#d8ded9');label.position.set(seat.x,1.0,seat.z-.68);label.scale.set(2.5,.52,1);objects.add(label);
        opponentVisuals.set(i,{...seat,meshes,count});
      });

      const snapshot=ninetySnapshot(payload,ninety,own),previous=lastNinetySnapshot;
      if(previous&&previous.key===snapshot.key&&motionAllowed()&&snapshot.lastId&&snapshot.lastId!==previous.lastId){
        const actor=previous.turn,viewerActor=actor===viewer,publicCard=ninety.last,discardTarget=new THREE.Vector3(1.5,TABLE_Y+.24,.05);
        let playFrom;
        if(viewerActor){
          const removed=(previous.ownIds||[]).find(id=>!(snapshot.ownIds||[]).includes(id))||snapshot.lastId,direct=previous.dragOrigins?.get?.(removed);
          if(direct?.position)playFrom=direct.position.clone();
          else if(storedLocalPose(removed)?.position)playFrom=storedLocalPose(removed).position.clone();
          else{const index=Math.max(0,(previous.ownIds||[]).indexOf(removed)),slot=handCardSlot(previous.ownIds.length,index);playFrom=new THREE.Vector3(slot.x,TABLE_Y+.28+slot.yOffset,slot.z)}
        }else{
          const visual=opponentVisuals.get(actor);playFrom=new THREE.Vector3(visual?.x||0,TABLE_Y+.29,(visual?.z||-2.2)+.08);
        }
        if(top)top.visible=false;
        queueCardFlight(cardMesh(publicCard,{back:!!publicCard?.hidden}),playFrom,discardTarget,{duration:520,lift:.72,fromRot:0,toRot:0,bank:.14,roll:viewerActor?.10:-.10,onDone:()=>{if(top)top.visible=true}});

        const deckDropped=snapshot.deckCount<previous.deckCount;
        if(deckDropped){
          if(viewerActor){
            const added=(snapshot.ownIds||[]).find(id=>!(previous.ownIds||[]).includes(id)),visual=added?ownVisuals.get(added):null;
            if(visual){
              visual.mesh.visible=false;
              queueCardFlight(cardMesh(visual.card),deckPos,visual.position,{duration:500,delay:95,lift:.64,fromRot:-.03,toRot:visual.rotation,bank:.11,roll:-.09,fromScale:new THREE.Vector3(.78,.78,.78),toScale:visual.scale,onDone:()=>{visual.mesh.visible=true}});
            }
          }else{
            const visual=opponentVisuals.get(actor);
            if(visual){
              const target=new THREE.Vector3(visual.x,TABLE_Y+.27,visual.z+.08);
              queueCardFlight(cardMesh(null,{back:true}),deckPos,target,{duration:510,delay:95,lift:.62,fromRot:-.03,toRot:0,bank:.10,roll:.08,fromScale:new THREE.Vector3(.78,.78,.78),toScale:new THREE.Vector3(.64,.64,.64)});
            }
          }
        }
      }
      lastNinetySnapshot=snapshot;

      if(payload.canInteract){
        const selectedId=[...selected][0],card=own.find(c=>c.id===selectedId);
        if(card){
          if(card.rank===1){
            const a1=actionSprite('JOUER L’AS · +1','ninety-action',{command:'play',cardId:card.id,ace:1},'#dbea9e');a1.position.set(-1.7,1.05,1.45);objects.add(a1);
            if(Number(ninety.total||0)+11<=99){const a11=actionSprite('JOUER L’AS · +11','ninety-action',{command:'play',cardId:card.id,ace:11},'#b7d5ee');a11.position.set(1.7,1.05,1.45);objects.add(a11)}
          }else if(legal.has(card.id)){const play=actionSprite('JOUER LA CARTE','ninety-action',{command:'play',cardId:card.id,ace:1},'#dbea9e');play.position.set(0,1.05,1.45);objects.add(play)}
        }else if(!own.some(c=>legal.has(c.id))){const bust=actionSprite('JE SUIS BLOQUÉ','ninety-action',{command:'bust'},'#efaaa0');bust.position.set(0,1.05,1.45);objects.add(bust)}
      }
      if(title)title.textContent='VUE 3D · 99';
      if(status)status.textContent=(ninety.dir===-1?'↺':'↻')+' · '+deckCount+' cartes en pioche';
      if(help)help.textContent=ninety.lastEffect||'Sélectionnez une carte puis confirmez son effet dessous';
      return;
    }

    if(game==='vingtetun'){
      const bj=data.blackjack||{},dealer=bj.dealer||[],own=bj.hand||[],shoePos=new THREE.Vector3(-3.75,TABLE_Y+.24,-.55),ownVisuals=new Map(),dealerVisuals=[];
      const deckCount=Math.max(0,Number(bj.deckCount)||0),shoeVisible=Math.min(5,Math.max(1,deckCount));
      for(let i=0;i<shoeVisible;i++){
        const mesh=cardMesh(null,{back:true});placeCard(mesh,shoePos.x+i*.018,shoePos.z-i*.018,TABLE_Y+.07+i*.025,-.045+i*.012,.70);
      }
      const shoeLabel=makeLabel('SABOT · '+deckCount,'#d8ded9');shoeLabel.position.set(shoePos.x,1.0,shoePos.z-.72);shoeLabel.scale.set(2.0,.44,1);objects.add(shoeLabel);

      dealer.forEach((card,i)=>{
        const x=(i-(dealer.length-1)/2)*.82,z=-.9,mesh=cardMesh(card,{back:!!card.hidden});
        placeCard(mesh,x,z,TABLE_Y+.13+i*.012,(i-(dealer.length-1)/2)*.04,.78);
        dealerVisuals.push({mesh,card,position:mesh.position.clone(),rotation:mesh.rotation.z,scale:mesh.scale.clone()});
      });
      const dn=own.length;
      own.forEach((card,i)=>{
        const slot=handCardSlot(dn,i),mesh=cardMesh(card,{back:!!card.hidden});
        placeCard(mesh,slot.x,slot.z,TABLE_Y+.13+slot.yOffset,slot.fan,slot.scale*.92);makeLooseManipulable(mesh,{kind:'loose-card',cardId:card.id,persistPose:true});
        if(card?.id)ownVisuals.set(card.id,{mesh,card,position:mesh.position.clone(),rotation:mesh.rotation.z,scale:mesh.scale.clone()});
      });

      const snapshot=blackjackSnapshot(payload,bj),previous=lastBlackjackSnapshot;
      if(previous&&previous.key===snapshot.key&&motionAllowed()){
        const previousOwn=previous.hand||[],previousDealer=previous.dealer||[],newOwn=snapshot.hand.filter(c=>!previousOwn.some(p=>p.id===c.id));
        own.forEach((card,i)=>{
          const visual=ownVisuals.get(card?.id);if(!visual)return;
          const prevIndex=previousOwn.findIndex(p=>p.id===card.id),posed=!!storedLocalPose(card?.id);
          if(prevIndex>=0&&previousOwn.length!==own.length&&!posed){
            const before=handCardSlot(previousOwn.length,prevIndex),from=new THREE.Vector3(before.x,TABLE_Y+.25+before.yOffset,before.z);
            if(from.distanceTo(visual.position)>.08){
              visual.mesh.visible=false;
              queueCardFlight(cardMesh(card,{back:!!card.hidden}),from,visual.position,{duration:330,delay:25*i,lift:.18,fromRot:before.fan,toRot:visual.rotation,bank:.04,roll:(i%2?-.04:.04),fromScale:new THREE.Vector3(before.scale*.92,before.scale*.92,before.scale*.92),toScale:visual.scale,onDone:()=>{visual.mesh.visible=true}});
            }
          }
        });
        newOwn.forEach((card,q)=>{
          const visual=ownVisuals.get(card.id);if(!visual)return;visual.mesh.visible=false;
          queueCardFlight(cardMesh(card,{back:!!card.hidden}),shoePos,visual.position,{duration:520+q*35,delay:q*145,lift:.72,fromRot:-.04,toRot:visual.rotation,bank:.14,roll:(q%2?-.10:.10),fromScale:new THREE.Vector3(.70,.70,.70),toScale:visual.scale,onDone:()=>{visual.mesh.visible=true}});
        });

        dealer.forEach((card,i)=>{
          const visual=dealerVisuals[i],prev=previousDealer[i],isNew=i>=previousDealer.length;
          if(!visual)return;
          if(isNew){
            visual.mesh.visible=false;
            queueCardFlight(cardMesh(card?.hidden?null:card,{back:!!card?.hidden}),shoePos,visual.position,{duration:520+i*35,delay:70+i*145,lift:.76,fromRot:-.04,toRot:visual.rotation,bank:.14,roll:(i%2?-.11:.11),fromScale:new THREE.Vector3(.70,.70,.70),toScale:visual.scale,onDone:()=>{visual.mesh.visible=true}});
          }else if(prev?.hidden&&!card?.hidden){
            visual.mesh.visible=false;
            queueCardFlight(cardMesh(null,{back:true}),visual.position,visual.position,{duration:500,delay:40,lift:.24,fromRot:visual.rotation,toRot:visual.rotation,bank:.04,roll:Math.PI,fromScale:visual.scale,toScale:visual.scale,onDone:()=>{visual.mesh.visible=true}});
          }else if(previousDealer.length!==dealer.length){
            const prevX=(i-(previousDealer.length-1)/2)*.82,from=new THREE.Vector3(prevX,TABLE_Y+.24+i*.012,-.9);
            if(from.distanceTo(visual.position)>.08){
              visual.mesh.visible=false;
              queueCardFlight(cardMesh(card?.hidden?null:card,{back:!!card?.hidden}),from,visual.position,{duration:320,delay:30*i,lift:.16,fromRot:(i-(previousDealer.length-1)/2)*.04,toRot:visual.rotation,bank:.035,roll:(i%2?-.035:.035),fromScale:visual.scale,toScale:visual.scale,onDone:()=>{visual.mesh.visible=true}});
            }
          }
        });
      }
      lastBlackjackSnapshot=snapshot;

      const dealerLabel=makeLabel('BANQUE · '+(dealer.length?(bj.dealerRevealed?bj.dealerValue:bj.dealerValue+' + ?'):'—'),'#e6d7b4');dealerLabel.position.set(0,1.02,-2.1);dealerLabel.scale.set(3,.62,1);objects.add(dealerLabel);
      if(bj.phase==='bet'){
        const bet=makeLabel('FAITES VOS JEUX','#dbea9e');bet.position.set(0,1.05,-.05);bet.scale.set(3.6,.8,1);objects.add(bet);
        if(payload.canInteract){[10,25,50,100].filter(n=>n<=Number(bj.chips||0)).forEach((amount,i,all)=>{const chip=actionSprite(String(amount),'blackjack-action',{command:'bet',amount},'#e6d7b4');chip.position.set((i-(all.length-1)/2)*1.45,1.02,1.55);chip.scale.set(1.18,.52,1);objects.add(chip)})}
      }else if(bj.phase==='play'&&payload.canInteract){
        const hit=actionSprite('TIRER','blackjack-action',{command:'hit'},'#dbea9e');hit.position.set(-2.1,1.02,1.45);objects.add(hit);
        const stand=actionSprite('RESTER','blackjack-action',{command:'stand'},'#b7d5ee');stand.position.set(0,1.02,1.45);objects.add(stand);
        if(own.length===2&&Number(bj.chips||0)>=Number(bj.bet||0)){const dbl=actionSprite('DOUBLER','blackjack-action',{command:'double'},'#e6d7b4');dbl.position.set(2.1,1.02,1.45);objects.add(dbl)}
      }
      if(title)title.textContent='VUE 3D · VINGT-ET-UN';
      if(status)status.textContent=bj.phase==='bet'?(bj.chips||0)+' jetons disponibles':own.length?(bj.playerValue||0)+' points · mise '+(bj.bet||0):'La banque distribue';
      if(help)help.textContent=bj.phase==='bet'?'Choisissez votre mise · les cartes seront distribuées depuis le sabot':bj.phase==='play'?'Tirer, rester ou doubler · chaque nouvelle carte vient physiquement du sabot':'La banque tire depuis le sabot · sa carte cachée reste masquée jusqu’à la révélation';
      return;
    }

    if(game==='bataille'){
      const battle=data.battle||{},counts=battle.counts||[],players=s.players||[],radius=3.25,deckVisuals=new Map();
      players.forEach((p,i)=>{
        const seat=battleSeat(players.length,i,radius),count=counts[i]??p.hand?.length??0,total=Math.min(5,count),meshes=[];
        for(let c=0;c<total;c++){
          const top=c===total-1,mesh=cardMesh(null,{back:true});
          placeCard(mesh,seat.x+c*.025,seat.z-c*.025,TABLE_Y+.11+c*.025,seat.angle+.08,.58);
          if(top&&payload.canInteract&&i===s.turn&&i===viewer){
            mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};
            makeLooseManipulable(mesh,{kind:'battle-card',tapEnabled:true,owner:i});
          }
          meshes.push(mesh);
        }
        deckVisuals.set(i,{...seat,count,meshes,top:meshes.at(-1)||null});
        const label=makeLabel((p.name||'Joueur')+' · '+count,i===s.turn?'#dbea9e':'#d8ded9');label.scale.set(2.2,.48,1);label.position.set(seat.x,.95,seat.z+(seat.z>0 ? .65 : -.65));objects.add(label);
      });

      const reveals=battle.reveals||[],revealVisuals=[];
      reveals.forEach((r,i)=>{
        const slot=battleRevealSlot(players.length,r,i),mesh=cardMesh(r.hidden?null:r.card,{back:!!r.hidden});
        placeCard(mesh,slot.x,slot.z,TABLE_Y+.16+i*.01,slot.angle,.64);
        revealVisuals.push({mesh,reveal:r,position:mesh.position.clone(),rotation:mesh.rotation.z,scale:mesh.scale.clone(),owner:r.owner});
      });

      const snapshot=battleSnapshot(payload,battle),previous=lastBattleSnapshot;
      if(previous&&previous.key===snapshot.key&&snapshot.number>previous.number&&motionAllowed()&&revealVisuals.length){
        const revealCount=Math.min(24,revealVisuals.length),actor=previous.turn;
        let usedPending=false;
        revealVisuals.slice(0,revealCount).forEach((visual,i)=>{
          const owner=Math.max(0,Number(visual.owner)||0),seat=battleSeat(players.length,owner,radius),direct=!usedPending&&owner===actor&&pendingBattleOrigin?.position?pendingBattleOrigin:null;
          if(direct)usedPending=true;
          const from=direct?.position?.clone?.()||new THREE.Vector3(seat.x,TABLE_Y+.29,seat.z),fromRot=direct?.rotation??seat.angle+.08,fromScale=direct?.scale?.clone?.()||new THREE.Vector3(.58,.58,.58);
          visual.mesh.visible=false;
          const flight=cardMesh(visual.reveal.hidden?null:visual.reveal.card,{back:!!visual.reveal.hidden});
          queueCardFlight(flight,from,visual.position,{
            duration:440+Math.min(100,i*12),delay:i*82,lift:.62,
            fromRot,toRot:visual.rotation,bank:.12,roll:(i%2?-.10:.10),
            fromScale,toScale:visual.scale,hideUntilStart:true,
            onDone:()=>{visual.mesh.visible=true}
          });
        });

        if(snapshot.winner>=0){
          const winner=battleSeat(players.length,snapshot.winner,radius),gatherDelay=revealCount*82+620,targetBase=new THREE.Vector3(winner.x,TABLE_Y+.29,winner.z);
          revealVisuals.slice(0,revealCount).forEach((visual,i)=>{
            const gather=cardMesh(visual.reveal.hidden?null:visual.reveal.card,{back:!!visual.reveal.hidden}),target=targetBase.clone().add(new THREE.Vector3((i-(revealCount-1)/2)*.018,i*.004,-i*.012));
            queueCardFlight(gather,visual.position,target,{
              duration:430+Math.min(90,i*8),delay:gatherDelay+i*28,lift:.48,
              fromRot:visual.rotation,toRot:winner.angle+.08,bank:.09,roll:(i%2?-.075:.075),
              fromScale:visual.scale,toScale:new THREE.Vector3(.58,.58,.58),hideUntilStart:true,
              onStart:()=>{visual.mesh.visible=false}
            });
          });
        }
      }
      if(previous&&snapshot.number>previous.number)pendingBattleOrigin=null;
      lastBattleSnapshot=snapshot;

      if(payload.canInteract){const action=actionSprite('RETOURNER LE PLI','battle-action');action.position.set(0,1.02,2.45);objects.add(action)}
      if(title)title.textContent='VUE 3D · BATAILLE';
      if(status)status.textContent='Pli '+(Number(battle.number||0)+1)+' / 200'+(battle.winner>=0?' · '+(players[battle.winner]?.name||'')+' gagne':'');
      if(help)help.textContent=payload.canInteract?'Touchez la carte supérieure ou glissez-la vers le centre · le moteur retourne tout le pli':'Les paquets restent face cachée · le pli confirmé se joue au centre';
    }
  }

  function syncCardFamily(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,data=payload.viewData||{},viewer=Number.isInteger(payload.privateIndex)?payload.privateIndex:0,game=data.cardGame||payload.gameId;
    if(!s?.players?.length)return;
    setCameraPose(0,7.4,9.1,0,.22,.15);
    const selected=new Set(data.selectedIds||[]),selectable=new Set(data.selectableIds||[]),playable=new Set(data.cardPlayableIds||[]);
    const dropTarget=cardGestureTarget(game,TABLE_Y+.025);dropMarker.visible=!!(payload.canInteract&&selectable.size);dropMarker.position.set(dropTarget.x,TABLE_Y+.025,dropTarget.z);dropMarker.material.opacity=.2;
    const own=payload.spectator?[]:(s.players[viewer]?.hand||[]),n=own.length,ownVisuals=new Map();
    own.forEach((card,i)=>{
      const slot=handCardSlot(n,i),chosen=selected.has(card.id),canSelect=selectable.has(card.id),legal=playable.has(card.id);
      const mesh=cardMesh(card,{back:!!card.hidden,id:card.id,interactiveCard:canSelect,playable:canSelect});
      mesh.userData.kind='card-select';mesh.userData.cardId=card.id;mesh.userData.playable=canSelect;mesh.userData.legal=legal;
      mesh.position.set(slot.x,TABLE_Y+.12+slot.yOffset+(chosen?.26:legal?.09:0),slot.z);mesh.rotation.set(-Math.PI/2,0,slot.fan);mesh.scale.setScalar(slot.scale*(chosen?1.075:legal?1.025:.98));
      mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};makeLooseManipulable(mesh,{kind:'card-select',tapEnabled:canSelect,cardId:card.id,persistPose:true});objects.add(mesh);
      if(card?.id)ownVisuals.set(card.id,{mesh,card,position:mesh.position.clone(),rotation:mesh.rotation.z,scale:mesh.scale.clone()});
    });
    const opponents=s.players.map((p,i)=>({p,i})).filter(x=>x.i!==viewer),opponentVisuals=new Map();
    opponents.forEach(({p,i},k)=>{
      const count=p.hand?.length||0,total=Math.min(8,count),seat=eightOpponentSeat(opponents.length,k),span=total<=1?0:Math.min(2.8,(total-1)*.40);
      for(let c=0;c<total;c++){const t=total<=1?.5:c/(total-1),mesh=cardMesh(null,{back:true});placeCard(mesh,seat.x+(t-.5)*span,seat.z+Math.abs(t-.5)*.09,TABLE_Y+.15+c*.006,(t-.5)*-.16,.70)}
      const label=makeLabel((p.name||'Joueur')+' · '+count+' carte'+(count>1?'s':''),i===s.turn?'#dbea9e':'#eef2e8');label.position.set(seat.x,1.12,seat.z-.70);label.scale.set(3.0,.62,1);objects.add(label);
      opponentVisuals.set(i,{...seat,count});
    });
    const center=data.cardCenter||{},centerVisuals=new Map();
    if(game==='president'){
      (center.cards||[]).forEach((card,i)=>{const mesh=cardMesh(card,{back:!!card.hidden}),x=(i-(center.cards.length-1)/2)*.72,z=.05;placeCard(mesh,x,z,TABLE_Y+.13+i*.01,(i-(center.cards.length-1)/2)*.05,.82);if(card?.id)centerVisuals.set(card.id,{mesh,card,position:new THREE.Vector3(x,TABLE_Y+.23,z)})});
    }else if(game==='menteur'){
      const count=Math.min(7,Number(center.backCount)||0);
      for(let i=0;i<count;i++){const mesh=cardMesh(null,{back:true});placeCard(mesh,(i-count/2)*.045,.08-i*.018,TABLE_Y+.1+i*.025,(i-count/2)*.02,.82)}
      const historicalReveal=s?.phase==='play'&&!center.claim&&Number(center.backCount||0)===0;
      if(!historicalReveal)(center.cards||[]).forEach((card,i)=>{const x=(i-(center.cards.length-1)/2)*.72,z=-.65,mesh=cardMesh(card,{back:!!card.hidden});placeCard(mesh,x,z,TABLE_Y+.16+i*.01,(i-(center.cards.length-1)/2)*.04,.72);if(card?.id)centerVisuals.set(card.id,{mesh,card,position:new THREE.Vector3(x,TABLE_Y+.25,z)})});
    }else if(game==='suites'){
      setCameraPose(0,8.9,7.2,0,.18,0);
      const suits=['S','H','D','C'];
      suits.forEach((suit,row)=>{
        const cards=center.lanes?.[suit]||[];
        cards.forEach(card=>{const x=(Number(card.rank)-7)*.62,z=(row-1.5)*1.25,mesh=cardMesh(card,{back:!!card.hidden});placeCard(mesh,x,z,TABLE_Y+.12,0,.48);if(card?.id)centerVisuals.set(card.id,{mesh,card,position:new THREE.Vector3(x,TABLE_Y+.22,z)})});
        const label=makeLabel((SUIT_NAME[suit]||suit).toUpperCase(),['H','D'].includes(suit)?'#eab3ad':'#dbea9e');label.scale.set(1.6,.42,1);label.position.set(-4.65,.92,(row-1.5)*1.25);objects.add(label);
      });
    }else if(game==='plis'){
      const physicalEntries=Array.isArray(s?.trickCards)&&s.trickCards.length?(center.entries||[]):(['trickResult','over'].includes(String(s?.phase||''))?(center.entries||[]):[]),canCollectTrick=!!(payload.canInteract&&data.cardAction?.canCollect);
      physicalEntries.forEach((entry,i)=>{
        const a=(Math.PI*2*i/Math.max(1,physicalEntries.length))-Math.PI/2,x=Math.cos(a)*1.45,z=Math.sin(a)*1.1,mesh=cardMesh(entry.card,{back:!!entry.card?.hidden,id:entry.card?.id});
        placeCard(mesh,x,z,TABLE_Y+.16,i*.06,.78);
        if(canCollectTrick&&entry.card?.id){mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};makeLooseManipulable(mesh,{kind:'trick-collect',tapEnabled:true,cardId:entry.card.id})}
        if(entry.card?.id)centerVisuals.set(entry.card.id,{mesh,card:entry.card,position:new THREE.Vector3(x,TABLE_Y+.26,z)});
      });
    }else if(game==='encheres'){
      if(center.prize){const prize=cardMesh(center.prize,{back:!!center.prize.hidden});placeCard(prize,0,-.55,TABLE_Y+.15,0,.88)}
      const bids=center.bids||[];
      bids.forEach((card,i)=>{
        if(!card)return;const x=(i-(bids.length-1)/2)*1.18,z=.75,mesh=cardMesh(card,{back:!!card.hidden});
        placeCard(mesh,x,z,TABLE_Y+.13+i*.008,(i-(bids.length-1)/2)*.03,.64);centerVisuals.set('bid-'+i,{mesh,card,position:new THREE.Vector3(x,TABLE_Y+.23,z)});
      });
    }
    const currentSnapshot=cardFamilySnapshot(payload,center),previousSnapshot=lastCardFamilySnapshots.get(game);
    animateCardFamilyConfirmed(game,payload,center,previousSnapshot,currentSnapshot,opponentVisuals,centerVisuals,ownVisuals);lastCardFamilySnapshots.set(game,currentSnapshot);
    const action=data.cardAction||{};
    if(payload.canInteract){
      if(game==='president'){
        if(action.canPlay){const play=actionSprite('POSER'+(action.count?' · '+action.count:''),'card-action',{command:'play'},'#dbea9e');play.position.set(-1.25,1.04,.92);objects.add(play)}
        if(action.canPass){const pass=actionSprite('PASSER','card-action',{command:'pass'},'#d8ded9');pass.position.set(action.canPlay?1.25:0,1.04,.92);objects.add(pass)}
      }else if(game==='menteur'){
        if(action.phase==='challenge'){
          const trust=actionSprite('JE TE CROIS','card-action',{command:'trust'},'#b7d5ee');trust.position.set(-1.35,1.04,1.02);objects.add(trust);
          const challenge=actionSprite('MENTEUR !','card-action',{command:'challenge'},'#efaaa0');challenge.position.set(1.35,1.04,1.02);objects.add(challenge);
        }else if(action.canPlay){const play=actionSprite('ANNONCER '+(action.count||1)+' × '+(RANK_NAME[action.required]||action.required),'card-action',{command:'play'},'#dbea9e');play.position.set(0,1.04,1.02);play.scale.set(3.15,.58,1);objects.add(play)}
      }else if(game==='suites'){
        if(action.canPlay){const play=actionSprite('POSER LA CARTE','card-action',{command:'play'},'#dbea9e');play.position.set(0,1.04,.88);objects.add(play)}
        else if(action.canPass){const pass=actionSprite('PASSER','card-action',{command:'pass'},'#d8ded9');pass.position.set(0,1.04,.88);objects.add(pass)}
      }else if(game==='plis'){
        if(action.canCollect){const collect=actionSprite('RAMASSER LE PLI','card-action',{command:'collect'},'#e6d7b4');collect.position.set(0,1.04,1.10);objects.add(collect)}
        else if(action.canPlay){const play=actionSprite('JOUER LA CARTE','card-action',{command:'play'},'#dbea9e');play.position.set(0,1.04,1.10);objects.add(play)}
      }else if(game==='encheres'&&action.canBid){
        const bid=actionSprite('CONFIRMER LA CARTE','card-action',{command:'bid'},'#dbea9e');bid.position.set(0,1.04,1.28);objects.add(bid);
      }
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
    if(help)help.textContent=game==='plis'&&action.canCollect?'Saisissez une carte du pli : tout le paquet suit · ramenez-le vers vous pour le collecter':payload.canInteract?'Touchez pour sélectionner · glissez librement une carte · validez directement sur la table':'La table 3D suit la partie et les mouvements confirmés';
  }

  function syncEight(payload){
    clearObjects();dropMarker.visible=true;
    setCameraPose(0,7.25,9.25,0,.25,.2);
    const s=payload.state,viewer=Number.isInteger(payload.privateIndex)?payload.privateIndex:0;
    if(!s?.players?.length){lastEightSnapshot=null;return}
    const own=payload.spectator?[]:(s.players[viewer]?.hand||[]),playable=new Set(payload.viewData?.playableIds||[]),previous=lastEightSnapshot;

    const n=own.length,ownVisuals=new Map();
    own.forEach((card,i)=>{
      const slot=handCardSlot(n,i),mesh=cardMesh(card,{id:card.id,interactiveCard:true,playable:playable.has(card.id)});
      const lift=playable.has(card.id)?.14:0,scale=slot.scale*(playable.has(card.id)?1.025:1);
      placeCard(mesh,slot.x,slot.z,TABLE_Y+.12+slot.yOffset+lift,slot.fan,scale);
      mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};makeLooseManipulable(mesh,{kind:'card',cardId:card.id,persistPose:true});
      ownVisuals.set(card.id,{mesh,card,position:mesh.position.clone(),rotation:mesh.rotation.z,scale});
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
      const ownPlayed=discardChanged&&snapshot.handCounts[viewer]===previous.handCounts[viewer]-1&&previous.ownIds?.includes(top.id);
      const ownDrawnIds=snapshot.deckCount<previous.deckCount&&snapshot.handCounts[viewer]>previous.handCounts[viewer]?(snapshot.ownIds||[]).filter(id=>!(previous.ownIds||[]).includes(id)):[];
      if(ownPlayed){
        const previousIndex=previous.ownIds.indexOf(top.id),slot=handCardSlot(previous.ownIds.length,Math.max(0,previousIndex)),posed=storedLocalPose(top.id),from=posed?.position?.clone?.()||new THREE.Vector3(slot.x,TABLE_Y+.28+slot.yOffset,slot.z),to=new THREE.Vector3(1.25,TABLE_Y+.23,.05),flight=cardMesh(top);
        if(discardMesh)discardMesh.visible=false;
        queueCardFlight(flight,from,to,{duration:560,lift:.72,fromRot:slot.fan,toRot:(visualHash(top.id)-.5)*.18,bank:.14,roll:(visualHash(top.id+'roll')-.5)*.22,onDone:()=>{if(discardMesh)discardMesh.visible=true}});
      }else if(ownDrawnIds.length){
        ownDrawnIds.slice(0,4).forEach((id,q)=>{
          const visual=ownVisuals.get(id);if(!visual)return;visual.mesh.visible=false;
          const flight=cardMesh(visual.card),from=new THREE.Vector3(-1.25,TABLE_Y+.28,.05);
          queueCardFlight(flight,from,visual.position,{duration:520+q*35,delay:q*80,lift:.68,fromRot:-.03,toRot:visual.rotation,bank:.12,roll:(q%2?-.10:.10),onDone:()=>{visual.mesh.visible=true}});
        });
      }else{
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
                queueCardFlight(flight,from,to,{duration:610,delay:q*115,lift:.82,fromRot:-.02,toRot:(q-(amount-1)/2)*.05,bank:.11,roll:(q%2?-.09:.09),onDone:()=>{if(arrivals[q])arrivals[q].visible=true}});
              }
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
    const data=payload.viewData?.rummi;if(!data){lastRummiSnapshot=null;return}
    const selected=new Set(data.selectedIds||[]),oldIds=new Set(data.refTableIds||[]),groups=data.table||[],layout=rummiBoardLayout(groups),currentVisuals=new Map();
    setCameraPose(0,8.65+Math.max(0,layout.rows-2)*.45,10.45+Math.max(0,layout.rows-2)*.35,0,.2,-.18);

    layout.active.forEach(({group,index:gi},order)=>{
      group.forEach((tile,ti)=>{
        const slot=rummiGroupSlot(layout,order,group.length,ti),movable=data.canMove&&(data.canMoveOld||!oldIds.has(tile.id)),mesh=rummiTileMesh(tile,selected.has(tile.id),movable);
        mesh.position.set(slot.x,TABLE_Y+.37,slot.z);mesh.rotation.x=-Math.PI/2;mesh.scale.setScalar(slot.scale);
        mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};if(movable)makeLooseManipulable(mesh,{kind:'rummi-tile',tapEnabled:true,tileId:tile.id});objects.add(mesh);
        currentVisuals.set(tile.id,{mesh,tile,position:mesh.position.clone(),scale:mesh.scale.clone(),rotation:mesh.rotation.z,zone:'table'});
      });
      if(data.canMove&&selected.size){
        const slot=rummiGroupSlot(layout,order,Math.max(1,group.length),Math.floor(Math.max(0,group.length-1)/2)),target=actionSprite('AJOUTER','rummi-dest',{dest:gi},'#dbea9e');
        target.position.set(slot.x,TABLE_Y+.84,slot.z+Math.min(.58,layout.cellD*.34));target.scale.set(Math.min(1.45,layout.cellW*.48),.36,1);objects.add(target);
      }
    });

    if(!layout.active.length){
      const empty=makeLabel('TABLE COMMUNE · PREMIÈRE COMBINAISON','#dbea9e');empty.position.set(0,1.0,-.65);empty.scale.set(4.9,.8,1);objects.add(empty);
    }

    const hand=data.hand||[],drawPos=new THREE.Vector3(4.55,TABLE_Y+.43,2.35),deckCount=Math.max(0,Number(data.deckCount)||0);
    if(deckCount){
      const visiblePile=Math.min(4,deckCount);
      for(let i=0;i<visiblePile;i++){
        const hidden=rummiHiddenTileMesh(),top=i===visiblePile-1;hidden.position.set(drawPos.x,drawPos.y+i*.026,drawPos.z);hidden.rotation.x=-Math.PI/2;hidden.rotation.z=.025*i;hidden.scale.setScalar(.82);
        if(top&&data.canMove){
          hidden.userData.home={position:hidden.position.clone(),rotation:hidden.rotation.clone(),scale:hidden.scale.clone()};
          makeLooseManipulable(hidden,{kind:'rummi-draw',tapEnabled:true});
        }
        objects.add(hidden);
      }
      const drawLabel=makeLabel('PIOCHE · '+deckCount+(data.canMove?' · TOUCHEZ / GLISSEZ':''),'#d8ded9');drawLabel.position.set(drawPos.x,1.04,drawPos.z-.70);drawLabel.scale.set(2.35,.46,1);objects.add(drawLabel);
    }else{
      const empty=makeLabel('PIOCHE VIDE','#9da8a0');empty.position.set(drawPos.x,1.02,drawPos.z-.25);empty.scale.set(1.8,.42,1);objects.add(empty);
    }

    hand.forEach((tile,i)=>{
      const slot=rummiRackSlot(hand.length,i),mesh=rummiTileMesh(tile,selected.has(tile.id),!!data.canMove);
      mesh.position.set(slot.x,TABLE_Y+.42+slot.yOffset,slot.z);mesh.rotation.x=-Math.PI/2;mesh.scale.setScalar(slot.scale);
      mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};makeLooseManipulable(mesh,{kind:'rummi-tile',tapEnabled:!!data.canMove,tileId:tile.id,persistPose:true,poseFloorY:TABLE_Y+.37});objects.add(mesh);
      currentVisuals.set(tile.id,{mesh,tile,position:mesh.position.clone(),scale:mesh.scale.clone(),rotation:mesh.rotation.z,zone:'hand'});
    });

    const snapshot=rummiMotionSnapshot(payload,data,currentVisuals),previous=lastRummiSnapshot;
    if(previous&&previous.key===snapshot.key&&motionAllowed()){
      let animated=0;
      for(const [id,visual] of currentVisuals){
        if(animated>=24)break;
        const before=previous.positions?.get(id);if(!before)continue;
        const distance=before.position.distanceTo(visual.position),scaleDelta=before.scale.distanceTo(visual.scale);
        if(distance<.10&&scaleDelta<.04&&before.zone===visual.zone)continue;
        visual.mesh.visible=false;const flight=rummiTileMesh(visual.tile,false,false);
        queueCardFlight(flight,before.position,visual.position,{duration:390+Math.min(130,distance*35),delay:Math.min(140,animated*18),lift:.30+Math.min(.28,distance*.05),fromRot:before.rotation||0,toRot:visual.rotation||0,bank:.08,roll:(animated%2?-.06:.06),fromScale:before.scale,toScale:visual.scale,onDone:()=>{visual.mesh.visible=true}});
        animated++;
      }
      if(snapshot.deckCount<previous.deckCount){
        const newHand=(snapshot.handIds||[]).filter(id=>!(previous.handIds||[]).includes(id));
        newHand.slice(0,2).forEach((id,q)=>{
          const visual=currentVisuals.get(id);if(!visual||previous.positions?.has(id))return;
          visual.mesh.visible=false;const flight=rummiTileMesh(visual.tile,false,false),fromScale=new THREE.Vector3(.82,.82,.82);
          queueCardFlight(flight,drawPos,visual.position,{duration:500+q*45,delay:80+q*75,lift:.62,fromRot:.04,toRot:visual.rotation||0,bank:.12,roll:(q%2?-.09:.09),fromScale,toScale:visual.scale,onDone:()=>{visual.mesh.visible=true}});
        });
      }
    }
    lastRummiSnapshot=snapshot;

    if(data.canMove&&selected.size){
      const actionZ=hand.length>10?1.05:1.48,fresh=actionSprite('NOUVEAU GROUPE','rummi-dest',{dest:'new'},'#dbea9e');fresh.position.set(-2.15,1.02,actionZ);objects.add(fresh);
      const toHand=actionSprite('AU CHEVALET','rummi-dest',{dest:'hand'},'#d8ded9');toHand.position.set(2.15,1.02,actionZ);objects.add(toHand);
    }

    if(data.canMove){
      const controlX=-4.25;
      if(data.canCommit){
        const commit=actionSprite('VALIDER LE TOUR','rummi-action',{command:'commit'},'#dbea9e');commit.position.set(controlX,1.03,.82);commit.scale.set(1.72,.45,1);objects.add(commit);
      }
      if(Number(data.undoCount)>0){
        const undoStep=actionSprite('ANNULER LE DERNIER','rummi-action',{command:'undoStep'},'#d8ded9');undoStep.position.set(controlX,1.03,.05);undoStep.scale.set(1.72,.42,1);objects.add(undoStep);
        const reset=actionSprite('RECOMMENCER LE TOUR','rummi-action',{command:'undo'},'#e6d7b4');reset.position.set(controlX,1.03,-.72);reset.scale.set(1.72,.42,1);objects.add(reset);
      }
      if(!deckCount){
        const pass=actionSprite('PASSER · PIOCHE VIDE','rummi-action',{command:'draw'},'#d8ded9');pass.position.set(3.95,1.03,1.15);pass.scale.set(1.85,.44,1);objects.add(pass);
      }
    }

    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · RUMMIKUB';
    if(status)status.textContent=(data.diagnostic?.text||(deckCount+' tuiles dans la pioche'))+' · '+layout.active.length+' groupe'+(layout.active.length>1?'s':'');
    if(help)help.textContent=data.canMove?'Glissez les tuiles · touchez ou ramenez la pioche vers le chevalet · validez et annulez directement sur la table':'Le chevalet actif reste privé · table commune synchronisée';
  }

  function syncCactus(payload){
    clearObjects();dropMarker.visible=false;
    setCameraPose(0,7.7,9.7,0,.2,.15);
    const data=payload.viewData?.cactus,s=payload.state;if(!data||!s){lastCactusSnapshot=null;return}
    const viewer=data.viewer,players=data.players||[],count=Math.max(1,players.length),previous=lastCactusSnapshot,playerVisuals=new Map(),ownVisuals=new Map();
    players.forEach((p,i)=>{
      const seat=cactusSeat(viewer,count,i),mine=seat.mine,cx=seat.x,cz=seat.z,meshes=[];
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
        if(mine){makeLooseManipulable(mesh,{kind:mesh.userData.kind,tapEnabled:interactiveCard,index,owner:i,cardId:card.id,persistPose:true});if(card.id)ownVisuals.set(card.id,{mesh,card,position:mesh.position.clone(),rotation:mesh.rotation.z})}
        meshes.push(mesh);
      });
      playerVisuals.set(i,{...seat,meshes});
      const label=makeLabel((p.name||'Joueur')+' · '+p.score+' pts'+(data.caller===i?' · CACTUS !':''),i===data.turn?'#dbea9e':'#d8ded9');
      label.position.set(cx,1.08,cz+(mine?.95:-.88));label.scale.set(mine?3.4:2.65,mine?.72:.58,1);objects.add(label);
    });
    const deck=Math.max(0,Number(data.deckCount)||0);
    for(let i=0;i<Math.min(5,Math.max(1,deck));i++){
      const top=i===Math.min(5,Math.max(1,deck))-1,mesh=cardMesh(null,{back:true,interactiveCard:top&&payload.canInteract&&data.phase==='draw'});
      mesh.userData.kind=top&&payload.canInteract&&data.phase==='draw'?'cactus-draw':'cactus-card';mesh.userData.interactive=top&&payload.canInteract&&data.phase==='draw';
      placeCard(mesh,-1.35,.1,TABLE_Y+.07+i*.035,-.02+i*.01,.82);
    }
    let discardMesh=null,drawnMesh=null;
    if(data.discard){discardMesh=cardMesh(data.discard,{interactiveCard:payload.canInteract&&data.phase==='draw'});discardMesh.userData.kind=payload.canInteract&&data.phase==='draw'?'cactus-take':'cactus-card';discardMesh.userData.interactive=payload.canInteract&&data.phase==='draw';placeCard(discardMesh,0,.1,TABLE_Y+.12,(visualHash(data.discard.id)-.5)*.12,.82)}
    if(data.drawn){drawnMesh=cardMesh(data.drawn);drawnMesh.userData.kind='cactus-drawn';placeCard(drawnMesh,1.35,.1,TABLE_Y+.14,0,.88)}

    const snapshot=cactusSnapshot(payload,data);
    if(previous&&previous.key===snapshot.key&&motionAllowed()){
      const discardChanged=!!snapshot.discardId&&snapshot.discardId!==previous.discardId;
      const drawnAppeared=!!snapshot.drawnId&&snapshot.drawnId!==previous.drawnId;
      const actorLoss=snapshot.handCounts.map((n,i)=>({i,delta:(previous.handCounts?.[i]??n)-n})).find(x=>x.delta>0)?.i;

      if(drawnAppeared&&drawnMesh){
        drawnMesh.visible=false;
        const from=data.source==='discard'?new THREE.Vector3(0,TABLE_Y+.25,.1):new THREE.Vector3(-1.35,TABLE_Y+.25,.1),to=new THREE.Vector3(1.35,TABLE_Y+.25,.1);
        const flight=cardMesh(data.source==='discard'?data.drawn:null,{back:data.source!=='discard'});
        queueCardFlight(flight,from,to,{duration:500,lift:.58,fromRot:data.source==='discard'?(visualHash(data.drawn.id)-.5)*.12:-.03,toRot:0,bank:.13,roll:.11,onDone:()=>{drawnMesh.visible=true}});
      }else if(discardChanged&&previous.drawnId&&snapshot.discardId===previous.drawnId&&discardMesh){
        discardMesh.visible=false;
        const flight=cardMesh(data.discard),from=new THREE.Vector3(1.35,TABLE_Y+.25,.1),to=new THREE.Vector3(0,TABLE_Y+.24,.1);
        queueCardFlight(flight,from,to,{duration:460,lift:.48,fromRot:0,toRot:(visualHash(data.discard.id)-.5)*.12,bank:.12,roll:-.10,onDone:()=>{discardMesh.visible=true}});
      }else if(discardChanged&&Number.isInteger(actorLoss)&&discardMesh){
        discardMesh.visible=false;
        const visual=playerVisuals.get(actorLoss);let from;
        if(actorLoss===viewer&&previous.ownIds?.includes(snapshot.discardId)){
          const index=previous.ownIds.indexOf(snapshot.discardId),col=index%2,row=Math.floor(index/2),seat=cactusSeat(viewer,count,actorLoss);
          const posed=storedLocalPose(snapshot.discardId);from=posed?.position?.clone?.()||new THREE.Vector3(seat.x+(col-.5)*1.02,TABLE_Y+.25,seat.z+(row-.5)*.78);
        }else from=new THREE.Vector3(visual?.x||0,TABLE_Y+.28,(visual?.z||-2.1)+.08);
        const flight=cardMesh(data.discard),to=new THREE.Vector3(0,TABLE_Y+.24,.1);
        queueCardFlight(flight,from,to,{duration:520,lift:.72,fromRot:0,toRot:(visualHash(data.discard.id)-.5)*.12,bank:.15,roll:(actorLoss%2?-.12:.12),onDone:()=>{discardMesh.visible=true}});
      }else if(previous.phase==='draw'&&snapshot.phase==='swap'&&snapshot.deckCount<previous.deckCount&&!snapshot.drawnId){
        const actor=previous.turn,visual=playerVisuals.get(actor),from=new THREE.Vector3(-1.35,TABLE_Y+.25,.1),to=new THREE.Vector3(visual?.x||0,TABLE_Y+.28,(visual?.z||-2.1)+.08),flight=cardMesh(null,{back:true});
        queueCardFlight(flight,from,to,{duration:540,lift:.68,fromRot:-.03,toRot:0,bank:.12,roll:(actor%2?-.10:.10)});
      }else if(previous.phase==='draw'&&snapshot.phase==='swap'&&snapshot.deckCount===previous.deckCount&&previous.discardId&&snapshot.discardId!==previous.discardId&&!snapshot.drawnId){
        const actor=previous.turn,visual=playerVisuals.get(actor),from=new THREE.Vector3(0,TABLE_Y+.24,.1),to=new THREE.Vector3(visual?.x||0,TABLE_Y+.28,(visual?.z||-2.1)+.08),flight=cardMesh(previous.discard);
        queueCardFlight(flight,from,to,{duration:520,lift:.62,fromRot:(visualHash(previous.discardId)-.5)*.12,toRot:0,bank:.13,roll:(actor%2?-.09:.09)});
      }
    }
    lastCactusSnapshot=snapshot;

    if(payload.canInteract&&data.turn===viewer){
      if(data.phase==='peek'||data.phase==='reveal'){const ready=actionSprite('C’EST MÉMORISÉ','cactus-action',{command:'ready'},'#dbea9e');ready.position.set(0,1.04,1.18);objects.add(ready)}
      if(data.phase==='draw'&&data.caller===null){const call=actionSprite('CACTUS !','cactus-action',{command:'call'},'#e6d7b4');call.position.set(0,1.04,1.30);objects.add(call)}
      if(data.phase==='swap'&&data.source==='draw'){const discard=actionSprite('JETER LA PIOCHE','cactus-action',{command:'discard'},'#efaaa0');discard.position.set(2.55,1.04,.15);objects.add(discard)}
      if(data.phase==='power'){const skip=actionSprite('IGNORER LE POUVOIR','cactus-action',{command:'skip'},'#d8ded9');skip.position.set(0,1.04,1.30);objects.add(skip)}
    }
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
      const r=Math.max(.18,Number(obstacle.r||20)/58),p=golfWorld(obstacle,TABLE_Y+.24+r*.45),rockExternal=externalAsset('golf-obstacle',{radius:r,source:Object.freeze({x:Number(obstacle.x)||0,y:Number(obstacle.y)||0,r:Number(obstacle.r)||0}),canonicalSize:{radius:r}});
      let rock=rockExternal;
      if(!rock){const geo=new THREE.DodecahedronGeometry(r,1),mat=new THREE.MeshStandardMaterial({color:0x69708c,roughness:.94,metalness:.03});rock=new THREE.Mesh(geo,mat);rock.scale.y=.62;rock.castShadow=true;rock.receiveShadow=true;rock.userData.temporaryGeometry=geo;rock.userData.temporaryMaterial=mat}
      rock.position.copy(p);objects.add(rock);
    }
    const hole=golfWorld(course.hole,TABLE_Y+.31),portalExternal=externalAsset('golf-portal',{sunk,canonicalSize:{radius:.31,tube:.065}});
    let portal=portalExternal;
    if(!portal){const portalGeo=new THREE.TorusGeometry(.31,.065,12,36),portalMat=new THREE.MeshStandardMaterial({color:0xbdebdc,roughness:.35,metalness:.08,emissive:0x3d8a7d,emissiveIntensity:sunk?.8:.45});portal=new THREE.Mesh(portalGeo,portalMat);portal.rotation.x=Math.PI/2;portal.userData.temporaryGeometry=portalGeo;portal.userData.temporaryMaterial=portalMat}
    portal.position.copy(hole);objects.add(portal);
    const innerGeo=new THREE.CylinderGeometry(.18,.18,.035,30),innerMat=new THREE.MeshStandardMaterial({color:0x102a34,roughness:.72,emissive:0x285a58,emissiveIntensity:.22}),inner=new THREE.Mesh(innerGeo,innerMat);inner.position.copy(hole);inner.position.y-=.04;inner.userData.temporaryGeometry=innerGeo;inner.userData.temporaryMaterial=innerMat;objects.add(inner);
    if(path.length>1){
      const pts=path.map(p=>golfWorld(p,TABLE_Y+.34)),geo=new THREE.BufferGeometry().setFromPoints(pts),mat=new THREE.LineBasicMaterial({color:0xe7d88f,transparent:true,opacity:.72}),trail=new THREE.Line(geo,mat);trail.userData.temporaryGeometry=geo;trail.userData.temporaryMaterial=mat;objects.add(trail);
    }
    const ballTarget=golfWorld(pos,TABLE_Y+.47),ballExternal=externalAsset('golf-ball',{sunk,stroke,canonicalSize:{radius:.13}});
    let ball=ballExternal;
    if(!ball){const ballMat=new THREE.MeshStandardMaterial({color:0xfff2ca,roughness:.5,metalness:.02});ball=new THREE.Mesh(golfBallGeometry,ballMat);ball.castShadow=true;ball.userData.temporaryMaterial=ballMat}
    ball.position.copy(ballTarget);objects.add(ball);
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
      const value=Math.max(0,Math.min(5,Number(shown[i]??i))),gemExternal=externalAsset('code-gem',{value,symbol:symbols[value],color:colors[value],revealed:phase==='result',index:i,canonicalSize:{radius:.5}});
      let gem=gemExternal;
      if(!gem){const mat=new THREE.MeshStandardMaterial({color:new THREE.Color(colors[value]),roughness:.38,metalness:.12,emissive:new THREE.Color(colors[value]),emissiveIntensity:phase==='result'?.38:.18});gem=new THREE.Mesh(codeGemGeometry,mat);gem.scale.set(1,1.12,.72);gem.castShadow=true;gem.userData.temporaryMaterial=mat}
      gem.position.set((i-1)*1.72,TABLE_Y+1.15,.15);
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
      const grow=1+Math.min(8,pumps)*.075,balloonExternal=externalAsset('balloon',{pumps,pot,risk,scale:grow,canonicalSize:{radius:1}});
      let balloon=balloonExternal;
      if(!balloon){const mat=new THREE.MeshStandardMaterial({color:0xe9aacb,roughness:.48,metalness:.02,emissive:0x5d2946,emissiveIntensity:.16+.025*pumps});balloon=new THREE.Mesh(balloonGeometry,mat);balloon.scale.set(grow,grow*1.18,grow);balloon.castShadow=true;balloon.userData.temporaryMaterial=mat}
      balloon.position.set(0,TABLE_Y+1.55,.15);objects.add(balloon);
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
    const s=payload.state,data=payload.viewData?.city||{},board=data.board||[],owners=data.owners||[],houses=data.houses||[],mortgaged=data.mortgaged||[],colors=data.colors||[],playerColors=data.playerColors||[],manage=data.manage||[];
    if(!payload.canInteract||!Number.isInteger(cityFocusIndex)||!manage[cityFocusIndex])cityFocusIndex=null;
    setCameraPose(0,9.35,9.9,0,.1,0);
    const boardGeo=new THREE.BoxGeometry(10.4,.18,7.45),boardBase=new THREE.Mesh(boardGeo,new THREE.MeshStandardMaterial({color:0x243a30,roughness:.94}));boardBase.position.y=TABLE_Y-.02;boardBase.receiveShadow=true;boardBase.userData.temporaryGeometry=boardGeo;boardBase.userData.temporaryMaterial=boardBase.material;objects.add(boardBase);
    board.forEach((cell,i)=>{
      const p=cityWorld(i),owner=owners[i]??-1,mat=cityCellMaterial(cell,owner,!!mortgaged[i],colors),tile=new THREE.Mesh(cityTileGeometry,mat),focused=i===cityFocusIndex;
      tile.position.copy(p);tile.castShadow=true;tile.receiveShadow=true;tile.userData.temporaryMaterial=mat;
      if(cell?.type==='property'&&payload.canInteract){tile.userData={...tile.userData,kind:'city-property',interactive:true,index:i};interactive.push(tile)}
      if(focused){tile.scale.set(1.08,1.16,1.08);tile.position.y+=.055}
      objects.add(tile);
      const label=makeLabel((i===0?'DÉPART · ':'')+(cell.name||('Case '+i)),mortgaged[i]?'#d69b96':owner>=0?(playerColors[owner]||'#dbea9e'):'#e5e9e3');label.scale.set(1.2,.26,1);label.position.set(p.x,TABLE_Y+.34,p.z);objects.add(label);
      const count=Math.min(3,Number(houses[i]||0));for(let h=0;h<count;h++){
        let house=externalAsset('metropole-house',{cellIndex:i,houseIndex:h,count,owner,canonicalSize:{width:.19,height:.25,depth:.19}});
        if(!house){const houseMat=new THREE.MeshStandardMaterial({color:0xdbea9e,roughness:.72});house=new THREE.Mesh(cityHouseGeometry,houseMat);house.userData.temporaryMaterial=houseMat}
        house.position.set(p.x+(h-1)*.24,TABLE_Y+.34,p.z-.27);objects.add(house)
      }
      if(owner>=0){
        const ownerColor=playerColors[owner]||'#dbea9e';let peg=externalAsset('metropole-owner-marker',{cellIndex:i,owner,color:ownerColor,canonicalSize:{radius:.09,height:.22}});
        if(!peg){const ownMat=new THREE.MeshStandardMaterial({color:new THREE.Color(ownerColor),roughness:.72});peg=new THREE.Mesh(cityPegGeometry,ownMat);peg.userData.temporaryMaterial=ownMat}
        peg.position.set(p.x+.47,TABLE_Y+.34,p.z+.25);objects.add(peg)
      }
    });
    (data.players||[]).forEach((pl,i)=>{
      if(pl.out)return;const p=cityWorld(Number(pl.pos)||0),pawn=pawnMesh(playerColors[i]||['#dbea9e','#aacdf7','#e4ad91','#c9afe7'][i%4]);pawn.position.set(p.x+((i%2)? .17:-.17),TABLE_Y+.48,p.z+(i>1?.17:-.17));objects.add(pawn);
      const tag=makeLabel((pl.name||'Joueur')+' · '+pl.cash+' ¤'+(pl.jailed?' · détenu':''),i===s.turn?'#dbea9e':'#d8ded9');tag.scale.set(1.65,.31,1);tag.position.set(pawn.position.x,TABLE_Y+.92,pawn.position.z);objects.add(tag);
    });
    const dice=Array.isArray(data.dice)?data.dice:[1,1],key='city|'+(s?.moves??0)+'|'+dice.join('-'),animate=s?.moves>0&&key!==lastDiceKey;if(animate)lastDiceKey=key;
    dice.forEach((value,i)=>{const die=dieMesh(value);die.position.set(-.52+i*1.04,TABLE_Y+.78,.05);objects.add(die);if(animate&&motionAllowed()){const h=visualHash(key+'|'+i);die.rotation.set(5+h*4,7+h*5,4+h*6);diceAnimations.push({mesh:die,start:performance.now(),duration:620+i*70,rx:die.rotation.x,ry:die.rotation.y,rz:die.rotation.z})}});
    if(payload.canInteract){
      const phaseActions=[];
      if(data.canRoll)phaseActions.push(['LANCER LES DÉS','roll','#dbea9e']);
      if(data.canBail)phaseActions.push(['CAUTION · 50','bail','#e8c88e']);
      if(data.canBuy)phaseActions.push(['ACHETER · '+(board[data.offer]?.price||0),'buy','#dbea9e']);
      if(data.canDecline)phaseActions.push(['LAISSER À LA BANQUE','decline','#d8ded9']);
      if(data.canEndTurn)phaseActions.push(['TERMINER LE TOUR','endTurn','#dbea9e']);
      if(data.canPay)phaseActions.push(['RÉGLER · '+(data.debt?.amount||0),'pay','#dbea9e']);
      if(data.canBankrupt)phaseActions.push(['DÉCLARER FAILLITE','bankrupt','#e5a09b']);
      if(data.canContinue)phaseActions.push(['AVANCER','continue','#dbea9e']);
      phaseActions.forEach((entry,i)=>{
        const x=(i-(phaseActions.length-1)/2)*2.85,control=actionSprite(entry[0],'city-action',{command:entry[1]},entry[2]);
        control.position.set(x,1.04,1.42);objects.add(control);
      });
      const focus=Number.isInteger(cityFocusIndex)?manage[cityFocusIndex]:null;
      if(focus){
        const cell=board[cityFocusIndex]||{},summary=makeLabel((cell.name||('Case '+cityFocusIndex))+' · '+Number(houses[cityFocusIndex]||0)+' ⌂',colors?.[cell.group]||'#e5e9e3');
        summary.scale.set(3.2,.48,1);summary.position.set(0,.96,-1.05);objects.add(summary);
        const propertyActions=[];
        if(focus.canMortgage)propertyActions.push(['HYPOTHÉQUER · +'+focus.mortgageGain,'mortgage','#e8c88e']);
        if(focus.canRedeem)propertyActions.push(['LEVER · '+focus.redeemCost,'redeem','#dbea9e']);
        if(focus.canBuild)propertyActions.push(['CONSTRUIRE · '+focus.buildCost,'build','#dbea9e']);
        if(focus.canSell)propertyActions.push(['VENDRE MAISON · +'+focus.sellGain,'sellHouse','#e8c88e']);
        propertyActions.forEach((entry,i)=>{
          const col=i%2,row=Math.floor(i/2),x=(col-.5)*3.15,z=-1.72-row*.72,control=actionSprite(entry[0],'city-action',{command:entry[1],index:cityFocusIndex},entry[2]);
          control.position.set(x,1.02,z);objects.add(control);
        });
        if(!propertyActions.length){const none=makeLabel('AUCUNE ACTION DISPONIBLE','#aeb9b0');none.scale.set(2.75,.44,1);none.position.set(0,.98,-1.72);objects.add(none)}
      }
    }
    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · MÉTROPOLE';
    if(status)status.textContent='Tour '+(data.lap||1)+' / 20 · '+(data.players?.[s.turn]?.name||'Joueur')+' · '+(data.phase==='debt'?'dette '+(data.debt?.amount||0)+' ¤':data.phase==='buy'?'achat proposé':data.phase==='roll'?'prêt à lancer':'gestion');
    if(help)help.textContent=payload.canInteract?'Toutes les décisions sont jouables ici · cliquez une de vos rues pour gérer le bien':'Plateau synchronisé · les décisions restent verrouillées hors de votre tour';
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
    activePoseScope=poseScope(payload);poseSeen=new Set();
    syncCurrent(payload);pruneLocalPoses();updateLocalPoseResetButton();draw();
  }
  function draw(){if(active&&renderer&&scene&&camera)renderer.render(scene,camera)}
  function updatePointer(e){
    if(!canvas)return;
    const r=canvas.getBoundingClientRect();pointer.x=((e.clientX-r.left)/Math.max(1,r.width))*2-1;pointer.y=-((e.clientY-r.top)/Math.max(1,r.height))*2+1;raycaster.setFromCamera(pointer,camera);
  }
  function hit(e){
    updatePointer(e);const raw=raycaster.intersectObjects(interactive,true)[0]?.object||null;return raw?.userData?.table3dRoot||raw;
  }
  function setHover(mesh){
    if(hovered===mesh)return;
    if(hovered&&!drag){const h=hovered.userData.home;if(h)hovered.scale.copy(h.scale);}
    hovered=mesh;
    if(hovered&&!drag&&['card','card-select','maid-pick','battle-card','trick-collect','special-select','cactus-quick','cactus-swap','cactus-target','cactus-draw','cactus-take','rummi-tile','rummi-draw','rummi-dest','intrus-spot','code-cycle'].includes(hovered.userData.kind)){const h=hovered.userData.home;if(h)hovered.scale.copy(h.scale).multiplyScalar(1.055)}
    draw();
  }
  function capturePointer(id){try{canvas?.setPointerCapture?.(id)}catch(_){}}
  function clampMotion(n,min,max){return Math.max(min,Math.min(max,Number(n)||0))}
  function dragSelectionIds(obj,kind){
    if(kind==='card-select'&&['president','menteur'].includes(current?.gameId)){
      const ids=current?.viewData?.selectedIds||[];return ids.includes(obj.userData.cardId)?ids:[];
    }
    if(kind==='rummi-tile'&&current?.gameId==='rummikub'){
      const ids=current?.viewData?.rummi?.selectedIds||[];return ids.includes(obj.userData.tileId)?ids:[];
    }
    return[];
  }
  function groupedDragCompanions(obj,kind){
    if(kind==='trick-collect')return objects.children.filter(mesh=>mesh!==obj&&mesh.userData?.kind==='trick-collect'&&mesh.userData?.home).map((mesh,index)=>({
      mesh,id:mesh.userData.cardId,index,
      home:{position:mesh.userData.home.position.clone(),rotation:mesh.userData.home.rotation.clone(),scale:mesh.userData.home.scale.clone()}
    }));
    const ids=dragSelectionIds(obj,kind);if(ids.length<2)return[];
    const key=kind==='rummi-tile'?'tileId':'cardId',wanted=new Set(ids);
    return objects.children.filter(mesh=>mesh!==obj&&wanted.has(mesh.userData?.[key])&&mesh.userData?.home).map((mesh,index)=>({
      mesh,id:mesh.userData[key],index,
      home:{position:mesh.userData.home.position.clone(),rotation:mesh.userData.home.rotation.clone(),scale:mesh.userData.home.scale.clone()}
    }));
  }
  function restoreManipulatedMesh(mesh,home,d,{snap=false,index=0}={}){
    if(!mesh||!home)return;
    if(snap||!motionAllowed()){mesh.position.copy(home.position);mesh.rotation.copy(home.rotation);mesh.scale.copy(home.scale);return}
    const throwX=clampMotion((d.velocityX||0)*.19,-1.8,1.8),throwZ=clampMotion((d.velocityY||0)*.16,-1.45,1.45),speed=Math.min(1,Math.hypot(d.velocityX||0,d.velocityY||0)/1.35),stagger=index*.035;
    manipAnimations.push({
      mesh,
      from:mesh.position.clone(),
      control:mesh.position.clone().add(new THREE.Vector3(throwX*(1-stagger),.38+.78*speed+index*.025,throwZ*(1-stagger))),
      to:home.position.clone(),
      fromRot:mesh.rotation.clone(),
      toRot:home.rotation.clone(),
      fromScale:mesh.scale.clone(),
      toScale:home.scale.clone(),
      start:performance.now()+index*18,
      duration:300+Math.round(speed*170)+index*12,
      done:false
    });
  }
  function returnManipulatedCard(d,{snap=false}={}){
    const mesh=d?.mesh,home=d?.home||mesh?.userData?.home;if(!mesh||!home)return;
    restoreManipulatedMesh(mesh,home,d,{snap,index:0});
    (d.companions||[]).forEach((c,i)=>restoreManipulatedMesh(c.mesh,c.home,d,{snap,index:i+1}));
    if(snap||!motionAllowed())draw();else startMotion();
  }
  const TOSSABLE_KINDS=new Set(['card','loose-card','card-select','special-select','cactus-quick','cactus-swap','cactus-target','maid-pick','battle-card','trick-collect','rummi-tile','rummi-draw']);
  function stopTossForMesh(mesh){
    if(!mesh)return;
    if(tossAnimations.length)tossAnimations=tossAnimations.filter(a=>a.mesh!==mesh);
    if(manipAnimations.length)manipAnimations=manipAnimations.filter(a=>a.mesh!==mesh);
  }
  function freeTossVelocity(d){
    const v=d?.worldVelocity?.clone?.()||new THREE.Vector3(),idle=Math.max(0,performance.now()-Number(d?.lastAt||0)),release=Math.max(0,Math.min(1,1-idle/150));
    v.multiplyScalar(release);
    const max=.66,speed=v.length();if(speed>max)v.multiplyScalar(max/speed);
    return v;
  }
  function startFreeToss(d){
    if(!d?.mesh||!TOSSABLE_KINDS.has(d.kind)||!motionAllowed())return false;
    const base=freeTossVelocity(d),speed=base.length();if(speed<.075)return false;
    const now=performance.now(),spinBase=clampMotion(((d.velocityX||0)*.010-(d.velocityY||0)*.006),-.15,.15);
    const items=[{mesh:d.mesh,home:d.home,index:0},...(d.companions||[]).map((c,i)=>({mesh:c.mesh,home:c.home,index:i+1}))];
    for(const item of items){
      stopTossForMesh(item.mesh);
      const side=(item.index%2?1:-1)*Math.floor((item.index+1)/2)*.012,velocity=base.clone();
      velocity.x+=side;velocity.z-=side*.7;
      const poseOrder=d.stackMode?localPoses.get(item.mesh.userData?.localPoseKey)?.order:null;
      tossAnimations.push({
        mesh:item.mesh,home:item.home,index:item.index,poseOrder,
        velocity,spin:spinBase+(item.index-(items.length-1)/2)*.012,
        speed:velocity.length(),start:now+item.index*10,lastAt:now+item.index*10,
        startY:item.mesh.position.y,duration:1050+Math.round(Math.min(1,speed/.5)*260)+item.index*25,done:false
      });
    }
    startMotion();return true;
  }
  function settlePersistentPlacement(d){
    const items=[{mesh:d?.mesh,home:d?.home,index:0},...(d?.companions||[]).map((c,i)=>({mesh:c.mesh,home:c.home,index:i+1}))];
    if(!items.some(item=>item.mesh?.userData?.persistLocalPose))return false;
    const now=performance.now();
    items.forEach(item=>{
      if(!item.mesh||!item.home)return;
      if(!item.mesh.userData?.persistLocalPose){restoreManipulatedMesh(item.mesh,item.home,d,{index:item.index});return}
      const from=meshTransform(item.mesh),poseOrder=d.stackMode?localPoses.get(item.mesh.userData?.localPoseKey)?.order:null,pose=saveLocalPose(item.mesh,item.home,{order:poseOrder});if(!pose)return;
      manipAnimations.push({
        mesh:item.mesh,from:from.position,
        control:from.position.clone().lerp(pose.position,.5).add(new THREE.Vector3(0,.10+item.index*.012,0)),
        to:pose.position.clone(),fromRot:from.rotation,toRot:pose.rotation.clone(),
        fromScale:from.scale,toScale:pose.scale.clone(),
        start:now+item.index*12,duration:185+item.index*10,done:false
      });
    });
    startMotion();return true;
  }
  function normalizeAngleDelta(delta){
    let d=Number(delta)||0;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;
  }
  function rotateDraggedObject(delta){
    const d=drag;if(!d?.mesh||!Number.isFinite(delta)||Math.abs(delta)<.0001)return false;
    d.manualRotation=Number.isFinite(d.manualRotation)?d.manualRotation:d.mesh.rotation.z;
    d.manualRotation+=delta;d.mesh.rotation.z=d.manualRotation;d.rotated=true;d.moved=true;
    (d.companions||[]).forEach((c,i)=>{c.mesh.rotation.z=d.manualRotation+(i-(d.companions.length-1)/2)*.018});
    draw();return true;
  }
  function onWheel(e){
    if(!active)return;
    if(drag?.mesh){
      const direction=Math.sign(e.deltaY||e.deltaX||0);if(!direction)return;
      if(rotateDraggedObject(direction*-Math.PI/18)){e.preventDefault();return}
    }
    const obj=hit(e);if(!obj?.userData?.persistLocalPose)return;
    stopTossForMesh(obj);
    const direction=Math.sign(e.deltaY||e.deltaX||0);if(!direction)return;
    obj.rotation.z+=direction*-Math.PI/18;
    const home=obj.userData.home||meshTransform(obj);saveLocalPose(obj,home);updateLocalPoseResetButton();draw();e.preventDefault();
  }
  function localStackCompanions(mesh){
    const key=mesh?.userData?.localPoseKey,pose=key?localPoses.get(key):null;if(!key||!pose)return[];
    const prefix=activePoseScope+'|',kind=key.slice(prefix.length).split('|')[0],near=[];
    for(const [otherKey,other] of localPoses){
      if(!otherKey.startsWith(prefix)||otherKey.slice(prefix.length).split('|')[0]!==kind)continue;
      if(Math.abs(other.position.x-pose.position.x)>=.58||Math.abs(other.position.z-pose.position.z)>=.78)continue;
      near.push({key:otherKey,pose:other});
    }
    if(near.length<2)return[];
    const maxOrder=Math.max(...near.map(x=>Number(x.pose.order)||0));if((Number(pose.order)||0)!==maxOrder)return[];
    const meshByKey=new Map(objects.children.filter(o=>o?.userData?.localPoseKey).map(o=>[o.userData.localPoseKey,o]));
    return near.filter(x=>x.key!==key).sort((a,b)=>(Number(a.pose.order)||0)-(Number(b.pose.order)||0)).map((x,index)=>{
      const obj=meshByKey.get(x.key);if(!obj)return null;
      return{mesh:obj,id:obj.userData.tileId||obj.userData.cardId,index,home:cloneTransform(obj.userData.home||meshTransform(obj))}
    }).filter(Boolean);
  }
  function clearStackHold(d){
    if(d?.stackTimer){clearTimeout(d.stackTimer);d.stackTimer=0}
  }
  function enableLocalStackDrag(d){
    if(!d?.mesh||d.stackMode)return !!d?.stackMode;
    const companions=localStackCompanions(d.mesh);if(!companions.length)return false;
    clearStackHold(d);
    if(d.gestureStarted){emitLocalCardGesture('cancel',0,0);d.gestureStarted=false}
    d.gestureEnabled=false;d.stackMode=true;d.companions=companions;
    companions.forEach(c=>stopTossForMesh(c.mesh));
    d.mesh.scale.copy(d.home.scale).multiplyScalar(1.055);
    companions.forEach((c,i)=>c.mesh.scale.copy(c.home.scale).multiplyScalar(1.025+i*.002));
    host?.classList.add('is-stack-dragging');draw();return true;
  }
  function armLocalStackDrag(d,e){
    if(!d?.mesh||!localStackCompanions(d.mesh).length)return;
    d.stackAvailable=true;
    if(e?.shiftKey){enableLocalStackDrag(d);return}
    if(e?.pointerType==='touch')d.stackTimer=setTimeout(()=>{if(drag===d&&!d.moved&&!d.twist)enableLocalStackDrag(d)},340);
  }
  function beginLooseCardDrag(obj,e,kind){
    const home=obj.userData.home||{position:obj.position.clone(),rotation:obj.rotation.clone(),scale:obj.scale.clone()},gestureEnabled=!!(current?.canInteract&&LIVE_CARD_GAMES.has(current?.gameId)&&(['card-select','special-select'].includes(kind)||kind==='cactus-quick')),companions=groupedDragCompanions(obj,kind);
    stopTossForMesh(obj);companions.forEach(c=>stopTossForMesh(c.mesh));
    drag={pointerId:e.pointerId,pointerType:e.pointerType||'mouse',kind,loose:true,mesh:obj,cardId:obj.userData.cardId,tileId:obj.userData.tileId,index:obj.userData.index,owner:obj.userData.owner,tapEnabled:!!obj.userData.tapEnabled,gestureEnabled,gestureStarted:false,gestureHome:home.position.clone(),companions,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,lastAt:performance.now(),velocityX:0,velocityY:0,worldVelocity:new THREE.Vector3(),lastWorld:obj.position.clone(),manualRotation:obj.rotation.z,rotated:false,twist:null,stackMode:false,stackTimer:0,moved:false,home:{position:home.position.clone(),rotation:home.rotation.clone(),scale:home.scale.clone()}};
    armLocalStackDrag(drag,e);host?.classList.add('is-dragging');capturePointer(e.pointerId);e.preventDefault();
  }
  function moveLooseCardDrag(e){
    const d=drag,now=performance.now(),dt=Math.max(8,now-(d.lastAt||now)),dx=e.clientX-d.startX,dy=e.clientY-d.startY;
    if(!d.moved&&Math.hypot(dx,dy)>6){d.moved=true;clearStackHold(d)}
    if(!d.moved)return false;
    d.velocityX=(e.clientX-d.lastX)/dt*16.67;d.velocityY=(e.clientY-d.lastY)/dt*16.67;d.lastX=e.clientX;d.lastY=e.clientY;d.lastAt=now;
    updatePointer(e);const p=new THREE.Vector3();
    if(raycaster.ray.intersectPlane(dragPlane,p)){
      const rawWorld=new THREE.Vector3(p.x-(d.lastWorld?.x??d.mesh.position.x),0,p.z-(d.lastWorld?.z??d.mesh.position.z)).multiplyScalar(16.67/dt);
      d.worldVelocity??=new THREE.Vector3();d.worldVelocity.lerp(rawWorld,.46);d.lastWorld?.set?.(p.x,1.05,p.z);
      d.mesh.position.set(p.x,1.05,p.z);
      const lean=clampMotion(d.velocityX*.010,-.08,.08);
      d.mesh.rotation.set(-Math.PI/2,clampMotion(-d.velocityY*.012,-.20,.20),(Number.isFinite(d.manualRotation)?d.manualRotation:d.home.rotation.z)+lean);
      d.mesh.scale.copy(d.home.scale).multiplyScalar(1.045);
      (d.companions||[]).forEach((c,i)=>{
        const side=(i%2?1:-1)*(.055+Math.floor(i/2)*.028),back=.055+(i+1)*.032,target=new THREE.Vector3(d.mesh.position.x+side,d.mesh.position.y+.018*(i+1),d.mesh.position.z+back);
        c.mesh.position.lerp(target,.42);
        c.mesh.rotation.set(d.mesh.rotation.x,d.mesh.rotation.y,d.mesh.rotation.z+(i-(d.companions.length-1)/2)*.018);
        c.mesh.scale.copy(c.home.scale).multiplyScalar(1.025);
      });
    }
    if(d.gestureEnabled){
      if(!d.gestureStarted){d.gestureStarted=true;emitLocalCardGesture('start',0,0)}
      const gesture=cardGestureCoordinates(d.mesh,d.gestureHome);emitLocalCardGesture('move',gesture.progress,gesture.lateral);
      d.overDrop=directCardDropNear(d);
      const target=cardGestureTarget(current?.gameId,TABLE_Y+.025);showDropMarkerAt(target.x,target.z,d.overDrop);
    }else if(d.kind==='rummi-tile'&&current?.gameId==='rummikub'){
      d.rummiDrop=rummiDropTarget(d.mesh.position);
      if(d.rummiDrop)showDropMarkerAt(d.rummiDrop.x,d.rummiDrop.z,true);else showDropMarkerAt(0,0,false);
    }else if(d.kind==='rummi-draw'&&current?.gameId==='rummikub'){
      d.drawToRack=d.mesh.position.z>=1.65&&Math.abs(d.mesh.position.x)<=4.55;
      showDropMarkerAt(Math.max(-3.4,Math.min(3.4,d.mesh.position.x)),2.18,d.drawToRack);
    }else if(d.kind==='maid-pick'&&current?.gameId==='pouilleux'){
      d.maidToHand=d.mesh.position.z>=1.55&&Math.abs(d.mesh.position.x)<=4.55;
      showDropMarkerAt(Math.max(-3.35,Math.min(3.35,d.mesh.position.x)),2.18,d.maidToHand);
    }else if(d.kind==='battle-card'&&current?.gameId==='bataille'){
      const radius=d.pointerType==='touch'||matchMedia('(pointer: coarse)').matches?2.15:1.8;
      d.battleToCenter=Math.hypot(d.mesh.position.x,d.mesh.position.z)<=radius;
      showDropMarkerAt(0,0,d.battleToCenter);
    }else if(d.kind==='trick-collect'&&current?.gameId==='plis'){
      d.trickToHand=d.mesh.position.z>=1.42&&Math.abs(d.mesh.position.x)<=4.45;
      showDropMarkerAt(Math.max(-2.8,Math.min(2.8,d.mesh.position.x)),2.20,d.trickToHand);
    }
    draw();e.preventDefault();return true;
  }
  function cardDropRadius(d){return d?.pointerType==='touch'||matchMedia('(pointer: coarse)').matches?1.9:1.5}
  function directCardDropNear(d,game=current?.gameId){
    const target=cardGestureTarget(game),radius=cardDropRadius(d);return Math.hypot(d.mesh.position.x-target.x,d.mesh.position.z-target.z)<radius;
  }
  function showDropMarkerAt(x,z,active=true){
    if(!dropMarker)return;
    dropMarker.visible=!!active;
    if(active){dropMarker.position.set(x,TABLE_Y+.025,z);dropMarker.material.opacity=.82}
    else dropMarker.material.opacity=.2;
  }
  function rummiDropTarget(position){
    const data=current?.viewData?.rummi;if(!data||!position)return null;
    const groups=data.table||[],layout=rummiBoardLayout(groups);
    let best=null;
    for(let order=0;order<layout.active.length;order++){
      const entry=layout.active[order],col=order%layout.cols,row=Math.floor(order/layout.cols),cx=(col-(layout.cols-1)/2)*layout.cellW,cz=layout.baseZ+row*layout.cellD;
      const dx=Math.abs(position.x-cx),dz=Math.abs(position.z-cz);
      if(dx<=layout.cellW*.47&&dz<=Math.min(.78,layout.cellD*.38)){
        const score=dx/Math.max(.1,layout.cellW)+dz/Math.max(.1,layout.cellD);
        if(!best||score<best.score)best={dest:entry.index,x:cx,z:cz,score};
      }
    }
    if(best)return best;
    if(position.z>=1.72&&Math.abs(position.x)<=4.45)return{dest:'hand',x:Math.max(-3.4,Math.min(3.4,position.x)),z:2.18,score:0};
    const tableMinZ=layout.baseZ-.72,tableMaxZ=layout.baseZ+(layout.rows-1)*layout.cellD+.72;
    if(position.z>=tableMinZ&&position.z<=tableMaxZ&&Math.abs(position.x)<=4.65)return{dest:'new',x:position.x,z:position.z,score:0};
    return null;
  }
  function rummiDropDestination(position){return rummiDropTarget(position)?.dest??null}
  function onPointerDown(e){
    if(!active)return;
    if(drag?.mesh&&e.pointerId!==drag.pointerId&&e.pointerType==='touch'){
      clearStackHold(drag);
      const angle=Math.atan2(e.clientY-drag.lastY,e.clientX-drag.lastX);
      drag.twist={pointerId:e.pointerId,lastAngle:angle};capturePointer(e.pointerId);e.preventDefault();return;
    }
    const obj=hit(e);setHover(obj);if(!obj)return;
    if(!current?.canInteract&&!obj.userData.looseManip)return;
    if(obj.userData.kind==='deck'){drag={pointerId:e.pointerId,pointerType:e.pointerType||'mouse',kind:'deck',startX:e.clientX,startY:e.clientY};capturePointer(e.pointerId);return}
    if(obj.userData.looseManip&&obj.userData.kind!=='card'){beginLooseCardDrag(obj,e,obj.userData.kind);return}
    if(['maid-pick','battle-action','cactus-quick','cactus-swap','cactus-target','cactus-draw','cactus-take','cactus-action','ninety-action','blackjack-action','card-action','rummi-tile','rummi-dest','rummi-action'].includes(obj.userData.kind)){drag={pointerId:e.pointerId,pointerType:e.pointerType||'mouse',kind:obj.userData.kind,index:obj.userData.index,owner:obj.userData.owner,cardId:obj.userData.cardId,tileId:obj.userData.tileId,dest:obj.userData.dest,command:obj.userData.command,amount:obj.userData.amount,ace:obj.userData.ace,startX:e.clientX,startY:e.clientY};capturePointer(e.pointerId);return}
    if(['goose-roll','goose-choice','yam-roll','yam-hold','box-roll','box-toggle','box-close','city-roll','city-action','city-property','echo-pad','echo-memorized','echo-continue','balloon-pump','balloon-bank','balloon-continue','word-letter','word-answer','word-clear','word-submit','word-giveup','word-continue','intrus-spot','intrus-continue','code-cycle','code-submit','code-continue','golf-adjust','golf-shoot','golf-continue'].includes(obj.userData.kind)){
      if(obj.userData.kind==='box-close'&&obj.userData.enabled===false)return;
      drag={pointerId:e.pointerId,pointerType:e.pointerType||'mouse',kind:obj.userData.kind,steps:obj.userData.steps,index:obj.userData.index,count:obj.userData.count,number:obj.userData.number,control:obj.userData.control,command:obj.userData.command,delta:obj.userData.delta,startX:e.clientX,startY:e.clientY};capturePointer(e.pointerId);return;
    }
    if(obj.userData.kind!=='card')return;
    const home=obj.userData.home||{position:obj.position.clone(),rotation:obj.rotation.clone(),scale:obj.scale.clone()},canPlay=!!obj.userData.playable;
    stopTossForMesh(obj);drag={pointerId:e.pointerId,pointerType:e.pointerType||'mouse',kind:'card',mesh:obj,cardId:obj.userData.cardId,canPlay,gestureStarted:false,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,lastAt:performance.now(),velocityX:0,velocityY:0,worldVelocity:new THREE.Vector3(),lastWorld:obj.position.clone(),manualRotation:obj.rotation.z,rotated:false,twist:null,stackMode:false,stackTimer:0,moved:false,overDrop:false,gestureHome:home.position.clone(),home:{position:home.position.clone(),rotation:home.rotation.clone(),scale:home.scale.clone()}};
    armLocalStackDrag(drag,e);if(canPlay&&!drag.stackMode){emitLocalCardGesture('start',0,0);drag.gestureStarted=true}host?.classList.add('is-dragging');capturePointer(e.pointerId);e.preventDefault();
  }
  function onPointerMove(e){
    if(!active)return;
    if(!drag){setHover(hit(e));return}
    if(drag.twist?.pointerId===e.pointerId){
      const angle=Math.atan2(e.clientY-drag.lastY,e.clientX-drag.lastX),delta=normalizeAngleDelta(angle-drag.twist.lastAngle);
      drag.twist.lastAngle=angle;rotateDraggedObject(delta);e.preventDefault();return;
    }
    if(e.pointerId!==drag.pointerId)return;
    if(drag.loose){moveLooseCardDrag(e);return}
    if(drag.kind!=='card')return;
    const now=performance.now(),dt=Math.max(8,now-(drag.lastAt||now)),dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(!drag.moved&&Math.hypot(dx,dy)>6){drag.moved=true;clearStackHold(drag)}
    if(!drag.moved)return;
    drag.velocityX=(e.clientX-drag.lastX)/dt*16.67;drag.velocityY=(e.clientY-drag.lastY)/dt*16.67;drag.lastX=e.clientX;drag.lastY=e.clientY;drag.lastAt=now;
    updatePointer(e);const p=new THREE.Vector3();if(raycaster.ray.intersectPlane(dragPlane,p)){const rawWorld=new THREE.Vector3(p.x-(drag.lastWorld?.x??drag.mesh.position.x),0,p.z-(drag.lastWorld?.z??drag.mesh.position.z)).multiplyScalar(16.67/dt);drag.worldVelocity??=new THREE.Vector3();drag.worldVelocity.lerp(rawWorld,.46);drag.lastWorld?.set?.(p.x,1.02,p.z);drag.mesh.position.set(p.x,1.02,p.z);const lean=clampMotion(drag.velocityX*.009,-.07,.07);drag.mesh.rotation.set(-Math.PI/2,clampMotion(-drag.velocityY*.010,-.16,.16),(Number.isFinite(drag.manualRotation)?drag.manualRotation:drag.home.rotation.z)+lean);(drag.companions||[]).forEach((c,i)=>{const side=(i%2?1:-1)*(.055+Math.floor(i/2)*.028),back=.055+(i+1)*.032,target=new THREE.Vector3(drag.mesh.position.x+side,drag.mesh.position.y+.018*(i+1),drag.mesh.position.z+back);c.mesh.position.lerp(target,.42);c.mesh.rotation.set(drag.mesh.rotation.x,drag.mesh.rotation.y,drag.mesh.rotation.z+(i-(drag.companions.length-1)/2)*.018);c.mesh.scale.copy(c.home.scale).multiplyScalar(1.025);});}
    const near=drag.canPlay&&Math.hypot(drag.mesh.position.x-1.25,drag.mesh.position.z-.05)<cardDropRadius(drag);drag.overDrop=near;dropMarker.material.opacity=near ? .82 : .2;
    if(drag.canPlay&&!drag.stackMode){const gesture=eightGestureCoordinates(drag.mesh,drag.gestureHome);emitLocalCardGesture('move',gesture.progress,gesture.lateral)}draw();e.preventDefault();
  }
  function finishDrag(e,cancelled=false){
    if(!drag||e.pointerId!==drag.pointerId)return;
    const d=drag;clearStackHold(d);drag=null;host?.classList.remove('is-dragging','is-stack-dragging');dropMarker.material.opacity=.2;
    if(d.loose&&d.kind!=='card')dropMarker.visible=false;
    if(cancelled){if(d.kind==='card'&&d.canPlay||d.loose&&d.gestureStarted)emitLocalCardGesture('cancel',0,0);if(d.loose)returnManipulatedCard(d,{snap:document.hidden});else{syncCurrent(current);draw()}return}
    const tap=!d.stackMode&&!d.rotated&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<8;
    if(d.loose&&!tap){
      if(d.stackMode){
        if(d.gestureStarted)emitLocalCardGesture('cancel',0,0);
        if(Number.isFinite(d.manualRotation))d.mesh.rotation.z=d.manualRotation;
        if(startFreeToss(d))return;if(settlePersistentPlacement(d))return;returnManipulatedCard(d);return;
      }
      if(d.kind==='cactus-quick'&&d.gestureStarted){
        if(directCardDropNear(d,'cactus')){emitLocalCardGesture('commit',1,0);current?.interactions?.cactus?.('quick',d.index);return}
      }
      if(d.kind==='card-select'&&d.gestureStarted&&directCardDropNear(d)){
        rememberGroupedCardDropOrigins(d);
        if(current?.interactions?.cardDrop?.(d.cardId)){emitLocalCardGesture('commit',1,0);return}
      }
      if(d.kind==='special-select'&&current?.gameId==='quatrevingtdixneuf'&&d.gestureStarted&&directCardDropNear(d,'quatrevingtdixneuf')){
        rememberNinetyDropOrigin(d.cardId,d.mesh);
        if(current?.interactions?.specialCard?.('drop',d.cardId)){emitLocalCardGesture('commit',1,0);return}
      }
      if(d.kind==='rummi-tile'){
        const dest=d.rummiDrop?.dest??rummiDropDestination(d.mesh.position);
        if(dest!==null){rememberGroupedRummiDropOrigins(d);if(current?.interactions?.rummi?.('drop',{id:d.tileId,dest}))return}
      }
      if(d.kind==='rummi-draw'&&d.drawToRack){
        if(current?.interactions?.rummi?.('draw'))return;
      }
      if(d.kind==='maid-pick'&&d.maidToHand){
        pendingMaidPickOrigin={position:d.mesh.position.clone(),rotation:d.mesh.rotation.z,scale:d.mesh.scale.clone(),index:d.index};
        if(current?.interactions?.specialCard?.('pick',d.index))return;
        pendingMaidPickOrigin=null;
      }
      if(d.kind==='battle-card'&&d.battleToCenter){
        pendingBattleOrigin={position:d.mesh.position.clone(),rotation:d.mesh.rotation.z,scale:d.mesh.scale.clone()};
        if(current?.interactions?.specialCard?.('battle'))return;
        pendingBattleOrigin=null;
      }
      if(d.kind==='trick-collect'&&d.trickToHand){
        rememberTrickCollectOrigins(d);
        if(current?.interactions?.cardAction?.('collect'))return;
      }
      if(d.gestureStarted)emitLocalCardGesture('cancel',0,0);
      if(Number.isFinite(d.manualRotation))d.mesh.rotation.z=d.manualRotation;
      if(startFreeToss(d))return;
      if(settlePersistentPlacement(d))return;
      returnManipulatedCard(d);return
    }
    if(d.loose&&(!d.tapEnabled||!current?.canInteract)){returnManipulatedCard(d,{snap:true});return}
    if(d.kind==='loose-card'){returnManipulatedCard(d,{snap:true});return}
    if(d.kind==='card-select'){current?.interactions?.cardSelect?.(d.cardId);return}
    if(d.kind==='trick-collect'){if(tap)current?.interactions?.cardAction?.('collect');return}
    if(d.kind==='special-select'){current?.interactions?.specialCard?.('select',d.cardId);return}
    if(d.kind==='maid-pick'){if(tap){pendingMaidPickOrigin={position:d.mesh.position.clone(),rotation:d.mesh.rotation.z,scale:d.mesh.scale.clone(),index:d.index};if(!current?.interactions?.specialCard?.('pick',d.index))pendingMaidPickOrigin=null}return}
    if(d.kind==='special-select'){if(tap)current?.interactions?.specialCard?.('select',d.cardId);return}
    if(d.kind==='battle-card'){if(tap){pendingBattleOrigin={position:d.mesh.position.clone(),rotation:d.mesh.rotation.z,scale:d.mesh.scale.clone()};if(!current?.interactions?.specialCard?.('battle'))pendingBattleOrigin=null}return}
    if(d.kind==='battle-action'){if(tap)current?.interactions?.specialCard?.('battle');return}
    if(d.kind==='cactus-quick'){if(tap)current?.interactions?.cactus?.('quick',d.index);return}
    if(d.kind==='cactus-swap'){if(tap)current?.interactions?.cactus?.('swap',d.index);return}
    if(d.kind==='cactus-target'){if(tap)current?.interactions?.cactus?.('target',d.index);return}
    if(d.kind==='cactus-draw'){if(tap)current?.interactions?.cactus?.('draw');return}
    if(d.kind==='cactus-take'){if(tap)current?.interactions?.cactus?.('take');return}
    if(d.kind==='cactus-action'){if(tap)current?.interactions?.cactus?.(d.command);return}
    if(d.kind==='ninety-action'){if(tap)current?.interactions?.specialCard?.(d.command,{id:d.cardId,ace:d.ace});return}
    if(d.kind==='blackjack-action'){if(tap)current?.interactions?.specialCard?.(d.command,d.amount);return}
    if(d.kind==='card-action'){if(tap)current?.interactions?.cardAction?.(d.command);return}
    if(d.kind==='rummi-tile'){if(tap)current?.interactions?.rummi?.('select',d.tileId);return}
    if(d.kind==='rummi-draw'){if(tap)current?.interactions?.rummi?.('draw');returnManipulatedCard(d,{snap:true});return}
    if(d.kind==='rummi-dest'){if(tap)current?.interactions?.rummi?.('move',d.dest);return}
    if(d.kind==='rummi-action'){if(tap)current?.interactions?.rummi?.(d.command);return}
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
    if(d.kind==='city-action'){if(tap)current?.interactions?.city?.(d.command,d.index);return}
    if(d.kind==='city-property'){if(tap){cityFocusIndex=d.index;syncMetropole(current);draw()}return}
    if(d.kind==='yam-roll'||d.kind==='yam-hold'){if(tap)current?.interactions?.yam?.(d.kind==='yam-hold'?'hold':'roll',d.index);return}
    if(d.kind==='box-roll'||d.kind==='box-toggle'||d.kind==='box-close'){
      if(tap)current?.interactions?.box?.(d.kind==='box-roll'?'roll':d.kind==='box-toggle'?'toggle':'close',d.kind==='box-roll'?d.count:d.number);return;
    }
    if(d.stackMode){
      if(d.gestureStarted)emitLocalCardGesture('cancel',0,0);
      if(Number.isFinite(d.manualRotation))d.mesh.rotation.z=d.manualRotation;
      if(startFreeToss(d))return;if(settlePersistentPlacement(d))return;returnManipulatedCard(d);return;
    }
    const near=d.canPlay&&d.moved&&(d.overDrop||Math.hypot(d.mesh.position.x-1.25,d.mesh.position.z-.05)<cardDropRadius(d));
    if(d.canPlay&&(!d.moved||near)){emitLocalCardGesture('commit',1,0);current?.interactions?.playCard?.(d.cardId);return}
    if(d.canPlay)emitLocalCardGesture('cancel',0,0);
    if(Number.isFinite(d.manualRotation))d.mesh.rotation.z=d.manualRotation;
    if(startFreeToss(d))return;
    if(settlePersistentPlacement(d))return;
    returnManipulatedCard(d);
  }
  function cancelActiveDrag(pointerId=null){
    if(!drag||(pointerId!==null&&drag.pointerId!==pointerId))return;
    const d=drag,wasCard=d.kind==='card',wasLoose=!!d.loose;clearStackHold(d);if(wasCard&&d.gestureStarted||wasLoose&&d.gestureStarted)emitLocalCardGesture('cancel',0,0);drag=null;host?.classList.remove('is-dragging','is-stack-dragging');if(dropMarker)dropMarker.material.opacity=.2;
    if(wasLoose||wasCard){returnManipulatedCard(d,{snap:document.hidden});return}
  }
  function releaseTwistPointer(e){
    if(!drag?.twist||drag.twist.pointerId!==e.pointerId)return false;
    drag.twist=null;return true;
  }
  function onPointerUp(e){if(releaseTwistPointer(e))return;finishDrag(e,false)}
  function onPointerCancel(e){if(releaseTwistPointer(e))return;cancelActiveDrag(e.pointerId)}
  function onLostPointerCapture(e){if(releaseTwistPointer(e))return;cancelActiveDrag(e.pointerId)}
  function onWindowBlur(){cancelActiveDrag()}
  function onVisibilityChange(){if(document.hidden)cancelActiveDrag()}

  function activate(){active=true;init()}
  function deactivate(){
    cancelActiveDrag();active=false;hovered=null;wordSelection=[];wordDraftKey='';codeDraft=[0,1,2];codeDraftKey='';golfAim={angle:0,power:50};golfAimKey='';lastGolfKey='';cityFocusIndex=null;diceAnimations.length=0;pawnAnimations.length=0;manipAnimations.length=0;
    if(animationRaf){cancelAnimationFrame(animationRaf);animationRaf=0}
    tossAnimations.length=0;
    resizeObserver?.disconnect();resizeObserver=null;host?.remove();host=null;
    document.documentElement.removeAttribute('data-table-3d-game');document.documentElement.removeAttribute('data-table-3d-phase');
  }
  function destroy(){
    deactivate();clearObjects();
    canvas?.removeEventListener('pointerdown',onPointerDown);canvas?.removeEventListener('pointermove',onPointerMove);canvas?.removeEventListener('pointerup',onPointerUp);canvas?.removeEventListener('pointercancel',onPointerCancel);canvas?.removeEventListener('lostpointercapture',onLostPointerCapture);canvas?.removeEventListener('wheel',onWheel);window.removeEventListener('blur',onWindowBlur);window.removeEventListener('salon:remote-card-gesture',onRemoteCardGesture);document.removeEventListener('visibilitychange',onVisibilityChange);assetUnsubscribe?.();assetUnsubscribe=null;
    cardGeometry.dispose();tileGeometry.dispose();pawnGeometry.dispose();dieGeometry.dispose();rummiTileGeometry.dispose();grainGeometry.dispose();heldPadGeometry.dispose();codeGemGeometry.dispose();intrusDotGeometry.dispose();balloonGeometry.dispose();golfBallGeometry.dispose();cityTileGeometry.dispose();cityHouseGeometry.dispose();cityPegGeometry.dispose();edgeMaterial.dispose();backMaterial.dispose();for(const m of frontMaterials.values())m.dispose();for(const m of tileMaterials.values())m.dispose();for(const m of rummiTileMaterials.values())m.dispose();for(const m of pawnMaterials.values())m.dispose();for(const m of dieFaceMaterials.values())m.dispose();for(const m of cellLabelMaterials.values())m.dispose();for(const m of boxTileMaterials.values())m.dispose();neutralDieMaterial.dispose();rummiBackMaterial.dispose();for(const t of disposableTextures)t.dispose();for(const t of cellLabelTextures)t.dispose();
    tableMesh?.geometry?.dispose();tableMesh?.material?.dispose();dropMarker?.geometry?.dispose();dropMarker?.material?.dispose();renderer?.dispose();
    localPoses.clear();poseSeen.clear();activePoseScope='';localPoseOrder=0;
    renderer=scene=camera=canvas=null;current=null;
  }
  return{activate,render,deactivate,destroy};
}
