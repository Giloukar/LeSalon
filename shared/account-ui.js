(function(){
function css(){
  if(document.getElementById("salon-account-style"))return;
  const s=document.createElement("style");s.id="salon-account-style";
  s.textContent=".saPanel{position:fixed;inset:0;z-index:100000;background:#05070bbd;display:grid;place-items:center;padding:16px}.saBox{width:min(460px,100%);background:#121824;border:1px solid #344055;border-radius:18px;padding:22px;color:white;font:14px system-ui;box-shadow:0 22px 80px #0009}.saBox input{width:100%;margin:10px 0;padding:11px;border-radius:9px;border:1px solid #344055;background:#090d14;color:white}.saBox .actions{display:flex;gap:8px;flex-wrap:wrap}.saBox button{padding:10px 12px;border:0;border-radius:9px;font-weight:750;cursor:pointer}.saBox .primary{background:#a9b9ff;color:#111629}.saAccountCard{margin:14px 0;padding:13px;border:1px solid #ffffff18;border-radius:12px;background:#ffffff08}.saAccountCard small{display:block;margin-top:4px;color:#9eabc0;overflow-wrap:anywhere}";
  document.head.appendChild(s);
}
function shell(body){
  const p=document.createElement("div");p.className="saPanel";p.innerHTML='<div class="saBox">'+body+'</div>';document.body.appendChild(p);
  const close=()=>p.remove();p.addEventListener("click",e=>{if(e.target===p)close()});
  return{p,close};
}
function loginPanel(){
  const {p,close}=shell('<h2>Paramètres du compte</h2><p>Connecte ton compte pour retrouver ta progression, tes statistiques et tes succès sur tous tes appareils.</p><div class="actions"><button class="primary" id="saGoogle">Continuer avec Google</button><button id="saClose">Fermer</button></div><hr style="border:0;border-top:1px solid #ffffff18;margin:18px 0"><small>Alternative</small><input id="saEmail" type="email" placeholder="ton@email.fr"><div class="actions"><button id="saSend">Recevoir un lien par e-mail</button></div>');
  p.querySelector("#saClose").onclick=close;
  p.querySelector("#saGoogle").onclick=async()=>{const b=p.querySelector("#saGoogle");b.disabled=true;b.textContent="Ouverture de Google…";try{const r=await SalonAccount.google();if(r?.error)throw r.error}catch(err){b.disabled=false;b.textContent="Continuer avec Google";alert("Connexion Google impossible : "+(err?.message||"configuration OAuth à vérifier."))}};
  p.querySelector("#saSend").onclick=async()=>{const e=p.querySelector("#saEmail").value.trim();if(!e)return;const b=p.querySelector("#saSend");b.disabled=true;b.textContent="Envoi…";try{const r=await SalonAccount.magic(e);if(r?.error)throw r.error;b.textContent="Lien envoyé ✓"}catch(err){b.disabled=false;b.textContent="Recevoir un lien par e-mail";alert("Connexion par e-mail indisponible pour le moment.")}};
}
function accountPanel(){
  const u=SalonAccount.user?.();
  if(!u){loginPanel();return}
  const mail=String(u.email||"Compte connecté").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const {p,close}=shell('<h2>Paramètres</h2><div class="saAccountCard"><b>Compte connecté</b><small>'+mail+'</small></div><p style="color:#9eabc0">L’adresse du compte n’est plus affichée en permanence sur le site.</p><div class="actions"><button class="primary" id="saClose">Fermer</button><button id="saOut">Se déconnecter</button></div>');
  p.querySelector("#saClose").onclick=close;
  p.querySelector("#saOut").onclick=async()=>{await SalonAccount.logout();close()};
}
async function boot(){
  css();
  window.addEventListener("salon:open-account",accountPanel);
  await SalonAccount.init();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
window.SalonAccountUI={open:accountPanel};
})();