import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
const threeRoot=path.dirname(fileURLToPath(import.meta.resolve('three')));
const threeURL='https://cdn.jsdelivr.net/npm/three@0.169.0/+esm';
test('54 distinct faces, rounded physical mesh, exported GLB and live renderer', {timeout:120000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TABLE_BROWSER_EXECUTABLE,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1060}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const u=new URL(route.request().url());let file;
 if(u.href===threeURL)file=path.join(threeRoot,'three.module.js');
 else if(u.pathname==='/exporter.js'){const body=(await readFile(path.join(threeRoot,'../examples/jsm/exporters/GLTFExporter.js'),'utf8')).replace("from 'three'",`from '${threeURL}'`);return route.fulfill({contentType:'text/javascript',body})}
 else if(u.pathname==='/utils/TextureUtils.js'){const body=(await readFile(path.join(threeRoot,'../examples/jsm/utils/TextureUtils.js'),'utf8')).replace("from 'three'",`from '${threeURL}'`);return route.fulfill({contentType:'text/javascript',body})}
 else if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#182630"><div id="gallery" style="display:grid;grid-template-columns:repeat(11,1fr);gap:12px;padding:18px"></div><div id="stage"></div></body>'});
 else if(u.origin==='http://cards.test')file=path.resolve(root,'.'+u.pathname);
 if(!file)return route.fulfill({contentType:'text/javascript',body:''});
 try{return route.fulfill({contentType:{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[path.extname(file)]||'application/octet-stream',body:await readFile(file)})}catch{return route.fulfill({status:404,body:''})}
 });
 await page.goto('http://cards.test/fixture');
 const info=await page.evaluate(async threeURL=>{
 const THREE=await import(threeURL),art=await import('/shared/playing-card.js');window.cardArt=art;window.THREE=THREE;
 window.outputs=[];
 for(const card of [...art.DECK,null]){const c=document.createElement('canvas');c.width=630;c.height=920;c.style='width:100%;border-radius:8px;box-shadow:0 4px 9px #0005';const g=c.getContext('2d');if(card)art.drawCardFace(g,c.width,c.height,card);else art.drawCardBack(g,c.width,c.height);gallery.append(c);outputs.push({key:card?art.cardKey(card):'back',png:c.toDataURL()})}
 const geo=art.createCardGeometry(THREE);window.geo=geo;
 return{count:art.DECK.length,keys:art.DECK.map(art.cardKey),images:outputs.map(o=>o.png),bounds:geo.boundingBox.getSize(new THREE.Vector3()).toArray(),triangles:geo.index.count/3,groups:geo.groups,normals:[...geo.attributes.normal.array].every(Number.isFinite)};
 },threeURL);
 assert.equal(info.count,54);assert.equal(new Set(info.keys).size,54);assert.equal(new Set(info.images).size,55);assert.ok(info.normals);assert.ok(info.triangles<1000);assert.ok(Math.abs(info.bounds[2]-.0068)<1e-7);assert.deepEqual(info.groups.map(g=>g.materialIndex),[0,4,5]);
 if(process.env.CARD_EXPORT){
 const dest=path.join(root,'assets/3d/cards');await mkdir(dest,{recursive:true});
 const outputs=await page.evaluate(()=>window.outputs);for(const o of outputs)await writeFile(path.join(dest,o.key+'.png'),Buffer.from(o.png.split(',')[1],'base64'));
 await page.screenshot({path:path.join(dest,'deck-preview.png')});
 const base64=await page.evaluate(async()=>{
 const {GLTFExporter}=await import('/exporter.js'),{THREE,geo}=window;
 const tex=i=>{const t=new THREE.CanvasTexture(gallery.children[i]);t.colorSpace=THREE.SRGBColorSpace;return t};
 const edge=new THREE.MeshStandardMaterial({name:'salon-card-edge',color:'#e9e2d1',roughness:.72});
 const front=new THREE.MeshStandardMaterial({name:'salon-card-front',map:tex(0),roughness:.48});
 const back=new THREE.MeshStandardMaterial({name:'salon-card-back',map:tex(54),roughness:.48});
 window.model=new THREE.Mesh(geo,[edge,edge,edge,edge,front,back]);model.name='LeSalon_Poker_Card';model.userData={physicalSizeMillimeters:[63,92,.35],artwork:'Original Le Salon 54-card deck',frontAxis:'+Z'};
 const bytes=await new GLTFExporter().parseAsync(model,{binary:true});return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob([bytes]))});
 });await writeFile(path.join(dest,'LeSalon_Card.glb'),Buffer.from(base64,'base64'));
 }
 // Render actual site games with the new asset. Fail on import, shader or runtime errors.
 await page.goto('http://cards.test/jeux.html');
 await page.evaluate(()=>{prefs.motion=false;prefs.sound=false;S=createGame('huit',{mode:'solo',names:['Mathis','Adversaire'],timeControl:{enabled:false}});view='game';gate=false;busy=false;renderGame(false)});
 await page.evaluate(()=>SalonTableView.setMode('3d',{persistPreference:false}));
 await page.waitForSelector('canvas');
 await page.waitForTimeout(700);
 if(process.env.CARD_EXPORT)await page.screenshot({path:path.join(root,'assets/3d/cards/table-preview.png')});
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(200);
 assert.ok(await page.locator('.table3d-canvas, canvas').count()>0);
 await page.evaluate(()=>SalonTableView.setMode('2d',{persistPreference:false}));
 await page.evaluate(()=>SalonTableView.setMode('3d',{persistPreference:false}));
 await page.waitForTimeout(200);
 assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
