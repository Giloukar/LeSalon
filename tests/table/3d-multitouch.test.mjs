import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=await readFile(fileURLToPath(new URL('../../shared/table-3d.js',import.meta.url)),'utf8');
function extract(start,end){
 const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
 assert.ok(first>=0&&last>first,'3D handler boundary: '+start);
 return source.slice(first,last);
}
const handlers=extract('  function onPointerDown(e){','  function onPointerMove(e){')+'\n'+
 extract('  function finishDrag(e,cancelled=false){','  function cancelActiveDrag(pointerId=null){')+'\n({onPointerDown,finishDrag})';

function tableHarness(overrides={}){
 const events=[],actions=[],restores=[],settles=[];
 const mesh={rotation:{z:0},position:{x:0,z:2.45}};
 const d={
  pointerId:1,pointerType:'touch',kind:'card',mesh,home:{rotation:{z:0}},
  cardId:'eight-card',canPlay:true,gestureStarted:true,startX:100,startY:200,
  moved:false,overDrop:false,multiTouch:false,rotated:false,flipped:false,
  manualRotation:0,stackMode:false,...overrides
 };
 const sandbox={
  active:true,drag:d,canvas:{focus(){},setPointerCapture(){}},
  host:{classList:{add(){},remove(){}}},
  dropMarker:{visible:true,material:{opacity:1}},
  current:{gameId:'huit',canInteract:true,interactions:{
   playCard(id){actions.push(['playCard',id]);return true},
   cactus(type,index){actions.push(['cactus',type,index]);return true}
  }},
  document:{hidden:false},
  performance:{now(){return 1000}},
  clearStackHold(){},capturePointer(){},syncCurrent(){},draw(){},
  emitLocalCardGesture(phase){events.push(phase)},
  directCardDropNear(){return true},cardDropRadius(){return 1.9},
  returnManipulatedCard(obj,options){restores.push(options||{})},
  settlePersistentPlacement(obj){settles.push(obj);return false},
  startFreeToss(){return false},
  hit(){return null},setHover(){},beginCameraDrag(){},addCameraPointer(){return false},
  clearPointer(){},releaseCameraPointer(){return false},releaseTwistPointer(){return false}
 };
 const handlers=vm.runInNewContext(globalThisHandlers,sandbox);
 const event=(pointerId=1,type='pointerup')=>({
  pointerId,pointerType:'touch',clientX:100,clientY:200,
  preventDefault(){},button:0
 });
 return{d,sandbox,events,actions,restores,settles,handlers,event};
}
const globalThisHandlers=handlers;

test('Eight 3D one-finger tap and intentional drop still use the authoritative play action',()=>{
 const tapped=tableHarness();
 tapped.handlers.finishDrag(tapped.event());
 assert.equal(tapped.actions.length,1);
 assert.equal(tapped.actions[0][0],'playCard');
 assert.deepEqual(tapped.events,['commit']);
 const dragged=tableHarness({moved:true,overDrop:true});
 dragged.handlers.finishDrag(dragged.event());
 assert.equal(dragged.actions.length,1);
 assert.deepEqual(dragged.events,['commit']);
});

test('secondary finger on an Eight card cannot commit an accidental play on release',()=>{
 const h=tableHarness();
 h.handlers.onPointerDown(h.event(2,'pointerdown'));
 assert.equal(h.d.multiTouch,true);
 assert.equal(h.d.twist.pointerId,2);
 h.handlers.finishDrag(h.event());
 assert.equal(h.actions.length,0,'no gameplay action despite unchanged primary touch position');
 assert.deepEqual(h.events,['cancel'],'drag presence is cancelled, never committed');
 assert.equal(h.restores.length,1,'card returns to a safe local position');
 assert.equal(h.restores[0].snap,true);
});

test('rotating or flipping a playable Eight card near the pile is not a card play',()=>{
 for(const prop of ['rotated','flipped']){
  const h=tableHarness({[prop]:true,moved:true,overDrop:true});
  h.handlers.finishDrag(h.event());
  assert.equal(h.actions.length,0,prop+' is presentation-only');
  assert.deepEqual(h.events,['cancel']);
  assert.equal(h.restores.length,1);
 }
});

test('Cactus one-finger quick throw works, but two-finger or flipped cards do not throw',()=>{
 const normal=tableHarness({kind:'cactus-quick',loose:true,index:2,moved:true,tapEnabled:true});
 normal.handlers.finishDrag(normal.event());
 assert.deepEqual(normal.actions,[['cactus','quick',2]]);
 assert.deepEqual(normal.events,['commit']);
 for(const overrides of [{multiTouch:true},{flipped:true},{rotated:true}]){
  const h=tableHarness({kind:'cactus-quick',loose:true,index:2,moved:true,tapEnabled:true,...overrides});
  h.handlers.finishDrag(h.event());
  assert.equal(h.actions.length,0,'no quick throw for '+JSON.stringify(overrides));
  assert.ok(h.events.includes('cancel'));
  assert.equal(h.restores.length,1);
 }
});

test('the multi-touch guard applies to drawn Cactus swaps as well as quick throws',()=>{
 const h=tableHarness({kind:'cactus-drawn',loose:true,index:1,moved:true,multiTouch:true,tapEnabled:false});
 h.handlers.finishDrag(h.event());
 assert.equal(h.actions.length,0);
 assert.equal(h.settles.length,1);
 assert.equal(h.restores.length,1);
});
