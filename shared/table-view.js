(function(){
'use strict';

const STORAGE_KEY='salon_table_view_v1';
const BASE_MODE='2d';
const renderers=new Map();
let preferred=readPreferred();
let active=BASE_MODE;
let requestId=0;
let lastPayload=null;
let destroyed=false;

function readPreferred(){
  try{
    const value=localStorage.getItem(STORAGE_KEY);
    return value==='3d'||value==='2d'?value:BASE_MODE;
  }catch(_){
    return BASE_MODE;
  }
}
function persist(mode){
  try{localStorage.setItem(STORAGE_KEY,mode);return true}catch(_){return false}
}
function renderer(mode){return renderers.get(mode)||null}
function available(mode){
  const r=renderer(mode);
  if(!r)return false;
  try{return r.available===undefined?true:!!(typeof r.available==='function'?r.available():r.available)}
  catch(_){return false}
}
function emit(detail){
  try{window.dispatchEvent(new CustomEvent('salon:table-view-change',{detail}))}catch(_){}
}
function setDataset(mode){
  try{document.documentElement.dataset.tableView=mode}catch(_){}
}
function safeDeactivate(mode){
  const r=renderer(mode);
  try{r?.deactivate?.()}catch(error){console.warn('Table view deactivate failed',error)}
}
function fallback(reason,error){
  const previous=active;
  requestId++;
  if(previous!==BASE_MODE)safeDeactivate(previous);
  active=BASE_MODE;
  setDataset(BASE_MODE);
  emit({mode:BASE_MODE,previous,preferred,reason:reason||'fallback',error:error?String(error?.message||error):''});
  if(lastPayload&&previous!==BASE_MODE){
    try{renderer(BASE_MODE)?.render?.(lastPayload)}catch(_){}
  }
  return BASE_MODE;
}
function register(mode,adapter){
  if(typeof mode!=='string'||!mode||!adapter||typeof adapter!=='object')throw new TypeError('Invalid table renderer');
  renderers.set(mode,adapter);
  if(mode===BASE_MODE&&active===BASE_MODE){
    try{adapter.activate?.({mode:BASE_MODE,previous:null})}catch(error){console.warn('2D renderer activation failed',error)}
    setDataset(BASE_MODE);
  }
  return function unregister(){
    if(active===mode&&mode!==BASE_MODE)fallback('renderer-unregistered');
    if(renderers.get(mode)===adapter)renderers.delete(mode);
  };
}
async function setMode(mode,{persistPreference=true,reason='user'}={}){
  if(mode!==BASE_MODE&&mode!=='3d'&&!renderers.has(mode))return{ok:false,mode:active,reason:'unknown-mode'};
  if(persistPreference&&(mode===BASE_MODE||mode==='3d')){
    preferred=mode;
    persist(mode);
  }
  if(mode===active)return{ok:true,mode:active,reason:'unchanged'};
  if(!available(mode))return{ok:false,mode:active,reason:'unavailable'};

  const id=++requestId,r=renderer(mode);
  try{
    if(typeof r?.prepare==='function')await r.prepare();
  }catch(error){
    if(id===requestId)fallback('prepare-failed',error);
    return{ok:false,mode:active,reason:'prepare-failed',error};
  }
  if(id!==requestId)return{ok:false,mode:active,reason:'superseded'};

  const previous=active;
  if(previous!==BASE_MODE)safeDeactivate(previous);
  try{r?.activate?.({mode,previous,lastPayload})}
  catch(error){
    fallback('activate-failed',error);
    return{ok:false,mode:active,reason:'activate-failed',error};
  }

  active=mode;
  setDataset(mode);
  if(lastPayload&&mode!==BASE_MODE){
    try{r?.render?.(lastPayload)}
    catch(error){
      fallback('render-failed',error);
      return{ok:false,mode:active,reason:'render-failed',error};
    }
  }
  emit({mode,previous,preferred,reason});
  return{ok:true,mode};
}
function render(payload){
  if(destroyed)return;
  lastPayload=payload;
  const base=renderer(BASE_MODE);
  if(!base||typeof base.render!=='function')throw new Error('2D renderer is not registered');

  // The 2D DOM is the permanent semantic/fallback layer. It is always kept current.
  const result=base.render(payload);

  if(active!==BASE_MODE){
    const overlay=renderer(active);
    if(!overlay||!available(active)){
      fallback('renderer-unavailable');
      return result;
    }
    try{overlay.render?.(payload)}
    catch(error){fallback('render-failed',error)}
  }
  return result;
}
function sync(){
  if(lastPayload)return render(lastPayload);
}
function getMode(){return active}
function getPreferredMode(){return preferred}
function getLastPayload(){return lastPayload}
function destroy(){
  requestId++;
  if(active!==BASE_MODE)safeDeactivate(active);
  for(const [mode,r] of renderers){
    if(mode===BASE_MODE)continue;
    try{r.destroy?.()}catch(error){console.warn('Table renderer destroy failed',error)}
  }
  active=BASE_MODE;lastPayload=null;destroyed=true;setDataset(BASE_MODE);
}
function revive(){destroyed=false;setDataset(active)}

window.SalonTableView={
  register,
  setMode,
  render,
  sync,
  fallback,
  getMode,
  getPreferredMode,
  getLastPayload,
  available,
  destroy,
  revive,
  storageKey:STORAGE_KEY,
  baseMode:BASE_MODE
};
setDataset(BASE_MODE);
})();
