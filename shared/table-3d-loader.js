(function(){
'use strict';
const view=window.SalonTableView,SRC=document.currentScript?.src||location.href;
if(!view)return;
let modulePromise=null,renderer=null,freshActivation=true;
function webglAvailable(){
  try{
    const c=document.createElement('canvas');
    return !!(window.WebGL2RenderingContext&&c.getContext('webgl2')||c.getContext('webgl'));
  }catch(_){return false}
}
function supportedHere(){
  return document.documentElement.dataset.table3dSupported==='yes';
}
function renderFreshBaseline(payload){
  const root=document.documentElement,hadMotion=root.hasAttribute('data-motion'),previousMotion=root.getAttribute('data-motion');
  root.dataset.motion='off';
  try{renderer?.render?.(payload)}finally{
    if(hadMotion)root.setAttribute('data-motion',previousMotion??'');else root.removeAttribute('data-motion');
  }
  renderer?.render?.(payload);
}
view.register('3d',{
  available(){return webglAvailable()&&supportedHere()},
  async prepare(){
    if(!webglAvailable())throw new Error('WebGL indisponible');
    modulePromise??=import(new URL('./table-3d.js?v=65',SRC).href);
    const mod=await modulePromise;
    renderer??=mod.createTable3DRenderer({
      onFatal(error){
        const failed=renderer;view.fallback('webgl-failed',error);
        queueMicrotask(()=>{if(renderer===failed){try{failed?.destroy?.()}catch(_){}renderer=null}});
      }
    });
    return renderer;
  },
  activate(){freshActivation=true;renderer?.activate?.()},
  render(payload){
    if(payload?.gated){view.fallback('gated-state');return}
    if(!supportedHere()){view.fallback('unsupported-game');return}
    if(freshActivation){freshActivation=false;renderFreshBaseline(payload);return}
    renderer?.render?.(payload);
  },
  deactivate(){renderer?.deactivate?.()},
  destroy(){renderer?.destroy?.();renderer=null;freshActivation=true}
});
})();
