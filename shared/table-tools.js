(function(){
const K="salon_table_tools_v1";let state=JSON.parse(localStorage.getItem(K)||'{"favorites":[],"recent":[]}');
function save(){localStorage.setItem(K,JSON.stringify(state))}
function fav(id){let i=state.favorites.indexOf(id);i>=0?state.favorites.splice(i,1):state.favorites.unshift(id);save();notify()}
function recent(id,name){state.recent=state.recent.filter(x=>x.id!==id);state.recent.unshift({id,name,at:Date.now()});state.recent=state.recent.slice(0,8);save();notify()}
function notify(){document.getElementById("salonQuick")?.remove();window.dispatchEvent(new CustomEvent("salon:table-tools-update",{detail:{favorites:[...state.favorites],recent:[...state.recent]}}))}
function boot(){document.getElementById("salonQuick")?.remove()}
window.SalonTableTools={favorite:fav,markRecent:recent,state:()=>state};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();