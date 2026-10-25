import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
const threeRoot=path.dirname(fileURLToPath(import.meta.resolve('three')));
const threeURL='https://cdn.jsdelivr.net/npm/three@0.169.0/+esm';
test('physical pieces: dice values, shared resources, exports and live game rendering', {timeout:120000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TABLE_BROWSER_EXECUTABLE,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1060}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const u=new URL(route.request().url());let file;
 if(u.href===threeURL)file=path.join(threeRoot,'three.module.js');
 else if(u.pathname==='/exporter.js'){const body=(await readFile(path.join(threeRoot,'../examples/jsm/exporters/GLTFExporter.js'),'utf8')).replace("from 'three'",`from '${threeURL}'`);return route.fulfill({contentType:'text/javascript',body})}
 else if(u.pathname==='/utils/TextureUtils.js'){const body=(await readFile(path.join(threeRoot,'../examples/jsm/utils/TextureUtils.js'),'utf8')).replace("from 'three'",`from '${threeURL}'`);return route.fulfill({contentType:'text/javascript',body})}
 else if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#182630"><div id="gallery" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:18px"></div><div id="stage"></div></body>'});
 else if(u.origin==='http://cards.test')file=path.resolve(root,'.'+u.pathname);
 if(!file)return route.fulfill({contentType:'text/javascript',body:''});
 try{
  let body=await readFile(file);
  if(u.pathname==='/shared/table-3d.js'){
   const source=body.toString('utf8'),marker='  function setHover(mesh){';
   if(!source.includes(marker))throw Error('3D touch probe insertion point missing');
   body=source.replace(marker,`  window.__salonTouchProbe={
    targets:()=>interactive.filter(o=>o.userData?.cardId).map(o=>{
      const center=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).project(camera),r=canvas.getBoundingClientRect();
      return{id:o.userData.cardId,kind:o.userData.kind,x:r.left+(center.x+1)*r.width/2,y:r.top+(1-center.y)*r.height/2};
    }),
    hitAt:(x,y,pointerType)=>{const o=hit({clientX:x,clientY:y,pointerType});return o?{id:o.userData.cardId||null,kind:o.userData.kind}:null}
   };
`+marker);
  }
  return route.fulfill({contentType:{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[path.extname(file)]||'application/octet-stream',body});
 }catch{return route.fulfill({status:404,body:''})}
 });
 await page.goto('http://cards.test/fixture');
 const info=await page.evaluate(async threeURL=>{
 const THREE=await import(threeURL),{createPieceKit,PIECE_KINDS}=await import('/shared/table-3d-pieces.js');
 const kit=createPieceKit(THREE);window.kit=kit;window.models=[];window.THREE=THREE;
 const results=[];
 for(let value=1;value<=6;value++){const die=kit.create('die',{value}),f=die.userData.faceValues;results.push({top:f[2],unique:new Set(f).size,pairs:[f[0]+f[1],f[2]+f[3],f[4]+f[5]]})}
 const blank=kit.create('die',{blank:true}).userData.faceValues;
 const shared=kit.create('pawn',{}).children[0].geometry===kit.create('pawn',{}).children[0].geometry;
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(420,360);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 const all=[];
 for(const kind of PIECE_KINDS){
 const model=kit.create(kind,{value:5,color:'#be5544',radius:.4,scale:1});models.push({kind,model});
 const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 let triangles=0;model.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;if(!Array.from(o.geometry.attributes.position.array).every(Number.isFinite))throw Error('Non-finite geometry')}});all.push({kind,triangles,size:size.toArray()});
 const scene=new THREE.Scene();scene.background=new THREE.Color('#17272d');const camera=new THREE.PerspectiveCamera(32,420/360,.01,100);camera.position.set(2.6,2.1,3.2);camera.lookAt(0,0,0);
 scene.add(new THREE.HemisphereLight('#eaf4ff','#514133',2));const light=new THREE.DirectionalLight('#fff1dc',3);light.position.set(3,4,4);scene.add(light);const rim=new THREE.DirectionalLight('#bad5ff',2);rim.position.set(-3,1,-2);scene.add(rim);
 const wrapper=new THREE.Group(),copy=model.clone(true);copy.position.sub(center);wrapper.add(copy);wrapper.scale.setScalar(1.5/Math.max(size.x,size.y,size.z));scene.add(wrapper);renderer.render(scene,camera);
 const item=document.createElement('div');item.style='background:#17272d;border:1px solid #8d7850;border-radius:12px;padding:8px;color:#eee;font:16px Georgia;text-align:center';const img=new Image();img.src=renderer.domElement.toDataURL();img.style='width:100%';item.append(img);item.append(document.createTextNode(kind));gallery.append(item);
 }
 renderer.dispose();return{results,blank,shared,all,stats:kit.stats()};
 },threeURL);
 for(const [i,r] of info.results.entries()){assert.equal(r.top,i+1);assert.equal(r.unique,6);assert.deepEqual(r.pairs,[7,7,7])}assert.deepEqual(info.blank,[0,0,0,0,0,0]);assert.ok(info.shared);assert.equal(info.all.length,10);for(const r of info.all){assert.ok(r.triangles>0&&r.triangles<25000,r.kind);assert.ok(r.size.every(v=>v>0&&Number.isFinite(v)),r.kind)}
 if(process.env.PIECE_EXPORT){
 const dest=path.join(root,'assets/3d/pieces');await mkdir(dest,{recursive:true});await page.screenshot({path:path.join(dest,'pieces-preview.png')});
 const exports=await page.evaluate(async()=>{const {GLTFExporter}=await import('/exporter.js');const out=[];for(const {kind,model} of models){const b=await new GLTFExporter().parseAsync(model,{binary:true});const data=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob([b]))});out.push({kind,data})}return out});
 for(const o of exports)await writeFile(path.join(dest,o.kind+'.glb'),Buffer.from(o.data,'base64'));
 }
 await page.goto('http://cards.test/jeux.html');
 for(const id of ['yam','oie','rummikub','metropole','code','golf','ballon']){
 await page.evaluate(async id=>{await SalonTableView.setMode('2d',{persistPreference:false});prefs.motion=false;prefs.sound=false;S=createGame(id,{mode:'solo',names:['Mathis','Adversaire'],timeControl:{enabled:false}});view='game';gate=false;busy=false;renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false})},id);
 await page.waitForTimeout(100);
 }
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
 // A backgrounded mobile browser must release a camera gesture so touches work on resume.
 for(const id of ['huit','cactus']){
  await page.evaluate(async gameId=>{
   await SalonTableView.setMode('2d',{persistPreference:false});
   S=createGame(gameId,{mode:'solo',names:['Joueur','Adversaire'],timeControl:{enabled:false}});
   view='game';gate=false;busy=false;renderGame(false);
   const entered=await SalonTableView.setMode('3d',{persistPreference:false});
   if(!entered.ok)throw Error('Cannot open 3D for '+gameId+': '+entered.reason);
   table3dSetPresentation('full');
  },id);
  await page.waitForTimeout(150);
  const touch=await page.evaluate(()=>{
   const host=document.querySelector('.table-3d-host'),canvas=host?.querySelector('canvas');
   if(!host||!canvas)throw Error('Missing interactive 3D canvas');
   const rect=canvas.getBoundingClientRect(),x=rect.left+8,y=rect.top+8,before=JSON.stringify(S);
   const pointer=(type,id)=>new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerdown'?1:0,clientX:x,clientY:y});
   canvas.dispatchEvent(pointer('pointerdown',501));
   const started=host.classList.contains('is-camera-dragging');
   const original=Object.getOwnPropertyDescriptor(document,'hidden');let cleared=false,recovered=false;
   try{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
    cleared=!host.classList.contains('is-camera-dragging');
   }finally{
    if(original)Object.defineProperty(document,'hidden',original);else delete document.hidden;
   }
   canvas.dispatchEvent(pointer('pointerdown',502));
   recovered=host.classList.contains('is-camera-dragging');
   canvas.dispatchEvent(pointer('pointercancel',502));
   return{started,cleared,recovered,unchanged:JSON.stringify(S)===before,stopped:!host.classList.contains('is-camera-dragging')};
  });
  assert.deepEqual(touch,{started:true,cleared:true,recovered:true,unchanged:true,stopped:true},'mobile 3D touch recovery for '+id);
  // Inspect the actual Three.js raycaster; find a neighboring pixel where mouse misses but touch selects.
  const tolerance=await page.evaluate(()=>{
   const probe=window.__salonTouchProbe,canvas=document.querySelector('.table-3d-host canvas'),r=canvas.getBoundingClientRect();
   if(!probe||!canvas)throw Error('Missing 3D hit probe');
   const projected=probe.targets(),targets=projected.filter(t=>t.x>r.left+24&&t.x<r.right-24&&t.y>r.top+24&&t.y<r.bottom-24);
   let candidate=null;
   for(const t of targets){
    for(const radius of [12,16,20,24,28,32]){
     for(const [dx,dy] of [[radius,0],[-radius,0],[0,radius],[0,-radius],[radius,radius],[-radius,-radius]]){
      const x=t.x+dx,y=t.y+dy;
      const mouse=probe.hitAt(x,y,'mouse'),finger=probe.hitAt(x,y,'touch');
      if(!mouse&&finger?.id===t.id){candidate={x,y,id:t.id};break}
     }
     if(candidate)break;
    }
    if(candidate)break;
   }
   if(!candidate)return{found:false,targets:targets.length,all:projected.slice(0,8),rect:{left:r.left,top:r.top,width:r.width,height:r.height},view:document.documentElement.dataset.tableView,presentation:document.documentElement.dataset.table3dPresentation};
   const original=JSON.stringify(S),events=[];
   const pointer=(type)=>new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:622,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerdown'?1:0,clientX:candidate.x,clientY:candidate.y});
   window.addEventListener('salon:local-card-gesture',e=>events.push(e.detail?.phase),{once:true});
   canvas.dispatchEvent(pointer('pointerdown'));
   const selected=document.querySelector('.table-3d-host')?.classList.contains('is-dragging')||false;
   canvas.dispatchEvent(pointer('pointercancel'));
   return{found:true,selected,unchanged:JSON.stringify(S)===original,id:candidate.id,events};
  });
  assert.equal(tolerance.found,true,'find a small near-miss touch target for '+id+' ('+JSON.stringify(tolerance)+')');
  assert.equal(tolerance.selected,true,'touch margin activates its real 3D card for '+id);
  assert.equal(tolerance.unchanged,true,'touch-and-cancel must not alter rules for '+id);
  
 }
 // In portrait fullscreen, the hint must not overlap a tall action tray or the top controls.
 for(const width of [320,390]){
  await page.setViewportSize({width,height:width===320?640:844});
  const layout=await page.evaluate(()=>{
   if(S?.id!=='cactus')throw Error('Expected Cactus 3D during portrait layout assertion');
   table3dSetPresentation('full');
   const host=document.querySelector('.table-3d-host'),help=host?.querySelector('.table-3d-help'),controls=host?.querySelector('.table-3d-window-controls'),tray=document.querySelector('#game-actions');
   if(!host||!help||!controls||!tray)throw Error('Missing 3D portrait UI elements');
   const oldHeight=tray.style.minHeight;tray.style.minHeight='160px';
   const h=help.getBoundingClientRect(),c=controls.getBoundingClientRect(),a=tray.getBoundingClientRect(),viewHeight=innerHeight;
   tray.style.minHeight=oldHeight;
   return{helpVisible:h.width>0&&h.height>0,underControls:h.top>=c.bottom+4,aboveTray:h.bottom<a.top-4,inViewport:h.top>=0&&h.bottom<=viewHeight,fullscreen:document.documentElement.dataset.table3dPresentation==='full'};
  });
  assert.deepEqual(layout,{helpVisible:true,underControls:true,aboveTray:true,inViewport:true,fullscreen:true},'3D portrait overlay layout at '+width+'px');
 }
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
