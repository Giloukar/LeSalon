(function(){
'use strict';
const view=window.SalonTableView,SRC=document.currentScript?.src||location.href;
if(!view)return;
let modulePromise=null,renderer=null;
function webglAvailable(){
  try{
    const c=document.createElement('canvas');
    return !!(window.WebGL2RenderingContext&&c.getContext('webgl2')||c.getContext('webgl'));
  }catch(_){return false}
}
function supportedHere(){
  return document.documentElement.dataset.table3dSupported==='yes';
}
view.register('3d',{
  available(){return webglAvailable()&&supportedHere()},
  async prepare(){
    if(!webglAvailable())throw new Error('WebGL indisponible');
    modulePromise??=import(new URL('./table-3d.js?v=37',SRC).href);
    const mod=await modulePromise;
    renderer??=mod.createTable3DRenderer({
      onFatal(error){view.fallback('webgl-failed',error)}
    });
    return renderer;
  },
  activate(){renderer?.activate?.()},
  render(payload){
    if(!['huit','oie','yam','boite','cactus','rummikub','president','menteur','suites','plis','encheres','pouilleux','quatrevingtdixneuf','vingtetun','bataille','metropole','echo','ballon','anagrammes','intrus','code','golf'].includes(payload?.gameId)){view.fallback('unsupported-game');return}
    renderer?.render?.(payload);
  },
  deactivate(){renderer?.deactivate?.()},
  destroy(){renderer?.destroy?.();renderer=null}
});
})();
