// Sons de la puff synthétisés en WebAudio (aucun fichier) : tirage qui crépite, expiration, toux, jingles de timing.
let ctx = null, noise = null, master = null, muted = false, inhale = null;

function init() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : .9; master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  loadCough();
  return true;
}
function src() { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.loopStart = Math.random(); return s; }
function filter(type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function env(g, t, peak, a, dcy) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + dcy); }
function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }

// Tirage réaliste : souffle d'air à travers l'embout + grésillement aléatoire de la résistance (pas de bourdonnement)
function sizzleBuffer() {
  // Impulsions éparses et irrégulières (loi de Poisson) : texture de "friture" qui ne boucle pas de façon audible
  const sr = ctx.sampleRate, b = ctx.createBuffer(1, sr * 3, sr), d = b.getChannelData(0);
  let i = 0;
  while (i < d.length) {
    i += Math.floor(-Math.log(1 - Math.random()) * sr / 420);
    const amp = Math.pow(Math.random(), 3) * (Math.random() < .5 ? -1 : 1), len = 20 + Math.random() * 120;
    for (let k = 0; k < len && i + k < d.length; k++) d[i + k] += amp * Math.exp(-k / (len / 5)) * (Math.random() * 2 - 1);
  }
  return b;
}
let sizzle = null;
export function inhaleStart() {
  if (!init()) return; inhaleStop(true);
  const t = ctx.currentTime;
  // Air : bruit large bande + légère résonance de l'embout, avec une respiration irrégulière
  const air = src(), bp = filter("bandpass", 1500, .45), res = filter("peaking", 3200, 5), ag = ctx.createGain();
  res.gain.value = 5;
  ag.gain.setValueAtTime(0, t); ag.gain.linearRampToValueAtTime(.055, t + .12); ag.gain.linearRampToValueAtTime(.075, t + 1.5);
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 1.7; lg.gain.value = .012;
  chain(lfo, lg); lg.connect(ag.gain); lfo.start(t);
  chain(air, bp, res, ag, master); air.start(t);
  // Résistance : le grésillement monte pendant que la bobine chauffe
  sizzle ||= sizzleBuffer();
  const cr = ctx.createBufferSource(), hp = filter("highpass", 1800, .7), sh = filter("highshelf", 6000), cg = ctx.createGain();
  cr.buffer = sizzle; cr.loop = true; sh.gain.value = -6;
  cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(.05, t + .25); cg.gain.linearRampToValueAtTime(.16, t + 1.2);
  chain(cr, hp, sh, cg, master); cr.start(t, Math.random() * 2);
  inhale = { nodes: [air, cr, lfo], gains: [ag, cg] };
}
export function inhaleStop(now) {
  if (!inhale) return;
  const t = ctx.currentTime, r = now ? .01 : .07;
  for (const g of inhale.gains) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + r); }
  for (const n of inhale.nodes) n.stop(t + r + .02);
  inhale = null;
}

// Expiration : souffle dont le filtre se referme, plus long et fort selon la puissance
export function exhale(power = 1) {
  if (!init()) return;
  const t = ctx.currentTime + .05, s = src(), lp = filter("lowpass", 1600, .5), bp = filter("bandpass", 700, .6), g = ctx.createGain(), dur = .5 + power * .6;
  lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(260, t + dur);
  env(g, t, .12 + power * .09, .08, dur); chain(s, lp, bp, g, master); s.start(t); s.stop(t + dur + .2);
}

// Toux : enregistrement réel (assets/puff/cough.mp3, CC BY-SA 4.0 — voir assets/puff/CREDITS.md)
const COUGH_URL = new URL("../assets/puff/cough.mp3", import.meta.url).href;
let coughBuf = null, coughLoad = null;
function loadCough() {
  coughLoad ||= fetch(COUGH_URL).then(r => r.arrayBuffer()).then(a => new Promise((ok, ko) => ctx.decodeAudioData(a, ok, ko))).then(b => coughBuf = b).catch(() => null);
  return coughLoad;
}
export function cough() {
  if (!init()) return;
  loadCough().then(b => {
    if (!b) return;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; s.playbackRate.value = .94 + Math.random() * .12; g.gain.value = 1.1;
    chain(s, g, master); s.start();
  });
}

// Petits jingles de notation
const NOTES = { perfect: [880, 1175, 1568], excellent: [880, 1320], good: [660], bad: [196, 165] };
export function grade(name) {
  if (!init() || !NOTES[name]) return;
  NOTES[name].forEach((f, i) => {
    const t = ctx.currentTime + i * .09, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = name === "bad" ? "square" : "sine"; o.frequency.value = f;
    env(g, t, name === "bad" ? .05 : .09, .01, name === "perfect" ? .35 : .22); chain(o, g, master); o.start(t); o.stop(t + .5);
  });
}

export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : .9, ctx.currentTime, .02); if (m) inhaleStop(true); }
