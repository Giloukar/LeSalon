import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=fileURLToPath(new URL('../../',import.meta.url));
const epoch=Date.UTC(2026,8,27,12);

async function table(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.TABLE_BROWSER_EXECUTABLE});
 const context=await browser.newContext();
 const page=await context.newPage();
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='http://table.test')return route.fulfill({status:200,contentType:'text/javascript',body:''});
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root))return route.abort();
  try{
   const body=await readFile(file),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
   await route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body});
  }catch{await route.fulfill({status:404,body:''})}
 });
 await page.addInitScript(({epoch})=>{
  const c=window.__test={now:epoch,seed:123456789,random:0,packets:[],timers:new Map(),next:1};
  const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[c.now]))}static now(){return c.now}};
  Math.random=()=>{c.random++;c.seed=(Math.imul(c.seed,1664525)+1013904223)>>>0;return c.seed/4294967296};
  localStorage.setItem('table.v3.prefs',JSON.stringify({sound:false,motion:false,immersive:true,fast:false,light:false}));
 },{epoch});
 await page.goto('http://table.test/jeux.html');
 await page.evaluate(()=>{__test.connection=()=>({open:true,send:p=>__test.packets.push(JSON.parse(JSON.stringify(p))),close(){}})});
 return{browser,page};
}

async function setup(page,id='huit'){
 await page.evaluate(id=>{
  net=freshNetwork();prefs.motion=false;prefs.sound=false;prefs.fast=false;prefs.immersive=true;applyPrefs();
  S=createGame(id,{mode:'online',names:['A','B','C'],timeControl:{enabled:false,initial:120,bonus:10,drawBonus:10}});
  view='game';gate=false;busy=false;selection.clear();showSuit=null;
  net.active=true;net.role='host';net.me=0;net.connected=true;net.started=true;net.status='playing';net.matchId='test';net.revision=1;net.state=S;
  net.seats=S.players.map(p=>({name:p.name,lastSeq:0,conn:__test.connection()}));net.conn=__test.connection();S=projectGame(net.state,0);renderGame(false);
 },id);
}

const clean=page=>page.evaluate(()=>({state:JSON.parse(JSON.stringify(S)),random:__test.random,packets:JSON.parse(JSON.stringify(__test.packets))}));

test('deterministic 2D/3D shell preserves state and supports full and embedded presentation',async()=>{
 const {browser,page}=await table();
 try{
  await setup(page,'huit');
  await page.evaluate(()=>{
   const original=window.matchMedia;window.__tableOriginalMatchMedia=original;
   window.matchMedia=query=>query==='(pointer: fine)'?{matches:false,addEventListener(){},removeEventListener(){}}:original(query);
   SalonTableView.register('3d',{available:()=>document.documentElement.dataset.table3dSupported==='yes',render(){}});renderGame(false);
  });
  assert.equal(await page.locator('.table-view-switch').count(),1);
  assert.equal(await page.locator('.table-view-switch button').count(),1);
  const before=await clean(page);
  await page.click('[data-table-view-mode="3d"]');
  await page.waitForFunction(()=>SalonTableView.getMode()==='3d');
  assert.deepEqual(await clean(page),before);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.table3dPresentation),'full');
  const hidden=await page.evaluate(()=>({board:getComputedStyle(document.querySelector('.scene-surface')).display,hand:getComputedStyle(document.querySelector('.hand-panel')).display}));
  assert.deepEqual(hidden,{board:'none',hand:'none'});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('salon:table-3d-window',{detail:{mode:'embedded'}})));
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.table3dPresentation),'embedded');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('salon:table-3d-window',{detail:{mode:'full'}})));
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.table3dPresentation),'full');
  await page.click('[data-table-view-mode="2d"]');
  await page.waitForFunction(()=>SalonTableView.getMode()==='2d');
  assert.deepEqual(await clean(page),before);
  assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-table3d-presentation')),false);
  const restored=await page.evaluate(()=>({board:getComputedStyle(document.querySelector('.scene-surface')).display,hand:getComputedStyle(document.querySelector('.hand-panel')).display}));
  assert.notEqual(restored.board,'none');assert.notEqual(restored.hand,'none');
  for(const id of ['oie','yam','boite','cactus','rummikub','president','menteur','suites','plis','encheres','pouilleux','quatrevingtdixneuf','vingtetun','bataille','metropole','echo','ballon','anagrammes','intrus','code','golf']){
   await setup(page,id);assert.equal(await page.locator('.table-view-switch').count(),1,id);assert.equal(await page.locator('.table-view-switch button').count(),1,id);
  }
  await page.evaluate(()=>{window.matchMedia=window.__tableOriginalMatchMedia;delete window.__tableOriginalMatchMedia});
 }finally{await browser.close()}
});
