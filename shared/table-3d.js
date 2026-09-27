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
  const edgeMaterial=new THREE.MeshStandardMaterial({color:0xe9e2d1,roughness:.72,metalness:0});
  const tileMaterials=new Map(),pawnMaterials=new Map(),dieFaceMaterials=new Map(),cellLabelMaterials=new Map(),boxTileMaterials=new Map(),cellLabelTextures=[];
  const neutralDieMaterial=new THREE.MeshStandardMaterial({color:0xd8d3c4,roughness:.82,metalness:0});
  let animationRaf=0,diceAnimations=[],pawnAnimations=[],lastDiceKey='',lastMoveKey='';
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
      host.innerHTML='<div class="table-3d-hud"><span class="table-3d-accent" data-table-3d-title>VUE 3D</span><span data-table-3d-status>Table synchronisée</span></div><div class="table-3d-help" data-table-3d-help>Vue immersive synchronisée avec la partie</div>';
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
    interactive.length=0;diceAnimations.length=0;pawnAnimations.length=0;
    if(animationRaf){cancelAnimationFrame(animationRaf);animationRaf=0}
    for(const child of [...objects.children]){
      objects.remove(child);
      child.traverse?.(o=>{o.userData?.temporaryMaterial?.dispose?.();o.userData?.temporaryTexture?.dispose?.()});
    }
  }
  function placeCard(mesh,x,z,y=TABLE_Y+.07,rot=0,scale=1){
    mesh.position.set(x,y,z);mesh.rotation.set(-Math.PI/2,0,rot);mesh.scale.setScalar(scale);objects.add(mesh);return mesh;
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
  function worldForCell(n,coords){
    if(!Number.isInteger(n)||n<=0)return new THREE.Vector3(-4.75,TABLE_Y+.42,3.15);
    const p=coords?.[n-1]||[4,3];return new THREE.Vector3((p[0]-4)*1.07,TABLE_Y+.42,(p[1]-3)*.87);
  }
  function startMotion(){
    if(animationRaf||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
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
      a.mesh.position.lerpVectors(p0,p1,u);a.mesh.position.y+=Math.sin(u*Math.PI)*.12;
      if(t<1)running=true;else a.mesh.position.copy(a.points.at(-1));
    }
    draw();if(running)animationRaf=requestAnimationFrame(motionFrame);
  }
  function syncGoose(payload){
    clearObjects();dropMarker.visible=false;
    const s=payload.state,coords=payload.viewData?.boardCoords||[],geese=new Set(payload.viewData?.gooseCells||[]),choices=new Set(payload.viewData?.choiceTargets||[]),choiceByTarget=new Map((payload.viewData?.gooseChoices||[]).map(x=>[x.target,x.steps])),grains=new Set(s?.gooseGrains||[]);
    const specials=payload.viewData?.specialCells||{};
    camera.position.set(0,8.7,8.25);camera.lookAt(0,.15,0);

    for(let n=1;n<=Math.min(63,coords.length);n++){
      const p=worldForCell(n,coords);let kind='normal';
      if(n===specials.goal)kind='goal';else if(n===specials.skull)kind='danger';else if(geese.has(n))kind='goose';else if(Object.values(specials).includes(n))kind='trap';
      const tile=new THREE.Mesh(tileGeometry,tileMaterial(kind,choices.has(n)));tile.position.set(p.x,TABLE_Y+.08,p.z);tile.castShadow=true;tile.receiveShadow=true;
      if(choices.has(n)&&payload.canInteract){tile.userData={kind:'goose-choice',steps:choiceByTarget.get(n),interactive:true};interactive.push(tile)}
      objects.add(tile);
      const label=cellLabel(n);label.position.set(p.x,TABLE_Y+.18,p.z);label.rotation.x=-Math.PI/2;objects.add(label);
      if(grains.has(n)){const grain=new THREE.Mesh(new THREE.SphereGeometry(.10,10,8),new THREE.MeshStandardMaterial({color:0xf2cf67,emissive:0x8b6b18,emissiveIntensity:.45}));grain.position.set(p.x+.27,TABLE_Y+.34,p.z-.16);grain.userData.temporaryMaterial=grain.material;objects.add(grain)}
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
      if(animateDice&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const h=visualHash(diceKey+'|'+i);die.rotation.set(5+h*4,7+h*5,4+h*6);diceAnimations.push({mesh:die,start:performance.now(),duration:620+i*80,rx:die.rotation.x,ry:die.rotation.y,rz:die.rotation.z})}
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
    camera.position.set(0,6.75,8.6);camera.lookAt(0,.25,.15);
    const key='yam|'+(s?.turn??0)+'|'+rolls+'|'+dice.join('-'),animate=rolls>0&&key!==lastDiceKey;if(animate)lastDiceKey=key;
    dice.forEach((value,i)=>{
      const die=rolls?dieMesh(value):blankDieMesh(),x=(i-2)*1.35,z=held[i]?.42:0;
      die.position.set(x,TABLE_Y+.78,z);die.scale.setScalar(held[i]?1.06:1);
      if(payload.canInteract&&rolls>0&&rolls<3){die.userData={kind:'yam-hold',index:i,interactive:true};interactive.push(die)}
      objects.add(die);
      if(held[i]){
        const pad=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.08,28),tileMaterial('goose',true));pad.position.set(x,TABLE_Y+.36,z);objects.add(pad);
      }
      if(animate&&!held[i]&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const h=visualHash(key+'|'+i);die.rotation.set(5+h*4,7+h*5,4+h*6);diceAnimations.push({mesh:die,start:performance.now(),duration:610+i*55,rx:die.rotation.x,ry:die.rotation.y,rz:die.rotation.z})}
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
    camera.position.set(0,6.9,8.4);camera.lookAt(0,.28,.05);
    for(let n=1;n<=9;n++){
      const isOpen=open.has(n),isSelected=selected.has(n),x=(n-5)*1.05;
      const tile=new THREE.Mesh(tileGeometry,boxTileMaterial(!isOpen,isSelected));tile.scale.set(1,.22,1.18);tile.position.set(x,TABLE_Y+(isOpen?.42:.31),-1.15);tile.rotation.x=isOpen?-.34:0;tile.castShadow=true;tile.receiveShadow=true;
      if(isOpen&&stage==='choose'&&payload.canInteract){tile.userData={kind:'box-toggle',number:n,interactive:true};interactive.push(tile)}
      objects.add(tile);const label=cellLabel(n);label.scale.set(.58,.4,1);label.position.set(x,TABLE_Y+(isOpen?.62:.39),-1.12);objects.add(label);
    }
    const key='box|'+(s?.moves??0)+'|'+dice.join('-'),animate=dice.length>0&&key!==lastDiceKey;if(animate)lastDiceKey=key;
    dice.forEach((value,i)=>{
      const die=dieMesh(value);die.position.set((i-(dice.length-1)/2)*1.1,TABLE_Y+.82,.45);objects.add(die);
      if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const h=visualHash(key+'|'+i);die.rotation.set(5+h*4,7+h*5,4+h*6);diceAnimations.push({mesh:die,start:performance.now(),duration:600+i*70,rx:die.rotation.x,ry:die.rotation.y,rz:die.rotation.z})}
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

  function syncEight(payload){
    clearObjects();dropMarker.visible=true;
    camera.position.set(0,7.25,9.25);camera.lookAt(0,.25,.2);
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

    const title=host?.querySelector('[data-table-3d-title]'),status=host?.querySelector('[data-table-3d-status]'),help=host?.querySelector('[data-table-3d-help]');
    if(title)title.textContent='VUE 3D · 8 AMÉRICAIN';
    if(status){const requested=SUIT_NAME[s.suit]||'',attack=s.pendingDraw>0?' · attaque +'+s.pendingDraw:'';status.textContent=(requested?requested+' demandé':'')+attack}
    if(help)help.textContent='Cliquez ou glissez une carte vers la défausse · cliquez la pioche pour piocher';
  }
  function syncCurrent(payload){
    if(payload?.gameId==='huit')syncEight(payload);
    else if(payload?.gameId==='oie')syncGoose(payload);
    else if(payload?.gameId==='yam')syncYam(payload);
    else if(payload?.gameId==='boite')syncBox(payload);
  }
  function render(payload){
    current=payload;if(!active)return;
    init();
    if(payload.gated){
      resizeObserver?.disconnect();resizeObserver=null;host?.remove();host=null;
      document.documentElement.removeAttribute('data-table-3d-game');return;
    }
    ensureHost();document.documentElement.dataset.table3dGame=payload.gameId||'';
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
    if(hovered&&!drag&&hovered.userData.kind==='card'){const h=hovered.userData.home;if(h)hovered.scale.copy(h.scale).multiplyScalar(1.055)}
    draw();
  }
  function onPointerDown(e){
    if(!active||!current?.canInteract)return;
    const obj=hit(e);setHover(obj);if(!obj)return;
    if(obj.userData.kind==='deck'){drag={pointerId:e.pointerId,kind:'deck',startX:e.clientX,startY:e.clientY};canvas.setPointerCapture?.(e.pointerId);return}
    if(['goose-roll','goose-choice','yam-roll','yam-hold','box-roll','box-toggle','box-close'].includes(obj.userData.kind)){
      if(obj.userData.kind==='box-close'&&obj.userData.enabled===false)return;
      drag={pointerId:e.pointerId,kind:obj.userData.kind,steps:obj.userData.steps,index:obj.userData.index,count:obj.userData.count,number:obj.userData.number,startX:e.clientX,startY:e.clientY};canvas.setPointerCapture?.(e.pointerId);return;
    }
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
    if(cancelled){syncCurrent(current);draw();return}
    const tap=Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<8;
    if(d.kind==='deck'){if(tap)current?.interactions?.draw?.();return}
    if(d.kind==='goose-roll'||d.kind==='goose-choice'){if(tap)current?.interactions?.goose?.(d.kind==='goose-roll'?'roll':'choose',d.steps);return}
    if(d.kind==='yam-roll'||d.kind==='yam-hold'){if(tap)current?.interactions?.yam?.(d.kind==='yam-hold'?'hold':'roll',d.index);return}
    if(d.kind==='box-roll'||d.kind==='box-toggle'||d.kind==='box-close'){
      if(tap)current?.interactions?.box?.(d.kind==='box-roll'?'roll':d.kind==='box-toggle'?'toggle':'close',d.kind==='box-roll'?d.count:d.number);return;
    }
    const near=d.moved&&Math.hypot(d.mesh.position.x-1.25,d.mesh.position.z-.05)<1.45;
    if(!d.moved||near){current?.interactions?.playCard?.(d.cardId);return}
    syncEight(current);draw();
  }
  function onPointerUp(e){finishDrag(e,false)}
  function onPointerCancel(e){finishDrag(e,true)}

  function activate(){active=true;init()}
  function deactivate(){
    active=false;drag=null;hovered=null;diceAnimations.length=0;pawnAnimations.length=0;
    if(animationRaf){cancelAnimationFrame(animationRaf);animationRaf=0}
    resizeObserver?.disconnect();resizeObserver=null;host?.remove();host=null;
    document.documentElement.removeAttribute('data-table-3d-game');
  }
  function destroy(){
    deactivate();clearObjects();
    canvas?.removeEventListener('pointerdown',onPointerDown);canvas?.removeEventListener('pointermove',onPointerMove);canvas?.removeEventListener('pointerup',onPointerUp);canvas?.removeEventListener('pointercancel',onPointerCancel);
    cardGeometry.dispose();tileGeometry.dispose();pawnGeometry.dispose();dieGeometry.dispose();edgeMaterial.dispose();backMaterial.dispose();for(const m of frontMaterials.values())m.dispose();for(const m of tileMaterials.values())m.dispose();for(const m of pawnMaterials.values())m.dispose();for(const m of dieFaceMaterials.values())m.dispose();for(const m of cellLabelMaterials.values())m.dispose();for(const m of boxTileMaterials.values())m.dispose();neutralDieMaterial.dispose();for(const t of disposableTextures)t.dispose();for(const t of cellLabelTextures)t.dispose();
    tableMesh?.geometry?.dispose();tableMesh?.material?.dispose();dropMarker?.geometry?.dispose();dropMarker?.material?.dispose();renderer?.dispose();
    renderer=scene=camera=canvas=null;current=null;
  }
  return{activate,render,deactivate,destroy};
}
