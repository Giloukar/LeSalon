// Puff 3D — modèle "JNR" + fumée volumétrique (Three.js). Chargé dynamiquement par puff-widget.js.
// Même URL de three que celle importée par GLTFLoader (+esm de jsDelivr) : une seule instance
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js/+esm";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/* ---------- Textures générées ---------- */
function smokeTexture() {
  const c = document.createElement("canvas"), g = c.getContext("2d"), S = 128;
  c.width = c.height = S;
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * S * .26, r = rand(S * .06, S * .24);
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${rand(.08, .3).toFixed(2)})`); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  // Masque circulaire doux pour éviter les bords carrés
  g.globalCompositeOperation = "destination-in";
  const m = g.createRadialGradient(S / 2, S / 2, S * .08, S / 2, S / 2, S / 2);
  m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = m; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

/* ---------- Skins ---------- */
// "blackberry" = impression d'origine du modèle GLB ; les autres sont peints dans la même disposition UV
export const SKINS = {
  blackberry: { name: "Blackberry", original: true },
  falcon: { name: "Golden Falcon", flavor: ["MANGO", "PASSION FRUIT"], scene: "forest", sky: ["#0c3f3a", "#1c8676", "#45c9b4", "#b4f3e3"], splash: "#fff1c4", flavorColor: "#ff9f2e" },
  cherry: { name: "Cherry Ice", flavor: ["CHERRY", "ICE"], scene: "sky", sky: ["#0b2f4f", "#1f6f9e", "#4fb0e0", "#bfe6f7"], splash: "#d8233f", flavorColor: "#ff5a6e" },
  razz: { name: "Blue Razz", flavor: ["BLUE", "RAZZ"], scene: "dusk", sky: ["#140a33", "#3a1a66", "#b0418f", "#f59a6b"], splash: "#7fe8ff", flavorColor: "#7fe8ff" }
};
// Photo réelle de buse à queue rousse en vol, détourée (Frank Schulenburg, Wikimedia Commons, CC BY-SA 4.0) — voir assets/puff/CREDITS.md
const HAWK = new Image(), onHawk = [];
HAWK.onload = () => onHawk.forEach(f => f());
HAWK.src = new URL("../assets/puff/hawk.webp?v=2", import.meta.url).href;

/* ---------- Impression (disposition UV du GLB) ----------
   Texture 887 × 1774 = une demi-circonférence (flanc → face avant → flanc), répétée au dos.
   Face avant plate centrée sur x = 443 ; ~11,9 px/mm en largeur contre ~18,9 px/mm en hauteur :
   on écrase donc horizontalement (SQ) ce qui doit garder ses proportions sur la puff. */
const TW = 887, TH = 1774, SQ = .63;
const DIGITS = { x0: 290, x1: 600, y0: 1520, y1: 1720 }; // zone des chiffres imprimés "100%" à masquer

function scenery(g, skin) {
  const bg = g.createLinearGradient(0, TH, 0, 0);
  skin.sky.forEach((col, i) => bg.addColorStop(i / (skin.sky.length - 1), col));
  g.fillStyle = bg; g.fillRect(0, 0, TW, TH);
  // Rayons de lumière depuis le haut
  g.save(); g.globalCompositeOperation = "screen";
  for (let i = 0; i < 8; i++) {
    const x = rand(TW * .2, TW * .8), sp = rand(20, 60), gr = g.createLinearGradient(0, 0, 0, TH * .8);
    gr.addColorStop(0, `rgba(255,255,240,${rand(.08, .2).toFixed(2)})`); gr.addColorStop(1, "rgba(255,255,240,0)");
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - 8, 0); g.lineTo(x + 8, 0); g.lineTo(x + sp + rand(30, 110), TH * .8); g.lineTo(x - sp + rand(-40, 30), TH * .8); g.fill();
  }
  g.restore();
  if (skin.scene === "forest") {
    // Sapins en plans successifs, de plus en plus nets et sombres
    for (const [n, alpha, blur, h0] of [[14, .25, 6, .55], [10, .45, 3, .7], [8, .75, 0, .85]]) {
      g.save(); g.filter = blur ? `blur(${blur}px)` : "none"; g.fillStyle = `rgba(4,28,25,${alpha})`;
      for (let i = 0; i < n; i++) {
        const x = rand(0, TW), top = TH * (1 - h0) + rand(-80, 100), wd = rand(28, 60);
        g.beginPath(); g.moveTo(x, top);
        for (let k = 1; k <= 7; k++) { const y = top + (TH - top) * k / 7, s = wd * k / 7; g.lineTo(x + s, y); g.lineTo(x + s * .45, y); }
        for (let k = 7; k >= 1; k--) { const y = top + (TH - top) * k / 7, s = wd * k / 7; g.lineTo(x - s * .45, y); g.lineTo(x - s, y); }
        g.fill();
      }
      g.restore();
    }
  } else {
    for (let i = 0; i < 18; i++) { // nuages
      const x = rand(0, TW), y = rand(TH * .4, TH), r = rand(60, 170), gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, skin.scene === "dusk" ? "rgba(255,180,200,.18)" : "rgba(255,255,255,.22)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const mist = g.createLinearGradient(0, TH * .55, 0, TH); mist.addColorStop(0, "rgba(255,255,255,0)"); mist.addColorStop(1, "rgba(220,255,245,.16)");
  g.fillStyle = mist; g.fillRect(0, 0, TW, TH);
  g.fillStyle = skin.splash;
  for (let i = 0; i < 50; i++) { g.globalAlpha = rand(.25, .75); g.beginPath(); g.ellipse(rand(TW * .55, TW * .9), rand(80, 700), rand(1, 3) * SQ, rand(1.5, 5), 0, 0, 6.3); g.fill(); }
  g.globalAlpha = 1;
}
// Texte "à l'échelle" de la puff malgré l'étirement horizontal des UV
function text(g, str, x, y, font, color, blur = 8) {
  g.save(); g.translate(x, y); g.scale(SQ, 1); g.font = font; g.fillStyle = color; g.textAlign = "center";
  g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = blur; g.fillText(str, 0, 0); g.restore();
}
function paintSkin(g, skin) {
  scenery(g, skin);
  if (HAWK.complete && HAWK.naturalWidth) {
    // Rapace tête à gauche, ailes levées qui débordent sur les flancs, serres en avant
    const w = 860, h = w * HAWK.naturalHeight / HAWK.naturalWidth / SQ;
    g.save(); g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 24; g.translate(430, 560); g.rotate(-.04); g.drawImage(HAWK, -w / 2, -h / 2, w, h); g.restore();
    g.save(); g.globalCompositeOperation = "soft-light"; g.translate(430, 540); g.scale(SQ, 1);
    const warm = g.createRadialGradient(0, 0, 20, 0, 0, 480); warm.addColorStop(0, "rgba(255,170,70,.55)"); warm.addColorStop(1, "rgba(255,170,70,0)");
    g.fillStyle = warm; g.fillRect(-800, -800, 1600, 1600); g.restore();
  }
  text(g, "JNR", 443, 1175, "700 190px 'Helvetica Neue',Arial,sans-serif", "#fff");
  text(g, "®", 590, 1040, "600 40px Arial,sans-serif", "#fff");
  text(g, "JUST NO REASON", 443, 1238, "500 50px Arial,sans-serif", "#fff");
  text(g, skin.flavor[0], 443, 1360, "800 58px Arial,sans-serif", skin.flavorColor);
  text(g, skin.flavor[1], 443, 1430, "800 58px Arial,sans-serif", skin.flavorColor);
}
// Efface les chiffres imprimés du décor d'origine : les pixels blancs sont retirés puis la zone est
// reconstruite à partir du voisinage (remplissage "pull-push" par réductions successives)
function eraseDigits(g) {
  const { x0, x1, y0, y1 } = DIGITS, w = x1 - x0, h = y1 - y0;
  const cut = document.createElement("canvas"), c = cut.getContext("2d"); cut.width = w; cut.height = h;
  c.drawImage(g.canvas, x0, y0, w, h, 0, 0, w, h);
  const im = c.getImageData(0, 0, w, h), d = im.data, hole = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) if (d[k * 4] > 170 && d[k * 4 + 1] > 170 && d[k * 4 + 2] > 170) hole[k] = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { // dilatation de 4 px pour avaler le halo des chiffres
    let near = 0; for (let dy = -4; dy <= 4 && !near; dy++) for (let dx = -4; dx <= 4; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w && hole[yy * w + xx] === 1) { near = 1; break; } }
    if (near) d[(y * w + x) * 4 + 3] = 0;
  }
  c.putImageData(im, 0, 0);
  const fill = document.createElement("canvas"), f = fill.getContext("2d"); fill.width = w; fill.height = h;
  for (const k of [32, 16, 8, 4, 2]) { // du plus grossier au plus fin : chaque niveau bouche les trous restants
    const t = document.createElement("canvas"); t.width = Math.max(1, w / k | 0); t.height = Math.max(1, h / k | 0);
    const tc = t.getContext("2d"); tc.imageSmoothingQuality = "high"; tc.drawImage(cut, 0, 0, t.width, t.height);
    f.imageSmoothingQuality = "high"; f.drawImage(t, 0, 0, w, h);
  }
  f.drawImage(cut, 0, 0);
  g.drawImage(fill, x0, y0);
}
// Écran 7 segments (chiffres blancs comme sur la vraie puff) — plan séparé pour pouvoir s'allumer au tirage
function paintDisplay(c, level) {
  const g = c.getContext("2d"); c.width = 512; c.height = 192; g.clearRect(0, 0, 512, 192);
  const SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
  const digit = (d, x, y, w, h, t) => {
    const on = SEG[d] || "", seg = (k, sx, sy, horiz) => {
      g.globalAlpha = on.includes(k) ? 1 : .07; g.beginPath();
      if (horiz) { g.moveTo(sx + t * .5, sy); g.lineTo(sx + t, sy - t / 2); g.lineTo(sx + w - t, sy - t / 2); g.lineTo(sx + w - t * .5, sy); g.lineTo(sx + w - t, sy + t / 2); g.lineTo(sx + t, sy + t / 2); }
      else { g.moveTo(sx, sy + t * .5); g.lineTo(sx + t / 2, sy + t); g.lineTo(sx + t / 2, sy + h / 2 - t); g.lineTo(sx, sy + h / 2 - t * .5); g.lineTo(sx - t / 2, sy + h / 2 - t); g.lineTo(sx - t / 2, sy + t); }
      g.closePath(); g.fill();
    };
    seg("a", x, y, 1); seg("g", x, y + h / 2, 1); seg("d", x, y + h, 1);
    seg("f", x, y, 0); seg("b", x + w, y, 0); seg("e", x, y + h / 2, 0); seg("c", x + w, y + h / 2, 0);
  };
  g.fillStyle = "#fff"; g.shadowColor = "rgba(255,255,255,.7)"; g.shadowBlur = 10;
  const s = String(Math.max(0, Math.min(100, level))).padStart(3, " ");
  [...s].forEach((d, i) => d !== " " && digit(+d, 70 + i * 120, 26, 80, 130, 20));
  g.globalAlpha = 1; g.font = "700 54px Arial,sans-serif"; g.fillText("%", 430, 156);
}

function blobTexture() {
  const c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = c.height = 128;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* ---------- Système de particules de fumée (quads instanciés) ---------- */
const S = 32; // floats par particule
const FREE = 0, RING = 1, TWIST = 2, GHOST = 3;

class Smoke {
  constructor(max, tex) {
    this.max = max; this.n = 0; this.time = 0; this.emitters = [];
    this.d = new Float32Array(max * S);
    const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iPos", this.iPos); geo.setAttribute("iData", this.iData);
    geo.instanceCount = 0; this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTex: { value: tex } },
      vertexShader: `attribute vec3 iPos;attribute vec4 iData;varying vec2 vUv;varying float vA;varying float vHue;
        void main(){vec4 mv=modelViewMatrix*vec4(iPos,1.);float near=smoothstep(1.2,4.5,-mv.z);float c=cos(iData.z),s=sin(iData.z);
        mv.xy+=mat2(c,s,-s,c)*position.xy*iData.x;gl_Position=projectionMatrix*mv;vUv=uv;vA=iData.y*near;vHue=iData.w;}`,
      fragmentShader: `uniform sampler2D uTex;varying vec2 vUv;varying float vA;varying float vHue;
        vec3 hsv(float h){return clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);}
        void main(){float a=texture2D(uTex,vUv).a*vA;if(a<.002)discard;
        float light=.8+.2*vUv.y;vec3 col=vec3(.9,.93,.95)*light;
        if(vHue>=0.)col=mix(col,hsv(vHue+vUv.x*.15),.35);
        gl_FragColor=vec4(col,a);}`
    });
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
  }
  get busy() { return this.n > 0 || this.emitters.length > 0; }
  spawn(o) {
    if (this.n >= this.max) return;
    const d = this.d, i = this.n++ * S;
    d.fill(0, i, i + S);
    d[i] = o.x || 0; d[i + 1] = o.y || 0; d[i + 2] = o.z || 0;
    d[i + 3] = o.vx || 0; d[i + 4] = o.vy || 0; d[i + 5] = o.vz || 0;
    d[i + 7] = o.life || 3; d[i + 8] = o.s0 ?? .3; d[i + 9] = o.s1 ?? 1.5;
    d[i + 10] = o.a ?? .5; d[i + 11] = Math.random() * 6.28; d[i + 12] = rand(-.6, .6);
    d[i + 13] = Math.random(); d[i + 14] = o.drag ?? 1; d[i + 15] = o.lift ?? .2;
    d[i + 16] = o.kind || FREE; d[i + 17] = o.hue ?? -1;
    if (o.p) for (let k = 0; k < o.p.length; k++) d[i + 18 + k] = o.p[k];
  }
  emit(e) { e.t = 0; e.acc = 0; this.emitters.push(e); }
  clear() { this.n = 0; this.emitters.length = 0; this.geo.instanceCount = 0; }
  update(dt) {
    this.time += dt;
    const T = this.time;
    for (let k = this.emitters.length - 1; k >= 0; k--) {
      const e = this.emitters[k];
      e.t += dt; e.acc += e.rate * dt;
      while (e.acc >= 1) { e.acc--; e.make(e.t / e.dur, this); }
      if (e.t >= e.dur) this.emitters.splice(k, 1);
    }
    const d = this.d, P = this.iPos.array, D = this.iData.array;
    const n3 = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let j = 0; j < this.n; j++) {
      const i = j * S;
      const age = (d[i + 6] += dt), life = d[i + 7];
      if (age >= life) { // retire la particule en la remplaçant par la dernière
        this.n--; if (j !== this.n) d.copyWithin(i, this.n * S, this.n * S + S); j--; continue;
      }
      const t = age / life, kind = d[i + 16], seed = d[i + 13] * 6.283;
      if (kind === RING) {
        // Anneau tourbillonnaire : le tore avance, grossit et "roule" sur lui-même
        n3.set(d[i + 21], d[i + 22], d[i + 23]); const sp = n3.length(); n3.divideScalar(sp || 1);
        u.crossVectors(n3, up); if (u.lengthSq() < 1e-4) u.set(1, 0, 0); u.normalize(); w.crossVectors(u, n3);
        const travel = sp * (1 - Math.exp(-.55 * age)) / .55;
        const R = d[i + 24] + d[i + 25] * age, th = d[i + 26], ph = (d[i + 27] += d[i + 29] * dt), tr = d[i + 28] * (1 + age * .35);
        const wob = 1 + .05 * Math.sin(th * 3 + T * 1.7 + d[i + 31]);
        const rr = (R + tr * Math.cos(ph)) * wob;
        d[i] = d[i + 18] + n3.x * travel + (Math.cos(th) * u.x + Math.sin(th) * w.x) * rr + n3.x * tr * Math.sin(ph);
        d[i + 1] = d[i + 19] + n3.y * travel + (Math.cos(th) * u.y + Math.sin(th) * w.y) * rr + n3.y * tr * Math.sin(ph) + d[i + 15] * age * age;
        d[i + 2] = d[i + 20] + n3.z * travel + (Math.cos(th) * u.z + Math.sin(th) * w.z) * rr + n3.z * tr * Math.sin(ph);
      } else if (kind === TWIST) {
        // Tornade : spirale ascendante en entonnoir
        const h = d[i + 24] + d[i + 23] * age, r = d[i + 25] + d[i + 26] * h;
        const th = (d[i + 21] += d[i + 22] * dt / (.25 + r));
        d[i] = d[i + 18] + Math.cos(th) * r + Math.sin(T * 1.3 + h) * .08 * h;
        d[i + 1] = d[i + 19] + h;
        d[i + 2] = d[i + 20] + Math.sin(th) * r;
      } else {
        if (kind === GHOST && age > d[i + 21]) {
          // Ghost inhale : la boule est aspirée d'un coup vers la bouche
          const k = Math.min(1, dt * 7);
          d[i] += (d[i + 18] - d[i]) * k; d[i + 1] += (d[i + 19] - d[i + 1]) * k; d[i + 2] += (d[i + 20] - d[i + 2]) * k;
        } else {
          const drag = Math.exp(-d[i + 14] * dt);
          d[i + 3] = d[i + 3] * drag + (Math.sin(d[i + 1] * 1.1 + T * .8 + seed) * .35) * dt;
          d[i + 4] = d[i + 4] * drag + d[i + 15] * dt;
          d[i + 5] = d[i + 5] * drag + (Math.cos(d[i] * 1.3 - T * .6 + seed) * .25) * dt;
          d[i] += d[i + 3] * dt; d[i + 1] += d[i + 4] * dt; d[i + 2] += d[i + 5] * dt;
        }
      }
      d[i + 11] += d[i + 12] * dt;
      let size = d[i + 8] + (d[i + 9] - d[i + 8]) * (1 - (1 - t) * (1 - t));
      let alpha = d[i + 10] * Math.min(1, t / .07) * Math.pow(1 - t, 1.4);
      if (kind === GHOST && age > d[i + 21]) { const g = Math.max(0, 1 - (age - d[i + 21]) / (life - d[i + 21])); size *= .4 + .6 * g; }
      P[j * 3] = d[i]; P[j * 3 + 1] = d[i + 1]; P[j * 3 + 2] = d[i + 2];
      D[j * 4] = size; D[j * 4 + 1] = alpha; D[j * 4 + 2] = d[i + 11]; D[j * 4 + 3] = d[i + 17];
    }
    this.geo.instanceCount = this.n;
    this.iPos.needsUpdate = this.iData.needsUpdate = true;
  }
}

/* ---------- Modèle JNR (assets/puff/jnr.glb, fourni) ---------- */
const GLB_URL = new URL("../assets/puff/jnr.glb?v=1", import.meta.url).href;
async function loadPuff() {
  const gltf = await new GLTFLoader().loadAsync(GLB_URL);
  const root = gltf.scene, group = new THREE.Group();
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  const K = 3.65 / size.y; // hauteur de la puff à l'écran ≈ 3,65 unités
  root.scale.setScalar(K); root.position.set(-(box.min.x + box.max.x) / 2 * K, -box.min.y * K - size.y * K / 2, -(box.min.z + box.max.z) / 2 * K);
  group.add(root);
  let decorMat = null;
  root.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m.map) decorMat = m;
    m.envMapIntensity = m.transmission ? .8 : .55; // reflets retenus : la puff ne doit pas "briller"
  });
  // Texture de décor sur canevas : impression d'origine (chiffres imprimés effacés) ou skin peint
  const canvas = document.createElement("canvas"); canvas.width = TW; canvas.height = TH;
  const g = canvas.getContext("2d"), original = decorMat.map.image;
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  decorMat.map = tex; decorMat.emissiveMap = tex; decorMat.needsUpdate = true;

  // Écran : plan collé sur la face avant, à l'emplacement des chiffres d'origine
  const dispCanvas = document.createElement("canvas"); paintDisplay(dispCanvas, 100);
  const dispTex = new THREE.CanvasTexture(dispCanvas); dispTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: dispTex, transparent: true, toneMapped: false, depthWrite: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.0235, .0088), screenMat);
  screen.position.set(0, .0167, .01535); screen.name = "screen"; root.children[0].add(screen);

  let current = "blackberry";
  function setSkin(id) {
    const s = SKINS[id] || SKINS.blackberry; current = id;
    if (s.original) { g.drawImage(original, 0, 0, TW, TH); eraseDigits(g); } else paintSkin(g, s);
    tex.needsUpdate = true;
  }
  onHawk.push(() => { if (!SKINS[current]?.original) setSkin(current); });
  function setLevel(n) { paintDisplay(dispCanvas, n); dispTex.needsUpdate = true; }
  const glow = new THREE.PointLight("#bfe6ff", 0, 2.5, 2); glow.position.set(0, -1.2, .8); group.add(glow);
  group.position.y = -.15;
  return { group, screenMat, glow, tip: new THREE.Vector3(0, size.y * K / 2 + .05, 0), setSkin, setLevel };
}

function envMap(renderer) {
  const scene = new THREE.Scene(), pm = new THREE.PMREMGenerator(renderer);
  scene.background = new THREE.Color("#2a2f38");
  const box = (col, w, h, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); m.rotation.z += ry; scene.add(m);
  };
  box(new THREE.Color(6, 6, 6.4), 6, 3, 0, 6, 4);      // softbox haute
  box(new THREE.Color(2.2, 1.2, 4), 3, 8, -7, 0, 2);    // rim violet
  box(new THREE.Color(1, 3.2, 4), 3, 8, 7, 1, -1);      // rim cyan
  box(new THREE.Color(1.3, 1.3, 1.3), 10, 2, 0, -5, -3);
  box(new THREE.Color(3, 3, 3), 4, 6, 0, 1, 8);          // face à la caméra
  box(new THREE.Color(2, 2, 2.1), 3, 7, 6, 0, 6);
  const tex = pm.fromScene(scene, .02).texture; pm.dispose();
  return tex;
}

/* ---------- API ---------- */
export async function create({ stage, skin = "blackberry", level = 100 }) {
  const tex = smokeTexture();

  // Scène de la puff dans le panneau
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "puffCanvas";
  stage.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.environment = envMap(renderer);
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 50); camera.position.set(0, 0, 8.4);
  const key = new THREE.DirectionalLight("#ffffff", .75); key.position.set(3, 5, 6); scene.add(key);
  scene.add(new THREE.HemisphereLight("#dfe8ff", "#20242c", .9));
  const puff = await loadPuff(); puff.setSkin(skin); puff.setLevel(level); scene.add(puff.group);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -2.02; scene.add(shadow);
  const wisps = new Smoke(260, tex); scene.add(wisps.mesh);

  // Calque plein écran pour la fumée expirée et les tricks
  const sRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  sRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  sRenderer.domElement.className = "puffSmokeCanvas";
  document.body.append(sRenderer.domElement);
  const sScene = new THREE.Scene(), sCam = new THREE.PerspectiveCamera(55, 1, .1, 60); sCam.position.set(0, 0, 10);
  const smoke = new Smoke(reduced ? 700 : 2600, tex); sScene.add(smoke.mesh);
  const Q = reduced ? .35 : 1; // facteur de densité

  let visible = false, pulling = false, pull = 0, shake = 0, pointerX = 0, pointerY = 0, raf = 0, last = 0, clock = 0;
  const rot = { x: 0, y: 0 }, tipWorld = new THREE.Vector3();

  function resize() {
    const r = stage.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
    sRenderer.setSize(innerWidth, innerHeight, false); sCam.aspect = innerWidth / innerHeight; sCam.updateProjectionMatrix();
  }
  addEventListener("resize", resize); resize();
  stage.addEventListener("pointermove", e => {
    const r = stage.getBoundingClientRect();
    pointerX = (e.clientX - r.left) / r.width * 2 - 1; pointerY = (e.clientY - r.top) / r.height * 2 - 1;
  });
  stage.addEventListener("pointerleave", () => { pointerX = pointerY = 0; });

  function frame(now) {
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now; clock += dt;
    if (visible) {
      pull = damp(pull, pulling ? 1 : 0, pulling ? 3.2 : 5, dt);
      const g = puff.group, idle = 1 - pull;
      // Au repos : flotte et oscille ; en tirant : l'embout vient vers la caméra
      rot.y = damp(rot.y, idle * (Math.sin(clock * .55) * .55 + pointerX * .45), 4, dt);
      rot.x = damp(rot.x, pull * 1.18 + idle * (pointerY * .25 + Math.sin(clock * .8) * .05), 6, dt);
      shake = Math.max(0, shake - dt * .9);
      g.rotation.set(rot.x + Math.sin(clock * 55) * shake * .05, rot.y, idle * Math.sin(clock * .7) * .06 + Math.sin(clock * 47) * shake * .06);
      g.position.set(0, -.15 + idle * Math.sin(clock * 1.1) * .08 - pull * .9, pull * 3.6);
      g.scale.setScalar(1 + (pulling ? Math.sin(clock * 38) * .004 * pull : 0));
      // L'écran s'allume pendant la taffe
      const led = pull * (.85 + .15 * Math.sin(clock * 24));
      puff.screenMat.color.setScalar(.9 + led * 1.6);
      puff.glow.intensity = led * 4;
      shadow.material.opacity = .9 - pull * .7; shadow.scale.setScalar(1 - pull * .3);
      wisps.update(dt);
      renderer.render(scene, camera);
    }
    // La dernière frame "busy" rend une scène vide : le calque est donc effacé à l'arrêt
    if (smoke.busy) { smoke.update(dt); sRenderer.render(sScene, sCam); }
    raf = visible || smoke.busy ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  // Point monde sur un plan z donné à partir de coordonnées écran
  function screenToWorld(x, y, z) {
    const v = new THREE.Vector3(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1, .5).unproject(sCam);
    v.sub(sCam.position).normalize();
    return sCam.position.clone().add(v.multiplyScalar((z - sCam.position.z) / v.z));
  }

  function exhale(power, rare) {
    const hue = rare ? Math.random() : -1;
    const dur = .45 + power * .35, rate = 520 * power * Q;
    // Le jet sort d'en bas de l'écran (ta bouche) et part vers la scène en s'élargissant
    smoke.emit({ dur, rate, make: (p, sm) => {
      const spread = .25 + p * .35, sp = rand(6, 9) * (1 - p * .35) * (.8 + power * .2);
      const dir = new THREE.Vector3(rand(-spread, spread), .32 + rand(-spread, spread) * .6, -1).normalize();
      sm.spawn({ x: rand(-.2, .2), y: -2.7, z: 5.6, vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp,
        life: rand(3.2, 5.2), s0: rand(.25, .5), s1: rand(1.6, 3.4) * (.7 + power * .3), a: rand(.07, .15), drag: rand(.7, 1.1), lift: rand(.12, .32), hue: rare ? (hue + rand(-.08, .08)) % 1 : -1 });
    } });
    // Nuage qui se déploie et remplit l'écran
    setTimeout(() => smoke.emit({ dur: .8, rate: 90 * power * Q, make: (p, sm) => {
      const a = Math.random() * 6.283, r = rand(.5, 5.5);
      sm.spawn({ x: Math.cos(a) * r, y: Math.sin(a) * r * .7 + .5, z: rand(-2, 4), vx: Math.cos(a) * rand(.4, 1.4), vy: Math.sin(a) * rand(.3, 1) + .2, vz: rand(-.4, .6),
        life: rand(4, 6.5), s0: rand(1.2, 2.4), s1: rand(3.5, 6.5), a: rand(.04, .09), drag: .5, lift: .08, hue: rare ? Math.random() : -1 });
    } }), 600);
    wake();
  }

  // Toux : trois bouffées courtes et désordonnées au lieu d'un jet continu
  function cough() {
    shake = 1;
    [0, 360, 780].forEach((ms, i) => setTimeout(() => {
      const k = 1 - i * .25;
      smoke.emit({ dur: .16, rate: 700 * k * Q, make: (p, sm) => {
        const dir = new THREE.Vector3(rand(-.7, .7), rand(-.1, .6), -1).normalize(), sp = rand(3, 7) * k;
        sm.spawn({ x: rand(-.3, .3), y: -2.6, z: 5.6, vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp,
          life: rand(2.2, 3.8), s0: rand(.3, .6), s1: rand(1.4, 2.8), a: rand(.08, .16), drag: rand(1.4, 2), lift: .3 });
      } });
      wake();
    }, ms));
  }

  function ring(o, opt = {}) {
    const n = Math.round((opt.n || 150) * Q), R0 = opt.R0 || .35, dir = opt.dir || new THREE.Vector3(rand(-.08, .08), rand(.02, .14), -1).normalize().multiplyScalar(opt.speed || 3.2);
    const phase = Math.random() * 6;
    for (let k = 0; k < n; k++) {
      const th = k / n * 6.283 + rand(-.03, .03);
      smoke.spawn({ kind: RING, life: rand(3.2, 4) * (opt.lifeK || 1), s0: rand(.18, .3), s1: rand(.55, .9) * (opt.sizeK || 1), a: rand(.28, .42), lift: .05,
        p: [o.x, o.y, o.z, dir.x, dir.y, dir.z, R0, opt.grow || .32, th, Math.random() * 6.283, rand(.05, .11), rand(2.5, 4), 0, phase] });
    }
  }

  const tricks = {
    // O-ring classique
    ring(o) { ring(o); },
    // Méduse : un anneau puis un jet qui le traverse et forme les tentacules
    jelly(o) {
      const dir = new THREE.Vector3(0, .12, -1).normalize().multiplyScalar(2.6);
      ring(o, { dir, R0: .45, grow: .5, sizeK: 1.2, n: 190 });
      setTimeout(() => smoke.emit({ dur: .9, rate: 170 * Q, make: (p, sm) => {
        const a = Math.random() * 6.283, r = rand(0, .25);
        sm.spawn({ x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r, z: o.z + .3, vx: Math.cos(a) * .25, vy: dir.y * .9 - .15, vz: dir.z * rand(.75, 1.05),
          life: rand(2.2, 3.2), s0: .2, s1: rand(.6, 1.2), a: rand(.18, .3), drag: .55, lift: -.05 });
      } }), 260);
    },
    // Ghost : une boule dense sort puis est ré-aspirée d'un coup
    ghost(o) {
      const n = Math.round(160 * Q);
      for (let k = 0; k < n; k++) {
        const v = new THREE.Vector3(rand(-1, 1), rand(-.6, 1), rand(-1, .4)).normalize().multiplyScalar(rand(.4, 1.3));
        smoke.spawn({ kind: GHOST, x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y + .2, vz: v.z - 1.2, life: rand(1.6, 1.85), s0: .25, s1: rand(.9, 1.4), a: rand(.25, .4), drag: 1.6, lift: .1,
          p: [o.x, o.y - .1, o.z + 1.2, rand(.95, 1.1)] });
      }
    },
    // Tornade : vortex qui monte en spirale
    tornado(o) {
      const base = screenToWorld(o.sx, o.sy + 40, 2);
      smoke.emit({ dur: 1.6, rate: 260 * Q, make: (p, sm) =>
        sm.spawn({ kind: TWIST, life: rand(2.2, 3.2), s0: .15, s1: rand(.45, .8), a: rand(.22, .36), p: [base.x, base.y - .6, base.z, Math.random() * 6.283, rand(3.5, 5), rand(.8, 1.3), rand(0, .2), .06, .22] }) });
    },
    // Dragon : narines vers le bas + commissures sur les côtés
    dragon(o) {
      const jets = [[-.12, -1, .25], [.12, -1, .25], [-1, -.15, .3], [1, -.15, .3]];
      smoke.emit({ dur: 1.1, rate: 300 * Q, make: (p, sm) => {
        const j = jets[(Math.random() * 4) | 0], sp = rand(1.6, 2.6);
        const dx = j[0] + rand(-.15, .15), dy = j[1] + rand(-.12, .12);
        sm.spawn({ x: o.x + j[0] * .25, y: o.y + (j[1] < -.5 ? .25 : -.05), z: o.z, vx: dx * sp, vy: dy * sp, vz: rand(-.2, .3),
          life: rand(2.2, 3.4), s0: .12, s1: rand(.55, 1.15), a: rand(.14, .24), drag: 1.1, lift: .45 });
      } });
    }
  };

  return {
    show() { visible = true; resize(); wake(); },
    hide() { visible = false; pulling = false; },
    pull() { pulling = true; wake(); },
    release(counted) {
      pulling = false;
      if (!counted) return;
      // Petite volute qui s'échappe de l'embout au retour
      puff.group.updateMatrixWorld(); tipWorld.copy(puff.tip); puff.group.localToWorld(tipWorld);
      wisps.emit({ dur: .5, rate: 90, make: (p, sm) => sm.spawn({ x: tipWorld.x + rand(-.05, .05), y: tipWorld.y, z: tipWorld.z, vx: rand(-.15, .15), vy: rand(.4, .9), vz: rand(-.1, .1),
        life: rand(1.6, 2.4), s0: .08, s1: rand(.35, .7), a: rand(.18, .3), drag: .8, lift: .35 }) });
    },
    exhale,
    cough,
    trick(name, x, y) {
      const o = screenToWorld(x, y, 4.2); o.sx = x; o.sy = y;
      (tricks[name] || tricks.ring)(o); wake();
    },
    clear() { smoke.clear(); wisps.clear(); sRenderer.clear(); },
    setSkin: id => { puff.setSkin(id); wake(); },
    setLevel: n => puff.setLevel(n),
    tricks: Object.keys(tricks)
  };
}
