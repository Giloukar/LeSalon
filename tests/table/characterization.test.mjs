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
 const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='http://table.test')return route.fulfill({status:200,contentType:'text/javascript',body:''});const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root))return route.abort();try{const body=await readFile(file);const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};await route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body});}catch{await route.fulfill({status:404,body:''});}});
 await page.addInitScript(({epoch})=>{const c=window.__test={now:epoch,seed:123456789,random:0,packets:[],timers:new Map(),next:1};const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[c.now]));}static now(){return c.now;}};Math.random=()=>{c.random++;c.seed=(Math.imul(c.seed,1664525)+1013904223)>>>0;return c.seed/4294967296;};const add=(kind,fn,delay=0)=>{const id=c.next++;c.timers.set(id,{kind,fn,delay:Number(delay),due:c.now+Number(delay)});return id;};window.setTimeout=(fn,d)=>add('timeout',fn,d);window.setInterval=(fn,d)=>add('interval',fn,d);window.clearTimeout=window.clearInterval=id=>c.timers.delete(id);window.requestAnimationFrame=fn=>add('frame',fn,16);window.cancelAnimationFrame=id=>c.timers.delete(id);c.advance=ms=>{c.now+=ms;};c.reset=()=>{c.now=epoch;c.seed=123456789;c.random=0;c.packets.length=0;};localStorage.setItem('table.v3.prefs',JSON.stringify({sound:false,motion:false,immersive:true,fast:false,light:false}));},{epoch});
 await page.goto('http://table.test/jeux.html');await page.evaluate(()=>{if(typeof houseEightAct!=='function'||typeof legacyCactusQuickUI!=='function')throw Error('final overrides missing');__test.connection=()=>({open:true,send:p=>__test.packets.push(JSON.parse(JSON.stringify(p))),close(){}});});return{browser,page,errors};}
const clone=v=>JSON.parse(JSON.stringify(v));
async function setup(page,id='huit',mode='solo',timed=false){return page.evaluate(({id,mode,timed})=>{__test.reset();net=freshNetwork();prefs.motion=false;prefs.sound=false;prefs.fast=false;prefs.immersive=true;applyPrefs();S=createGame(id,{mode,names:['A','B','C'],timeControl:{enabled:timed,initial:120,bonus:10,drawBonus:10}});view='game';gate=false;busy=false;selection.clear();showSuit=null;if(mode==='online'){net.active=true;net.role='host';net.me=0;net.connected=true;net.started=true;net.status='playing';net.matchId='test';net.revision=1;net.state=S;net.seats=S.players.map(p=>({name:p.name,lastSeq:0,conn:__test.connection()}));net.conn=__test.connection();S=projectGame(net.state,0);}renderGame(false);return Object.keys(GAMES);},{id,mode,timed});}
async function clean(page){return page.evaluate(()=>({state:clone(S),random:__test.random,packets:clone(__test.packets)}));}
let browser;
test('22 final game definitions survive repeated 2D refreshes',async()=>{const t=await table();browser=t.browser;try{const games=await setup(t.page);assert.equal(games.length,22);for(const id of games){await setup(t.page,id);const before=await clean(t.page);await t.page.evaluate(()=>{for(let i=0;i<5;i++)renderGame(false);});assert.deepEqual(await clean(t.page),before,id);}assert.deepEqual(t.errors,[]);}finally{await browser.close();}});
test('2D card hands always use the grid layout with no fan toggle',async()=>{const t=await table();browser=t.browser;try{for(const id of ['huit','president','menteur','pouilleux']){await setup(t.page,id,'solo');const r=await t.page.evaluate(()=>{renderGame(false);const rack=document.querySelector('.card-rack'),hand=rack?.querySelector('.hand');return{grid:!!rack?.classList.contains('card-grid'),fan:!!rack?.classList.contains('card-fan'),toggle:!!document.querySelector('[data-action="card-layout"]'),display:hand?getComputedStyle(hand).display:''};});assert.equal(r.grid,true,id);assert.equal(r.fan,false,id);assert.equal(r.toggle,false,id);assert.equal(r.display,'grid',id);}}finally{await browser.close();}});
test('same seed and actions are independent of extra frames',async()=>{const t=await table();browser=t.browser;try{await setup(t.page);const run=extra=>t.page.evaluate(extra=>{const trace=[];for(let i=0;i<6&&S.phase!=='over';i++){const a=ai(S);trace.push({a,ok:act(S,a)});if(extra)for(let j=0;j<3;j++)renderGame(false);}return{state:clone(S),trace,random:__test.random};},extra);const a=await run(false);await setup(t.page);const b=await run(true);assert.deepEqual(b,a);}finally{await browser.close();}});
test('render is timing-neutral while the session tick settles the clock',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','solo',true);const r=await t.page.evaluate(()=>{S.clock.running=true;S.clock.lastAt=Date.now();const before=clone(S.clock);__test.advance(4000);renderGame(false);const afterRender=clone(S.clock);timingTick();const afterTick=clone(S.clock);return{before,afterRender,afterTick};});assert.deepEqual(r.afterRender,r.before);assert.equal(r.afterRender.remaining[0]-r.afterTick.remaining[0],4000);}finally{await browser.close();}});
test('session scheduling owns the clock run-state',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','solo',true);const r=await t.page.evaluate(()=>{S.clock.running=false;S.clock.lastAt=Date.now();schedule();const afterSchedule=clone(S.clock);renderGame(false);return{afterSchedule,afterRender:clone(S.clock)};});assert.equal(r.afterSchedule.running,true);assert.deepEqual(r.afterRender,r.afterSchedule);}finally{await browser.close();}});
test('final guest handler preserves the authenticated seat index',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','online');const r=await t.page.evaluate(()=>{net.state.turn=2;const n=net.state.players[2].hand.length;handleGuestAction({seq:1,revision:1,matchId:'test',action:{type:'draw'}},2);return{drawn:net.state.players[2].hand.length-n,seq:net.seats[2].lastSeq,otherSeq:net.seats[1].lastSeq};});assert.deepEqual(r,{drawn:1,seq:1,otherSeq:0});}finally{await browser.close();}});
test('Cactus quick throw uses the authenticated guest seat even out of turn',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'cactus','online');const r=await t.page.evaluate(()=>{net.state.phase='draw';net.state.turn=0;const owner=2,index=net.state.players[owner].hand.findIndex(Boolean),card=net.state.players[owner].hand[index];net.state.discard[net.state.discard.length-1]={...net.state.discard.at(-1),rank:card.rank};const before=legacyCactusCount(net.state.players[owner]);handleGuestAction({seq:1,revision:1,matchId:'test',action:{type:'quick',index}},owner);return{removed:before-legacyCactusCount(net.state.players[owner]),owner:net.state.lastQuick?.owner,seq:net.seats[owner].lastSeq,otherSeq:net.seats[1].lastSeq,turn:net.state.turn};});assert.deepEqual(r,{removed:1,owner:2,seq:1,otherSeq:0,turn:0});}finally{await browser.close();}});
test('clock expiration uses the restored Eight rules',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','solo',true);const r=await t.page.evaluate(()=>{S.turn=0;S.phase='play';S.pendingDraw=6;S.attack='A';S.blockEight=false;S.clock.remaining[0]=0;S.clock.running=false;const before=S.players[0].hand.length;const ok=clockExpire(S,Date.now());return{ok,drawn:S.players[0].hand.length-before,pendingDraw:S.pendingDraw,attack:S.attack,turn:S.turn,reserve:S.clock.remaining[0]};});assert.equal(r.ok,true);assert.equal(r.drawn,6);assert.equal(r.pendingDraw,0);assert.equal(r.attack,null);assert.notEqual(r.turn,0);assert.equal(r.reserve,20000);}finally{await browser.close();}});
test('view controller switches renderers without touching game or network state',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','online');const before=await clean(t.page);const r=await t.page.evaluate(async()=>{const calls=[];SalonTableView.register('test3d',{activate(){calls.push('activate')},render(payload){calls.push({gameId:payload.gameId,privateIndex:payload.privateIndex,online:payload.online,stateId:payload.state?.id})},deactivate(){calls.push('deactivate')}});const switched=await SalonTableView.setMode('test3d',{persistPreference:false});renderGame(false);const mode3d=SalonTableView.getMode();const back=await SalonTableView.setMode('2d',{persistPreference:false});return{switched,back,mode3d,mode2d:SalonTableView.getMode(),calls,hasStateView:Object.hasOwn(S,'tableView')||Object.hasOwn(S,'viewMode'),hasNetView:Object.hasOwn(net,'tableView')||Object.hasOwn(net,'viewMode')};});const after=await clean(t.page);assert.equal(r.switched.ok,true);assert.equal(r.mode3d,'test3d');assert.equal(r.back.ok,true);assert.equal(r.mode2d,'2d');assert.equal(r.hasStateView,false);assert.equal(r.hasNetView,false);assert.ok(r.calls.some(x=>typeof x==='object'&&x.gameId==='huit'&&x.privateIndex===0&&x.online===true&&x.stateId==='huit'));assert.deepEqual(after,before);}finally{await browser.close();}});

test('unavailable 3D leaves the effective renderer in 2D',async()=>{const t=await table();browser=t.browser;try{await setup(t.page);const before=await clean(t.page);const r=await t.page.evaluate(async()=>{SalonTableView.register('3d',{available:()=>false});const result=await SalonTableView.setMode('3d',{persistPreference:false});return{result,mode:SalonTableView.getMode(),dataset:document.documentElement.dataset.tableView};});assert.equal(r.result.ok,false);assert.equal(r.result.reason,'unavailable');assert.equal(r.mode,'2d');assert.equal(r.dataset,'2d');assert.deepEqual(await clean(t.page),before);}finally{await browser.close();}});

test('returning to 2D cancels a late asynchronous 3D activation',async()=>{const t=await table();browser=t.browser;try{await setup(t.page);const r=await t.page.evaluate(async()=>{let release;SalonTableView.register('3d',{prepare(){return new Promise(resolve=>{release=resolve})},render(){throw Error('late 3D render must not run')}});const pending=SalonTableView.setMode('3d',{persistPreference:false});await Promise.resolve();const back=await SalonTableView.setMode('2d',{persistPreference:false});release();const first=await pending;return{first,back,mode:SalonTableView.getMode(),dataset:document.documentElement.dataset.tableView};});assert.equal(r.back.ok,true);assert.equal(r.first.ok,false);assert.equal(r.first.reason,'superseded');assert.equal(r.mode,'2d');assert.equal(r.dataset,'2d');}finally{await browser.close();}});

test('runtime 3D failure exits fullscreen and restores 2D without touching game state',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','online');const before=await clean(t.page);const r=await t.page.evaluate(async()=>{let renders=0,exits=0,fullscreen=true;Object.defineProperty(document,'fullscreenElement',{configurable:true,get(){return fullscreen?document.documentElement:null}});Object.defineProperty(document,'exitFullscreen',{configurable:true,value:()=>{exits++;fullscreen=false;return Promise.resolve()}});SalonTableView.register('3d',{available:()=>true,render(){renders++;if(renders>1)throw Error('synthetic 3D runtime failure')}});const entered=await SalonTableView.setMode('3d',{persistPreference:false});table3dSetPresentation('full');renderGame(false);await Promise.resolve();return{entered:entered.ok,mode:SalonTableView.getMode(),dataset:document.documentElement.dataset.tableView,presentation:document.documentElement.hasAttribute('data-table3d-presentation'),exits,renders};});assert.equal(r.entered,true);assert.equal(r.mode,'2d');assert.equal(r.dataset,'2d');assert.equal(r.presentation,false);assert.equal(r.exits,1);assert.equal(r.renders,2);assert.deepEqual(await clean(t.page),before);}finally{await browser.close();}});

test('mobile-style pointers avoid native fullscreen and keep CSS fullscreen available',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','solo');const r=await t.page.evaluate(()=>{const original=window.matchMedia;window.matchMedia=query=>query==='(pointer: fine)'?{matches:false,addEventListener(){},removeEventListener(){}}:original(query);const safe=table3dNativeFullscreenSafe();table3dSetPresentation('full');const presentation=document.documentElement.dataset.table3dPresentation;window.matchMedia=original;table3dSetPresentation(null);return{safe,presentation};});assert.equal(r.safe,false);assert.equal(r.presentation,'full');}finally{await browser.close();}});

test('embedded 3D window mode leaves CSS fullscreen immediately',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','solo');const r=await t.page.evaluate(async()=>{SalonTableView.register('3d',{available:()=>true,activate(){},deactivate(){},render(){}});await SalonTableView.setMode('3d',{persistPreference:false});table3dSetPresentation('full');await table3dApplyWindowMode('embedded');return{mode:SalonTableView.getMode(),presentation:document.documentElement.dataset.table3dPresentation};});assert.equal(r.mode,'3d');assert.equal(r.presentation,'embedded');}finally{await browser.close();}});

test('game over leaves fullscreen 3D before opening the finale',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','solo');const r=await t.page.evaluate(async()=>{SalonTableView.register('3d',{available:()=>true,activate(){},deactivate(){document.documentElement.dataset.test3dDeactivated='yes'},render(){}});await SalonTableView.setMode('3d',{persistPreference:false});table3dSetPresentation('full');S.phase='over';S.winners=[0];S.finishedAt=123456;renderGame(false);celebrate();const dialog=document.querySelector('#finale-dialog');const out={mode:SalonTableView.getMode(),dataset:document.documentElement.dataset.tableView,presentation:document.documentElement.hasAttribute('data-table3d-presentation'),deactivated:document.documentElement.dataset.test3dDeactivated,dialogOpen:!!dialog?.open,hasWin:!!document.querySelector('.win-box')};if(dialog?.open)dialog.close();dialog?.remove();return out;});assert.equal(r.mode,'2d');assert.equal(r.dataset,'2d');assert.equal(r.presentation,false);assert.equal(r.deactivated,'yes');assert.equal(r.dialogOpen,true);assert.equal(r.hasWin,true);}finally{await browser.close();}});


test('3D game over crossfades into the finale when view transitions are available',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','solo');const r=await t.page.evaluate(async()=>{SalonTableView.register('3d',{available:()=>true,render(){}});await SalonTableView.setMode('3d',{persistPreference:false});table3dSetPresentation('full');S.phase='over';S.winners=[0];S.finishedAt=123456;prefs.motion=true;let starts=0;Object.defineProperty(document,'startViewTransition',{configurable:true,value:update=>{starts++;const updateCallbackDone=Promise.resolve().then(update),finished=updateCallbackDone.then(()=>undefined);return{ready:Promise.resolve(),updateCallbackDone,finished,skipTransition(){}}}});const transition=celebrate();await transition.updateCallbackDone;await transition.finished;const dialog=document.querySelector('#finale-dialog'),out={starts,mode:SalonTableView.getMode(),dataset:document.documentElement.dataset.tableView,presentation:document.documentElement.hasAttribute('data-table3d-presentation'),dialogOpen:!!dialog?.open,transitionAttr:document.documentElement.hasAttribute('data-table-finale-transition')};if(dialog?.open)dialog.close();dialog?.remove();prefs.motion=false;return out;});assert.equal(r.starts,1);assert.equal(r.mode,'2d');assert.equal(r.dataset,'2d');assert.equal(r.presentation,false);assert.equal(r.dialogOpen,true);assert.equal(r.transitionAttr,false);}finally{await browser.close();}});

test('supported games expose one exclusive 2D/3D return button and fullscreen-first shell without mutating online state',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','online');await t.page.evaluate(()=>{SalonTableView.register('3d',{available:()=>document.documentElement.dataset.table3dSupported==='yes',render(){}});renderGame(false);});assert.equal(await t.page.locator('.table-view-switch').count(),1);assert.equal(await t.page.locator('.table-view-switch button').count(),1);assert.equal((await t.page.locator('.table-view-switch button').textContent())?.trim(),'3D');const before=await clean(t.page);await t.page.click('[data-table-view-mode="3d"]');await t.page.waitForFunction(()=>SalonTableView.getMode()==='3d');assert.deepEqual(await clean(t.page),before);assert.equal(await t.page.evaluate(()=>document.documentElement.dataset.table3dPresentation),'full');assert.equal((await t.page.locator('.table-view-switch button').textContent())?.trim(),'2D');const hidden=await t.page.evaluate(()=>({board:getComputedStyle(document.querySelector('.scene-surface')).display,hand:getComputedStyle(document.querySelector('.hand-panel')).display}));assert.equal(hidden.board,'none');assert.equal(hidden.hand,'none');await t.page.evaluate(()=>window.dispatchEvent(new CustomEvent('salon:table-3d-window',{detail:{mode:'embedded'}})));assert.equal(await t.page.evaluate(()=>document.documentElement.dataset.table3dPresentation),'embedded');await t.page.evaluate(()=>window.dispatchEvent(new CustomEvent('salon:table-3d-window',{detail:{mode:'full'}})));assert.equal(await t.page.evaluate(()=>document.documentElement.dataset.table3dPresentation),'full');await t.page.click('[data-table-view-mode="2d"]');await t.page.waitForFunction(()=>SalonTableView.getMode()==='2d');assert.deepEqual(await clean(t.page),before);assert.equal(await t.page.evaluate(()=>document.documentElement.hasAttribute('data-table3d-presentation')),false);assert.equal(await t.page.evaluate(()=>document.documentElement.dataset.tableView),'2d');assert.equal((await t.page.locator('.table-view-switch button').textContent())?.trim(),'3D');const restored=await t.page.evaluate(()=>({board:getComputedStyle(document.querySelector('.scene-surface')).display,hand:getComputedStyle(document.querySelector('.hand-panel')).display}));assert.notEqual(restored.board,'none');assert.notEqual(restored.hand,'none');for(const id of ['oie','yam','boite','cactus','rummikub','president','menteur','suites','plis','encheres','pouilleux','quatrevingtdixneuf','vingtetun','bataille','metropole','echo','ballon','anagrammes','intrus','code','golf']){await setup(t.page,id,'online');assert.equal(await t.page.locator('.table-view-switch').count(),1,id);assert.equal(await t.page.locator('.table-view-switch button').count(),1,id);}}finally{await browser.close();}});

test('privacy gate withholds state from an active 3D renderer',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','local');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen={state:payload.state,gated:payload.gated,canInteract:payload.canInteract}}});await SalonTableView.setMode('3d',{persistPreference:false});gate=true;seen=null;renderGame(false);return{seen,mode:SalonTableView.getMode()};});assert.equal(r.mode,'3d');assert.equal(r.seen.gated,true);assert.equal(r.seen.canInteract,false);assert.equal(r.seen.state,null);}finally{await browser.close();}});

test('3D interaction payload pauses while Eight waits for a suit choice',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','solo');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen={canInteract:payload.canInteract,playable:[...payload.viewData.playableIds]}}});await SalonTableView.setMode('3d',{persistPreference:false});showSuit='synthetic-choice';renderGame(false);return seen;});assert.equal(r.canInteract,false);assert.deepEqual(r.playable,[]);}finally{await browser.close();}});

test('Eight touch drag to discard opens the suit choice and always cleans its ghost',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','solo');const r=await t.page.evaluate(()=>{S.turn=0;S.phase='play';S.pendingDraw=0;S.attack=null;S.blockEight=false;S.suit='C';S.discard=[{id:'touch-top',suit:'C',rank:9}];S.players[0].hand=[{id:'touch-eight',suit:'H',rank:8},{id:'touch-four',suit:'C',rank:4}];showSuit=null;renderGame(false);const card=document.querySelector('[data-eight-card="1"][data-id="touch-eight"]'),drop=document.querySelector('[data-eight-drop="1"]');if(!card||!drop)throw Error('Eight drag fixtures missing');const a=card.getBoundingClientRect(),b=drop.getBoundingClientRect(),start={x:a.left+a.width/2,y:a.top+a.height/2},end={x:b.left+b.width/2,y:b.top+b.height/2},event=(type,x,y)=>new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:77,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y});card.dispatchEvent(event('pointerdown',start.x,start.y));document.dispatchEvent(event('pointermove',end.x,end.y));const during={ghost:document.querySelectorAll('.eight-drag-ghost').length,source:document.querySelectorAll('.eight-drag-source').length,hot:document.querySelector('[data-eight-drop="1"]')?.classList.contains('eight-drop-hot')};document.dispatchEvent(event('pointerup',end.x,end.y));return{during,showSuit,ghost:document.querySelectorAll('.eight-drag-ghost').length,source:document.querySelectorAll('.eight-drag-source').length,hot:document.querySelector('[data-eight-drop="1"]')?.classList.contains('eight-drop-hot')||false};});assert.deepEqual(r.during,{ghost:1,source:1,hot:true});assert.equal(r.showSuit,'touch-eight');assert.equal(r.ghost,0);assert.equal(r.source,0);assert.equal(r.hot,false);}finally{await browser.close();}});

test('Goose exposes engine-derived destinations to the 3D renderer',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'oie','solo');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen={gameId:payload.gameId,coords:payload.viewData.boardCoords.length,geese:[...payload.viewData.gooseCells],choices:payload.viewData.gooseChoices.map(x=>({...x}))}}});S.goosePending={i:S.turn,dice:[2,5],rerolls:0};S.dice=[2,5];const expected=[2,5,7].map(steps=>({steps,target:legacyGooseTarget(player(S).pos,steps)}));renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});return{seen,expected,switches:document.querySelectorAll('.table-view-switch').length};});assert.equal(r.seen.gameId,'oie');assert.equal(r.seen.coords,63);assert.deepEqual(r.seen.choices,r.expected);assert.equal(r.switches,1);}finally{await browser.close();}});

test('Three.js table renderer never draws gameplay randomness',async()=>{const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');assert.equal(source.includes('Math.random'),false);assert.match(source,/Array\.isArray\(s\?\.dice\).*s\.dice/);});

test('Yam exposes engine-owned dice and held state to the 3D renderer',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'yam','solo');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen={dice:[...payload.viewData.yamDice],held:[...payload.viewData.yamHeld],rolls:payload.viewData.yamRolls,turn:payload.viewData.yamTurn,interactions:payload.interactions}}});S.dice=[6,2,6,4,1];S.held=[true,false,true,false,false];S.rolls=2;renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const initial={dice:[...seen.dice],held:[...seen.held],rolls:seen.rolls,turn:seen.turn},before=clone(S),action=seen.interactions.yam;action('hold',1);return{seen:initial,before,after:clone(S)};});assert.deepEqual(r.seen.dice,[6,2,6,4,1]);assert.deepEqual(r.seen.held,[true,false,true,false,false]);assert.equal(r.seen.rolls,2);assert.equal(r.after.held[1],true);assert.equal(r.after.moves,r.before.moves+1);assert.deepEqual(r.after.dice,r.before.dice);assert.equal(r.after.rolls,r.before.rolls);assert.equal(r.after.turn,r.before.turn);assert.equal(r.after.players[0].score,r.before.players[0].score);}finally{await browser.close();}});

test('Yam and Métropole expose direct physical dice controls without bypassing engine actions',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/const kind=rolls===0\?'yam-roll':'yam-hold'/);
 assert.match(source,/kind,index:i,interactive:true,home:\{scale:die\.scale\.clone\(\)\}/);
 assert.match(source,/payload\.canInteract&&data\.canRoll/);
 assert.match(source,/kind:'city-roll',interactive:true,home:\{scale:die\.scale\.clone\(\)\}/);
 assert.match(source,/kind:'goose-roll',interactive:true,home:\{scale:die\.scale\.clone\(\)\}/);
 assert.match(source,/current\?\.interactions\?\.yam\?\.\(d\.kind==='yam-hold'\?'hold':'roll'/);
 assert.match(source,/current\?\.interactions\?\.city\?\.\('roll'\)/);
 assert.match(source,/current\?\.interactions\?\.goose\?\.\(d\.kind==='goose-roll'\?'roll':'choose'/);
 assert.match(source,/const interactiveHover=!!hovered\?\.userData\?\.interactive/);
 assert.doesNotMatch(source,/kind==='yam-roll'[^\n]*Math\.random/);
 assert.doesNotMatch(source,/kind==='city-roll'[^\n]*Math\.random/);
});

test('Shut the Box exposes open tiles, dice and local selection to 3D',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'boite','solo');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen={dice:[...payload.viewData.boxDice],numbers:[...payload.viewData.boxNumbers],selected:[...payload.viewData.boxSelected],stage:payload.viewData.boxStage,canOne:payload.viewData.boxCanOne,interactions:payload.interactions}}});S.boxDice=[3,4];S.boxNumbers=[1,2,3,4,5,6];S.boxStage='choose';selection.clear();renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const stateBefore=clone(S);seen.interactions.box('toggle',3);const stateAfter=clone(S);return{first:{dice:seen.dice,numbers:seen.numbers,stage:seen.stage,canOne:seen.canOne},selected:[...selection].map(Number),stateBefore,stateAfter};});assert.deepEqual(r.first.dice,[3,4]);assert.deepEqual(r.first.numbers,[1,2,3,4,5,6]);assert.equal(r.first.stage,'choose');assert.equal(r.first.canOne,true);assert.deepEqual(r.selected,[3]);assert.deepEqual(r.stateAfter,r.stateBefore);}finally{await browser.close();}});

test('generic 3D card selection stays local and network-neutral',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'president','online');const r=await t.page.evaluate(async()=>{S.turn=0;let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen={selected:[...payload.viewData.selectedIds],selectable:[...payload.viewData.selectableIds],interactions:payload.interactions}}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const id=S.players[0].hand[0].id,before={state:clone(S),random:__test.random,packets:clone(__test.packets)},select=seen.interactions.cardSelect;select(id);return{id,selected:[...selection],before,after:{state:clone(S),random:__test.random,packets:clone(__test.packets)}};});assert.deepEqual(r.selected,[r.id]);assert.deepEqual(r.after,r.before);}finally{await browser.close();}});

test('Suites and Tricks playable cards are derived from their existing rule engines',async()=>{const t=await table();browser=t.browser;try{for(const id of ['suites','plis']){await setup(t.page,id,'solo');const r=await t.page.evaluate(async id=>{S.turn=0;gate=false;let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=[...payload.viewData.cardPlayableIds]}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const expected=player(S).hand.filter(c=>id==='suites'?suitesLegal(S,c):tricksLegal(S,c)).map(c=>c.id);return{seen,expected};},id);assert.deepEqual(r.seen,r.expected,id);await t.page.evaluate(()=>SalonTableView.setMode('2d',{persistPreference:false}));}}finally{await browser.close();}});

test('Auction 3D payload preserves projected hidden bids',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'encheres','online');const r=await t.page.evaluate(async()=>{net.state.phase='play';net.state.turn=0;net.state.bids[1]=clone(net.state.players[1].hand[0]);S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){const bid=payload.viewData.cardCenter.bids[1];seen={hidden:!!bid?.hidden,hasRank:!!bid&&Object.hasOwn(bid,'rank'),id:bid?.id,sourceRank:net.state.bids[1].rank}}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});return seen;});assert.equal(r.hidden,true);assert.equal(r.hasRank,false);assert.match(r.id,/^sealed-/);assert.equal(Number.isInteger(r.sourceRank),true);}finally{await browser.close();}});

test('Old Maid 3D target uses only projected hidden cards',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'pouilleux','online');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen={maid:{...payload.viewData.maid},targetCards:payload.state.players[payload.viewData.maid.target].hand.map(c=>({...c}))}}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});return seen;});assert.equal(r.targetCards.length,r.maid.targetCount);assert.equal(r.targetCards.every(c=>c.hidden===true),true);assert.equal(r.targetCards.some(c=>Object.hasOwn(c,'rank')),false);}finally{await browser.close();}});

test('99 card selection stays local and network-neutral in 3D',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'quatrevingtdixneuf','online');const r=await t.page.evaluate(async()=>{S.turn=0;let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen={ninety:{...payload.viewData.ninety},interactions:payload.interactions}}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const id=S.players[0].hand[0].id,before={state:clone(S),random:__test.random,packets:clone(__test.packets)},select=seen.interactions.specialCard;select('select',id);return{id,selected:[...selection],before,after:{state:clone(S),random:__test.random,packets:clone(__test.packets)}};});assert.deepEqual(r.selected,[r.id]);assert.deepEqual(r.after,r.before);}finally{await browser.close();}});

test('Blackjack 3D payload preserves the hidden dealer card',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'vingtetun','online');const r=await t.page.evaluate(async()=>{const source=net.state,first=clone(source.deck.at(-1)),second=clone(source.deck.at(-2));source.dealer=[first,second];source.dealerRevealed=false;source.phase='play';source.turn=0;source.players[0].hand=[clone(source.deck.at(-3)),clone(source.deck.at(-4))];source.players[0].status='playing';S=projectGame(source,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload.viewData.blackjack.dealer.map(c=>({...c}))}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});return{seen,firstRank:first.rank,secondRank:second.rank};});assert.equal(r.seen[0].rank,r.firstRank);assert.equal(r.seen[1].hidden,true);assert.equal(Object.hasOwn(r.seen[1],'rank'),false);assert.equal(Number.isInteger(r.secondRank),true);}finally{await browser.close();}});

test('Battle projection removes the value of face-down war cards',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'bataille','online');const r=await t.page.evaluate(async()=>{const source=net.state,hidden=clone(source.players[0].hand[0]),shown=clone(source.players[1].hand[0]);source.battleReveal=[{owner:0,card:hidden,hidden:true},{owner:1,card:shown,hidden:false}];S=projectGame(source,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen={projected:clone(payload.state.battleReveal),rendered:clone(payload.viewData.battle.reveals)}}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});return{seen,hiddenRank:hidden.rank,shownRank:shown.rank};});assert.equal(r.seen.projected[0].hidden,true);assert.equal(Object.hasOwn(r.seen.projected[0],'card'),false);assert.equal(Object.hasOwn(r.seen.rendered[0],'card'),false);assert.equal(r.seen.rendered[1].card.rank,r.shownRank);assert.equal(Number.isInteger(r.hiddenRank),true);}finally{await browser.close();}});
test('Cactus 3D adapter preserves projected card privacy online',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'cactus','online');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=clone(payload.viewData.cactus)}});net.state.phase='draw';net.state.turn=0;net.state.reveal=null;S=projectGame(net.state,0);renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});return seen;});assert.equal(r.viewer,0);for(const p of r.players)for(const c of p.hand)if(c){assert.equal(c.hidden,true);assert.equal('rank' in c,false);assert.equal('suit' in c,false);}assert.ok(r.discard&&Number.isInteger(r.discard.rank));}finally{await browser.close();}});

test('Cactus 3D sees only engine-authorized peek cards',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'cactus','online');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=clone(payload.viewData.cactus)}});net.state.phase='peek';net.state.turn=0;S=projectGame(net.state,0);renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});return seen.players[0].hand.map(c=>c&&({hidden:!!c.hidden,rank:c.rank??null,suit:c.suit??null}));});assert.equal(r[0].hidden,true);assert.equal(r[1].hidden,true);assert.equal(r[2].hidden,false);assert.equal(r[3].hidden,false);assert.ok(Number.isInteger(r[2].rank));assert.ok(Number.isInteger(r[3].rank));}finally{await browser.close();}});

test('Cactus 3D quick throw keeps the out-of-turn online action path',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'cactus','online');const r=await t.page.evaluate(async()=>{net.state.phase='draw';net.state.turn=1;const owner=0,index=net.state.players[owner].hand.findIndex(Boolean),card=net.state.players[owner].hand[index];net.state.discard[net.state.discard.length-1]={...net.state.discard.at(-1),rank:card.rank};S=projectGame(net.state,0);let interaction=null;SalonTableView.register('3d',{available:()=>true,render(payload){interaction=payload.interactions.cactus}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const before=legacyCactusCount(net.state.players[owner]);interaction('quick',index);return{removed:before-legacyCactusCount(net.state.players[owner]),owner:net.state.lastQuick?.owner,turn:net.state.turn};});assert.deepEqual(r,{removed:1,owner:0,turn:1});}finally{await browser.close();}});

test('99 3D can select and play a legal card without HTML controls',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'quatrevingtdixneuf','online');const r=await t.page.evaluate(async()=>{net.gameId='quatrevingtdixneuf';net.state.turn=0;S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const card=net.state.players[0].hand.find(c=>legal99(net.state,c,1));if(!card)throw Error('No legal 99 card in fixture');const selected=seen.interactions.specialCard('select',card.id);const before=net.state.moves,played=seen.interactions.specialCard('play',{id:card.id,ace:1});return{selected,played,before,after:net.state.moves,discard:net.state.discard.at(-1)?.id};});assert.equal(r.selected,true);assert.equal(r.played,true);assert.equal(r.after,r.before+1);assert.ok(r.discard);}finally{await browser.close();}});

test('Blackjack 3D can place a bet through the authoritative action path',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'vingtetun','online');const r=await t.page.evaluate(async()=>{net.gameId='vingtetun';net.state.phase='bet';net.state.turn=0;S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const before={moves:net.state.moves,bet:net.state.players[0].bet,turn:net.state.turn};const ok=seen.interactions.specialCard('bet',10);return{ok,before,after:{moves:net.state.moves,bet:net.state.players[0].bet,phase:net.state.phase,turn:net.state.turn}};});assert.equal(r.ok,true);assert.equal(r.after.moves,r.before.moves);assert.equal(r.after.bet,10);assert.ok(r.after.phase==='bet'||r.after.phase==='play');assert.notEqual(r.after.turn,r.before.turn);}finally{await browser.close();}});

test('Rummikub 3D exposes only the viewer rack and projected common table',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'rummikub','online');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=clone(payload.viewData.rummi)}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});return{seen,own:clone(S.players[0].hand),opponent:clone(S.players[1].hand)};});assert.deepEqual(r.seen.hand,r.own);assert.ok(r.opponent.every(t=>t.hidden===true));assert.ok(r.seen.table.flat().every(t=>!t.hidden));}finally{await browser.close();}});

test('Rummikub 3D selection is local until an existing move action is sent',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'rummikub','online');const r=await t.page.evaluate(async()=>{net.gameId='rummikub';let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const id=S.players[0].hand[0].id,before={state:clone(S),packets:clone(__test.packets),random:__test.random};seen.interactions.rummi('select',id);const selected=[...selection],afterSelect={state:clone(S),packets:clone(__test.packets),random:__test.random};return{id,selected,before,afterSelect};});assert.deepEqual(r.selected,[r.id]);assert.deepEqual(r.afterSelect,r.before);}finally{await browser.close();}});

test('Rummikub 3D keeps old table tiles locked before first opening',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'rummikub','solo');const r=await t.page.evaluate(async()=>{player(S).opened=false;const old=S.table.flat()[0]||null;return{opened:player(S).opened,oldId:old?.id||null,refIds:S.refTable.flat().map(t=>t.id),canMoveOld:player(S).opened};});assert.equal(r.opened,false);assert.equal(r.canMoveOld,false);if(r.oldId)assert.ok(r.refIds.includes(r.oldId));}finally{await browser.close();}});

test('Métropole 3D payload contains board state but not the private event deck',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'metropole','online');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen={city:clone(payload.viewData.city),stateHasEvents:Object.hasOwn(payload.state,'events')}}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});return{...seen,playerCount:S.players.length};});assert.equal(r.city.board.length,24);assert.equal(r.city.owners.length,24);assert.equal(r.city.houses.length,24);assert.equal(r.city.mortgaged.length,24);assert.equal(r.city.players.length,r.playerCount);assert.equal(r.stateHasEvents,false);assert.equal(r.city.board.every(c=>typeof c.name==='string'&&typeof c.type==='string'),true);}finally{await browser.close();}});

test('Métropole 3D roll delegates to the authoritative host action path',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'metropole','online');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});net.gameId='metropole';net.state.phase='roll';net.state.turn=0;S=projectGame(net.state,0);renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const before={moves:net.state.moves,packets:clone(__test.packets)};const ok=seen.interactions.city('roll');return{ok,before,remoteSeats:net.seats.slice(1).filter(seat=>seat?.conn?.open).length,after:{moves:net.state.moves,phase:net.state.phase,dice:clone(net.state.dice),packets:clone(__test.packets)}};});assert.equal(r.ok,true);assert.equal(r.after.moves,r.before.moves+1);assert.equal(Array.isArray(r.after.dice)&&r.after.dice.length,2);assert.equal(r.after.dice.every(n=>Number.isInteger(n)&&n>=1&&n<=6),true);const added=r.after.packets.slice(r.before.packets.length);assert.equal(added.length,r.remoteSeats);assert.ok(added.every(packet=>packet?.type==='state'&&packet?.event?.type==='roll'&&packet?.event?.actor===0));assert.equal(new Set(added.map(packet=>packet.revision)).size,1);}finally{await browser.close();}});


test('Métropole 3D exposes the full authoritative turn and property action surface',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'metropole','online');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});net.gameId='metropole';net.state.turn=0;net.state.phase='buy';net.state.offer=1;net.state.owners[1]=-1;net.state.houses[1]=0;net.state.mortgaged[1]=false;net.state.players[0].cash=1200;S=projectGame(net.state,0);renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const before={cash:net.state.players[0].cash,revision:net.revision,price:seen.viewData.city.board[1].price,canBuy:seen.viewData.city.canBuy,manageCount:seen.viewData.city.manage.length};const bought=seen.interactions.city('buy');const afterBuy={cash:net.state.players[0].cash,owner:net.state.owners[1],phase:net.state.phase,revision:net.revision};const manage=seen.viewData.city.manage[1];const mortgaged=seen.interactions.city('mortgage',1);return{before,bought,afterBuy,manage,mortgaged,afterMortgage:{cash:net.state.players[0].cash,mortgaged:net.state.mortgaged[1],revision:net.revision}};});assert.equal(r.before.canBuy,true);assert.equal(r.before.manageCount,24);assert.equal(r.bought,true);assert.equal(r.afterBuy.owner,0);assert.equal(r.afterBuy.cash,r.before.cash-r.before.price);assert.equal(r.afterBuy.phase,'end');assert.equal(r.afterBuy.revision,r.before.revision+1);assert.equal(r.manage.canMortgage,true);assert.equal(r.mortgaged,true);assert.equal(r.afterMortgage.mortgaged,true);assert.equal(r.afterMortgage.cash,r.afterBuy.cash+r.manage.mortgageGain);assert.equal(r.afterMortgage.revision,r.afterBuy.revision+1);}finally{await browser.close();}});

test('Métropole renderer keeps every management decision inside the 3D surface',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 const html=await readFile(path.join(root,'jeux.html'),'utf8');
 assert.match(source,/cityFocusIndex=null/);
 assert.match(source,/kind:'city-property',interactive:true,index:i/);
 assert.match(source,/actionSprite\(entry\[0\],'city-action'/);
 assert.match(source,/HYPOTHÉQUER · \+/);
 assert.match(source,/CONSTRUIRE · /);
 assert.match(source,/VENDRE MAISON · \+/);
 assert.match(source,/current\?\.interactions\?\.city\?\.\(d\.command,d\.index\)/);
 assert.match(source,/cityFocusIndex=d\.index;syncMetropole\(current\)/);
 assert.doesNotMatch(source,/achats, constructions et finances restent dans le panneau 2D/);
 assert.match(html,/canMortgage:/);
 assert.match(html,/canRedeem:/);
 assert.match(html,/canBuild:/);
 assert.match(html,/canSell:/);
 assert.match(html,/city\(type,value\)/);
});

test('Echo 3D is playable while the hidden sequence stays out of the repeat payload',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'echo','online');const r=await t.page.evaluate(async()=>{net.gameId='echo';let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const watch={phase:seen.viewData.echo.phase,visible:[...seen.viewData.echo.sequence],authoritative:[...net.state.sequence]};const memorized=seen.interactions.echo('memorized');const repeat={phase:seen.viewData.echo.phase,visible:[...seen.viewData.echo.sequence],stateSequence:[...(seen.state.sequence||[])],authoritative:[...net.state.sequence]};while(net.state.phase==='repeat'){const index=net.state.sequence[net.state.input.length];if(!seen.interactions.echo('pad',index))throw Error('3D pad rejected');}const result={phase:net.state.phase,score:net.state.players[0].score,visible:[...seen.viewData.echo.sequence],input:[...net.state.input]};const continued=seen.interactions.echo('continue');return{watch,memorized,repeat,result,continued,after:{turn:net.state.turn,phase:net.state.phase,visible:[...seen.viewData.echo.sequence]}};});assert.equal(r.watch.phase,'watch');assert.equal(r.watch.visible.length,3);assert.deepEqual(r.watch.visible,r.watch.authoritative);assert.equal(r.memorized,true);assert.equal(r.repeat.phase,'repeat');assert.deepEqual(r.repeat.visible,[]);assert.deepEqual(r.repeat.stateSequence,[]);assert.equal(r.repeat.authoritative.length,3);assert.equal(r.result.phase,'result');assert.equal(r.result.score,6);assert.deepEqual(r.result.input,r.result.visible);assert.equal(r.continued,true);assert.equal(r.after.turn,1);assert.equal(r.after.phase,'watch');assert.deepEqual(r.after.visible,[]);}finally{await browser.close();}});


test('Balloon 3D stays RNG-neutral and delegates pump, bank and continue to the engine',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'ballon','online');const r=await t.page.evaluate(async()=>{net.gameId='ballon';let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const randomBeforeRender=__test.random;for(let i=0;i<4;i++)renderGame(false);const randomAfterRender=__test.random;const beforePump={moves:net.state.moves,random:__test.random};const pump=seen.interactions.balloon('pump');const afterPump={moves:net.state.moves,pumps:net.state.pumps,random:__test.random};net.state.phase='play';net.state.pot=20;net.state.pumps=2;net.state.burst=false;S=projectGame(net.state,0);renderGame(false);const score=net.state.players[0].score,randomBeforeBank=__test.random,risk=seen.viewData.balloon.risk;const bank=seen.interactions.balloon('bank');const banked={phase:net.state.phase,score:net.state.players[0].score,random:__test.random};const continued=seen.interactions.balloon('continue');return{randomBeforeRender,randomAfterRender,beforePump,pump,afterPump,risk,score,randomBeforeBank,bank,banked,continued,after:{turn:net.state.turn,phase:net.state.phase,pot:net.state.pot,pumps:net.state.pumps}};});assert.equal(r.randomAfterRender,r.randomBeforeRender);assert.equal(r.pump,true);assert.equal(r.afterPump.moves,r.beforePump.moves+1);assert.equal(r.afterPump.pumps,1);assert.equal(r.afterPump.random,r.beforePump.random+1);assert.equal(r.risk,30);assert.equal(r.bank,true);assert.equal(r.banked.phase,'result');assert.equal(r.banked.score,r.score+20);assert.equal(r.banked.random,r.randomBeforeBank);assert.equal(r.continued,true);assert.equal(r.after.turn,1);assert.equal(r.after.phase,'play');assert.equal(r.after.pot,0);assert.equal(r.after.pumps,0);}finally{await browser.close();}});


test('Echo 3D solo payload projects away the answer during repeat',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'echo','solo');const r=await t.page.evaluate(async()=>{let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const watch={view:[...seen.viewData.echo.sequence],state:[...(seen.state.sequence||[])]};const ok=seen.interactions.echo('memorized');return{ok,watch,repeat:{phase:S.phase,authoritative:[...S.sequence],view:[...seen.viewData.echo.sequence],state:[...(seen.state.sequence||[])]}};});assert.equal(r.ok,true);assert.equal(r.watch.view.length,3);assert.equal(r.watch.state.length,3);assert.equal(r.repeat.phase,'repeat');assert.equal(r.repeat.authoritative.length,3);assert.deepEqual(r.repeat.view,[]);assert.deepEqual(r.repeat.state,[]);}finally{await browser.close();}});

test('Anagram 3D submits through the engine without exposing the answer',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'anagrammes','online');const r=await t.page.evaluate(async()=>{net.gameId='anagrammes';let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const initial={phase:seen.viewData.anagram.phase,letters:[...seen.viewData.anagram.letters],clue:seen.viewData.anagram.clue,viewHasAnswer:Object.hasOwn(seen.viewData.anagram,'answer'),stateHasAnswer:Object.hasOwn(seen.state,'answer'),answer:net.state.answer,score:net.state.players[0].score};const submitted=seen.interactions.anagram('submit',net.state.answer);const result={phase:net.state.phase,score:net.state.players[0].score,feedback:seen.viewData.anagram.feedback};const continued=seen.interactions.anagram('continue');return{initial,submitted,result,continued,after:{turn:net.state.turn,phase:net.state.phase,stateHasAnswer:Object.hasOwn(seen.state,'answer'),viewHasAnswer:Object.hasOwn(seen.viewData.anagram,'answer')}};});assert.equal(r.initial.phase,'play');assert.equal(r.initial.letters.length,5);assert.equal(typeof r.initial.clue,'string');assert.equal(r.initial.viewHasAnswer,false);assert.equal(r.initial.stateHasAnswer,false);assert.equal(r.submitted,true);assert.equal(r.result.phase,'result');assert.equal(r.result.score,r.initial.score+5);assert.equal(r.continued,true);assert.equal(r.after.turn,1);assert.equal(r.after.phase,'play');assert.equal(r.after.stateHasAnswer,false);assert.equal(r.after.viewHasAnswer,false);}finally{await browser.close();}});


test('Intrus 3D exposes only visual variants and validates spots through the engine',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'intrus','online');const r=await t.page.evaluate(async()=>{net.gameId='intrus';let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const answer=net.state.intrusIndex,wrong=(answer+1)%net.state.intrusCount,score=net.state.players[0].score;const initial={count:seen.viewData.intrus.count,tiles:[...seen.viewData.intrus.tiles],viewHasIndex:Object.hasOwn(seen.viewData.intrus,'intrusIndex'),stateHasIndex:Object.hasOwn(seen.state,'intrusIndex')};const wrongOk=seen.interactions.intrus('spot',wrong);const afterWrong={phase:net.state.phase,tried:[...net.state.tried],score:net.state.players[0].score,stateHasIndex:Object.hasOwn(seen.state,'intrusIndex')};const correctOk=seen.interactions.intrus('spot',answer);const result={phase:net.state.phase,tried:[...net.state.tried],score:net.state.players[0].score,viewHasIndex:Object.hasOwn(seen.viewData.intrus,'intrusIndex'),stateHasIndex:Object.hasOwn(seen.state,'intrusIndex'),tiles:[...seen.viewData.intrus.tiles]};const continued=seen.interactions.intrus('continue');return{answer,score,initial,wrongOk,afterWrong,correctOk,result,continued,after:{turn:net.state.turn,phase:net.state.phase,tried:[...net.state.tried],stateHasIndex:Object.hasOwn(seen.state,'intrusIndex')}};});assert.equal(r.initial.count,9);assert.equal(r.initial.tiles.filter(Boolean).length,1);assert.equal(r.initial.tiles[r.answer],true);assert.equal(r.initial.viewHasIndex,false);assert.equal(r.initial.stateHasIndex,false);assert.equal(r.wrongOk,true);assert.equal(r.afterWrong.phase,'play');assert.deepEqual(r.afterWrong.tried,[(r.answer+1)%r.initial.count]);assert.equal(r.afterWrong.score,r.score);assert.equal(r.afterWrong.stateHasIndex,false);assert.equal(r.correctOk,true);assert.equal(r.result.phase,'result');assert.equal(r.result.tried.length,2);assert.equal(r.result.score,r.score+20);assert.equal(r.result.viewHasIndex,false);assert.equal(r.result.stateHasIndex,false);assert.deepEqual(r.result.tiles,r.initial.tiles);assert.equal(r.continued,true);assert.equal(r.after.turn,1);assert.equal(r.after.phase,'play');assert.deepEqual(r.after.tried,[]);assert.equal(r.after.stateHasIndex,false);}finally{await browser.close();}});


test('Code Secret 3D keeps the secret private until result and delegates guesses to the engine',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'code','online');const r=await t.page.evaluate(async()=>{net.gameId='code';let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const secret=[...net.state.secret],wrong=[...secret];wrong[0]=(wrong[0]+1)%6;const score=net.state.players[0].score;const initial={history:clone(seen.viewData.code3d.history),secret:[...seen.viewData.code3d.secret],viewHasSecret:Object.hasOwn(seen.viewData.code3d,'secret')&&seen.viewData.code3d.secret.length>0,stateHasSecret:Object.hasOwn(seen.state,'secret')};const wrongOk=seen.interactions.codePuzzle('guess',wrong);const afterWrong={phase:net.state.phase,history:clone(net.state.codeHistory),viewHistory:clone(seen.viewData.code3d.history),viewSecret:[...seen.viewData.code3d.secret],stateHasSecret:Object.hasOwn(seen.state,'secret')};const correctOk=seen.interactions.codePuzzle('guess',secret);const result={phase:net.state.phase,history:clone(net.state.codeHistory),score:net.state.players[0].score,viewSecret:[...seen.viewData.code3d.secret],stateSecret:[...(seen.state.secret||[])]};const continued=seen.interactions.codePuzzle('continue');return{secret,score,initial,wrongOk,afterWrong,correctOk,result,continued,after:{turn:net.state.turn,phase:net.state.phase,viewSecret:[...seen.viewData.code3d.secret],stateHasSecret:Object.hasOwn(seen.state,'secret')}};});assert.deepEqual(r.initial.history,[]);assert.deepEqual(r.initial.secret,[]);assert.equal(r.initial.viewHasSecret,false);assert.equal(r.initial.stateHasSecret,false);assert.equal(r.wrongOk,true);assert.equal(r.afterWrong.phase,'play');assert.equal(r.afterWrong.history.length,1);assert.equal(r.afterWrong.viewHistory.length,1);assert.deepEqual(r.afterWrong.viewSecret,[]);assert.equal(r.afterWrong.stateHasSecret,false);assert.equal(r.correctOk,true);assert.equal(r.result.phase,'result');assert.equal(r.result.history.length,2);assert.equal(r.result.score,r.score+52);assert.deepEqual(r.result.viewSecret,r.secret);assert.deepEqual(r.result.stateSecret,r.secret);assert.equal(r.continued,true);assert.equal(r.after.turn,1);assert.equal(r.after.phase,'play');assert.deepEqual(r.after.viewSecret,[]);assert.equal(r.after.stateHasSecret,false);}finally{await browser.close();}});


test('Mini Golf 3D delegates physics to the engine and reuses the authoritative path',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'golf','online');const r=await t.page.evaluate(async()=>{net.gameId='golf';const course=GOLF_COURSES[net.state.stage-1];net.state.phase='play';net.state.turn=0;net.state.golfPos={x:course.hole.x-10,y:course.hole.y};net.state.golfStroke=0;net.state.golfPath=[];net.state.golfSunk=false;S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const before={moves:net.state.moves,random:__test.random,score:net.state.players[0].score,pos:clone(net.state.golfPos),course:clone(seen.viewData.golf3d.course)};const shot=seen.interactions.golf('shoot',{angle:0,power:5});const result={moves:net.state.moves,random:__test.random,score:net.state.players[0].score,phase:net.state.phase,stroke:net.state.golfStroke,sunk:net.state.golfSunk,path:clone(net.state.golfPath),viewPath:clone(seen.viewData.golf3d.path),viewPos:clone(seen.viewData.golf3d.pos)};const continued=seen.interactions.golf('continue');return{before,shot,result,continued,after:{turn:net.state.turn,phase:net.state.phase,stroke:net.state.golfStroke,path:clone(net.state.golfPath),pos:clone(net.state.golfPos)}};});assert.equal(Array.isArray(r.before.course.obstacles),true);assert.equal(Number.isFinite(r.before.course.hole.x)&&Number.isFinite(r.before.course.hole.y),true);assert.equal(r.shot,true);assert.equal(r.result.moves,r.before.moves+1);assert.equal(r.result.random,r.before.random);assert.equal(r.result.phase,'result');assert.equal(r.result.stroke,1);assert.equal(r.result.sunk,true);assert.equal(r.result.score,r.before.score+100);assert.equal(r.result.path.length>=2,true);assert.deepEqual(r.result.viewPath,r.result.path);assert.deepEqual(r.result.viewPos,r.result.path.at(-1).reduce((o,v,i)=>(o[i?'y':'x']=v,o),{}));assert.equal(r.continued,true);assert.equal(r.after.turn,1);assert.equal(r.after.phase,'play');assert.equal(r.after.stroke,0);assert.deepEqual(r.after.path,[]);assert.deepEqual(r.after.pos,{x:65,y:220});}finally{await browser.close();}});


test('manifest model packs can auto-fit and recenter GLB instances to canonical renderer dimensions',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','solo');const r=await t.page.evaluate(async()=>{const vec=(x,y,z)=>({x,y,z,set(a,b,c){this.x=a;this.y=b;this.z=c},multiplyScalar(n){this.x*=n;this.y*=n;this.z*=n}}),make=()=>({isObject3D:true,scale:vec(1,1,1),rotation:vec(0,0,0),position:vec(0,0,0),traverse(fn){fn(this)},bounds:{min:{x:-2,y:0,z:-1},max:{x:2,y:4,z:1}}});class Box3{constructor(){this.min={x:0,y:0,z:0};this.max={x:0,y:0,z:0}}setFromObject(obj){const s=obj.scale||{x:1,y:1,z:1},p=obj.position||{x:0,y:0,z:0},b=obj.bounds;this.min={x:b.min.x*s.x+p.x,y:b.min.y*s.y+p.y,z:b.min.z*s.z+p.z};this.max={x:b.max.x*s.x+p.x,y:b.max.y*s.y+p.y,z:b.max.z*s.z+p.z};return this}getSize(out){out.x=this.max.x-this.min.x;out.y=this.max.y-this.min.y;out.z=this.max.z-this.min.z;return out}getCenter(out){out.x=(this.min.x+this.max.x)/2;out.y=(this.min.y+this.max.y)/2;out.z=(this.min.z+this.max.z)/2;return out}}const result=await SalonTable3DModelPack.load({id:'fit-pack',assets:{card:{src:'card.glb',fit:'canonical',origin:'center',scale:1.1}}},{loadModel:async()=>({template:{},clone:()=>make()})});const card=SalonTable3DAssets.create('card',{THREE:{Box3},canonicalSize:{width:1.22,height:1.78,depth:.045}}),bounds=new Box3().setFromObject(card),center={x:0,y:0,z:0};bounds.getCenter(center);const out={scale:[card.scale.x,card.scale.y,card.scale.z],center:[center.x,center.y,center.z],loadedKinds:result.loadedKinds};result.unload();return out;});assert.deepEqual(r.loadedKinds,['card']);const expected=.045/2*1.1;assert.ok(Math.abs(r.scale[0]-expected)<1e-9);assert.ok(Math.abs(r.scale[1]-expected)<1e-9);assert.ok(Math.abs(r.scale[2]-expected)<1e-9);assert.ok(r.center.every(v=>Math.abs(v)<1e-9));const source=await readFile(path.join(root,'shared/table-3d-model-pack.js'),'utf8');assert.match(source,/function canonicalDimensions\(size=\{\}\)/);assert.match(source,/function fitCanonical\(object,entry,context\)/);assert.match(source,/entry\.fit==='canonical'/);assert.match(source,/origin==='floor-center'/);assert.doesNotMatch(source,/Math\.random/);}finally{await browser.close();}});

test('manifest model packs preload, transform and unload without touching gameplay state',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','online');const before=await clean(t.page);const r=await t.page.evaluate(async()=>{const events=[],onEvent=e=>events.push(e.detail?.type);window.addEventListener('salon:table-3d-model-pack',onEvent);const vec=(x,y,z)=>({x,y,z,set(a,b,c){this.x=a;this.y=b;this.z=c},multiplyScalar(n){this.x*=n;this.y*=n;this.z*=n}}),make=src=>({isObject3D:true,src,scale:vec(1,1,1),rotation:vec(0,0,0),position:vec(0,0,0),traverse(fn){fn(this)}}),calls=[];const result=await SalonTable3DModelPack.load({id:'fixture-pack',assets:[{kind:'pawn',src:'pawn.glb',scale:2,rotationDeg:[0,90,0],offset:[1,2,3],scaleFrom:'boost'},{kind:'die',src:'bad.glb'}]},{loadModel:async src=>{calls.push(src);if(src==='bad.glb')throw Error('fixture failure');return{template:{src},clone:()=>make(src)}}});const activeBefore=SalonTable3DModelPack.active(),pawn=SalonTable3DAssets.create('pawn',{boost:1.5}),hasPawn=SalonTable3DAssets.has('pawn'),hasDie=SalonTable3DAssets.has('die'),failed=result.failed.map(x=>({kind:x.kind,src:x.src,error:x.error})),unloaded=result.unload(),activeAfter=SalonTable3DModelPack.active(),stillPawn=SalonTable3DAssets.has('pawn');window.removeEventListener('salon:table-3d-model-pack',onEvent);return{events,calls,loadedKinds:result.loadedKinds,failed,activeBefore,activeAfter,hasPawn,hasDie,unloaded,stillPawn,pawn:{src:pawn.src,scale:[pawn.scale.x,pawn.scale.y,pawn.scale.z],rotation:[pawn.rotation.x,pawn.rotation.y,pawn.rotation.z],position:[pawn.position.x,pawn.position.y,pawn.position.z]}};});assert.deepEqual(r.calls,['pawn.glb','bad.glb']);assert.deepEqual(r.loadedKinds,['pawn']);assert.equal(r.failed.length,1);assert.equal(r.failed[0].kind,'die');assert.equal(r.failed[0].src,'bad.glb');assert.match(r.failed[0].error,/fixture failure/);assert.equal(r.hasPawn,true);assert.equal(r.hasDie,false);assert.deepEqual(r.pawn.scale,[3,3,3]);assert.ok(Math.abs(r.pawn.rotation[1]-Math.PI/2)<1e-9);assert.deepEqual(r.pawn.position,[1,2,3]);assert.equal(r.activeBefore.length,1);assert.equal(r.activeBefore[0].id,'fixture-pack');assert.deepEqual(r.activeBefore[0].kinds,['pawn']);assert.equal(r.unloaded,true);assert.deepEqual(r.activeAfter,[]);assert.equal(r.stillPawn,false);assert.deepEqual(r.events,['loading','progress','progress','ready','unloaded']);assert.deepEqual(await clean(t.page),before);const source=await readFile(path.join(root,'shared/table-3d-model-pack.js'),'utf8');assert.match(source,/GLTFLoader\.js\/\+esm/);assert.match(source,/SkeletonUtils\.js\/\+esm/);assert.match(source,/new rt\.THREE\.Group\(\)/);assert.match(source,/record\.wrap\?\.\(visual,context\|\|\{\},entry\)\|\|visual/);assert.match(source,/registry\.register\(result\.entry\.kind,result\.factory\)/);assert.doesNotMatch(source,/Math\.random/);}finally{await browser.close();}});

test('replaceable 3D asset registry stays presentation-only and supports hot swaps',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','online');const before=await clean(t.page);const r=await t.page.evaluate(()=>{const calls=[],events=[],unsubscribe=SalonTable3DAssets.subscribe(kind=>events.push(kind));const dispose=SalonTable3DAssets.register('card',ctx=>{calls.push({kind:ctx.kind,flag:ctx.flag});return{factory:true}});const created=SalonTable3DAssets.create('card',{flag:7});const listed=SalonTable3DAssets.list();const hasBefore=SalonTable3DAssets.has('card');dispose();unsubscribe();return{created,listed,hasBefore,hasAfter:SalonTable3DAssets.has('card'),calls,events};});assert.equal(r.hasBefore,true);assert.equal(r.hasAfter,false);assert.equal(r.created.factory,true);assert.deepEqual(r.calls,[{kind:'card',flag:7}]);assert.deepEqual(r.events,['card','card']);assert.equal(r.listed.includes('card'),true);assert.deepEqual(await clean(t.page),before);const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');assert.match(source,/function externalAsset\(kind,context,userData=\{\}\)/);for(const kind of ['card','rummikub-tile','die','pawn','golf-ball','golf-obstacle','golf-portal','code-gem','balloon','metropole-house','metropole-owner-marker'])assert.match(source,new RegExp("externalAsset\\('"+kind+"'"));assert.match(source,/assetUnsubscribe\?\?=externalAssets\?\.subscribe/);assert.match(source,/assetUnsubscribe\?\.\(\);assetUnsubscribe=null/);assert.match(source,/intersectObjects\(interactive,true\)/);}finally{await browser.close();}});

test('dense Rummikub layout keeps every board and rack tile inside adaptive visible rows',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function rummiDesiredGroupWidth\(group\)/);
 assert.match(source,/packed=rummiPackRows\(active,width,gap\)/);
 assert.match(source,/minZ=-2\.90,maxZ=\.85/);
 assert.match(source,/z=minZ\+\(rowIndex\+\.5\)\*cellD/);
 assert.match(source,/tileCount=active\.reduce/);
 assert.match(source,/function rummiLayoutCell\(layout,order\)/);
 assert.match(source,/depthScale=\(Math\.max\(\.22,cell\.depth-\.06\)\)\/\.9/);
 assert.match(source,/scale=Math\.max\(\.24,Math\.min\(\.96,widthScale,depthScale\)\)/);
 assert.match(source,/function rummiRackLayout\(count\)/);
 assert.match(source,/rows=total<=10\?1:total<=20\?2:total<=32\?3:total<=50\?4:5/);
 assert.match(source,/layout\.minZ\+\(row\+\.5\)\*layout\.rowPitch/);
 assert.match(source,/density=Math\.max\(layout\.rows,rackLayout\.rows,Math\.ceil\(\(layout\.tileCount\+hand\.length\)\/24\)\)/);
 assert.match(source,/position\.z>=layout\.minZ&&position\.z<=layout\.maxZ/);
 assert.match(source,/position\.z>=rack\.minZ-\.12&&position\.z<=rack\.maxZ\+\.20/);
 assert.match(source,/cell=rummiLayoutCell\(layout,order\),cx=cell\.x,cz=cell\.z/);
 assert.match(source,/dx<=cell\.width\*\.47&&dz<=Math\.min\(\.78,cell\.depth\*\.42\)/);
 assert.match(source,/slot\.cellD\*\.34/);
 assert.match(source,/slot\.cellW\*\.48/);
 assert.doesNotMatch(source,/rummiPackRows[^\n]*dispatch\(/);
});

test('3D text labels reuse a bounded texture cache instead of reallocating every refresh',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/labelMaterials=new Map\(\)/);
 assert.match(source,/labelGeneration=0/);
 assert.match(source,/function labelMaterial\(text,accent='#dbea9e'\)/);
 assert.match(source,/hit\.lastUsed=labelGeneration/);
 assert.match(source,/labelMaterials\.set\(key,\{material,texture,lastUsed:labelGeneration\}\)/);
 assert.match(source,/function pruneLabelCache\(limit=128\)/);
 assert.match(source,/entry\.lastUsed<labelGeneration/);
 assert.match(source,/entry\.material\.dispose\(\);entry\.texture\.dispose\(\);labelMaterials\.delete\(key\)/);
 assert.match(source,/labelGeneration\+\+/);
 assert.match(source,/syncCurrent\(payload\);pruneLocalPoses\(\);pruneLabelCache\(\)/);
 assert.match(source,/new THREE\.Sprite\(labelMaterial\(text,accent\)\)/);
 assert.doesNotMatch(source,/sp\.userData\.temporaryMaterial=mat;sp\.userData\.temporaryTexture=tex/);
});

test('3D interactive objects expose consistent hover and pointer affordances',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 const css=await readFile(path.join(root,'shared/table-3d.css'),'utf8');
 assert.match(source,/sp\.userData\.home\?\?=\{scale:sp\.scale\.clone\(\)\}/);
 assert.match(source,/const interactiveHover=!!hovered\?\.userData\?\.interactive,dragHover=interactiveHover&&!!hovered\?\.userData\?\.looseManip/);
 assert.match(source,/classList\.toggle\('has-action-hover',interactiveHover&&!dragHover\)/);
 assert.match(source,/classList\.toggle\('has-object-hover',dragHover\)/);
 assert.match(source,/if\(hovered&&!drag&&interactiveHover\)/);
 assert.match(source,/classList\.remove\('has-action-hover','has-object-hover'\)/);
 assert.match(css,/\.table-3d-host\.has-action-hover canvas\{cursor:pointer\}/);
 assert.match(css,/\.table-3d-host\.has-object-hover canvas\{cursor:grab\}/);
 assert.match(css,/\.table-3d-host\.is-dragging canvas,.table-3d-host\.is-camera-dragging canvas\{cursor:grabbing\}/);
});

test('Three.js hardening adapts mobile quality, motion and reusable geometry',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 const css=await readFile(path.join(root,'shared/table-3d.css'),'utf8');
 const html=await readFile(path.join(root,'jeux.html'),'utf8');
 const loader=await readFile(path.join(root,'shared/table-3d-loader.js'),'utf8');
 assert.match(source,/dataset\.motion!=='off'/);
 assert.doesNotMatch(source,/const motionAllowed=.*&&motionAllowed\(\)/);
 assert.match(source,/prefers-reduced-motion: reduce/);
 assert.match(source,/targetPixelRatio/);
 assert.match(source,/function handCardSlot\(count,index\)/);
 assert.match(source,/function pickCardSlot\(count,index\)/);
 assert.equal((source.match(/handCardSlot\(/g)||[]).length>=6,true);
 assert.match(source,/function rummiBoardLayout\(groups\)/);
 assert.match(source,/function rummiGroupSlot\(layout,order,length,tileIndex\)/);
 assert.match(source,/function rummiRackSlot\(count,index\)/);
 assert.match(source,/function cardFamilySnapshot\(payload,center\)/);
 assert.match(source,/function animateCardFamilyConfirmed\(/);
 assert.match(source,/cactus-action/);
 assert.match(source,/ninety-action/);
 assert.match(source,/blackjack-action/);
 assert.match(source,/card-action/);
 assert.match(html,/salon:table-3d-window/);
 assert.match(source,/function applyCameraFit\(\)/);
 assert.match(source,/portraitBoost=aspect<\.82\?Math\.min\(1\.95,\.82\/aspect\):1/);
 assert.match(source,/camera\.fov=aspect<\.62\?42:aspect<\.82\?40:aspect<\.95\?39:aspect>1\.8\?37:39/);
 assert.equal((source.match(/setCameraPose\(/g)||[]).length>=18,true);
 assert.match(source,/function device3DProfile\(\)/);
 assert.match(source,/pixelCap=constrained\?1\.25:memory<=6\?1\.5:2/);
 assert.match(source,/textureScale=constrained\?\.62:memory<=6\?\.8:1/);
 assert.match(source,/generateMipmaps=false/);
 assert.match(source,/profile\.shadowSize/);
 assert.equal((source.match(/new THREE\.BoxGeometry\(\.62,\.9,\.085\)/g)||[]).length,1);
 assert.equal((source.match(/new THREE\.BoxGeometry\(1\.28,\.16,\.88\)/g)||[]).length,1);
 assert.match(source,/lostpointercapture/);
 assert.match(source,/function capturePointer\(id\)\{try\{/);
 assert.match(source,/cardDropRadius/);
 assert.match(source,/const dense=rows>1,baseScale=rows===1\?Math\.max\(\.84,1-Math\.max\(0,total-5\)\*\.035\):rows===2\?\.72:\.60/);
 assert.match(source,/spacing=rowCount<=1\?0:CARD_W\*scale\+\(dense\?\.13:\.11\)/);
 assert.match(source,/const farFill=new THREE\.DirectionalLight/);
 assert.match(source,/const farGlow=new THREE\.PointLight/);
 assert.match(source,/function eightOpponentSeat\(total,index\)/);
 assert.match(source,/function eightSnapshot\(payload,deckCount,top\)/);
 assert.match(source,/function queueCardFlight\(mesh,from,to/);
 assert.match(source,/function emitLocalCardGesture\(phase,progress=0,lateral=0\)/);
 assert.match(source,/function onRemoteCardGesture\(event\)/);
 assert.match(source,/remoteCardGestures=new Map\(\)/);
 assert.match(source,/salon:remote-card-gesture/);
 assert.match(source,/snapshot\.deckCount<previous\.deckCount/);
 assert.match(source,/snapshot\.handCounts\[i\]===previous\.handCounts\[i\]-1/);
 assert.match(css,/58svh/);
 assert.match(css,/54svh/);
 assert.match(css,/data-table-view="3d"\] \.table-column>\.scene-surface/);
 assert.match(css,/data-table-view="3d"\] \.table-column>\.arcade-arena/);
 assert.match(css,/data-table-view="3d"\] \.table-column>\.hand-panel/);
 assert.match(css,/data-table3d-presentation="full"/);
 assert.match(css,/height:100dvh/);
 assert.match(css,/\.table-3d-window-controls/);
 assert.match(css,/#game-actions\{position:fixed/);
 assert.match(html,/\.game-layout \.hand\{--cardw:clamp\(52px,9dvh,78px\)/);
 assert.match(html,/\.game-layout \.playing-card \.corner\{font-size:clamp\(16px,calc\(var\(--cardw\)\*\.27\),21px\)/);
 assert.match(html,/async function table3dApplyWindowMode\(target\)/);
 assert.match(html,/table3dRefreshLayout/);
 assert.match(loader,/const failed=renderer;view\.fallback\('webgl-failed',error\)/);
 assert.match(loader,/renderer=null/);
 assert.match(source,/button\.getAttribute\('data-table-3d-window'\)/);
 assert.match(source,/salon:table-3d-window/);
});


test('live Eight card gestures are transient and never mutate online state',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','online');const r=await t.page.evaluate(()=>{net.gameId='huit';net.state.turn=0;S.turn=0;__test.packets.length=0;const before={view:clone(S),host:clone(net.state),revision:net.revision,random:__test.random};window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail:{phase:'start',progress:0,lateral:0}}));window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail:{phase:'move',progress:.58,lateral:.22}}));window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail:{phase:'cancel',progress:0,lateral:0}}));return{before,after:{view:clone(S),host:clone(net.state),revision:net.revision,random:__test.random},packets:clone(__test.packets).filter(p=>p.type==='card-gesture')};});assert.deepEqual(r.after,r.before);assert.equal(r.packets.length>=2,true);for(const p of r.packets){assert.equal(p.matchId,'test');assert.equal(p.revision,1);assert.equal(p.actor,0);assert.equal('cardId'in p,false);assert.equal('suit'in p,false);assert.equal('rank'in p,false);}}finally{await browser.close();}});

test('host relays a remote Eight drag preview without applying a move',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','online');const r=await t.page.evaluate(()=>{net.gameId='huit';net.state.turn=1;S.turn=1;let seen=null;window.addEventListener('salon:remote-card-gesture',e=>seen=clone(e.detail),{once:true});const before={state:clone(net.state),revision:net.revision,random:__test.random},conn=net.seats[1].conn;const handled=receiveSocial({type:'card-gesture',matchId:net.matchId,revision:net.revision,gesture:7,phase:'move',progress:.44,lateral:-.18},1,conn);return{handled,seen,before,after:{state:clone(net.state),revision:net.revision,random:__test.random}};});assert.equal(r.handled,true);assert.deepEqual(r.after,r.before);assert.equal(r.seen.actor,1);assert.equal(r.seen.gesture,7);assert.equal(r.seen.phase,'move');assert.equal(r.seen.progress,.44);assert.equal(r.seen.lateral,-.18);}finally{await browser.close();}});

test('shared card games broadcast privacy-safe transient drag presence',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'president','online');const r=await t.page.evaluate(()=>{net.gameId='president';net.state.turn=0;S.turn=0;__test.packets.length=0;const before={view:clone(S),host:clone(net.state),revision:net.revision,random:__test.random};window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail:{gameId:'president',phase:'start',progress:0,lateral:0}}));window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail:{gameId:'president',phase:'move',progress:.51,lateral:-.14}}));window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail:{gameId:'president',phase:'cancel',progress:0,lateral:0}}));return{before,after:{view:clone(S),host:clone(net.state),revision:net.revision,random:__test.random},packets:clone(__test.packets).filter(p=>p.type==='card-gesture')};});assert.deepEqual(r.after,r.before);assert.equal(r.packets.length>=2,true);for(const p of r.packets){assert.equal(p.gameId,'president');assert.equal(p.actor,0);assert.equal('cardId'in p,false);assert.equal('suit'in p,false);assert.equal('rank'in p,false);}}finally{await browser.close();}});

test('host relays shared card drag presence only for the current game and turn',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'president','online');const r=await t.page.evaluate(()=>{net.gameId='president';net.state.turn=1;S.turn=1;const seen=[];window.addEventListener('salon:remote-card-gesture',e=>seen.push(clone(e.detail)));const before={state:clone(net.state),revision:net.revision,random:__test.random},conn=net.seats[1].conn;const good=receiveSocial({type:'card-gesture',gameId:'president',matchId:net.matchId,revision:net.revision,gesture:11,phase:'move',progress:.47,lateral:.12},1,conn);const wrongGame=receiveSocial({type:'card-gesture',gameId:'huit',matchId:net.matchId,revision:net.revision,gesture:12,phase:'move',progress:.7,lateral:0},1,conn);return{good,wrongGame,seen,before,after:{state:clone(net.state),revision:net.revision,random:__test.random}};});assert.equal(r.good,true);assert.equal(r.wrongGame,true);assert.deepEqual(r.after,r.before);assert.equal(r.seen.length,1);assert.equal(r.seen[0].gameId,'president');assert.equal(r.seen[0].actor,1);assert.equal(r.seen[0].gesture,11);}finally{await browser.close();}});

test('shared live card presence remains presentation-only in renderer and protocol',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 const html=await readFile(path.join(root,'jeux.html'),'utf8');
 assert.match(source,/const LIVE_CARD_GAMES=new Set/);
 assert.match(source,/function cardGestureTarget\(game,y=1\.02\)/);
 assert.match(source,/function cardGestureCoordinates\(/);
 assert.match(source,/gestureEnabled=!!\(current\?\.canInteract&&LIVE_CARD_GAMES\.has/);
 assert.match(source,/d\.gestureStarted=true;emitLocalCardGesture\('start'/);
 assert.match(html,/const CARD_GESTURE_GAMES=new Set/);
 assert.match(html,/gameId,gesture:cardGestureCurrent/);
 assert.doesNotMatch(html,/card-gesture[^\n]*(cardId|suit|rank)/);
});

test('Cactus quick-drag presence is allowed out of turn without leaking the card',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'cactus','online');const r=await t.page.evaluate(()=>{net.gameId='cactus';net.state.phase='draw';net.state.turn=1;S.phase='draw';S.turn=1;__test.packets.length=0;const before={view:clone(S),host:clone(net.state),revision:net.revision,random:__test.random};window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail:{gameId:'cactus',phase:'start',progress:0,lateral:0}}));window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail:{gameId:'cactus',phase:'move',progress:.63,lateral:.18}}));window.dispatchEvent(new CustomEvent('salon:local-card-gesture',{detail:{gameId:'cactus',phase:'cancel',progress:0,lateral:0}}));return{before,after:{view:clone(S),host:clone(net.state),revision:net.revision,random:__test.random},packets:clone(__test.packets).filter(p=>p.type==='card-gesture')};});assert.deepEqual(r.after,r.before);assert.equal(r.packets.length>=2,true);for(const p of r.packets){assert.equal(p.gameId,'cactus');assert.equal(p.actor,0);assert.equal('cardId'in p,false);assert.equal('suit'in p,false);assert.equal('rank'in p,false);}}finally{await browser.close();}});

test('host relays out-of-turn Cactus quick presence but blocks the active protected phase',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'cactus','online');const r=await t.page.evaluate(()=>{net.gameId='cactus';net.state.phase='draw';net.state.turn=0;S.phase='draw';S.turn=0;const seen=[];window.addEventListener('salon:remote-card-gesture',e=>seen.push(clone(e.detail)));const before={state:clone(net.state),revision:net.revision,random:__test.random},conn=net.seats[2].conn;const good=receiveSocial({type:'card-gesture',gameId:'cactus',matchId:net.matchId,revision:net.revision,gesture:21,phase:'move',progress:.52,lateral:-.11},2,conn);net.state.phase='swap';net.state.turn=2;S.phase='swap';S.turn=2;const blocked=receiveSocial({type:'card-gesture',gameId:'cactus',matchId:net.matchId,revision:net.revision,gesture:22,phase:'move',progress:.72,lateral:0},2,conn);return{good,blocked,seen,before,after:{state:{...clone(net.state),phase:'draw',turn:0},revision:net.revision,random:__test.random}};});assert.equal(r.good,true);assert.equal(r.blocked,true);assert.equal(r.seen.length,1);assert.equal(r.seen[0].actor,2);assert.equal(r.seen[0].gameId,'cactus');assert.equal(r.after.revision,r.before.revision);assert.equal(r.after.random,r.before.random);assert.deepEqual(r.after.state,r.before.state);}finally{await browser.close();}});

test('Eight local confirmed play and draw reuse physical card flights',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/ownIds:own\.map\(c=>c\?\.id\)/);
 assert.match(source,/const ownPlayed=discardChanged/);
 assert.match(source,/const ownDrawnIds=snapshot\.deckCount<previous\.deckCount/);
 assert.match(source,/previous\.ownIds\.indexOf\(top\.id\)/);
 assert.match(source,/ownDrawnIds\.slice\(0,4\)\.forEach/);
 assert.match(source,/a\.mesh\.rotation\.x=-Math\.PI\/2\+arc/);
 assert.match(source,/a\.mesh\.rotation\.y=arc/);
 assert.doesNotMatch(source,/ownDrawnIds[^\n]*dispatch\(/);
});

test('shared card-family physical cleanup remains snapshot-driven and presentation-only',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function exactLocalCardOrigin\(previous,id,index=0\)/);
 assert.match(source,/game==='president'&&\(previous\.centerIds\|\|\[\]\)\.length/);
 assert.match(source,/game==='plis'&&previous\.phase==='trickResult'&&currentSnapshot\.phase==='play'/);
 assert.match(source,/game==='encheres'&&previous\.bidRound&&currentSnapshot\.bidRound>previous\.bidRound/);
 assert.match(source,/previous\.ownIds\|\|\[\]\)\.filter\(id=>!\(currentSnapshot\.ownIds/);
 assert.doesNotMatch(source,/exactLocalCardOrigin[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/animateCardFamilyConfirmed[^\n]*onlineAct\(/);
});

test('99 physical flow animates play and replacement draw without changing the engine path',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function ninetySnapshot\(payload,ninety,own\)/);
 assert.match(source,/deckPos=new THREE\.Vector3\(-2\.1,TABLE_Y\+\.22,\.05\)/);
 assert.match(source,/snapshot\.lastId&&snapshot\.lastId!==previous\.lastId/);
 assert.match(source,/const deckDropped=snapshot\.deckCount<previous\.deckCount/);
 assert.match(source,/queueCardFlight\(cardMesh\(publicCard/);
 assert.match(source,/queueCardFlight\(cardMesh\(visual\.card\),deckPos,visual\.position/);
 assert.doesNotMatch(source,/ninetySnapshot[^\n]*dispatch\(/);
});

test('Rummikub physical motion preserves tile identity across rack, table and draw pile',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function rummiHiddenTileMesh\(\)/);
 assert.match(source,/function rummiMotionSnapshot\(payload,data,visuals\)/);
 assert.match(source,/currentVisuals\.set\(tile\.id/);
 assert.match(source,/previous\.positions\?\.get\(id\)/);
 assert.match(source,/before\.zone===visual\.zone/);
 assert.match(source,/snapshot\.deckCount<previous\.deckCount/);
 assert.match(source,/fromScale:before\.scale,toScale:visual\.scale/);
 assert.match(source,/fromScale,toScale:visual\.scale/);
 assert.doesNotMatch(source,/rummiMotionSnapshot[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/currentVisuals[^\n]*onlineAct\(/);
});

test('Cactus 3D pile transitions are inferred from confirmed snapshots only',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/lastCactusSnapshot=null/);
 assert.match(source,/function cactusSnapshot\(payload,data\)/);
 assert.match(source,/const drawnAppeared=!!snapshot\.drawnId/);
 assert.match(source,/previous\.drawnId&&snapshot\.discardId===previous\.drawnId/);
 assert.match(source,/const actorLoss=snapshot\.handCounts/);
 assert.match(source,/previous\.phase==='draw'&&snapshot\.phase==='swap'/);
 assert.match(source,/flight=cardMesh\(previous\.discard\)/);
 assert.doesNotMatch(source,/cactusSnapshot[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/drawnAppeared[^\n]*onlineAct\(/);
});

test('Cactus physical quick throw commits only through the existing engine interaction',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 const html=await readFile(path.join(root,'jeux.html'),'utf8');
 assert.match(source,/kind==='cactus-quick'/);
 assert.match(source,/directCardDropNear\(d,'cactus'\)/);
 assert.match(source,/current\?\.interactions\?\.cactus\?\.\('quick',d\.index\)/);
 assert.match(html,/function cardGestureActorAllowed\(gameId,actor,state\)/);
 assert.match(html,/gameId==='cactus'/);
 assert.doesNotMatch(source,/cactus-quick[^\n]*onlineAct\(/);
});

test('Eight 3D staging keeps opponent motion presentation-only',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/cardFx=new THREE\.Group\(\)/);
 assert.match(source,/cardAnimations\.push\(/);
 assert.match(source,/cardFx\.remove\(a\.mesh\)/);
 assert.doesNotMatch(source,/cardAnimations[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/queueCardFlight[^\n]*onlineAct\(/);
});


test('dense 3D card hands switch to compact grid rows before reaching the action HUD',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/total<=7\?1:total<=14\?2:3/);
 assert.match(source,/fan=dense\?0:/);
 assert.match(source,/rows===2\?\.93\+row\*1\.25/);
 assert.match(source,/rows===3\?\.54:\.62/);
});

test('Rummikub dense 3D layout and shared card motion remain presentation-only',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function rummiBoardLayout\(groups\)/);
 assert.match(source,/function rummiRackLayout\(count\)/);
 assert.match(source,/lastCardFamilySnapshots=new Map\(\)/);
 assert.match(source,/queueCardFlight\(/);
 assert.doesNotMatch(source,/animateCardFamilyConfirmed[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/animateCardFamilyConfirmed[^\n]*onlineAct\(/);
});


test('shared card games expose direct authoritative 3D actions',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'president','online');const r=await t.page.evaluate(async()=>{net.gameId='president';net.state.turn=0;net.state.trick=null;net.state.passed=[];S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const id=net.state.players[0].hand[0].id,before=net.state.players[0].hand.length,selected=seen.interactions.cardSelect(id),played=seen.interactions.cardAction('play');return{selected,played,before,after:net.state.players[0].hand.length,trickId:net.state.trick?.cards?.[0]?.id,owner:net.state.trick?.owner};});assert.equal(r.selected,true);assert.equal(r.played,true);assert.equal(r.after,r.before-1);assert.equal(r.trickId!=null,true);assert.equal(r.owner,0);}finally{await browser.close();}});

test('shared card games accept a legal physical drop without prior button confirmation',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'president','online');const r=await t.page.evaluate(async()=>{net.gameId='president';net.state.turn=0;net.state.trick=null;net.state.passed=[];S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const id=net.state.players[0].hand[0].id,before=net.state.players[0].hand.length;selection.clear();const dropped=seen.interactions.cardDrop(id);return{dropped,before,after:net.state.players[0].hand.length,trickId:net.state.trick?.cards?.[0]?.id,owner:net.state.trick?.owner};});assert.equal(r.dropped,true);assert.equal(r.after,r.before-1);assert.equal(r.trickId!=null,true);assert.equal(r.owner,0);}finally{await browser.close();}});

test('Rummikub direct drop reuses the existing move action',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'rummikub','online');const r=await t.page.evaluate(async()=>{net.gameId='rummikub';let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const id=S.players[0].hand[0].id,before={hand:net.state.players[0].hand.length,table:net.state.table.flat().length,revision:net.revision,random:__test.random};selection.clear();const dropped=seen.interactions.rummi('drop',{id,dest:'new'});return{id,dropped,before,after:{hand:net.state.players[0].hand.length,table:net.state.table.flat().length,contains:net.state.table.flat().some(t=>t.id===id),revision:net.revision,random:__test.random},view:{hand:S.players[0].hand.length,table:S.table.flat().length,contains:S.table.flat().some(t=>t.id===id)}};});assert.equal(r.dropped,true);assert.deepEqual({hand:r.after.hand,table:r.after.table,contains:r.after.contains,revision:r.after.revision},{hand:r.before.hand-1,table:r.before.table+1,contains:true,revision:r.before.revision+1},JSON.stringify(r));assert.deepEqual(r.view,{hand:r.after.hand,table:r.after.table,contains:true});assert.equal(r.after.random,r.before.random);}finally{await browser.close();}});

test('Rummikub 3D draw control reuses the authoritative draw action',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'rummikub','online');const r=await t.page.evaluate(async()=>{net.gameId='rummikub';let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const before={hand:net.state.players[0].hand.length,deck:net.state.deck.length,turn:net.state.turn,revision:net.revision,random:__test.random};const drawn=seen.interactions.rummi('draw');return{drawn,before,after:{hand:net.state.players[0].hand.length,deck:net.state.deck.length,turn:net.state.turn,revision:net.revision,random:__test.random}};});assert.equal(r.drawn,true);assert.equal(r.after.hand,r.before.hand+1);assert.equal(r.after.deck,r.before.deck-1);assert.notEqual(r.after.turn,r.before.turn);assert.equal(r.after.revision,r.before.revision+1);assert.equal(r.after.random,r.before.random);}finally{await browser.close();}});

test('Rummikub 3D turn controls stay adapters over existing interactions',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 const html=await readFile(path.join(root,'jeux.html'),'utf8');
 assert.match(source,/makeLooseManipulable\(hidden,\{kind:'rummi-draw',tapEnabled:true\}\)/);
 assert.match(source,/d\.kind==='rummi-draw'&&d\.drawToRack/);
 assert.match(source,/current\?\.interactions\?\.rummi\?\.\('draw'\)/);
 assert.match(source,/actionSprite\('VALIDER LE TOUR','rummi-action',\{command:'commit'\}/);
 assert.match(source,/actionSprite\('ANNULER LE DERNIER','rummi-action',\{command:'undoStep'\}/);
 assert.match(source,/actionSprite\('RECOMMENCER LE TOUR','rummi-action',\{command:'undo'\}/);
 assert.match(source,/current\?\.interactions\?\.rummi\?\.\(d\.command\)/);
 assert.match(html,/undoCount:canPlay\(\)\?Number\(S\.rummiUndoCount\?\?S\.rummiHistory\?\.length\?\?0\):0/);
 assert.match(html,/canCommit:!!\(canPlay\(\)&&rummiDiag\?\.ok\)/);
 assert.doesNotMatch(source,/rummi-action[^\n]*dispatch\(/);
});

test('99 direct drop uses the authoritative card action when the effect is unambiguous',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'quatrevingtdixneuf','online');const r=await t.page.evaluate(async()=>{net.gameId='quatrevingtdixneuf';net.state.turn=0;net.state.total99=0;S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const card=net.state.players[0].hand.find(c=>c.rank!==1),before={deck:net.state.deck.length,moves:net.state.moves,random:__test.random};const dropped=card?seen.interactions.specialCard('drop',card.id):false;return{card:card?{id:card.id,rank:card.rank}:null,dropped,before,after:{deck:net.state.deck.length,moves:net.state.moves,last:net.state.discard.at(-1)?.id,random:__test.random}};});assert.ok(r.card);assert.equal(r.dropped,true);assert.equal(r.after.moves,r.before.moves+1);assert.equal(r.after.last,r.card.id);assert.equal(r.after.deck,r.before.deck-1);assert.equal(r.after.random,r.before.random);}finally{await browser.close();}});

test('physical drop routing remembers release coordinates but leaves validation to interactions',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 const html=await readFile(path.join(root,'jeux.html'),'utf8');
 assert.match(source,/function rememberCardDropOrigin\(game,id,mesh\)/);
 assert.match(source,/function rememberNinetyDropOrigin\(id,mesh\)/);
 assert.match(source,/function rememberRummiDropOrigin\(id,mesh\)/);
 assert.match(source,/function showDropMarkerAt\(x,z,active=true\)/);
 assert.match(source,/function rummiDropTarget\(position\)/);
 assert.match(source,/function rummiDropDestination\(position\)/);
 assert.match(source,/d\.rummiDrop=rummiDropTarget\(d\.mesh\.position\)/);
 assert.match(source,/showDropMarkerAt\(target\.x,target\.z,d\.overDrop\)/);
 assert.match(source,/current\?\.interactions\?\.cardDrop\?\.\(d\.cardId\)/);
 assert.match(source,/current\?\.interactions\?\.rummi\?\.\('drop',\{id:d\.tileId,dest\}\)/);
 assert.match(html,/cardDrop\(id\)\{/);
 assert.match(html,/if\(type==='drop'&&value&&typeof value==='object'\)/);
 assert.match(html,/if\(type==='drop'&&typeof value==='string'\)/);
 assert.doesNotMatch(source,/rummiDropDestination[^\n]*dispatch\(/);
});

test('President direct drop preserves a selected multi-card group',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'president','online');const r=await t.page.evaluate(async()=>{net.gameId='president';net.state.turn=0;net.state.trick=null;net.state.passed=[];const hand=net.state.players[0].hand;if(hand.length<2)throw Error('President fixture needs two cards');hand[1]={...hand[1],rank:hand[0].rank};S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const ids=[S.players[0].hand[0].id,S.players[0].hand[1].id],before=net.state.players[0].hand.length;selection.clear();selection.add(ids[0]);selection.add(ids[1]);renderGame(false);const dropped=seen.interactions.cardDrop(ids[0]);return{ids,dropped,before,after:net.state.players[0].hand.length,trick:(net.state.trick?.cards||[]).map(c=>c.id),owner:net.state.trick?.owner};});assert.equal(r.dropped,true);assert.equal(r.after,r.before-2);assert.deepEqual(new Set(r.trick),new Set(r.ids));assert.equal(r.owner,0);}finally{await browser.close();}});

test('Rummikub direct drop preserves the selected tile group',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'rummikub','online');const r=await t.page.evaluate(async()=>{net.gameId='rummikub';let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const ids=S.players[0].hand.slice(0,2).map(t=>t.id),before={hand:net.state.players[0].hand.length,table:net.state.table.flat().length,random:__test.random};selection.clear();ids.forEach(id=>selection.add(id));renderGame(false);const dropped=seen.interactions.rummi('drop',{id:ids[0],dest:'new'});return{ids,dropped,before,after:{hand:net.state.players[0].hand.length,table:net.state.table.flat().length,contains:ids.every(id=>net.state.table.flat().some(t=>t.id===id)),random:__test.random}};});assert.equal(r.dropped,true);assert.equal(r.after.hand,r.before.hand-2);assert.equal(r.after.table,r.before.table+2);assert.equal(r.after.contains,true);assert.equal(r.after.random,r.before.random);}finally{await browser.close();}});

test('grouped 3D drag keeps selected companions presentation-only',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function dragSelectionIds\(obj,kind\)/);
 assert.match(source,/function groupedDragCompanions\(obj,kind\)/);
 assert.match(source,/companions=groupedDragCompanions\(obj,kind\)/);
 assert.match(source,/\(d\.companions\|\|\[\]\)\.forEach/);
 assert.match(source,/function rememberGroupedCardDropOrigins\(d\)/);
 assert.match(source,/function rememberGroupedRummiDropOrigins\(d\)/);
 assert.doesNotMatch(source,/groupedDragCompanions[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/restoreManipulatedMesh[^\n]*onlineAct\(/);
});

test('collected tricks stay in 2D history without reappearing on the physical 3D table',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/const physicalEntries=Array\.isArray\(state\?\.trickCards\)&&state\.trickCards\.length/);
 assert.match(source,/const physicalEntries=Array\.isArray\(s\?\.trickCards\)&&s\.trickCards\.length/);
 assert.match(source,/game==='plis'&&previous\.phase==='trickResult'&&currentSnapshot\.phase==='play'/);
 assert.doesNotMatch(source,/physicalEntries[^\n]*dispatch\(/);
});

test('Pouilleux 3D draw gesture reuses the authoritative pick interaction',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function maidSnapshot\(payload,maid,own\)/);
 assert.match(source,/d\.kind==='maid-pick'&&current\?\.gameId==='pouilleux'/);
 assert.match(source,/d\.maidToHand=d\.mesh\.position\.z>=1\.55/);
 assert.match(source,/pendingMaidPickOrigin=\{position:d\.mesh\.position\.clone\(\)/);
 assert.match(source,/current\?\.interactions\?\.specialCard\?\.\('pick',d\.index\)/);
 assert.match(source,/pairMade=snapshot\.discardCount>=previous\.discardCount\+2/);
 assert.doesNotMatch(source,/maidToHand[^\n]*dispatch\(/);
});

test('blackjack 3D shoe animates only projected cards after authoritative state changes',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 const html=await readFile(path.join(root,'jeux.html'),'utf8');
 assert.match(source,/function blackjackSnapshot\(payload,bj\)/);
 assert.match(source,/shoePos=new THREE\.Vector3\(-3\.75,TABLE_Y\+\.24,-\.55\)/);
 assert.match(source,/newOwn=snapshot\.hand\.filter/);
 assert.match(source,/prev\?\.hidden&&!card\?\.hidden/);
 assert.match(source,/queueCardFlight\(cardMesh\(card/);
 assert.match(html,/deckCount:S\.deck\.length/);
 assert.doesNotMatch(source,/blackjackSnapshot[^\n]*dispatch\(/);
});

test('blackjack 3D hit control still goes through the existing engine action',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'vingtetun','online');const r=await t.page.evaluate(async()=>{net.gameId='vingtetun';net.state.phase='play';net.state.turn=0;net.state.players.forEach((p,i)=>{p.status=i===0?'playing':'stand';p.bet=i===0?10:0;p.hand=i===0?[{id:'bj-test-2',rank:2,suit:'S'},{id:'bj-test-3',rank:3,suit:'H'}]:[]});net.state.dealer=[{id:'bj-dealer-10',rank:10,suit:'C'},{id:'bj-dealer-7',rank:7,suit:'D'}];net.state.dealerRevealed=false;net.state.deck=[{id:'bj-test-hit',rank:4,suit:'C'}];S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const before={hand:net.state.players[0].hand.length,deck:net.state.deck.length,revision:net.revision};const projected={deckCount:seen.viewData.blackjack.deckCount,hidden:seen.viewData.blackjack.dealer[1]?.hidden,hasRank:Object.hasOwn(seen.viewData.blackjack.dealer[1]||{},'rank')};const hit=seen.interactions.specialCard('hit');return{hit,before,projected,after:{hand:net.state.players[0].hand.length,deck:net.state.deck.length,revision:net.revision,last:net.state.players[0].hand.at(-1)?.id}};});assert.equal(r.projected.deckCount,1);assert.equal(r.projected.hidden,true);assert.equal(r.projected.hasRank,false);assert.equal(r.hit,true);assert.equal(r.after.hand,r.before.hand+1);assert.equal(r.after.deck,r.before.deck-1);assert.equal(r.after.revision,r.before.revision+1);assert.equal(r.after.last,'bj-test-hit');}finally{await browser.close();}});

test('Battle top-card drag and staged reveal remain adapters over projected state',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function battleSnapshot\(payload,battle\)/);
 assert.match(source,/makeLooseManipulable\(mesh,\{kind:'battle-card',tapEnabled:true,owner:i\}\)/);
 assert.match(source,/d\.kind==='battle-card'&&current\?\.gameId==='bataille'/);
 assert.match(source,/pendingBattleOrigin=\{position:d\.mesh\.position\.clone\(\)/);
 assert.match(source,/hideUntilStart:true/);
 assert.match(source,/onStart:\(\)=>\{visual\.mesh\.visible=false\}/);
 assert.match(source,/visual\.reveal\.hidden\?null:visual\.reveal\.card/);
 assert.doesNotMatch(source,/battleSnapshot[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/battleToCenter[^\n]*dispatch\(/);
});

test('Battle 3D action still goes through the authoritative battle engine',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'bataille','online');const r=await t.page.evaluate(async()=>{net.gameId='bataille';S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const before={number:net.state.battleNumber,moves:net.state.moves,revision:net.revision,counts:net.state.players.map(p=>p.hand.length)};const played=seen.interactions.specialCard('battle');const projected=S.battleReveal||[];return{played,before,after:{number:net.state.battleNumber,moves:net.state.moves,revision:net.revision,counts:net.state.players.map(p=>p.hand.length),reveal:net.state.battleReveal.length},projectedHidden:projected.filter(r=>r.hidden).map(r=>({hasCard:Object.hasOwn(r,'card'),keys:Object.keys(r)}))};});assert.equal(r.played,true);assert.equal(r.after.number,r.before.number+1);assert.equal(r.after.moves,r.before.moves+1);assert.equal(r.after.revision,r.before.revision+1);assert.equal(r.after.reveal>0,true);for(const hidden of r.projectedHidden)assert.equal(hidden.hasCard,false);}finally{await browser.close();}});

test('Menteur challenge pile collection is reconstructed from confirmed projected state',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/base\.centerCards=\(center\.cards\|\|\[\]\)\.map\(visualCardSnapshot\)/);
 assert.match(source,/game==='menteur'&&previous\.phase==='challenge'&&currentSnapshot\.phase==='play'/);
 assert.match(source,/receivers=currentSnapshot\.handCounts\.map/);
 assert.match(source,/addedIds=receiver===viewer/);
 assert.match(source,/historicalReveal=s\?\.phase==='play'&&!center\.claim&&Number\(center\.backCount\|\|0\)===0/);
 assert.match(source,/if\(localVisual\?\.mesh\)localVisual\.mesh\.visible=false/);
 assert.doesNotMatch(source,/historicalReveal[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/receivers[^\n]*onlineAct\(/);
});

test('Menteur 3D challenge still uses the authoritative challenge action',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'menteur','online');const r=await t.page.evaluate(async()=>{net.gameId='menteur';const revealed={id:'liar-test-truth',rank:5,suit:'S'};net.state.phase='challenge';net.state.turn=0;net.state.required=5;net.state.discard=[clone(revealed)];net.state.revealed=[];net.state.claim={owner:1,rank:5,cards:[clone(revealed)]};S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const before={hand:net.state.players[0].hand.length,discard:net.state.discard.length,revision:net.revision};const challenged=seen.interactions.cardAction('challenge');return{challenged,before,after:{hand:net.state.players[0].hand.length,discard:net.state.discard.length,phase:net.state.phase,claim:net.state.claim,revision:net.revision,revealed:net.state.revealed.map(c=>c.id)}};});assert.equal(r.challenged,true);assert.equal(r.after.hand,r.before.hand+1);assert.equal(r.after.discard,0);assert.equal(r.after.phase,'play');assert.equal(r.after.claim,null);assert.equal(r.after.revision,r.before.revision+1);assert.deepEqual(r.after.revealed,['liar-test-truth']);}finally{await browser.close();}});

test('completed trick cards drag as one physical group and collect through the existing action',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/makeLooseManipulable\(mesh,\{kind:'trick-collect',tapEnabled:true,cardId:entry\.card\.id\}\)/);
 assert.match(source,/if\(kind==='trick-collect'\)return objects\.children\.filter/);
 assert.match(source,/function rememberTrickCollectOrigins\(d\)/);
 assert.match(source,/d\.kind==='trick-collect'&&current\?\.gameId==='plis'/);
 assert.match(source,/d\.trickToHand=d\.mesh\.position\.z>=1\.42/);
 assert.match(source,/current\?\.interactions\?\.cardAction\?\.\('collect'\)/);
 assert.match(source,/previous\.trickOrigins\?\.get\?\.\(entry\.card\.id\)/);
 assert.doesNotMatch(source,/trickToHand[^\n]*dispatch\(/);
});

test('physical trick collection still uses the authoritative collect action',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'plis','online');const r=await t.page.evaluate(async()=>{net.gameId='plis';net.state.phase='trickResult';net.state.turn=0;net.state.completedTricks=1;net.state.trickCards=[{owner:0,card:{id:'trick-a',rank:10,suit:'S'}},{owner:1,card:{id:'trick-b',rank:9,suit:'S'}}];net.state.lastTrick=[];net.state.discard=[];S=projectGame(net.state,0);let seen=null;SalonTableView.register('3d',{available:()=>true,render(payload){seen=payload}});renderGame(false);await SalonTableView.setMode('3d',{persistPreference:false});const before={moves:net.state.moves,discard:net.state.discard.length,revision:net.revision};const collected=seen.interactions.cardAction('collect');return{collected,before,after:{moves:net.state.moves,discard:net.state.discard.map(c=>c.id),phase:net.state.phase,trick:net.state.trickCards.length,revision:net.revision}};});assert.equal(r.collected,true);assert.equal(r.after.moves,r.before.moves+1);assert.deepEqual(r.after.discard,['trick-a','trick-b']);assert.equal(r.after.phase,'play');assert.equal(r.after.trick,0);assert.equal(r.after.revision,r.before.revision+1);}finally{await browser.close();}});

test('free tabletop toss physics stays local and yields to authoritative drop zones',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/tossAnimations=\[\]/);
 assert.match(source,/const TOSSABLE_KINDS=new Set/);
 assert.match(source,/function freeTossVelocity\(d\)/);
 assert.match(source,/function startFreeToss\(d\)/);
 assert.match(source,/worldVelocity:new THREE\.Vector3\(\)/);
 assert.match(source,/d\.worldVelocity\.lerp\(rawWorld,\.46\)/);
 assert.match(source,/const xLimit=5\.05,zLimit=3\.08/);
 assert.match(source,/a\.velocity\.x=-Math\.abs\(a\.velocity\.x\)\*\.54/);
 assert.match(source,/if\(startFreeToss\(d\)\)return/);
 assert.match(source,/if\(d\.kind==='card-select'.*directCardDropNear\(d\)/s);
 assert.match(source,/if\(d\.kind==='rummi-tile'\)/);
 assert.doesNotMatch(source,/startFreeToss[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/freeTossVelocity[^\n]*onlineAct\(/);
 assert.doesNotMatch(source,/tossAnimations[^\n]*publishOnline\(/);
});

test('owned cards and rack tiles can keep local free poses without changing game state',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/const localPoses=new Map\(\)/);
 assert.match(source,/function poseScope\(payload=current\)/);
 assert.match(source,/state\?\.startedAt/);
 assert.match(source,/function applyLocalPose\(mesh/);
 assert.match(source,/function saveLocalPose\(mesh/);
 assert.match(source,/function pruneLocalPoses\(\)/);
 assert.match(source,/persistPose:true/);
 assert.match(source,/function settlePersistentPlacement\(d\)/);
 assert.match(source,/if\(a\.mesh\.userData\?\.persistLocalPose\)/);
 assert.match(source,/function storedLocalPose\(id,type='card'\)/);
 assert.match(source,/activePoseScope=poseScope\(payload\);poseSeen=new Set\(\)/);
 assert.match(source,/syncCurrent\(payload\);pruneLocalPoses\(\);pruneLabelCache\(\);updateLocalPoseResetButton\(\);updateCameraResetButton\(\);draw\(\)/);
 assert.doesNotMatch(source,/saveLocalPose[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/settlePersistentPlacement[^\n]*onlineAct\(/);
 assert.doesNotMatch(source,/localPoses[^\n]*publishOnline\(/);
});

test('authoritative drop handling precedes local free placement fallback',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 const cardDrop=source.indexOf("if(d.kind==='card-select'&&d.gestureStarted&&directCardDropNear(d))");
 const rummiDrop=source.indexOf("if(d.kind==='rummi-tile'){",cardDrop);
 const settle=source.indexOf('if(settlePersistentPlacement(d))return',cardDrop);
 assert.ok(cardDrop>=0&&rummiDrop>cardDrop&&settle>rummiDrop);
 assert.match(source,/rememberGroupedCardDropOrigins\(d\)/);
 assert.match(source,/current\?\.interactions\?\.cardDrop\?\.\(d\.cardId\)/);
 assert.match(source,/current\?\.interactions\?\.rummi\?\.\('drop'/);
});

test('nearby local cards magnetically snap into neat physical stacks without becoming game actions',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function localPoseSnapTarget\(mesh,position=mesh\?\.position\)/);
 assert.match(source,/limit=kind==='tile'\?\.38:\.52/);
 assert.match(source,/score=Math\.hypot\(dx,dz\*\.82\)/);
 assert.match(source,/function freePoseForMesh\(mesh,home=mesh\?\.userData\?\.home,\{snap=false\}=\{\}\)/);
 assert.match(source,/if\(snap\)\{const anchor=localPoseSnapTarget\(mesh,position\)/);
 assert.match(source,/rotation\.z=anchor\.rotation/);
 assert.match(source,/saveLocalPose\(item\.mesh,item\.home,\{order:poseOrder,snap:magnetic\}\)/);
 assert.match(source,/magnetic=!d\.stackMode&&items\.length===1/);
 assert.match(source,/d\.localSnap=.*localPoseSnapTarget\(d\.mesh,d\.mesh\.position\)/);
 assert.match(source,/showDropMarkerAt\(d\.localSnap\.x,d\.localSnap\.z,true\)/);
 assert.doesNotMatch(source,/localPoseSnapTarget[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/localPoseSnapTarget[^\n]*onlineAct\(/);
 assert.doesNotMatch(source,/localPoseSnapTarget[^\n]*publishOnline\(/);
});

test('persistent local poses stack cleanly and expose a local-only reset',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/localPoseOrder=0/);
 assert.match(source,/function localPoseDisplay\(key,pose\)/);
 assert.match(source,/Math\.abs\(other\.position\.x-pose\.position\.x\)<\.58/);
 assert.match(source,/Math\.abs\(other\.position\.z-pose\.position\.z\)<\.78/);
 assert.match(source,/pose\.order=Number\.isFinite\(order\)\?order:\+\+localPoseOrder/);
 assert.match(source,/data-table-3d-reset-poses hidden/);
 assert.match(source,/function resetActiveLocalPoses\(\)/);
 assert.match(source,/syncCurrent\(current\);pruneLocalPoses\(\)/);
 assert.match(source,/updateLocalPoseResetButton\(\);draw\(\)/);
 assert.doesNotMatch(source,/resetActiveLocalPoses[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/localPoseDisplay[^\n]*onlineAct\(/);
});

test('free thrown cards are shared anonymously and can be arranged back into hand',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 const html=await readFile(path.join(root,'jeux.html'),'utf8');
 assert.match(source,/const TABLETOP_CARD_GAMES=new Set/);
 assert.match(source,/data-table-3d-arrange-hand hidden/);
 assert.match(source,/function arrangeActiveHand\(\)/);
 assert.match(source,/emitLocalTabletopCard\('throw'/);
 assert.match(source,/cardMesh\(null,\{back:true\}\)/);
 assert.match(source,/window\.addEventListener\('salon:remote-tabletop-card',onRemoteTabletopCard\)/);
 assert.match(source,/socialCards=new THREE\.Group\(\)/);
 assert.match(html,/type:'card-tabletop'/);
 assert.match(html,/\['throw','arrange'\]\.includes/);
 assert.doesNotMatch(html,/card-tabletop[^\n]*(cardId|rank|suit)/);
});

test('remote free-card visuals are pruned to the authoritative hand count',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function remoteLooseLimit\(actor\)/);
 assert.match(source,/current\?\.state\?\.players\?\.\[actor\]\?\.hand/);
 assert.match(source,/Math\.max\(0,Math\.min\(54,count\)\)/);
 assert.match(source,/function trimRemoteLooseCards\(actor=null\)/);
 assert.match(source,/while\(entries\.length>limit\)/);
 assert.match(source,/removeRemoteLooseCard\(key,entry\)/);
 assert.match(source,/trimRemoteLooseCards\(actor\);startMotion\(\)/);
 assert.match(source,/else trimRemoteLooseCards\(\);resetCameraForGame/);
 assert.doesNotMatch(source,/trimRemoteLooseCards[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/trimRemoteLooseCards[^\n]*onlineAct\(/);
});

test('tabletop throw packets expose motion but never card identity',async()=>{const t=await table();browser=t.browser;try{await setup(t.page,'huit','online');const r=await t.page.evaluate(()=>{net.gameId='huit';const packet={type:'card-tabletop',matchId:net.matchId,revision:net.revision,gameId:'huit',action:'throw',token:7,lateral:.4,forward:.65,rotation:.2,speed:.7,cardId:'secret',rank:8,suit:'H'};const clean=tabletopCardClean(packet,0);const arrange=tabletopCardClean({...packet,action:'arrange'},0);return{clean,arrange};});assert.equal(r.clean.action,'throw');assert.equal(r.clean.token,7);assert.equal(Object.hasOwn(r.clean,'cardId'),false);assert.equal(Object.hasOwn(r.clean,'rank'),false);assert.equal(Object.hasOwn(r.clean,'suit'),false);assert.deepEqual(Object.keys(r.arrange).sort(),['action','actor','gameId','matchId','revision','type'].sort());}finally{await browser.close();}});

test('free 3D camera orbit, zoom, pinch and reset stay presentation-only',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/cameraControl=\{yaw:0,pitch:0,zoom:1\}/);
 assert.match(source,/function cameraViewChanged\(\)/);
 assert.match(source,/function resetCameraView\(\)/);
 assert.match(source,/data-table-3d-reset-camera hidden/);
 assert.match(source,/Math\.atan2\(dx,dz\)\+cameraControl\.yaw/);
 assert.match(source,/basePhi\+cameraControl\.pitch/);
 assert.match(source,/cameraRadius=baseRadius\*clampMotion\(cameraControl\.zoom,\.62,1\.72\)/);
 assert.match(source,/function zoomCamera\(delta\)/);
 assert.match(source,/function beginCameraDrag\(e\)/);
 assert.match(source,/function addCameraPointer\(e\)/);
 assert.match(source,/function moveCameraDrag\(e\)/);
 assert.match(source,/function cameraDragDistance\(points=cameraDrag\?\.points\)/);
 assert.doesNotMatch(source,/cameraControl\.pinchZoom/);
 assert.match(source,/cameraDrag\.pinchZoom\*\(cameraDrag\.pinchDistance\/distance\)/);
 assert.match(source,/if\(cameraDrag&&e\.pointerType==='touch'\)\{if\(addCameraPointer\(e\)\)return\}/);
 assert.match(source,/if\(!obj\)\{if\(e\.pointerType==='touch'\|\|e\.button===0\)beginCameraDrag\(e\);return\}/);
 assert.match(source,/if\(releaseCameraPointer\(e\)\)return/);
 assert.doesNotMatch(source,/zoomCamera[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/moveCameraDrag[^\n]*onlineAct\(/);
 assert.doesNotMatch(source,/cameraControl[^\n]*publishOnline\(/);
});

test('manual local object rotation stays presentation-only on wheel and touch twist',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/canvas\.addEventListener\('wheel',onWheel,\{passive:false\}\)/);
 assert.match(source,/function normalizeAngleDelta\(delta\)/);
 assert.match(source,/function rotateDraggedObject\(delta\)/);
 assert.match(source,/function onWheel\(e\)/);
 assert.match(source,/direction\*-Math\.PI\/18/);
 assert.match(source,/e\.pointerType==='touch'/);
 assert.match(source,/drag\.twist=\{pointerId:e\.pointerId,lastAngle:angle,startedAt:performance\.now\(\),turned:false\}/);
 assert.match(source,/drag\.twist\?\.pointerId===e\.pointerId/);
 assert.match(source,/rotateDraggedObject\(delta\)/);
 assert.match(source,/const tap=!d\.stackMode&&!d\.rotated&&!d\.flipped&&/);
 assert.match(source,/saveLocalPose\(obj,home\)/);
 assert.match(source,/canvas\?\.removeEventListener\('wheel',onWheel\)/);
 assert.doesNotMatch(source,/rotateDraggedObject[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/onWheel[^\n]*onlineAct\(/);
 assert.doesNotMatch(source,/drag\.twist[^\n]*publishOnline\(/);
});

test('local face flipping persists locally and coexists with rotation, tosses and stack mode',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function faceRotationX\(value\)/);
 assert.match(source,/function flipLocalObject\(mesh\)/);
 assert.match(source,/function flipDraggedObject\(\)/);
 assert.match(source,/d\.stackMode\)return false/);
 assert.match(source,/function onKeyDown\(e\)/);
 assert.match(source,/String\(e\.key\|\|''\)\.toLowerCase\(\)!=='f'/);
 assert.match(source,/manualFace:faceRotationX\(obj\.rotation\.x\)/);
 assert.match(source,/faceX:faceRotationX\(item\.mesh\.rotation\.x\)/);
 assert.match(source,/a\.mesh\.rotation\.x=\(a\.faceX\?\?-Math\.PI\/2\)/);
 assert.match(source,/const tap=!d\.stackMode&&!d\.rotated&&!d\.flipped/);
 assert.match(source,/twist=drag\.twist,quickTap=allowFlip&&!twist\.turned/);
 assert.match(source,/function onPointerUp\(e\)\{if\(releaseCameraPointer\(e\)\)return;if\(releaseTwistPointer\(e,\{allowFlip:true\}\)\)return/);
 assert.match(source,/performance\.now\(\)-Number\(twist\.startedAt\|\|0\)<=260/);
 assert.match(source,/if\(quickTap\)flipDraggedObject\(\)/);
 assert.match(source,/mats=\[edgeMaterial,edgeMaterial,edgeMaterial,edgeMaterial,front,rummiBackMaterial\]/);
 assert.match(source,/canvas\.addEventListener\('keydown',onKeyDown\)/);
 assert.match(source,/canvas\?\.removeEventListener\('keydown',onKeyDown\)/);
 assert.doesNotMatch(source,/flipLocalObject[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/flipDraggedObject[^\n]*onlineAct\(/);
 assert.doesNotMatch(source,/onKeyDown[^\n]*publishOnline\(/);
});

test('local pose stacks can be moved as local-only packets without becoming game actions',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function localStackCompanions\(mesh\)/);
 assert.match(source,/const maxOrder=Math\.max/);
 assert.match(source,/function enableLocalStackDrag\(d\)/);
 assert.match(source,/function armLocalStackDrag\(d,e\)/);
 assert.match(source,/e\?\.shiftKey/);
 assert.match(source,/e\?\.pointerType==='touch'/);
 assert.match(source,/setTimeout\(\(\)=>\{if\(drag===d&&!d\.moved&&!d\.twist\)enableLocalStackDrag\(d\)\},340\)/);
 assert.match(source,/if\(d\.stackMode\)\{/);
 assert.match(source,/poseOrder=d\.stackMode\?localPoses\.get/);
 assert.match(source,/saveLocalPose\(a\.mesh,a\.home,\{order:a\.poseOrder\}\)/);
 assert.match(source,/const tap=!d\.stackMode&&!d\.rotated/);
 assert.doesNotMatch(source,/enableLocalStackDrag[^\n]*onlineAct\(/);
 assert.doesNotMatch(source,/stackMode[^\n]*dispatch\(/);
});

test('local whole-stack movement preserves existing pose order',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/function saveLocalPose\(mesh,home=mesh\?\.userData\?\.home,\{order=null,snap=false\}=\{\}\)/);
 assert.match(source,/pose\.order=Number\.isFinite\(order\)\?order:\+\+localPoseOrder/);
 assert.match(source,/localPoseOrder=Math\.max\(localPoseOrder,order\)/);
 assert.match(source,/sort\(\(a,b\)=>\(Number\(a\.pose\.order\)\|\|0\)-\(Number\(b\.pose\.order\)\|\|0\)\)/);
});

test('free 3D tabletop manipulation stays presentation-only until an explicit valid action',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/manipAnimations=\[\]/);
 assert.match(source,/function makeLooseManipulable\(/);
 assert.match(source,/function beginLooseCardDrag\(/);
 assert.match(source,/function moveLooseCardDrag\(/);
 assert.match(source,/function returnManipulatedCard\(/);
 assert.match(source,/if\(!current\?\.canInteract&&!obj\.userData\.looseManip\)return/);
 assert.match(source,/if\(drag\.loose\)\{moveLooseCardDrag\(e\);return\}/);
 assert.match(source,/makeLooseManipulable\(mesh,\{kind:'rummi-tile'/);
 assert.match(source,/if\(mine\)\{makeLooseManipulable\(mesh,\{kind:mesh\.userData\.kind/);
 assert.match(source,/interactiveCard:true,playable:playable\.has\(card\.id\)/);
 assert.doesNotMatch(source,/returnManipulatedCard[^\n]*dispatch\(/);
 assert.doesNotMatch(source,/moveLooseCardDrag[^\n]*onlineAct\(/);
 assert.match(source,/card-action/);
});
