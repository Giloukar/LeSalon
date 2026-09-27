(function(){
'use strict';

const registry=window.SalonTable3DAssets;
if(!registry){console.warn('[Le Salon 3D] model-pack loader disabled: asset registry missing');return}

const activePacks=new Map();
let packCounter=0,runtimePromise=null;

function normalizeKind(kind){return String(kind||'').trim().toLowerCase()}
function normalizeManifest(manifest){
 const raw=manifest&&typeof manifest==='object'?manifest:{};
 let assets=raw.assets;
 if(!Array.isArray(assets)&&assets&&typeof assets==='object')assets=Object.entries(assets).map(([kind,value])=>({kind,...(typeof value==='string'?{src:value}:value)}));
 if(!Array.isArray(assets))throw new TypeError('A 3D model pack requires an assets array or object');
 const seen=new Set(),normalized=[];
 for(const item of assets){
  const entry=typeof item==='string'?{kind:item,src:item}:item||{},kind=normalizeKind(entry.kind),src=String(entry.src||'').trim();
  if(!kind||!src)throw new TypeError('Every 3D asset requires kind and src');
  if(seen.has(kind))throw new TypeError('Duplicate 3D asset kind: '+kind);
  seen.add(kind);normalized.push({...entry,kind,src});
 }
 return{id:String(raw.id||('model-pack-'+(++packCounter))),assets:normalized};
}
function emit(detail){try{window.dispatchEvent(new CustomEvent('salon:table-3d-model-pack',{detail}))}catch(_){}}
function vec3(value,fallback){
 if(Array.isArray(value))return [Number(value[0])||0,Number(value[1])||0,Number(value[2])||0];
 if(Number.isFinite(Number(value)))return [Number(value),Number(value),Number(value)];
 return fallback.slice();
}
function cloneMaterials(root){
 root?.traverse?.(node=>{
  if(!node?.isMesh||!node.material)return;
  if(Array.isArray(node.material))node.material=node.material.map(m=>m?.clone?.()||m);
  else node.material=node.material.clone?.()||node.material;
 });
}
function tintObject(root,color){
 if(color===undefined||color===null||color==='')return;
 cloneMaterials(root);
 root?.traverse?.(node=>{
  if(!node?.isMesh||!node.material)return;
  const materials=Array.isArray(node.material)?node.material:[node.material];
  for(const mat of materials)mat?.color?.set?.(color);
 });
}
function applyTransform(object,entry,context){
 const scale=vec3(entry.scale,[1,1,1]),rotation=vec3(entry.rotationDeg,[0,0,0]),offset=vec3(entry.offset,[0,0,0]);
 const multiplier=entry.scaleFrom&&Number.isFinite(Number(context?.[entry.scaleFrom]))?Number(context[entry.scaleFrom]):1;
 object.scale?.set?.(scale[0]*multiplier,scale[1]*multiplier,scale[2]*multiplier);
 object.rotation?.set?.(rotation[0]*Math.PI/180,rotation[1]*Math.PI/180,rotation[2]*Math.PI/180);
 object.position?.set?.(offset[0],offset[1],offset[2]);
 if(entry.tintFrom)tintObject(object,context?.[entry.tintFrom]);
 if(typeof entry.configure==='function'){
  const configured=entry.configure(object,context);
  if(configured?.isObject3D)return configured;
 }
 return object;
}

async function runtime(){
 if(runtimePromise)return runtimePromise;
 runtimePromise=Promise.all([
  import('https://cdn.jsdelivr.net/npm/three@0.169.0/+esm'),
  import('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js/+esm'),
  import('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/utils/SkeletonUtils.js/+esm')
 ]).then(([THREE,loaderModule,skeletonModule])=>({THREE,GLTFLoader:loaderModule.GLTFLoader,clone:skeletonModule.clone}));
 return runtimePromise;
}
async function defaultLoadModel(src){
 const rt=await runtime(),loader=new rt.GLTFLoader();
 const gltf=await new Promise((resolve,reject)=>loader.load(src,resolve,undefined,reject));
 const template=gltf?.scene||gltf?.scenes?.[0];
 if(!template?.isObject3D)throw new Error('GLB/GLTF has no scene: '+src);
 return{template,clone:()=>rt.clone(template)};
}
function normalizeLoaded(value,cloneModel){
 if(value?.template){
  const template=value.template,clone=typeof value.clone==='function'?value.clone:()=>cloneModel?cloneModel(template):template?.clone?.(true);
  return{template,clone};
 }
 const template=value,clone=()=>cloneModel?cloneModel(template):template?.clone?.(true);
 return{template,clone};
}
function unload(id){
 const key=String(id||''),pack=activePacks.get(key);if(!pack)return false;
 activePacks.delete(key);
 for(const dispose of pack.disposers)try{dispose()}catch(_){}
 emit({type:'unloaded',id:key,kinds:[...pack.kinds]});
 return true;
}
function unloadAll(){for(const id of [...activePacks.keys()])unload(id)}
function active(){return [...activePacks.values()].map(pack=>({id:pack.id,kinds:[...pack.kinds]}))}

async function load(manifest,options={}){
 const pack=normalizeManifest(manifest);
 unload(pack.id);
 const loadModel=typeof options.loadModel==='function'?options.loadModel:defaultLoadModel;
 const cloneModel=typeof options.cloneModel==='function'?options.cloneModel:null;
 const disposers=[],loadedKinds=[],failed=[];
 emit({type:'loading',id:pack.id,total:pack.assets.length,loaded:0,failed:0});
 let completed=0;
 const results=await Promise.all(pack.assets.map(async entry=>{
  try{
   const value=await loadModel(entry.src,entry),record=normalizeLoaded(value,cloneModel);
   if(!record.template)throw new Error('Model loader returned no template');
   const factory=context=>{
    const instance=record.clone?.();
    if(!instance)return null;
    return applyTransform(instance,entry,context||{});
   };
   return{entry,factory};
  }catch(error){return{entry,error}}
 }));
 for(const result of results){
  completed++;
  if(result.error){
   failed.push({kind:result.entry.kind,src:result.entry.src,error:String(result.error?.message||result.error)});
  }else{
   disposers.push(registry.register(result.entry.kind,result.factory));loadedKinds.push(result.entry.kind);
  }
  emit({type:'progress',id:pack.id,total:pack.assets.length,loaded:loadedKinds.length,failed:failed.length,completed});
 }
 activePacks.set(pack.id,{id:pack.id,kinds:new Set(loadedKinds),disposers});
 const outcome={id:pack.id,loadedKinds:[...loadedKinds],failed:failed.map(x=>({...x})),unload:()=>unload(pack.id)};
 emit({type:'ready',id:pack.id,loadedKinds:[...loadedKinds],failed:outcome.failed});
 return outcome;
}

window.SalonTable3DModelPack=Object.freeze({load,unload,unloadAll,active});
})();