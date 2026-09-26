import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const epoch = Date.UTC(2026, 8, 27, 12);
async function table() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.TABLE_BROWSER_EXECUTABLE });
  const context = await browser.newContext(); const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://table.test') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) return route.abort();
    try { const body = await readFile(file); const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }; await route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body }); }
    catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await page.addInitScript(({ epoch }) => {
    const c = window.__test = { now: epoch, seed: 123456789, random: 0, packets: [], timers: new Map(), next: 1 };
    const NativeDate = Date; window.Date = class extends NativeDate { constructor(...a) { super(...(a.length ? a : [c.now])); } static now() { return c.now; } };
    Math.random = () => { c.random++; c.seed = (Math.imul(c.seed, 1664525) + 1013904223) >>> 0; return c.seed / 4294967296; };
    const add = (kind, fn, delay=0) => { const id=c.next++; c.timers.set(id,{kind,fn,delay:Number(delay),due:c.now+Number(delay)}); return id; };
    window.setTimeout=(fn,d)=>add('timeout',fn,d); window.setInterval=(fn,d)=>add('interval',fn,d); window.clearTimeout=window.clearInterval=id=>c.timers.delete(id); window.requestAnimationFrame=fn=>add('frame',fn,16); window.cancelAnimationFrame=id=>c.timers.delete(id);
    c.advance = ms => { c.now += ms; }; c.run = id => { const t=c.timers.get(id); if(!t) throw Error('missing timer'); c.now=Math.max(c.now,t.due); if(t.kind==='interval') t.due=c.now+t.delay; else c.timers.delete(id); t.fn(); };
    localStorage.setItem('table.v3.prefs', JSON.stringify({ sound:false, motion:false, immersive:true, fast:false, light:false }));
  }, { epoch });
  await page.goto('http://table.test/jeux.html');
  await page.evaluate(() => { if(typeof houseEightAct!=='function'||typeof legacyCactusQuickUI!=='function') throw Error('final overrides missing'); __test.connection=()=>({open:true,send:p=>__test.packets.push(JSON.parse(JSON.stringify(p))),close(){}}); });
  return { browser, page, errors };
}
const clone = value => JSON.parse(JSON.stringify(value));
async function setup(page, id='huit', mode='solo', timed=false) { return page.evaluate(({id,mode,timed}) => { net=freshNetwork(); prefs.motion=false; prefs.sound=false; prefs.fast=false; prefs.immersive=true; applyPrefs(); S=createGame(id,{mode,names:['A','B','C'],timeControl:{enabled:timed,initial:120,bonus:10,drawBonus:10}}); view='game'; gate=false; busy=false; selection.clear(); showSuit=null; if(mode==='online'){net.active=true;net.role='host';net.me=0;net.connected=true;net.started=true;net.status='playing';net.matchId='test';net.revision=1;net.state=S;net.seats=S.players.map(p=>({name:p.name,lastSeq:0,conn:__test.connection()}));net.conn=__test.connection();S=projectGame(net.state,0);} renderGame(false); return Object.keys(GAMES); }, {id,mode,timed}); }
async function clean(page) { const result=await page.evaluate(() => ({ state:clone(S), random:__test.random, packets:clone(__test.packets), timers:[...__test.timers].map(([id,t])=>({id,kind:t.kind,delay:t.delay,due:t.due})) })); return result; }

let browser;
test('22 final game definitions survive repeated 2D refreshes', async () => { const t=await table(); browser=t.browser; try { const games=await setup(t.page); assert.equal(games.length,22); for(const id of games){ await setup(t.page,id); const before=await clean(t.page); await t.page.evaluate(()=>{ for(let i=0;i<5;i++) renderGame(false); }); assert.deepEqual(await clean(t.page),before,id); } assert.deepEqual(t.errors,[]); } finally { await browser.close(); } });

test('same seed and actions are independent of extra frames', async () => { const t=await table(); browser=t.browser; try { await setup(t.page); const run=extra=>t.page.evaluate(extra=>{const trace=[];for(let i=0;i<6&&S.phase!=='over';i++){const a=ai(S);trace.push({a,ok:act(S,a)});if(extra)for(let j=0;j<3;j++)renderGame(false);}return {state:clone(S),trace,random:__test.random};},extra); const a=await run(false); await setup(t.page); const b=await run(true); assert.deepEqual(b,a); } finally { await browser.close(); } });

test('render currently settles an active clock (diagnostic)', async () => { const t=await table(); browser=t.browser; try { await setup(t.page,'huit','solo',true); const r=await t.page.evaluate(()=>{S.clock.running=true;S.clock.lastAt=Date.now();const before=clone(S);__test.advance(4000);renderGame(false);return {before,after:clone(S)};}); assert.equal(r.before.clock.remaining[0]-r.after.clock.remaining[0],4000); } finally { await browser.close(); } });

test('final guest handler loses the authenticated seat index (diagnostic)', async () => { const t=await table(); browser=t.browser; try { await setup(t.page,'huit','online'); const r=await t.page.evaluate(()=>{net.state.turn=2;const n=net.state.players[2].hand.length;handleGuestAction({seq:1,revision:1,matchId:'test',action:{type:'draw'}},2);return {drawn:net.state.players[2].hand.length-n,seq:net.seats[2].lastSeq};}); assert.deepEqual(r,{drawn:0,seq:0}); } finally { await browser.close(); } });
