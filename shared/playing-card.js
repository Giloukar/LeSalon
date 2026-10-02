// Original Le Salon artwork and physical card mesh. No game state is mutated here.
export const CARD_SPEC=Object.freeze({width:1.22,height:1.78,depth:.0068,radius:.064});
export const DECK=Object.freeze(['S','H','D','C'].flatMap(suit=>Array.from({length:13},(_,i)=>({suit,rank:i+1}))).concat([{suit:'X',rank:0,joker:true,jokerVariant:0},{suit:'X',rank:0,joker:true,jokerVariant:1}]));
export function jokerVariant(card){return Number(card?.jokerVariant??(/(?:-|^)(1)$/.test(String(card?.id||''))?1:0))===1?1:0}
export function cardKey(card){return card?.joker?'joker-'+jokerVariant(card):(card?.suit||'X')+'-'+(card?.rank||0)}
const INK='#182536',RED='#b32437',GOLD='#b58a42',PAPER='#fffdf7';
function path(g,d,fill,stroke){const p=new Path2D(d);if(fill){g.fillStyle=fill;g.fill(p)}if(stroke){g.strokeStyle=stroke;g.stroke(p)}}
function pip(g,suit,x,y,size,flip=false){
 g.save();g.translate(x,y);g.scale(size/100,(flip?-1:1)*size/100);
 const color=suit==='H'||suit==='D'?RED:INK;
 const d={H:'M0 42 C-12 27 -49 6 -45 -18 C-41 -47 -9 -46 0 -23 C9 -46 41 -47 45 -18 C49 6 12 27 0 42Z',D:'M0 -49 L34 0 0 49 -34 0Z',S:'M0 -49 C-12 -31 -46 -10 -43 13 C-40 39 -12 38 -4 20 L-9 39 -23 46 23 46 9 39 4 20 C12 38 40 39 43 13 C46 -10 12 -31 0 -49Z',C:'M-7 17 C-43 45 -62 -3 -29 -15 C-46 -59 46 -59 29 -15 C62 -3 43 45 7 17 L10 37 24 46 -24 46 -10 37Z'}[suit];
 if(d)path(g,d,color);g.restore();
}
// Each court is drawn twice, rotated 180 degrees, like a traditional reversible deck.
function courtHalf(g,rank,suit){
 const red=suit==='H'||suit==='D',coat=red?RED:INK,accent=red?INK:RED;
 g.lineWidth=2.5;g.lineJoin='round';
 path(g,'M145 445 L153 337 Q174 303 211 292 L281 292 Q322 310 349 347 L360 445Z',coat,GOLD);
 path(g,'M179 322 L209 302 299 440 264 450Z',GOLD,INK);
 path(g,'M303 315 L327 328 236 450 213 440Z',PAPER,GOLD);
 for(let i=0;i<6;i++){g.save();g.translate(183+i*13,346+i*17);g.rotate(-.48);path(g,'M0 -8 L6 0 0 8 -6 0Z',accent);g.restore()}
 path(g,'M219 278 L218 311 Q255 334 278 306 L275 273Z','#e8c39c',INK);
 path(g,'M207 199 Q247 176 287 206 L279 269 Q270 296 248 298 Q221 285 214 254Z','#f2d5b3',INK);
 path(g,'M204 234 Q182 184 218 172 Q266 151 291 185 L290 240 278 224 277 201 Q235 214 211 203Z',rank===12?GOLD:INK);
 path(g,'M230 236 Q237 231 244 235 M258 233 L269 236 M252 235 L248 256 258 257 M241 274 Q251 278 265 270',null,INK);
 if(rank===13)path(g,'M220 261 Q231 283 252 279 L273 263 266 302 247 317 226 299Z',INK);
 if(rank===11){path(g,'M195 196 Q209 150 268 165 L296 199Z',accent,GOLD);path(g,'M262 173 Q307 125 313 147 Q291 153 275 181Z',PAPER,GOLD)}
 else{path(g,'M204 188 L195 145 222 159 246 129 270 158 294 143 283 187Z',GOLD,INK);for(const x of [217,246,274]){g.beginPath();g.arc(x,174,4,0,7);g.fillStyle=RED;g.fill()}}
 if(rank===12){path(g,'M325 403 L329 263',null,GOLD);for(let i=0;i<5;i++){g.save();g.translate(329,254);g.rotate(i*Math.PI*2/5);path(g,'M0 0 C-25 -8 -14 -38 0 -20 C14 -38 25 -8 0 0Z',RED,GOLD);g.restore()}}
 else{path(g,'M172 416 L178 226 188 202 196 227 189 419Z',rank===13?'#c9d1d8':GOLD,INK);path(g,'M161 305 L202 307',null,GOLD)}
 pip(g,suit,253,371,42);
}
function jokerHalf(g,variant){
 const a=variant?RED:INK,b=variant?GOLD:'#60768b';g.lineWidth=3;
 path(g,'M159 443 Q160 359 223 329 L285 329 Q350 366 350 443Z',a,GOLD);
 path(g,'M204 339 L225 378 250 348 276 378 300 339',PAPER,GOLD);
 path(g,'M214 247 Q250 219 286 249 L279 307 Q251 345 222 306Z','#f2d5b3',INK);
 path(g,'M202 270 Q178 222 162 214 Q194 182 224 236 Q237 180 257 170 Q287 196 279 235 Q315 195 342 226 Q308 226 298 273 L273 258 250 270 229 257Z',b,a);
 for(const [x,y] of [[163,215],[257,173],[340,226]]){g.beginPath();g.arc(x,y,9,0,7);g.fillStyle=GOLD;g.fill()}
 path(g,'M230 285 L240 283 M260 283 L270 285 M236 303 Q253 318 269 300',null,INK);
 for(let i=0;i<3;i++)path(g,`M${220+i*29} 393 l12 18 -12 18 -12 -18Z`,i%2?GOLD:PAPER);
}
export function drawCardFace(g,w,h,card){
 g.save();g.scale(w/500,h/730);g.fillStyle=PAPER;g.fillRect(0,0,500,730);
 const isJoker=!!card?.joker,rank=Number(card?.rank),suit=card?.suit;
 const label=isJoker?'J':({1:'A',11:'V',12:'D',13:'R'}[rank]||String(rank||''));
 for(let turn=0;turn<2;turn++){g.save();if(turn){g.translate(500,730);g.rotate(Math.PI)}
 g.fillStyle=(suit==='H'||suit==='D'||isJoker&&jokerVariant(card))?RED:INK;g.textAlign='center';g.textBaseline='middle';g.font='bold 64px Georgia,serif';g.fillText(label,49,65);
 if(isJoker){g.font='bold 16px Georgia,serif';[...'JOKER'].forEach((c,i)=>g.fillText(c,48,112+i*23))}else pip(g,suit,49,128,43);g.restore()}
 if(isJoker||rank>10){
 g.strokeStyle=GOLD;g.lineWidth=2;g.strokeRect(112,150,276,430);
 g.save();g.beginPath();g.rect(114,152,272,426);g.clip();
 for(let turn=0;turn<2;turn++){g.save();if(turn){g.translate(500,730);g.rotate(Math.PI)}g.beginPath();g.rect(114,152,272,213);g.clip();g.translate(0,57);g.scale(1,.72);if(isJoker)jokerHalf(g,jokerVariant(card));else courtHalf(g,rank,suit);g.restore()}g.restore();
 }else if(rank===1){pip(g,suit,250,350,157);g.fillStyle=GOLD;g.textAlign='center';g.font='14px Georgia,serif';g.fillText('L E  S A L O N',250,465)}
 else{
 const rows={2:[[250,190],[250,540]],3:[[250,190],[250,365],[250,540]],4:[[161,190],[339,190],[161,540],[339,540]],5:[[161,190],[339,190],[250,365],[161,540],[339,540]],6:[[161,190],[339,190],[161,365],[339,365],[161,540],[339,540]],7:[[161,190],[339,190],[250,277],[161,365],[339,365],[161,540],[339,540]],8:[[161,190],[339,190],[250,277],[161,365],[339,365],[250,452],[161,540],[339,540]],9:[[161,177],[339,177],[161,302],[339,302],[250,365],[161,428],[339,428],[161,553],[339,553]],10:[[161,177],[339,177],[250,239],[161,302],[339,302],[161,428],[339,428],[250,491],[161,553],[339,553]]}[rank]||[];
 for(const [x,y] of rows)pip(g,suit,x,y,rank>=9?67:77,y>365);
 }
 g.restore();
}
export function drawCardBack(g,w,h){
 g.save();g.scale(w/500,h/730);g.fillStyle=PAPER;g.fillRect(0,0,500,730);g.fillStyle='#162c48';g.beginPath();g.roundRect(24,24,452,682,15);g.fill();
 g.save();g.beginPath();g.rect(35,35,430,660);g.clip();g.strokeStyle='#627991';g.lineWidth=1.2;
 for(let x=-700;x<900;x+=22){g.beginPath();g.moveTo(x,0);g.lineTo(x+730,730);g.stroke();g.beginPath();g.moveTo(x,730);g.lineTo(x+730,0);g.stroke()}g.restore();
 for(const inset of [37,46,62]){g.strokeStyle=GOLD;g.lineWidth=inset===46?3:1;g.beginPath();g.roundRect(inset,inset,500-inset*2,730-inset*2,10);g.stroke()}
 for(let turn=0;turn<2;turn++){g.save();if(turn){g.translate(500,730);g.rotate(Math.PI)}
 g.fillStyle='#162c48';g.beginPath();g.ellipse(250,245,123,140,0,0,Math.PI*2);g.fill();g.strokeStyle=GOLD;g.lineWidth=2;g.stroke();
 for(let i=0;i<12;i++){g.save();g.translate(250,245);g.rotate(i*Math.PI/6);path(g,'M0 -116 C-40 -87 -25 -42 0 -21 C25 -42 40 -87 0 -116Z',null,GOLD);g.restore()}
 g.fillStyle='#162c48';g.beginPath();g.arc(250,245,40,0,7);g.fill();g.stroke();g.fillStyle='#ecdbb4';g.font='italic 38px Georgia,serif';g.textAlign='center';g.textBaseline='middle';g.fillText('S',250,246);g.restore()}
 g.restore();
}
export function drawPaperGrain(g,w,h){
 g.fillStyle='#808080';g.fillRect(0,0,w,h);let seed=7241;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){seed=(Math.imul(seed,1664525)+1013904223)|0;const v=119+((seed>>>24)%19);g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(x,y,1,1)}
}
export function createCardGeometry(THREE){
 const {width:w,height:h,depth:d,radius:r}=CARD_SPEC,positions=[],uvs=[],indices=[],rings=[];
 const ring=(inset,z)=>{const list=[];for(let c=0;c<4;c++){const angle=c*Math.PI/2,cx=(c===0||c===3?1:-1)*(w/2-r),cy=(c<2?1:-1)*(h/2-r);for(let i=0;i<=10;i++){const a=angle+i*Math.PI/20,x=cx+(r-inset)*Math.cos(a),y=cy+(r-inset)*Math.sin(a);list.push(positions.length/3);positions.push(x,y,z);uvs.push(x/w+.5,y/h+.5)}}return list};
 // Edge bevel has true thickness; printed caps are separate to keep their normals flat.
 for(const [inset,z] of [[.0013,-d/2],[0,-d/2+.0013],[0,d/2-.0013],[.0013,d/2]])rings.push(ring(inset,z));
 const n=rings[0].length;
 for(let k=0;k<3;k++)for(let i=0;i<n;i++){const j=(i+1)%n,a=rings[k][i],b=rings[k][j],c=rings[k+1][i],e=rings[k+1][j];indices.push(a,b,c,b,e,c)}
 const edgeCount=indices.length;
 for(const front of [true,false]){const cap=ring(.0013,front?d/2:-d/2),center=positions.length/3;positions.push(0,0,front?d/2:-d/2);uvs.push(.5,.5);if(!front)for(const idx of cap)uvs[idx*2]=1-uvs[idx*2];for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(center,cap[front?i:j],cap[front?j:i])}}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.addGroup(0,edgeCount,0);geo.addGroup(edgeCount,n*3,4);geo.addGroup(edgeCount+n*3,n*3,5);geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();return geo;
}
