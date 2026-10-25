import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

test('touch expansion on Eight and Cactus selects only neighboring 3D targets',async()=>{
 const file=fileURLToPath(new URL('../../shared/table-3d.js',import.meta.url)),source=await readFile(file,'utf8');
 const start=source.indexOf('  function hit(e){'),end=source.indexOf('  function setHover(mesh){',start);
 assert.ok(start>=0&&end>start,'actual 3D hit function can be isolated for regression coverage');
 const interactive=[{userData:{interactive:true,cardId:'near'}},{userData:{interactive:true,cardId:'exact'}}];
 const pointer={x:0,y:0,set(x,y){this.x=x;this.y=y}};
 let targets=new Map(),probes=0;
 const key=(x,y)=>Math.round(x)+','+Math.round(y);
 const raycaster={
  setFromCamera(){},
  intersectObjects(){probes++;const x=(pointer.x+1)*200,y=(1-pointer.y)*300,object=targets.get(key(x,y));return object?[{object}]:[]}
 };
 const context={
  raycaster,pointer,canvas:{getBoundingClientRect(){return{left:0,top:0,width:400,height:600}}},
  current:{gameId:'huit'},camera:{},interactive,
  updatePointer(e){pointer.set(e.clientX/400*2-1,-e.clientY/600*2+1);raycaster.setFromCamera(pointer,context.camera)}
 };
 const hit=vm.runInNewContext(source.slice(start,end)+'\n hit',context);
 const event=pointerType=>({clientX:100,clientY:200,pointerType});
 targets.set(key(110,200),interactive[0]);
 assert.equal(hit(event('mouse')),null,'mouse picking is pixel-perfect');
 assert.equal(hit(event('pen')),null,'pen picking is unchanged');
 assert.equal(hit(event('touch')),interactive[0],'finger picks an immediately adjacent card');
 assert.ok(probes>3&&probes<20,'touch-only probes stay bounded');
 assert.ok(Math.abs(pointer.x-(-.5))<.0001,'3D pointer resets to the actual touch after probe');
 targets.set(key(100,200),interactive[1]);
 assert.equal(hit(event('touch')),interactive[1],'exact hits take precedence over nearby cards');
 targets.delete(key(100,200));
 context.current.gameId='yam';
 assert.equal(hit(event('touch')),null,'unrelated games do not gain touch-only expansion');
 context.current.gameId='cactus';
 assert.equal(hit(event('touch')),interactive[0],'Cactus receives the same small touch tolerance');
 interactive[0].userData.interactive=false;
 assert.equal(hit(event('touch')),null,'non-interactive objects never become a fallback touch target');
});
