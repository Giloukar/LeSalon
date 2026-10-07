import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));

async function controller(){
  const source=await readFile(path.join(root,'shared/table-view.js'),'utf8');
  const store=new Map();
  const html={dataset:{},removeAttribute(name){delete this.dataset[name.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]}};
  const sandbox={
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback){callback();return 1},
    CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail}},
    document:{documentElement:html},
    localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value))},
    dispatchEvent(){return true}
  };
  sandbox.window=sandbox;
  vm.runInNewContext(source,sandbox,{filename:'table-view.js'});
  return sandbox.SalonTableView;
}

test('a pending 3D prepare cannot reactivate 3D after an immediate return to 2D',async()=>{
  const view=await controller();
  view.register('2d',{render(){}});

  let releasePrepare;
  const prepareGate=new Promise(resolve=>{releasePrepare=resolve});
  const calls={activate:0,render:0,deactivate:0};
  view.register('3d',{
    available:()=>true,
    prepare:()=>prepareGate,
    activate(){calls.activate++},
    render(){calls.render++},
    deactivate(){calls.deactivate++}
  });

  const enter3d=view.setMode('3d');
  const return2d=await view.setMode('2d');
  assert.equal(return2d.ok,true);
  assert.equal(return2d.mode,'2d');
  assert.equal(return2d.reason,'unchanged');

  releasePrepare();
  const stale3d=await enter3d;
  assert.equal(stale3d.ok,false);
  assert.equal(stale3d.mode,'2d');
  assert.equal(stale3d.reason,'superseded');
  assert.equal(view.getMode(),'2d');
  assert.deepEqual(calls,{activate:0,render:0,deactivate:0});
});
