import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../../',import.meta.url));
const epoch=Date.UTC(2026,8,27,12);
const clone=x=>JSON.parse(JSON.stringify(x));

async function peers(id){
 const browser=await chromium.launch({headless:true,executablePath:process.env.TABLE_BROWSER_EXECUTABLE});
 const context=await browser.newContext();
 const errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='http://table.test')return route.fulfill({status:200,contentType:'text/javascript',body:''});
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root))return route.abort();
  try{const body=await readFile(file);return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream'),body})}
  catch{return route.fulfill({status:404,body:''})}
 });
 await context.addInitScript(({epoch})=>{
  const t=window.__test={now:epoch,seed:1432140,timers:new Map(),next:1};
  const NativeDate=Date;
  window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[t.now]))}static now(){return t.now}};
  Math.random=()=>{t.seed=(Math.imul(t.seed,1664525)+1013904223)>>>0;return t.seed/4294967296};
  const add=(type,fn,ms=0)=>{const id=t.next++;t.timers.set(id,{type,fn,ms});return id};
  window.setTimeout=(fn,ms)=>add('timeout',fn,ms);
  window.setInterval=(fn,ms)=>add('interval',fn,ms);
  window.requestAnimationFrame=fn=>add('frame',fn,16);
  window.clearTimeout=window.clearInterval=window.cancelAnimationFrame=id=>t.timers.delete(id);
  localStorage.setItem('table.v3.prefs',JSON.stringify({sound:false,motion:false,immersive:false,fast:false,light:false}));
 },{epoch});
 const host=await context.newPage(),guest=await context.newPage();
 await Promise.all([host.goto('http://table.test/jeux.html'),guest.goto('http://table.test/jeux.html')]);
 await host.evaluate(id=>{
  window.__outgoing=[];
  net=freshNetwork();
  Object.assign(net,{active:true,role:'host',me:0,connected:true,started:true,status:'playing',gameId:id,
   code:'ABCDEF12',name:'Host',capacity:2,revision:1,viewRevision:-1,matchId:'match-'+id,
   paused:[false,false],replay:[false,false],phrases:['',''],timeControl:{enabled:false},
   spectators:new Map(),chat:[],seats:[
    {name:'Host',token:'host',ready:true,lastSeq:0},
    {name:'Guest',token:'guest',ready:true,lastSeq:0,conn:{open:true,send:p=>window.__outgoing.push(clonePacket(p))}}
   ]});
  function clonePacket(p){return JSON.parse(JSON.stringify(p))}
  net.state=createGame(id,{mode:'online',names:['Host','Guest'],timeControl:{enabled:false}});
  S=projectGame(net.state,0);view='game';gate=false;busy=false;selection.clear();showSuit=null;
  prefs.motion=false;prefs.sound=false;applyPrefs();
  SalonTableView.register('3d',{available:()=>true,activate(){},deactivate(){},render(){}});
  renderGame(false);publishOnline();
 },id);
 await guest.evaluate(id=>{
  window.__outgoing=[];
  net=freshNetwork();
  Object.assign(net,{active:true,role:'guest',me:1,connected:true,started:false,status:'playing',
    gameId:id,code:'ABCDEF12',name:'Guest',otherName:'Host',capacity:2,
    revision:0,viewRevision:-1,matchId:'match-'+id,paused:[false,false],replay:[false,false],seq:0,
    roster:[{index:0,name:'Host',connected:true},{index:1,name:'Guest',connected:true}],
    conn:{open:true,send:p=>window.__outgoing.push(JSON.parse(JSON.stringify(p)))}
  });
  S=null;view='lobby';gate=false;busy=false;selection.clear();showSuit=null;
  prefs.motion=false;prefs.sound=false;applyPrefs();
  SalonTableView.register('3d',{available:()=>true,activate(){},deactivate(){},render(){}});
 },id);
 const drain=async page=>page.evaluate(()=>window.__outgoing.splice(0));
 const deliver=async()=>{
  const outgoing=await drain(guest);
  for(const packet of outgoing)if(packet.type==='action')await host.evaluate(p=>handleGuestAction(p,1),packet);
  const incoming=await drain(host);
  for(const packet of incoming)if(packet.type==='state')await guest.evaluate(p=>acceptOnlineSnapshot(p),packet);
  return{outgoing,incoming};
 };
 await deliver();
 const state=async()=>({
  host:await host.evaluate(()=>JSON.parse(JSON.stringify(net.state))),
  guest:await guest.evaluate(()=>JSON.parse(JSON.stringify(S))),
  projected:await host.evaluate(()=>projectGame(net.state,1)),
  ack:await guest.evaluate(()=>({pending:net.pending,revision:net.revision,seq:net.seq})),
  hostRevision:await host.evaluate(()=>net.revision),
 });
 // The browser globals deliberately share no JS realm; all packets cross via an explicit relay.
 async function toggleViews(){
  const before=await state();
  for(const page of [host,guest]){
   const result=await page.evaluate(async()=>{
    const entered=await SalonTableView.setMode('3d',{persistPreference:false});
    renderGame(false);
    const returned=await SalonTableView.setMode('2d',{persistPreference:false});
    renderGame(false);
    return{entered:entered.ok,returned:returned.ok,mode:SalonTableView.getMode()};
   });
   assert.deepEqual(result,{entered:true,returned:true,mode:'2d'});
  }
  const after=await state();
  assert.deepEqual(after,before,'view switching must not affect either authoritative or projected state');
 }
 async function step(action=null){
  const {actor,turnAction}=await host.evaluate(()=>{
   const actor=net.state.turn,turnAction=ai(net.state);
   return{actor,turnAction};
  });
  const a=action||turnAction;
  if(actor===0){
   const ok=await host.evaluate(a=>applyOnlineAction(a,0),a);
   assert.equal(ok,true,'host action accepted: '+JSON.stringify(a));
  }else{
   await guest.evaluate(a=>onlineAct(a),a);
  }
  const packets=await deliver(),next=await state();
  assert.deepEqual(next.guest,next.projected,'guest sees the host-authoritative projection');
  assert.equal(next.ack.pending,0,'guest actions must be acknowledged');
  assert.equal(next.ack.revision,next.hostRevision,'host and guest revisions converge');
  assert.ok(packets.incoming.some(p=>p.type==='state'),'host broadcasts an authoritative snapshot');
  return{action:a,actor,next,packets};
 }
 async function close(){await browser.close()}
 return{host,guest,errors,close,drain,deliver,state,step,toggleViews};
}

test('Cactus accepts a valid out-of-turn guest quick throw exactly once and synchronizes both browsers',async()=>{
 const pair=await peers('cactus');
 try{
  await pair.host.evaluate(()=>{
   const c=net.state.players[1].hand[0];net.state.discard.at(-1).rank=c.rank;
   net.state.phase='draw';net.state.turn=0;publishOnline();
  });
  await pair.deliver();
  const before=await pair.state();
  const guestCount=before.host.players[1].hand.filter(Boolean).length;
  await pair.guest.evaluate(()=>onlineAct({type:'quick',index:0}));
  const packets=await pair.deliver(),after=await pair.state();
  assert.equal(after.host.players[1].hand.filter(Boolean).length,guestCount-1);
  assert.equal(after.host.lastQuick?.owner,1);
  assert.equal(after.host.lastQuick?.good,true);
  assert.equal(after.host.turn,0,'quick throw is legal outside guest turn');
  assert.deepEqual(after.guest,after.projected,'two browsers agree after a remote quick');
  assert.equal(after.ack.pending,0,'guest sees the acknowledged quick action');
  assert.equal(after.hostRevision,before.hostRevision+1);
  const original=packets.outgoing.find(p=>p.type==='action');
  assert.ok(original);
  await pair.host.evaluate(p=>handleGuestAction(p,1),original);
  assert.equal((await pair.state()).hostRevision,after.hostRevision,'replayed quick packet never mutates twice');
  await pair.deliver();
  await pair.toggleViews();
  assert.deepEqual(pair.errors,[]);
 }finally{await pair.close()}
});

test('Eight and Cactus finish authoritative two-browser rounds across repeated 2D/3D switches',async()=>{
 for(const id of ['huit','cactus']){
  const pair=await peers(id);
  try{
   let steps=0,hostMoves=0,guestMoves=0,switches=0,finished=false;
   while(steps<450){
    const before=await pair.state();
    if(before.host.phase==='over'){finished=true;break}
    if(steps%6===0){await pair.toggleViews();switches++}
    const result=await pair.step();
    if(result.actor===0)hostMoves++;else guestMoves++;
    steps++;
   }
   const after=await pair.state();
   assert.equal(finished||after.host.phase==='over',true,id+' reaches authoritative over state');
   assert.ok(steps>3&&steps<450,id+' completes a realistic round in bounded actions');
   assert.ok(hostMoves>0&&guestMoves>0,id+' both browsers submit actions');
   assert.ok(switches>=2,id+' view switching runs during active play');
   assert.deepEqual(after.guest,after.projected,id+' result and winner projection match');
   assert.deepEqual(after.guest.winners,after.host.winners,id+' both displays agree on winners');
   const result=await Promise.all([pair.host,pair.guest].map(p=>p.evaluate(()=>({
    phase:S.phase,dialog:!!document.querySelector('.win-box'),mode:SalonTableView.getMode()
   }))));
   for(const p of result){assert.equal(p.phase,'over');assert.equal(p.dialog,true);assert.equal(p.mode,'2d')}
   assert.deepEqual(pair.errors,[],id+' no JavaScript errors');
  }finally{await pair.close()}
 }
});
