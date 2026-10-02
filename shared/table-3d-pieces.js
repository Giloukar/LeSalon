// Shared, deterministic board-game models. Geometry/material ownership belongs to the kit.
export const PIECE_KINDS=Object.freeze(['die','pawn','rummikub-tile','metropole-house','metropole-owner-marker','code-gem','golf-ball','golf-obstacle','golf-portal','balloon']);
export function dieValues(value){const v=Math.max(1,Math.min(6,Number(value)||1)),pairs=[[1,6],[2,5],[3,4]].filter(p=>!p.includes(v));return[pairs[0][0],pairs[0][1],v,7-v,pairs[1][0],pairs[1][1]]}
export function roundedBox(T,w,h,d,r,segments=6){
 const g=new T.BoxGeometry(w,h,d,segments,segments,segments),p=g.attributes.position,inner=new T.Vector3(w/2-r,h/2-r,d/2-r),v=new T.Vector3(),c=new T.Vector3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);c.copy(v).clamp(inner.clone().negate(),inner);v.sub(c).normalize().multiplyScalar(r).add(c);p.setXYZ(i,v.x,v.y,v.z)}
 g.computeVertexNormals();g.computeBoundingBox();return g;
}
const PIPS={1:[[0,0]],2:[[-1,1],[1,-1]],3:[[-1,1],[0,0],[1,-1]],4:[[-1,1],[1,1],[-1,-1],[1,-1]],5:[[-1,1],[1,1],[0,0],[-1,-1],[1,-1]],6:[[-1,1],[1,1],[-1,0],[1,0],[-1,-1],[1,-1]]};
function dieFace(T,value){
 const g=new T.PlaneGeometry(.68,.68,40,40),p=g.attributes.position,colors=[],ink=new T.Color('#172233'),ivory=new T.Color('#fffaf0'),color=new T.Color(),r=.085,flat=.34-r;
 for(let i=0;i<p.count;i++){
 const x=p.getX(i),y=p.getY(i),cx=Math.max(-flat,Math.min(flat,x)),cy=Math.max(-flat,Math.min(flat,y));
 // Map a cube face onto the rounded shell; seams on adjacent faces coincide.
 const v=new T.Vector3(x-cx,y-cy,r).normalize().multiplyScalar(r).add(new T.Vector3(cx,cy,flat));
 let dist=10;for(const [px,py] of PIPS[value]||[])dist=Math.min(dist,Math.hypot(x-px*.15,y-py*.15));
 const bowl=Math.max(0,1-(dist/.05)**2);v.z-=.022*bowl*bowl;p.setXYZ(i,v.x,v.y,v.z);
 const pigment=1-T.MathUtils.smoothstep(dist,.037,.048);color.copy(ivory).lerp(ink,pigment);colors.push(color.r,color.g,color.b);
 }
 g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
export function createPieceKit(T){
 const geometries=new Map(),materials=new Map();let disposed=false;
 const geo=(key,make)=>{if(!geometries.has(key))geometries.set(key,make());return geometries.get(key)};
 const mat=(key,options)=>{if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial(options));return materials.get(key)};
 const solid=(color,roughness=.36,metalness=0)=>mat(color+'|'+roughness+'|'+metalness,{color,roughness,metalness});
 const mesh=(geometry,material,name)=>{const m=new T.Mesh(geometry,material);m.name=name;m.castShadow=m.receiveShadow=true;return m};
 const group=name=>{const g=new T.Group();g.name=name;g.userData.modelPack='salon-physical-pieces-v1';return g};
 const box=(w,h,d,r)=>geo(`box:${w}:${h}:${d}:${r}`,()=>roundedBox(T,w,h,d,r));
 const sphere=(r)=>geo('sphere:'+r,()=>new T.SphereGeometry(r,24,16));
 function create(kind,c={}){
 if(disposed||!PIECE_KINDS.includes(kind))return null;
 const root=group(kind);
 if(kind==='die'){
 const values=c.blank?[0,0,0,0,0,0]:dieValues(c.value),rotations=[[0,Math.PI/2,0],[0,-Math.PI/2,0],[-Math.PI/2,0,0],[Math.PI/2,0,0],[0,0,0],[0,Math.PI,0]];
 values.forEach((v,i)=>{const face=mesh(geo('die-face:'+v,()=>dieFace(T,v)),mat('dice-resin',{vertexColors:true,roughness:.29,metalness:0}),'Recessed_pips_'+i);face.rotation.set(...rotations[i]);face.userData.faceValue=v;root.add(face)});root.userData.faceValues=values;
 }else if(kind==='pawn'){
 const points=[[.16,-.23],[.21,-.22],[.23,-.19],[.23,-.15],[.19,-.12],[.15,-.1],[.105,.025],[.10,.045],[.135,.065],[.15,.105],[.135,.155],[.105,.195],[.06,.225],[0,.23]].map(([x,y])=>new T.Vector2(x,y));
 root.add(mesh(geo('turned-pawn',()=>new T.LatheGeometry(points,32)),solid(c.color||'#c75440',.28),'Lacquered_turned_pawn'));
 const foot=mesh(geo('felt-foot',()=>new T.CylinderGeometry(.175,.175,.008,32)),solid('#23362d',.96),'Felt_base');foot.position.y=-.23;root.add(foot);
 }else if(kind==='rummikub-tile'){
 const edge=mat('tile-edge',{name:'salon-tile-edge',color:'#ece4d0',roughness:.35}),front=mat('tile-front',{name:'salon-tile-front',color:'#fff6df',roughness:.36}),back=mat('tile-back',{name:'salon-tile-back',color:'#34493c',roughness:.48});
 root.add(mesh(box(.62,.9,.085,.032),[edge,edge,edge,edge,front,back],'Rounded_resin_tile'));
 }else if(kind==='metropole-house'){
 const walls=mesh(box(.17,.145,.17,.008),solid('#e7dcc1',.64),'Walls');walls.position.y=-.04;root.add(walls);
 const roof=geo('gable-roof',()=>{const s=new T.Shape();s.moveTo(-.095,0);s.lineTo(0,.09);s.lineTo(.095,0);s.closePath();const g=new T.ExtrudeGeometry(s,{depth:.19,bevelEnabled:false});g.translate(0,.035,-.095);return g});root.add(mesh(roof,solid('#b85b46',.67),'Terracotta_roof'));
 const door=mesh(box(.034,.065,.003,.001),solid('#3e4c42',.62),'Door');door.position.set(0,-.077,.086);root.add(door);
 for(const x of [-.055,.055]){const window=mesh(box(.024,.028,.003,.001),solid('#809fa8',.25),'Window');window.position.set(x,-.017,.086);root.add(window)}
 }else if(kind==='metropole-owner-marker'){
 const base=mesh(geo('marker-base',()=>new T.CylinderGeometry(.088,.09,.028,24)),solid(c.color||'#c69c43',.3),'Ownership_base');base.position.y=-.095;root.add(base);
 const pole=mesh(geo('marker-post',()=>new T.CylinderGeometry(.021,.026,.19,16)),solid('#aa874d',.32,.55),'Brass_post');root.add(pole);
 const top=mesh(sphere(.044),solid(c.color||'#c69c43',.3),'Owner_color');top.position.y=.07;root.add(top);
 }else if(kind==='code-gem'){
 const g=geo('faceted-gem',()=>{const points=[[0,-.49],[.34,-.15],[.48,.015],[.48,.13],[.24,.35],[0,.35]].map(p=>new T.Vector2(...p));const g=new T.LatheGeometry(points,8);g.computeVertexNormals();return g});root.add(mesh(g,mat('gem:'+c.color,{color:c.color||'#528eb1',roughness:.18,metalness:.26,flatShading:true}),'Cut_gem'));
 }else if(kind==='golf-ball'){
 const g=geo('dimpled-ball',()=>{const g=new T.SphereGeometry(.13,64,40),p=g.attributes.position,centers=[];for(let i=0;i<180;i++){const y=1-2*(i+.5)/180,a=i*2.39996323;centers.push(new T.Vector3(Math.cos(a)*Math.sqrt(1-y*y),y,Math.sin(a)*Math.sqrt(1-y*y)))}const v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).normalize();let nearest=-1;for(const c of centers)nearest=Math.max(nearest,v.dot(c));const dip=Math.max(0,(nearest-.994)/.006);v.multiplyScalar(.13-.0022*dip*dip);p.setXYZ(i,v.x,v.y,v.z)}g.computeVertexNormals();return g});root.add(mesh(g,solid('#fffaf0',.34),'Dimpled_golf_ball'));
 }else if(kind==='golf-obstacle'){
 const g=geo('stone',()=>{const g=new T.IcosahedronGeometry(1,2),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),f=1+.075*Math.sin(x*9+y*7+z*11);p.setXYZ(i,x*f,y*f*.62,z*f)}g.computeVertexNormals();return g});root.add(mesh(g,mat('granite',{color:'#777d83',roughness:.96,flatShading:true}),'Granite_obstacle'));root.scale.setScalar(c.radius||.4);
 }else if(kind==='golf-portal'){
 const rim=mesh(geo('hole-rim',()=>new T.TorusGeometry(.31,.038,12,48)),solid('#b4afa0',.31,.7),'Metal_cup_rim');rim.rotation.x=Math.PI/2;root.add(rim);
 }else if(kind==='balloon'){
 const g=geo('latex-balloon',()=>{const g=new T.SphereGeometry(1,40,28),p=g.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i),taper=.9+.1*y;p.setXYZ(i,p.getX(i)*taper,y*1.18,p.getZ(i)*taper)}g.computeVertexNormals();return g});root.add(mesh(g,solid('#e9a1c7',.22),'Latex_balloon'));root.scale.setScalar(c.scale||1);
 }
 return root;
 }
 function dispose(){for(const g of geometries.values())g.dispose();for(const m of materials.values())m.dispose();geometries.clear();materials.clear();disposed=true}
 return{create,dispose,stats:()=>({geometries:geometries.size,materials:materials.size})};
}
