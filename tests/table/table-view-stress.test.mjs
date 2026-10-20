import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));

async function controller(){
  const source=await readFile(path.join(root,'shared/table-view.js'),'utf8');
  const frames=[],events=[],storage=new Map();
  const element={dataset:{},removeAttribute(name){
    delete this.dataset[name.replace(/^data-/,'').replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())];
  }};
  const sandbox={
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback){frames.push(callback);return frames.length},
    CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail}},
    document:{documentElement:element},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},
    dispatchEvent(event){events.push(event);return true}
  };
  sandbox.window=sandbox;
  vm.runInNewContext(source,sandbox,{filename:'table-view.js'});
  return{view:sandbox.SalonTableView,element,events,storage,flushFrames(){
    let iterations=0;
    while(frames.length){
      if(++iterations>100)throw Error('Animation frame guard failed to settle');
      frames.shift()();
    }
  }};
}

test('repeated 2D/3D switching preserves the authoritative snapshot and deactivates each 3D session',async()=>{
  const {view,element,events,flushFrames}=await controller();
  const state=Object.freeze({turn:3,score:80}),network=Object.freeze({revision:17,packets:4});
  const payload=Object.freeze({gameId:'huit',state,network});
  const calls={base:0,activate:0,render:0,deactivate:0};
  view.register('2d',{render(p){assert.equal(p,payload);calls.base++}});
  view.register('3d',{
    available:()=>true,
    activate(){calls.activate++},
    render(p){assert.equal(p,payload);calls.render++},
    deactivate(){calls.deactivate++}
  });
  view.render(payload);
  for(let i=0;i<12;i++){
    const entered=await view.setMode('3d',{persistPreference:false});
    assert.equal(entered.ok,true);
    assert.equal(view.getMode(),'3d');
    view.render(payload);
    const returned=await view.setMode('2d',{persistPreference:false});
    assert.equal(returned.ok,true);
    assert.equal(view.getMode(),'2d');
    view.render(payload);
  }
  flushFrames();
  assert.equal(element.dataset.tableView,'2d');
  assert.equal(element.dataset.tableViewTransition,undefined);
  assert.deepEqual(calls,{base:25,activate:12,render:24,deactivate:12});
  assert.equal(events.filter(event=>event.type==='salon:table-view-change').length,24);
  assert.equal(view.getLastPayload(),payload);
  assert.equal(view.getPreferredMode(),'2d');
  assert.equal(state.turn,3);
  assert.equal(network.revision,17);
});

test('multiple late 3D loads cannot override a newer 2D request',async()=>{
  const {view,element,flushFrames}=await controller();
  const gates=[],calls={activate:0,render:0,deactivate:0};
  view.register('2d',{render(){}});
  view.register('3d',{
    available:()=>true,
    prepare(){return new Promise(resolve=>gates.push(resolve))},
    activate(){calls.activate++},
    render(){calls.render++},
    deactivate(){calls.deactivate++}
  });
  view.render({phase:'playing'});
  const first=view.setMode('3d',{persistPreference:false});
  const second=view.setMode('3d',{persistPreference:false});
  assert.equal((await view.setMode('2d',{persistPreference:false})).reason,'unchanged');
  gates[1]();gates[0]();
  assert.equal((await second).reason,'superseded');
  assert.equal((await first).reason,'superseded');
  assert.deepEqual(calls,{activate:0,render:0,deactivate:0});
  const third=view.setMode('3d',{persistPreference:false});
  gates[2]();
  assert.equal((await third).ok,true);
  assert.equal(view.getMode(),'3d');
  assert.equal((await view.setMode('2d',{persistPreference:false})).ok,true);
  flushFrames();
  assert.equal(element.dataset.tableView,'2d');
  assert.equal(element.dataset.tableViewTransition,undefined);
  assert.deepEqual(calls,{activate:1,render:1,deactivate:1});
});

test('returning to 2D during a 3D presentation cancels its adapter and never replays stale frames',async()=>{
  const {view,element,flushFrames}=await controller();
  const frames=[],rendered2d=[];
  const states=[{revision:1},{revision:2},{revision:3}];
  view.register('2d',{render(payload){rendered2d.push(payload.state.revision)}});
  view.register('3d',{
    available:()=>true,
    activate(){},
    render(payload){frames.push({revision:payload.state.revision,active:true})},
    deactivate(){for(const frame of frames)frame.active=false}
  });
  view.render({state:states[0]});
  assert.equal((await view.setMode('3d',{persistPreference:false})).ok,true);
  view.render({state:states[1]});
  assert.equal(frames.length,2);
  assert.ok(frames.every(frame=>frame.active));
  assert.equal((await view.setMode('2d',{persistPreference:false})).ok,true);
  assert.ok(frames.every(frame=>!frame.active));
  view.render({state:states[2]});
  assert.equal(frames.length,2,'only the 2D renderer receives updates after deactivation');
  assert.equal((await view.setMode('3d',{persistPreference:false})).ok,true);
  assert.equal(frames.at(-1).revision,3,'reactivation renders the latest authoritative snapshot');
  assert.equal((await view.setMode('2d',{persistPreference:false})).ok,true);
  flushFrames();
  assert.equal(element.dataset.tableView,'2d');
  assert.equal(element.dataset.tableViewTransition,undefined);
  assert.deepEqual(rendered2d,[1,2,3]);
});
