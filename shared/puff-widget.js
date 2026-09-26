(function(){const K="salon_fun_puff_v2",TK="salon_fun_puff_trick",VIDEO="./assets/puff/gemini_generated_video_4a1e2df8.mp4",START=2.15,END=9.72,SRC=document.currentScript?.src||location.href,TRICKS=[["ring","◯ Ronds"],["jelly","Méduse"],["ghost","Ghost"],["tornado","Tornade"],["dragon","Dragon"]],SK="salon_fun_puff_skin",SKINS=[["blackberry","Blackberry","#1b1f6b,#8a2be2,#ff5a2e"],["falcon","Golden Falcon","#0c3f3a,#45c9b4,#ff9f2e"],["cherry","Cherry Ice","#0e4468,#2f93c7,#c8322a"],["razz","Blue Razz","#5a2d91,#d0508f,#f59a6b"]];let s=JSON.parse(localStorage.getItem(K)||'{"puffs":0,"best":0,"streak":0,"last":0}'),hold=0,raf=0,returning=false,smokeLocked=false,effectId=0,p3=null,loading=null,trick=localStorage.getItem(TK)||"ring",au=null,T=null,tick=0,coughT=0,muted=localStorage.getItem("salon_fun_puff_muted")==="1",skin=localStorage.getItem(SK)||"blackberry";
function save(){localStorage.setItem(K,JSON.stringify(s));let c=document.querySelector("#puffCount"),r=document.querySelector("#puffRecord");if(c)c.textContent=s.puffs;if(r)r.textContent=s.best;let pf=document.querySelector("#puffPerfect");if(pf)pf.textContent=s.perfects||0;p3?.setLevel(level())}
function level(){return 100-s.puffs%100}
async function sync(){let db=window.SalonAccount?.db?.(),u=window.SalonAccount?.user?.();if(!db||!u)return;try{let r=await db.from("fun_stats").select("virtual_puffs").eq("user_id",u.id).maybeSingle();if(!r.error&&r.data){s.puffs=Math.max(s.puffs,Number(r.data.virtual_puffs||0));save()}}catch(_){}}
function cloud(duration,grade){let id=++effectId;smokeLocked=true;let stage=document.querySelector(".puffStage");stage?.classList.add("smokeLocked");stage?.setAttribute("aria-disabled","true");let layer=document.querySelector("#puffScreenVapor");if(!layer)return;let power=POWER[grade]||Math.min(2.2,Math.max(.72,duration/1100)),rare=Math.random()<(grade==="perfect"?.2:.035);if(grade==="cough"){stage?.classList.add("coughing");setTimeout(()=>stage?.classList.remove("coughing"),1200)}layer.innerHTML="";layer.className="puffScreenVapor active tunnel"+(rare?" rare":"")+(p3?" webgl":"");layer.style.setProperty("--fog",Math.min(p3?.42:.68,.18+power*.15));
if(p3)grade==="cough"?p3.cough():p3.exhale(power,rare);else for(let i=0;i<Math.round(9+power*5);i++){let q=document.createElement("i");q.className="puffJet";q.style.setProperty("--jx",(Math.random()*16-8)+"vw");q.style.setProperty("--jy",(Math.random()*13-6.5)+"vh");q.style.setProperty("--size",(45+Math.random()*90*power)+"px");q.style.setProperty("--blur",(10+Math.random()*18)+"px");q.style.setProperty("--delay",(Math.random()*.32)+"s");layer.append(q)}
setTimeout(()=>{if(!smokeLocked||id!==effectId)return;layer.classList.remove("tunnel");layer.classList.add("impact");if(p3)return;for(let i=0;i<Math.round(16+power*10);i++){let q=document.createElement("i");q.className="puffSpread";q.style.setProperty("--a",(Math.random()*360)+"deg");q.style.setProperty("--dist",(32+Math.random()*62)+"vmax");q.style.setProperty("--size",(110+Math.random()*220*power)+"px");q.style.setProperty("--blur",(18+Math.random()*34)+"px");q.style.setProperty("--delay",(Math.random()*.65)+"s");q.style.setProperty("--o",(.13+Math.random()*.27));layer.append(q)}},720);setTimeout(()=>{if(smokeLocked&&id===effectId)layer.classList.add("settle")},2200);setTimeout(()=>{if(id!==effectId)return;layer.className="puffScreenVapor";layer.innerHTML="";smokeLocked=false;let stage=document.querySelector(".puffStage");stage?.classList.remove("smokeLocked");stage?.setAttribute("aria-disabled","false")},5600)}
function ring(x,y){let layer=document.querySelector("#puffRingLayer"),fog=document.querySelector("#puffScreenVapor");if(!layer||!fog?.classList.contains("active"))return;if(p3){p3.trick(trick,x,y);return}let r=document.createElement("i");r.className="puffRing";r.style.left=x+"px";r.style.top=y+"px";r.style.setProperty("--drift",(Math.random()*70-35)+"px");r.style.setProperty("--tilt",(Math.random()*18-9)+"deg");layer.append(r);setTimeout(()=>r.remove(),2600)}
function countPuff(duration,grade){if(grade==="perfect")s.perfects=(s.perfects||0)+1;let now=Date.now();s.streak=now-s.last<10000?s.streak+1:1;s.last=now;s.puffs++;s.best=Math.max(s.best,s.streak);save();let db=window.SalonAccount?.db?.(),u=window.SalonAccount?.user?.();if(db&&u)db.rpc("add_virtual_puff").then(r=>{if(!r.error&&r.data!=null){s.puffs=Number(r.data);save()}}).catch(()=>{});cloud(duration,grade);if(grade==="cough"){au?.cough();navigator.vibrate?.([60,120,60,120,40])}else{au?.exhale(POWER[grade]);au?.grade(grade);navigator.vibrate?.(grade==="perfect"?[25,20,35,20,60]:[25,20,35])}}
function approach(v){if(p3){p3.pull();return}if(!v)return;returning=false;cancelAnimationFrame(raf);v.playbackRate=3.45;if(v.currentTime<START-.1||v.currentTime>END)v.currentTime=START;v.play().catch(()=>{});let watch=()=>{if(!hold)return;if(v.currentTime>=END-.08){v.pause();v.currentTime=END;return}raf=requestAnimationFrame(watch)};watch()}
function reverse(v,counted){if(p3){p3.release(counted);return}if(!v)return;returning=true;v.pause();cancelAnimationFrame(raf);let last=performance.now();function step(now){if(!returning)return;let dt=(now-last)/1000;last=now;v.currentTime=Math.max(START,v.currentTime-dt*4.2);if(v.currentTime<=START+.04){v.currentTime=START;returning=false;return}raf=requestAnimationFrame(step)}raf=requestAnimationFrame(step)}
function clearEffects(){effectId++;smokeLocked=false;hold=0;cancelAnimationFrame(tick);clearTimeout(coughT);au?.inhaleStop(true);returning=false;cancelAnimationFrame(raf);p3?.clear();let fog=document.querySelector("#puffScreenVapor"),rings=document.querySelector("#puffRingLayer"),stage=document.querySelector(".puffStage"),v=document.querySelector(".puffVideo");if(fog){fog.className="puffScreenVapor";fog.innerHTML=""}if(rings)rings.innerHTML="";if(stage){stage.classList.remove("smokeLocked","pulling","timing","coughing");stage.setAttribute("aria-disabled","false")}if(v){v.pause();v.currentTime=START}}
function useVideo(stage){if(stage.querySelector(".puffVideo"))return;let v=document.createElement("video");v.className="puffVideo";v.src=VIDEO;v.preload="auto";v.playsInline=v.muted=true;v.draggable=false;v.disablePictureInPicture=true;v.setAttribute("controlslist","nodownload noplaybackrate nofullscreen");v.setAttribute("disableremoteplayback","");v.addEventListener("loadeddata",()=>{v.currentTime=START;stage.classList.add("videoReady")});v.addEventListener("error",()=>stage.classList.add("videoError"));stage.prepend(v)}
// Modèle Three.js chargé à la première ouverture ; la vidéo sert de repli (pas de WebGL, CDN bloqué…)
function load3d(stage){if(loading)return loading;loading=import(new URL("./puff-3d.js?v=7",SRC).href).then(m=>m.create({stage,skin,level:level()})).then(api=>{p3=api;stage.classList.add("videoReady","is3d");if(!document.querySelector("#puffPanel")?.hidden)p3.show()}).catch(e=>{console.warn("Puff 3D indisponible, repli vidéo",e);p3=null;document.querySelectorAll(".puffCanvas,.puffSmokeCanvas").forEach(c=>c.remove());document.querySelectorAll(".puffTricks,.puffSkins").forEach(x=>x.hidden=true);useVideo(stage)});return loading}
// Timing : la zone "perfect" bouge à chaque taffe ; au-delà de la dernière zone, c'est la toux
const POWER={perfect:2.2,excellent:1.7,good:1.2,bad:.55,cough:1},LABEL={perfect:"PERFECT",excellent:"EXCELLENT",good:"GOOD",bad:"BAD",cough:"*TOUX* 🤧"};
function newTiming(){let p=1.9+Math.random()*.6;return{z:[[0,.8,"bad"],[.8,1.5,"good"],[1.5,p,"excellent"],[p,p+.45,"perfect"],[p+.45,p+.9,"excellent"],[p+.9,p+1.5,"bad"]],cough:p+1.5}}
function gradeOf(t){for(let z of T.z)if(t>=z[0]&&t<z[1])return z[2];return"bad"}
function drawTiming(stage){stage.querySelector(".puffTrack").innerHTML=T.z.map(z=>'<span class="z-'+z[2]+'" style="left:'+z[0]/T.cough*100+'%;width:'+(z[1]-z[0])/T.cough*100+'%"></span>').join("");stage.querySelector(".puffNeedle").style.left="0%"}
function rate(stage,g,t){let r=stage.querySelector(".puffRating");r.className="puffRating";void r.offsetWidth;r.textContent=LABEL[g]+(g==="bad"?(t<1?" · trop court":" · trop long"):"");r.className="puffRating show r-"+g}
function pickTrick(t){if(!TRICKS.some(x=>x[0]===t))return;trick=t;localStorage.setItem(TK,t);document.querySelectorAll(".puffTricks button").forEach(b=>b.setAttribute("aria-checked",b.dataset.trick===t))}
function pickSkin(k){if(!SKINS.some(x=>x[0]===k))return;skin=k;localStorage.setItem(SK,k);p3?.setSkin(k);document.querySelectorAll(".puffSkins button").forEach(b=>b.setAttribute("aria-checked",b.dataset.skin===k))}
const POSK="salon_fun_puff_pos_v1",STOWK="salon_fun_puff_stowed_v1",STOWXK="salon_fun_puff_stow_x_v1";
let panelPos=(()=>{try{return JSON.parse(localStorage.getItem(POSK)||"null")}catch(_){return null}})(),
    stowX=(()=>{const n=Number(localStorage.getItem(STOWXK));return Number.isFinite(n)&&n>=0&&n<=1?n:.82})(),
    pressTimer=0,gesture=null,layoutRaf=0;
const SAFE_GAP=12,OWN_UI="#puffPanel,#puffOrb,#puffControls,#puffStowGuide,#puffScreenVapor,#puffRingLayer,.puffSmokeCanvas";
function box(x,y,w,h){return{left:x,top:y,right:x+w,bottom:y+h,width:w,height:h}}
function visible(el){
  if(!el||!el.isConnected||el.matches?.(OWN_UI)||el.closest?.(OWN_UI))return false;
  const cs=getComputedStyle(el),r=el.getBoundingClientRect();
  if((cs.position!=="fixed"&&cs.position!=="sticky")||cs.display==="none"||cs.visibility==="hidden"||Number(cs.opacity)===0)return false;
  if(r.width<20||r.height<18||r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)return false;
  if(r.width*r.height>innerWidth*innerHeight*.32)return false;
  return true
}
function blockers(extra=[]){
  const out=[...document.body.children].filter(visible).map(el=>el.getBoundingClientRect());
  for(const el of extra){if(!el||!el.isConnected)continue;const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)out.push(r)}
  return out
}
function hitRect(a,b,g=SAFE_GAP){return!(a.right<=b.left-g||a.left>=b.right+g||a.bottom<=b.top-g||a.top>=b.bottom+g)}
function overlapArea(a,b){return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))}
function clampXY(x,y,w,h,pad=10){return{x:Math.min(Math.max(pad,x),Math.max(pad,innerWidth-w-pad)),y:Math.min(Math.max(pad,y),Math.max(pad,innerHeight-h-pad))}}
function safeSpot(w,h,preferred,obs=blockers()){
  const seed=clampXY(preferred.x,preferred.y,w,h),candidates=[seed,clampXY(innerWidth-w-12,12,w,h),clampXY(12,12,w,h),clampXY(innerWidth-w-12,innerHeight-h-12,w,h),clampXY(12,innerHeight-h-12,w,h)];
  for(const r of obs)candidates.push(clampXY(r.left-w-SAFE_GAP,preferred.y,w,h),clampXY(r.right+SAFE_GAP,preferred.y,w,h),clampXY(preferred.x,r.top-h-SAFE_GAP,w,h),clampXY(preferred.x,r.bottom+SAFE_GAP,w,h),clampXY(r.left-w-SAFE_GAP,r.top-h-SAFE_GAP,w,h),clampXY(r.right+SAFE_GAP,r.bottom+SAFE_GAP,w,h));
  let best=seed,bestScore=Infinity;
  for(const c of candidates){
    const q=box(c.x,c.y,w,h);let penalty=0;
    for(const r of obs)if(hitRect(q,r,8))penalty+=1e6+overlapArea(q,r)*100;
    const score=penalty+Math.hypot(c.x-seed.x,c.y-seed.y);
    if(score<bestScore){bestScore=score;best=c}
    if(!penalty)return c
  }
  const step=Math.max(24,Math.min(52,Math.round(Math.min(w,h)/4)));
  for(let y=10;y<=Math.max(10,innerHeight-h-10);y+=step)for(let x=10;x<=Math.max(10,innerWidth-w-10);x+=step){
    const q=box(x,y,w,h);if(obs.every(r=>!hitRect(q,r,8)))return{x,y}
  }
  return best
}
function layoutHud(){
  const orb=document.querySelector("#puffOrb"),ctl=document.querySelector("#puffControls"),p=panel();if(!orb)return;
  const ow=orb.offsetWidth||44,oh=orb.offsetHeight||44,extra=[];
  if(p&&!p.classList.contains("stowed")&&!p.hidden)extra.push(p);
  const o=safeSpot(ow,oh,{x:innerWidth-ow-14,y:14},blockers(extra));
  orb.style.left=o.x+"px";orb.style.top=o.y+"px";orb.style.right="auto";
  if(ctl&&!ctl.hidden){
    const cw=ctl.offsetWidth||340,ch=ctl.offsetHeight||300,obs=blockers([orb,...extra]);
    const c=safeSpot(cw,ch,{x:o.x+ow-cw,y:o.y+oh+8},obs);
    ctl.style.left=c.x+"px";ctl.style.top=c.y+"px";ctl.style.right="auto"
  }
}
function stowThreshold(){return Math.min(120,Math.max(76,innerHeight*.11))}
function stowPosition(p,clientX=null,persist=false){
  if(!p)return;
  const r=p.getBoundingClientRect(),w=r.width||300,peekH=Math.min(142,Math.max(112,innerHeight*.15));
  if(Number.isFinite(clientX)){
    const edge=18,anchor=Math.min(innerWidth-edge,Math.max(edge,clientX));
    stowX=Math.min(.98,Math.max(.02,anchor/Math.max(1,innerWidth)));
    if(persist)localStorage.setItem(STOWXK,String(stowX));
  }
  const anchor=Math.min(innerWidth-18,Math.max(18,stowX*innerWidth));
  p.style.setProperty("--puff-peek-h",peekH+"px");
  p.style.left=(anchor-w/2)+"px";p.style.top=(innerHeight-peekH)+"px";p.style.right="auto";p.style.bottom="auto"
}
function stowGuide(active){
  const g=document.querySelector("#puffStowGuide");if(!g)return;
  g.classList.toggle("active",!!active)
}
function unstowPosition(p){
  if(!p)return;
  const r=p.getBoundingClientRect(),w=r.width||300,h=r.height||480,anchor=Math.min(innerWidth-18,Math.max(18,stowX*innerWidth));
  const q=clampPos(p,anchor-w/2,innerHeight-h-24);
  place(p,q,true,false)
}
function scheduleLayout(){
  if(layoutRaf)return;
  layoutRaf=requestAnimationFrame(()=>{layoutRaf=0;layoutHud();const p=panel();if(!p)return;if(p.classList.contains("stowed"))stowPosition(p);else if(!gesture?.drag){const r=p.getBoundingClientRect(),q=panelPos||{x:r.left,y:r.top};place(p,q,false,true)}})
}

function settings(open){
  const c=document.querySelector("#puffControls");
  if(!c)return;
  c.hidden=open==null?!c.hidden:!open;
  document.querySelector("#puffOrb")?.setAttribute("aria-expanded",String(!c.hidden));
  scheduleLayout();
}
function panel(){return document.querySelector("#puffPanel")}
function defaultPos(p){
  const r=p.getBoundingClientRect(),gap=34;
  return{x:Math.max(12,innerWidth-r.width-gap),y:Math.max(78,Math.min(innerHeight-r.height-24,(innerHeight-r.height)*.46))};
}
function clampPos(p,x,y){
  const r=p.getBoundingClientRect(),pad=10,top=66;
  return{x:Math.min(Math.max(pad,x),Math.max(pad,innerWidth-r.width-pad)),y:Math.min(Math.max(top,y),Math.max(top,innerHeight-r.height-pad))};
}
function place(p,next,persist=true,avoid=true){
  if(!p||p.classList.contains("stowed"))return;
  const base=clampPos(p,Number(next?.x),Number(next?.y));
  if(!Number.isFinite(base.x)||!Number.isFinite(base.y))return;
  const r=p.getBoundingClientRect(),extra=[document.querySelector("#puffOrb")];
  const ctl=document.querySelector("#puffControls");if(ctl&&!ctl.hidden)extra.push(ctl);
  const q=avoid?safeSpot(r.width||300,r.height||480,base,blockers(extra.filter(Boolean))):base;
  panelPos=q;p.style.left=q.x+"px";p.style.top=q.y+"px";p.style.right="auto";p.style.bottom="auto";
  if(persist)localStorage.setItem(POSK,JSON.stringify(q));
}
function ensurePos(p){
  const q=panelPos&&Number.isFinite(panelPos.x)&&Number.isFinite(panelPos.y)?panelPos:defaultPos(p);
  place(p,q,!panelPos);
}
function flip(p,change){
  if(!p)return;
  const a=p.getBoundingClientRect();change();const b=p.getBoundingClientRect();
  if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const dx=a.left-b.left,dy=a.top-b.top,sx=a.width/Math.max(1,b.width),sy=a.height/Math.max(1,b.height);
  p.animate([{transform:"translate("+dx+"px,"+dy+"px) scale("+sx+","+sy+")",opacity:.82},{transform:"translate(0,0) scale(1)",opacity:1}],{duration:420,easing:"cubic-bezier(.2,.9,.2,1)"});
}
function show(){
  if(!document.querySelector("#puffOrb"))boot();
  const p=panel();if(!p)return;
  const was=p.classList.contains("stowed");
  localStorage.setItem(STOWK,"0");
  if(was){p.classList.remove("stowed","stow-ready");unstowPosition(p)}
  else ensurePos(p);
  p.hidden=false;settings(false);
  if(!au)import(new URL("./puff-audio.js?v=2",SRC).href).then(m=>{au=m;m.setMuted(muted)}).catch(()=>{});
  load3d(p.querySelector(".puffStage"));p3?.show();
  p.classList.add("respawned");setTimeout(()=>p.classList.remove("respawned"),650);
  scheduleLayout();
}
function hide(clientX=null){
  const p=panel();if(!p||p.classList.contains("stowed")||smokeLocked)return;
  hold=0;cancelAnimationFrame(tick);clearTimeout(coughT);au?.inhaleStop(true);returning=false;cancelAnimationFrame(raf);
  const stage=p.querySelector(".puffStage"),v=stage?.querySelector(".puffVideo");
  if(stage)stage.classList.remove("pulling","timing","coughing");
  if(v){v.pause();try{v.currentTime=START}catch(_){}}
  p3?.release?.(false);
  settings(false);stowGuide(false);localStorage.setItem(STOWK,"1");
  p.classList.remove("dragging","stow-ready");p.classList.add("stowed");
  const r=p.getBoundingClientRect(),anchor=Number.isFinite(clientX)?clientX:r.left+r.width/2;
  stowPosition(p,anchor,true);p3?.show();scheduleLayout();
}
function centerPuff(){
  const p=panel();if(!p)return;
  if(p.classList.contains("stowed"))show();
  panelPos=null;place(p,defaultPos(p),true);settings(false);
}
function boot(){
  localStorage.removeItem("salon_fun_puff_hidden");
  if(document.querySelector("#puffOrb"))return;

  const fog=document.createElement("div");fog.id="puffScreenVapor";fog.className="puffScreenVapor";
  const rings=document.createElement("div");rings.id="puffRingLayer";rings.className="puffRingLayer";
  const guide=document.createElement("div");guide.id="puffStowGuide";guide.setAttribute("aria-hidden","true");
  const b=document.createElement("button");b.id="puffOrb";b.type="button";b.title="Puff — réglages";b.setAttribute("aria-label","Réglages de la puff");b.setAttribute("aria-expanded","false");b.textContent="☁";

  const controls=document.createElement("section");controls.id="puffControls";controls.hidden=true;controls.setAttribute("aria-label","Réglages de la puff");
  controls.innerHTML='<div class="puffCtlHead"><div><b>Puff JNR</b><small>Objet flottant</small></div><button id="puffCtlClose" type="button" aria-label="Fermer">×</button></div>'+
  '<div class="puffCtlActions"><button id="puffRespawn" type="button">↗ Réafficher</button><button id="puffCenter" type="button">◎ Recentrer</button><button id="puffMute" type="button" aria-pressed="'+muted+'">'+(muted?"🔇 Son coupé":"🔊 Son")+'</button></div>'+
  '<p class="puffCtlHint">Pour ranger la puff, fais-la simplement glisser vers le bas de l’écran. Elle restera accessible là où tu la déposes.</p>'+
  '<div class="puffCtlLabel">Trick dans la fumée</div><div class="puffTricks" role="radiogroup" aria-label="Trick à faire dans la fumée">'+TRICKS.map((t,i)=>'<button type="button" role="radio" data-trick="'+t[0]+'" aria-checked="'+(t[0]===trick)+'" title="Touche '+(i+1)+'">'+t[1]+'</button>').join("")+'</div>'+
  '<div class="puffCtlLabel">Style / goût</div><div class="puffSkins" role="radiogroup" aria-label="Skin de la JNR">'+SKINS.map(k=>'<button type="button" role="radio" data-skin="'+k[0]+'" aria-checked="'+(k[0]===skin)+'"><i style="background:linear-gradient(135deg,'+k[2]+')"></i>'+k[1]+'</button>').join("")+'</div>'+
  '<div class="puffCtlStats"><span><b id="puffCount">'+s.puffs+'</b> taffes</span><span>× <b id="puffRecord">'+s.best+'</b> série</span><span>★ <b id="puffPerfect">'+(s.perfects||0)+'</b> perfect</span></div>';

  const p=document.createElement("aside");p.id="puffPanel";p.setAttribute("aria-label","Puff virtuelle flottante");
  p.innerHTML='<div class="puffStageWrap"><div class="puffStage"><div class="puffHitZone" role="button" tabindex="0" aria-label="Puff virtuelle JNR — maintiens pour tirer, fais glisser pour la déplacer, ou vers le bas pour la ranger"></div><div class="puffFallback"></div><div class="puffHoldGlow"></div><div class="puffTiming" aria-hidden="true"><div class="puffTrack"></div><i class="puffNeedle"></i></div><div class="puffRating" aria-live="polite"></div></div></div>';

  document.body.append(fog,rings,guide,p,b,controls);
  const stage=p.querySelector(".puffStage"),hit=stage.querySelector(".puffHitZone"),v=()=>stage.querySelector(".puffVideo");

  controls.querySelectorAll(".puffTricks button").forEach(x=>x.onclick=()=>pickTrick(x.dataset.trick));
  controls.querySelectorAll(".puffSkins button").forEach(x=>x.onclick=()=>pickSkin(x.dataset.skin));
  controls.querySelector("#puffCtlClose").onclick=()=>settings(false);
  controls.querySelector("#puffRespawn").onclick=show;
  controls.querySelector("#puffCenter").onclick=centerPuff;
  controls.querySelector("#puffMute").onclick=e=>{
    muted=!muted;localStorage.setItem("salon_fun_puff_muted",muted?"1":"0");au?.setMuted(muted);
    e.currentTarget.textContent=muted?"🔇 Son coupé":"🔊 Son";e.currentTarget.setAttribute("aria-pressed",String(muted));
  };

  b.onclick=()=>p.classList.contains("stowed")?show():settings();

  document.addEventListener("pointerdown",e=>{
    if(!controls.hidden&&!e.target.closest("#puffControls,#puffOrb"))settings(false);
    if(!smokeLocked||e.target.closest("#puffPanel,#puffControls,#puffOrb"))return;
    ring(e.clientX,e.clientY);
  },{capture:true,passive:true});

  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&!controls.hidden){e.preventDefault();settings(false);return}
    if(/^[1-5]$/.test(e.key)&&!e.target.closest?.("input,textarea")&&!p.classList.contains("stowed"))pickTrick(TRICKS[e.key-1][0]);
  });

  let begin=()=>{
    if(hold||smokeLocked||p.classList.contains("stowed"))return;
    hold=Date.now();T=newTiming();drawTiming(stage);stage.classList.add("pulling","timing");stage.querySelector(".puffRating").className="puffRating";
    au?.inhaleStart();approach(v());clearTimeout(coughT);coughT=setTimeout(()=>finish(true),T.cough*1000);
    const needle=stage.querySelector(".puffNeedle");
    const loop=()=>{if(!hold)return;let t=(Date.now()-hold)/1000;needle.style.left=Math.min(100,t/T.cough*100)+"%";tick=requestAnimationFrame(loop)};loop();
  };
  let finish=forced=>{
    if(!hold)return;
    let d=Date.now()-hold;hold=0;cancelAnimationFrame(tick);clearTimeout(coughT);au?.inhaleStop();stage.classList.remove("pulling");
    setTimeout(()=>{if(!hold)stage.classList.remove("timing")},1100);
    if(d<=220&&!forced){reverse(v(),false);return}
    let g=forced?"cough":gradeOf(d/1000);rate(stage,g,d/1000);countPuff(d,g);reverse(v(),true);
  };

  const dragMove=e=>{
    if(!gesture||e.pointerId!==gesture.id)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y,dist=Math.hypot(dx,dy);
    if(!gesture.drag&&!gesture.pulling&&dist>9){clearTimeout(pressTimer);gesture.drag=true;p.classList.add("dragging")}
    if(!gesture.drag)return;
    gesture.stow=e.clientY>=innerHeight-stowThreshold();
    p.classList.toggle("stow-ready",gesture.stow);stowGuide(gesture.stow);
    e.preventDefault();place(p,{x:gesture.left+dx,y:gesture.top+dy},false,false);
  };
  const start=e=>{
    if(p.classList.contains("stowed")){e.preventDefault();show();return}
    if(smokeLocked){ring(e.clientX,e.clientY);return}
    e.preventDefault();
    const r=p.getBoundingClientRect();
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,drag:false,pulling:false,stow:false};
    hit.setPointerCapture?.(e.pointerId);clearTimeout(pressTimer);
    pressTimer=setTimeout(()=>{if(gesture&&!gesture.drag){gesture.pulling=true;begin()}},125);
  };
  const end=(e,cancelled=false)=>{
    if(!gesture||e.pointerId!==gesture.id)return;
    clearTimeout(pressTimer);const g=gesture;gesture=null;stowGuide(false);p.classList.remove("stow-ready");
    if(g.drag){
      p.classList.remove("dragging");
      if(g.stow&&!cancelled){hide(e.clientX);return}
      panelPos=clampPos(p,p.getBoundingClientRect().left,p.getBoundingClientRect().top);
      place(p,panelPos,true,true);scheduleLayout();
    }else if(g.pulling)finish(false);
    else{begin();finish(false)}
  };
  hit.addEventListener("pointerdown",start);
  hit.addEventListener("pointermove",dragMove);
  hit.addEventListener("pointerup",e=>end(e,false));
  hit.addEventListener("pointercancel",e=>end(e,true));
  hit.addEventListener("contextmenu",e=>e.preventDefault());
  hit.addEventListener("keydown",e=>{
    if(p.classList.contains("stowed")){if(e.code==="Space"||e.code==="Enter"){e.preventDefault();show()}return}
    if((e.code==="Space"||e.code==="Enter")&&!e.repeat){e.preventDefault();begin()}
  });
  hit.addEventListener("keyup",e=>{if(e.code==="Space"||e.code==="Enter")finish(false)});

  addEventListener("resize",scheduleLayout);
  addEventListener("scroll",scheduleLayout,{passive:true});
  new MutationObserver(m=>{if(m.some(x=>{let el=x.target?.nodeType===1?x.target:null;if(el===document.body)return[...x.addedNodes,...x.removedNodes].some(n=>n.nodeType===1);while(el&&el.parentElement!==document.body)el=el.parentElement;return visible(el)}))scheduleLayout()}).observe(document.body,{childList:true,subtree:true});

  if(localStorage.getItem(STOWK)==="1"){p.classList.add("stowed");stowPosition(p)}else ensurePos(p);
  if(!au)import(new URL("./puff-audio.js?v=2",SRC).href).then(m=>{au=m;m.setMuted(muted)}).catch(()=>{});
  load3d(stage);p3?.show();sync();scheduleLayout();setTimeout(scheduleLayout,80);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
window.SalonAccount?.onChange?.(()=>sync());
window.SalonPuff={state:()=>s,show,hide,stow:hide,center:centerPuff,sync,trick:pickTrick,skin:pickSkin};
})();