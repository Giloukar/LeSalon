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

function canvasTexture(draw,w=512,h=720){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');draw(ctx,w,h);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  return tex;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.closePath();
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
  const edgeMaterial=new THREE.MeshStandardMaterial({color:0xe9e2d1,roughness:.72,metalness:0});
  const backTexture=cardBackTexture();disposableTextures.push(backTexture);
  const backMaterial=new THREE.MeshStandardMaterial({map:backTexture,roughness:.64,metalness:0});
  let objects=new THREE.Group(),dropMarker=null,tableMesh=null;

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
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    canvas=renderer.domElement;canvas.setAttribute('aria-label','Table de jeu 3D interactive');canvas.tabIndex=0;

    scene=new THREE.Scene();scene.background=new THREE.Color(0x0b110e);
    scene.fog=new THREE.Fog(0x0b110e,12,23);
    camera=new THREE.PerspectiveCamera(39,1,.1,60);camera.position.set(0,7.25,9.25);camera.lookAt(0,.25,.2);

    const hemi=new THREE.HemisphereLight(0xe9f3e7,0x162019,1.28);scene.add(hemi);
    const key=new THREE.DirectionalLight(0xfff5df,2.15);key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-8;key.shadow.camera.right=8;key.shadow.camera.top=7;key.shadow.camera.bottom=-7;scene.add(key);
    const rim=new THREE.DirectionalLight(0xb8d8c5,.85);rim.position.set(6,3,-5);scene.add(rim);

    const tableMat=new THREE.MeshStandardMaterial({color:0x294335,roughness:.88,metalness:0});
    tableMesh=new THREE.Mesh(new THREE.BoxGeometry(12,.5,8),tableMat);tableMesh.position.y=0;tableMesh.receiveShadow=true;tableMesh.castShadow=true;scene.add(tableMesh);
    const felt=new THREE.Mesh(new THREE.PlaneGeometry(11.55,7.55),new THREE.MeshStandardMaterial({color:0x365944,roughness:1}));
    felt.rotation.x=-Math.PI/2;felt.position.y=TABLE_Y+.005;felt.receiveShadow=true;scene.add(felt);
    scene.add(objects);

    const ring=new THREE.RingGeometry(.86,1.03,56);
    dropMarker=new THREE.Mesh(ring,new THREE.MeshBasicMaterial({color:0xdbea9e,transparent:true,opacity:.2,side:THREE.DoubleSide}));
    dropMarker.rotation.x=-Math.PI/2;dropMarker.position.set(1.25,TABLE_Y+.025,0);scene.add(dropMarker);

    canvas.addEventListener('pointerdown',onPointerDown);
    canvas.addEventListener('pointermove',onPointerMove);
    canvas.addEventListener('pointerup',onPointerUp);
    canvas.addEventListener('pointercancel',onPointerCancel);
    canvas.addEventListener('pointerleave',()=>setHover(null));
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onFatal?.(new Error('Contexte WebGL perdu'));});
  }
  function ensureHost(){
    const column=document.querySelector('.table-column');if(!column)return null;
    if(!host?.isConnected){
      host=document.createElement('section');host.className='table-3d-host';host.setAttribute('aria-label','Vue 3D de la table');
      host.innerHTML='<div class="table-3d-hud"><span class="table-3d-accent">VUE 3D · 8 AMÉRICAIN</span><span data-table-3d-status>Table synchronisée</span></div><div class="table-3d-help">Cliquez ou glissez une carte vers la défausse · cliquez la pioche pour piocher</div>';
      const banner=column.querySelector('.turn-banner');banner?.after(host);if(!banner)column.prepend(host);
      host.append(canvas);
      resizeObserver?.disconnect();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();
    }
    return host;
  }
  function resize(){
    if(!renderer||!host)return;
    const r=host.getBoundingClientRect(),w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();draw();
  }
  function clearObjects(){
    interactive.length=0;
    for(const child of [...objects.children]){
      objects.remove(child);
      child.traverse?.(o=>{o.userData?.temporaryMaterial?.dispose?.();o.userData?.temporaryTexture?.dispose?.()});
    }
  }
  function placeCard(mesh,x,z,y=TABLE_Y+.07,rot=0,scale=1){
    mesh.position.set(x,y,z);mesh.rotation.set(-Math.PI/2,0,rot);mesh.scale.setScalar(scale);objects.add(mesh);return mesh;
  }
  function syncEight(payload){
    clearObjects();
    const s=payload.state,viewer=Number.isInteger(payload.privateIndex)?payload.privateIndex:0;
    if(!s?.players?.length)return;
    const own=payload.spectator?[]:(s.players[viewer]?.hand||[]),playable=new Set(payload.viewData?.playableIds||[]);

    const n=own.length,span=Math.min(7.1,Math.max(1.4,(n-1)*.62));
    own.forEach((card,i)=>{
      const t=n<=1 ? .5 : i/(n-1),x=(t-.5)*span,fan=(t-.5)*-.20,z=2.55+Math.abs(t-.5)*.26;
      const mesh=cardMesh(card,{id:card.id,interactiveCard:playable.has(card.id),playable:playable.has(card.id)});
      const lift=playable.has(card.id) ? .14 : 0;
      placeCard(mesh,x,z,TABLE_Y+.12+lift,fan,playable.has(card.id)?1.035:1);
      mesh.userData.home={position:mesh.position.clone(),rotation:mesh.rotation.clone(),scale:mesh.scale.clone()};
    });

    const deckCount=Array.isArray(s.deck)?s.deck.length:Number(s.deckCount||0);
    for(let i=0;i<Math.min(5,Math.max(1,deckCount));i++){
      const mesh=cardMesh(null,{back:true,interactiveCard:i===Math.min(5,Math.max(1,deckCount))-1});
      mesh.userData.kind=i===Math.min(5,Math.max(1,deckCount))-1?'deck':'card';
      if(mesh.userData.kind==='deck')mesh.userData.interactive=!!payload.canInteract;
      placeCard(mesh,-1.25,.05,TABLE_Y+.07+i*.035,-.025+i*.012,1);
    }
    const top=s.discard?.at?.(-1);
    if(top){const mesh=cardMesh(top);placeCard(mesh,1.25,.05,TABLE_Y+.12,(visualHash(top.id)-.5)*.18,1);}
    dropMarker.material.opacity=.2;

    const opponents=s.players.map((p,i)=>({p,i})).filter(x=>x.i!==viewer);
    opponents.forEach(({p,i},k)=>{
      const count=p.hand?.length||0,total=Math.min(7,count),x=opponents.length<=1?0:(k/(opponents.length-1)-.5)*7.4,z=-2.62;
      for(let c=0;c<total;c++){const mesh=cardMesh(null,{back:true});placeCard(mesh,x+(c-(total-1)/2)*.12,z+c*.018,TABLE_Y+.1+c*.018,(c-(total-1)/2)*.025,.67);}
      const label=makeLabel((p.name||'Joueur')+' · '+count+' carte'+(count>1?'s':''),i===s.turn?'#dbea9e':'#d8ded9');
      label.position.set(x,1.05,z-.82);objects.add(label);
    });

    const status=host?.querySelector('[data-table-3d-status]');
    if(status){
      const requested=SUIT_NAME[s.suit]||'',attack=s.pendingDraw>0?' · attaque +'+s.pendingDraw:'';
      status.textContent=(requested?requested+' demandé':'')+attack;
    }
  }
  function render(payload){
    current=payload;if(!active)return;
    init();
    if(payload.gated){
      resizeObserver?.disconnect();resizeObserver=null;host?.remove();host=null;
      document.documentElement.removeAttribute('data-table-3d-game');return;
    }
    ensureHost();document.documentElement.dataset.table3dGame=payload.gameId||'';
    if(payload.gameId==='huit')syncEight(payload);
    draw();
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
    if(hovered&&!drag&&hovered.userData.kind==='card'){const h=hovered.userData.home;if(h)hovered.scale.copy(h.scale).multiplyScalar(1.055)}
    draw();
  }
  function onPointerDown(e){
    if(!active||!current?.canInteract)return;
    const obj=hit(e);setHover(obj);if(!obj)return;
    if(obj.userData.kind==='deck'){drag={pointerId:e.pointerId,kind:'deck',startX:e.clientX,startY:e.clientY};canvas.setPointerCapture?.(e.pointerId);return}
    if(obj.userData.kind!=='card'||!obj.userData.playable)return;
    drag={pointerId:e.pointerId,kind:'card',mesh:obj,cardId:obj.userData.cardId,startX:e.clientX,startY:e.clientY,moved:false};
    host?.classList.add('is-dragging');canvas.setPointerCapture?.(e.pointerId);e.preventDefault();
  }
  function onPointerMove(e){
    if(!active)return;
    if(!drag){setHover(hit(e));return}
    if(e.pointerId!==drag.pointerId||drag.kind!=='card')return;
    const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(!drag.moved&&Math.hypot(dx,dy)>6)drag.moved=true;
    if(!drag.moved)return;
    updatePointer(e);const p=new THREE.Vector3();if(raycaster.ray.intersectPlane(dragPlane,p)){drag.mesh.position.set(p.x,1.02,p.z);drag.mesh.rotation.set(-Math.PI/2,0,(dx*.0025));}
    const near=Math.hypot(drag.mesh.position.x-1.25,drag.mesh.position.z-.05)<1.45;dropMarker.material.opacity=near ? .82 : .2;draw();e.preventDefault();
  }
  function finishDrag(e,cancelled=false){
    if(!drag||e.pointerId!==drag.pointerId)return;
    const d=drag;drag=null;host?.classList.remove('is-dragging');dropMarker.material.opacity=.2;
    if(cancelled){syncEight(current);draw();return}
    if(d.kind==='deck'){
      if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<8)current?.interactions?.draw?.();
      return;
    }
    const near=d.moved&&Math.hypot(d.mesh.position.x-1.25,d.mesh.position.z-.05)<1.45;
    if(!d.moved||near){current?.interactions?.playCard?.(d.cardId);return}
    syncEight(current);draw();
  }
  function onPointerUp(e){finishDrag(e,false)}
  function onPointerCancel(e){finishDrag(e,true)}

  function activate(){active=true;init()}
  function deactivate(){
    active=false;drag=null;hovered=null;resizeObserver?.disconnect();resizeObserver=null;host?.remove();host=null;
    document.documentElement.removeAttribute('data-table-3d-game');
  }
  function destroy(){
    deactivate();
    canvas?.removeEventListener('pointerdown',onPointerDown);canvas?.removeEventListener('pointermove',onPointerMove);canvas?.removeEventListener('pointerup',onPointerUp);canvas?.removeEventListener('pointercancel',onPointerCancel);
    cardGeometry.dispose();edgeMaterial.dispose();backMaterial.dispose();for(const m of frontMaterials.values())m.dispose();for(const t of disposableTextures)t.dispose();
    tableMesh?.geometry?.dispose();tableMesh?.material?.dispose();dropMarker?.geometry?.dispose();dropMarker?.material?.dispose();renderer?.dispose();
    renderer=scene=camera=canvas=null;current=null;
  }
  return{activate,render,deactivate,destroy};
}
