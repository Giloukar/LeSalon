(function(){
'use strict';
const factories=new Map(),listeners=new Set();
function normalizeKind(kind){return String(kind||'').trim().toLowerCase()}
function emit(kind){for(const fn of [...listeners]){try{fn(kind)}catch(_){}}}
function register(kind,factory){
 const key=normalizeKind(kind);
 if(!key||typeof factory!=='function')throw new TypeError('SalonTable3DAssets.register(kind, factory) requires a valid kind and factory');
 factories.set(key,factory);emit(key);
 return()=>unregister(key,factory);
}
function registerMany(entries){
 if(!entries||typeof entries!=='object')return()=>{};
 const disposers=Object.entries(entries).map(([kind,factory])=>register(kind,factory));
 return()=>disposers.forEach(dispose=>dispose());
}
function unregister(kind,factory=null){
 const key=normalizeKind(kind),current=factories.get(key);
 if(!current||factory&&current!==factory)return false;
 factories.delete(key);emit(key);return true;
}
function create(kind,context={}){
 const key=normalizeKind(kind),factory=factories.get(key);if(!factory)return null;
 try{return factory(Object.freeze({...context,kind:key}))||null}
 catch(error){console.warn('[Le Salon 3D] asset factory failed for '+key,error);return null}
}
function has(kind){return factories.has(normalizeKind(kind))}
function list(){return [...factories.keys()]}
function subscribe(fn){if(typeof fn!=='function')return()=>{};listeners.add(fn);return()=>listeners.delete(fn)}
window.SalonTable3DAssets=Object.freeze({register,registerMany,unregister,create,has,list,subscribe});
})();