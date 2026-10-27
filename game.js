'use strict';
/* Meccha Chameleon fan remake: chameleons, painting, hunters, modes, UI. */

/* ================= sound ================= */
const Sound = (() => {
  let ac = null, master = null;
  const init = () => {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
  };
  const out = (pos) => {
    if (!pos) return master;
    const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2.5; p.rolloffFactor = 1.1;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(master); return p;
  };
  const osc = (type, f0, f1, t0, dur, vol, dest) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  };
  const noise = (t0, dur, vol, freq, dest) => {
    const len = Math.max(1, (ac.sampleRate * dur) | 0), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(); s.buffer = b;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ac.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(dest); s.start(t0);
  };
  const ok = () => !!ac;
  return {
    init,
    listener(cam) {
      if (!ac) return;
      const l = ac.listener, p = cam.position;
      const f = new V3(0, 0, -1).applyQuaternion(cam.quaternion), u = new V3(0, 1, 0).applyQuaternion(cam.quaternion);
      if (l.positionX) {
        l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
        l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z;
      } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    },
    whistle(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); osc('sine', 1250, 2100, t, 0.2, 0.32, d); osc('sine', 2100, 1150, t + 0.22, 0.32, 0.32, d); },
    bonk(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); osc('triangle', 240, 70, t, 0.25, 0.5, d); noise(t, 0.1, 0.5, 900, d); },
    thud() { if (!ok()) return; const t = ac.currentTime; osc('sine', 140, 60, t, 0.12, 0.25, master); },
    pop(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); noise(t, 0.35, 0.7, 1800, d); osc('sine', 500, 1500, t, 0.18, 0.3, d); },
    horn() { if (!ok()) return; const t = ac.currentTime; [196, 247, 294].forEach((f, i) => osc('sawtooth', f, f, t + i * 0.03, 0.7, 0.09, master)); },
    tick() { if (!ok()) return; osc('square', 1100, null, ac.currentTime, 0.04, 0.05, master); },
    click() { if (!ok()) return; osc('sine', 720, null, ac.currentTime, 0.05, 0.08, master); },
    splat() { if (!ok()) return; noise(ac.currentTime, 0.05, 0.12, 2800, master); },
    alert(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); osc('square', 700, 1400, t, 0.14, 0.12, d); },
    win() { if (!ok()) return; const t = ac.currentTime; [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, null, t + i * 0.12, 0.3, 0.2, master)); },
    lose() { if (!ok()) return; const t = ac.currentTime; [392, 330, 262].forEach((f, i) => osc('triangle', f, null, t + i * 0.16, 0.35, 0.2, master)); },
  };
})();

/* ================= chameleon ================= */
const TS = 256;
const GEO = {
  blob: new THREE.CapsuleGeometry(0.35, 0.8, 8, 28),
  cube: (() => {
    const g = new THREE.BoxGeometry(0.7, 1.5, 0.7), uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) { const cu = f % 3, cv = Math.floor(f / 3); for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, (cu + uv.getX(i)) / 3, (cv + uv.getY(i)) / 2); } }
    uv.needsUpdate = true; return g;
  })(),
};
const SIZES = { petite: [0.55, 0.55], normal: [1, 1], plump: [1.5, 1.15] };
const POSES = {
  stand: { sx: 1, sy: 1, sz: 1, move: true },
  crouch: { sx: 1.12, sy: 0.62, sz: 1.12, move: true },
  curl: { sx: 1.15, sy: 0.5, sz: 1.15, move: true },
  lie: { sx: 1, sy: 1, sz: 0.8, lie: true, move: false },
  flat: { sx: 1.15, sy: 1, sz: 0.42, move: false },
};
const NAMES = ['Kiwi', 'Mango', 'Pickle', 'Basil', 'Mochi', 'Yuzu', 'Pesto', 'Taro', 'Olive', 'Sprout'];
const HIDER_COLORS = ['#3ad49c', '#ff7ab3', '#4da3ff', '#ffb057', '#b197fc', '#ffd43b', '#63e6be', '#ff8787'];

class Cham {
  constructor({ name, isPlayer = false, human = false, color = '#3ad49c' }) {
    this.name = name; this.isPlayer = isPlayer; this.human = human; this.color = color;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = TS;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.85, metalness: 0 });
    this.root = new THREE.Group(); scene.add(this.root);
    this.shape = 'blob'; this.size = 'normal'; this.pose = 'stand'; this.yaw = 0;
    this.body = { pos: this.root.position, vy: 0, onGround: true, r: 0.3, h: 1.5 };
    this.caught = false; this.isClone = false; this.painted = false; this.speed = 0; this.lastPos = new V3();
    this.mesh = null; this.label = null;
    this.blank();
    this.rebuild();
  }
  blank() {
    const g = this.ctx; g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, TS, TS);
    g.fillStyle = '#1b1d22';
    const eye = (u, v) => { g.beginPath(); g.ellipse(u * TS, (1 - v) * TS, 6, 10, 0, 0, 7); g.fill(); };
    if (this.shape === 'blob') { eye(0.06, 0.73); eye(0.94, 0.73); }
    else { eye((1 + 0.32) / 3, (1 + 0.74) / 2); eye((1 + 0.68) / 3, (1 + 0.74) / 2); }
    g.fillStyle = 'rgba(255,140,160,.5)';
    if (this.shape === 'blob') { g.beginPath(); g.arc(0.1 * TS, 0.35 * TS, 6, 0, 7); g.arc(0.9 * TS, 0.35 * TS, 6, 0, 7); g.fill(); }
    this.tex.needsUpdate = true; this.painted = false;
  }
  rebuild() {
    if (this.mesh) this.root.remove(this.mesh);
    this.mesh = new THREE.Mesh(GEO[this.shape], this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.userData.cham = this;
    this.root.add(this.mesh);
    this.applyPose();
  }
  applyPose() {
    const p = POSES[this.pose], [sx, sy] = SIZES[this.size], m = this.mesh;
    m.rotation.set(0, 0, 0); m.scale.set(p.sx * sx, p.sy * sy, p.sz * sx);
    let h;
    if (p.lie) { m.rotation.x = -Math.PI / 2; h = 0.7 * p.sz * sx; }
    else h = 1.5 * p.sy * sy;
    m.position.set(0, h / 2, 0);
    this.body.h = h;
    this.body.r = (this.pose === 'flat' ? 0.17 : 0.3) * sx;
    this.root.rotation.y = this.yaw;
  }
  setPose(p) { this.pose = p; this.applyPose(); }
  setShape(s) { if (s === this.shape) return; const wasPainted = this.painted; this.shape = s; if (!wasPainted) this.blank(); this.rebuild(); }
  setSize(s) { this.size = s; this.applyPose(); }
  setYaw(y) { this.yaw = y; this.root.rotation.y = y; }
  center() { return new V3(this.root.position.x, this.root.position.y + this.body.h / 2, this.root.position.z); }
  paintDot(uv, rgb, r) {
    const g = this.ctx, x = uv.x * TS, y = (1 - uv.y) * TS;
    g.fillStyle = Array.isArray(rgb) ? `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})` : rgb;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (this.shape === 'blob') {
      if (x < r) { g.beginPath(); g.arc(x + TS, y, r, 0, 7); g.fill(); }
      if (x > TS - r) { g.beginPath(); g.arc(x - TS, y, r, 0, 7); g.fill(); }
    }
    this.painted = true; this.dirty = true;
  }
  fill(rgb) { this.ctx.fillStyle = rgb; this.ctx.fillRect(0, 0, TS, TS); this.painted = true; this.dirty = true; }
  flush() { if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; } }
  avgColors(n = 6) {
    const d = this.ctx.getImageData(0, 0, TS, TS).data, out = [];
    for (let i = 0; i < n; i++) { const k = ((Math.random() * TS * TS) | 0) * 4; out.push(`rgb(${d[k]},${d[k + 1]},${d[k + 2]})`); }
    return out;
  }
  copyFrom(o) {
    this.shape = o.shape; this.size = o.size; this.pose = o.pose; this.yaw = o.yaw;
    this.ctx.drawImage(o.canvas, 0, 0); this.painted = true; this.tex.needsUpdate = true;
    this.mat.roughness = o.mat.roughness; this.mat.metalness = o.mat.metalness;
    this.rebuild(); this.root.position.copy(o.root.position);
  }
  dispose() { scene.remove(this.root); if (this.label) scene.remove(this.label); this.tex.dispose(); this.mat.dispose(); }
}

function textSprite(text, bg = '#3ad49c', fg = '#06261a', scale = 0.55) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = '600 44px Segoe UI, system-ui, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 44; c.width = w; c.height = 72;
  g.font = '600 44px Segoe UI, system-ui, sans-serif';
  g.fillStyle = bg; const r = 30; g.beginPath(); g.moveTo(r, 4); g.arcTo(w - 4, 4, w - 4, 68, r); g.arcTo(w - 4, 68, 4, 68, r); g.arcTo(4, 68, 4, 4, r); g.arcTo(4, 4, w - 4, 4, r); g.fill();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 38);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(scale * w / 72, scale, 1); s.renderOrder = 10;
  return s;
}

/* ---------- AI camouflage ---------- */
const rcBody = new THREE.Raycaster();
const SKILLS = {
  sloppy: { grid: [16, 22], dot: 7.5, noise: 30, vps: 1, miss: 0.75 },
  medium: { grid: [30, 42], dot: 4.4, noise: 14, vps: 2, miss: 0.2 },
  good: { grid: [42, 58], dot: 3.3, noise: 6, vps: 3, miss: 0 },
};
function ndcRect(bb, cam) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const v = new V3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
    v.applyMatrix4(cam.matrixWorldInverse);
    if (v.z > -0.12) return null;
    v.applyMatrix4(cam.projectionMatrix);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { x0, y0, x1, y1 };
}
function autoCamo(ch, skillKey) {
  const S = SKILLS[skillKey];
  ch.root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(ch.mesh), c = bb.getCenter(new V3());
  let acc = [0, 0, 0], n = 0, rough = 0.85;
  const dirs = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, d = new V3(Math.sin(a), 0, Math.cos(a));
    const h = envHit(c, d, 14), free = h ? h.distance : 14;
    dirs.push({ d, free, a });
    if (h && h.distance < 2.5) { const col = surfaceColor(h); acc = acc.map((v, k) => v + col[k]); n++; }
  }
  const down = envHit(c, new V3(0, -1, 0), 5);
  if (down) { const col = surfaceColor(down); acc = acc.map((v, k) => v + col[k] * 3); n += 3; }
  if (n) ch.fill(`rgb(${acc[0] / n | 0},${acc[1] / n | 0},${acc[2] / n | 0})`);
  dirs.sort((p, q) => q.free - p.free);
  const chosen = [];
  for (const d of dirs) { if (chosen.every((o) => Math.abs(angDiff(o.a, d.a)) > 0.75)) chosen.push(d); if (chosen.length >= S.vps) break; }
  chosen.reverse();
  const vc = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
  const ndc = new THREE.Vector2();
  const near = envNear(c, 9);
  for (const vp of chosen) {
    const low = ch.pose === 'lie' || ch.pose === 'curl';
    const V = c.clone().addScaledVector(vp.d, Math.max(1.5, Math.min(vp.free - 0.4, low ? 3 : 4.5)));
    V.y = 1.6;
    vc.position.copy(V); vc.lookAt(c); vc.updateMatrixWorld(); vc.updateProjectionMatrix();
    const r = ndcRect(bb, vc); if (!r) continue;
    const [gx, gy] = S.grid;
    for (let i = 0; i < gx; i++) for (let j = 0; j < gy; j++) {
      ndc.set(lerp(r.x0, r.x1, (i + 0.5) / gx), lerp(r.y0, r.y1, (j + 0.5) / gy));
      rcBody.setFromCamera(ndc, vc); rcBody.far = 80;
      const h1 = rcBody.intersectObject(ch.mesh, false)[0]; if (!h1) continue;
      const h2 = envHit(h1.point.clone().addScaledVector(rcBody.ray.direction, 0.01), rcBody.ray.direction, 9, near); if (!h2) continue;
      const col = surfaceColor(h2), nz = S.noise;
      ch.paintDot(h1.uv, [col[0] + rand(-nz, nz), col[1] + rand(-nz, nz), col[2] + rand(-nz, nz)], S.dot);
      if (vp === chosen[chosen.length - 1] && i === gx >> 1 && j === gy >> 1) rough = h2.object.material.roughness ?? 0.85;
    }
  }
  if (Math.random() < S.miss) {
    const g = ch.ctx; g.fillStyle = '#f2f2ee';
    const u = ch.shape === 'blob' ? pick([0.04, 0.96, 0.25, 0.75]) : rand(0.36, 0.64), v = ch.shape === 'blob' ? rand(0.3, 0.75) : rand(0.6, 0.95);
    g.beginPath(); g.ellipse(u * TS, (1 - v) * TS, rand(8, 14), rand(10, 18), rand(0, 3), 0, 7); g.fill();
  }
  ch.mat.roughness = rough;
  ch.flush(); ch.tex.needsUpdate = true;
}

/* ---------- hiding spots ---------- */
function doorNear(axis, line, at) { return DOORS.some((d) => d.a === axis && Math.abs(d.line - line) < 0.01 && Math.abs(d.at - at) < 1.5); }
function findSpot(taken, rooms) {
  for (let tries = 0; tries < 400; tries++) {
    const r = ROOM[pick(rooms)], roll = Math.random();
    let s = null;
    if (roll < 0.58) {
      const side = pick(['n', 's', 'w', 'e']), off = 0.1 + 0.16;
      if (side === 'n' || side === 's') {
        const x = rand(r.x0 + 0.6, r.x1 - 0.6), line = side === 'n' ? r.z0 : r.z1;
        if (doorNear('h', line, x)) continue;
        s = { x, y: 0, z: side === 'n' ? r.z0 + off : r.z1 - off, yaw: side === 'n' ? 0 : Math.PI, pose: 'flat' };
      } else {
        const z = rand(r.z0 + 0.6, r.z1 - 0.6), line = side === 'w' ? r.x0 : r.x1;
        if (doorNear('v', line, z)) continue;
        s = { x: side === 'w' ? r.x0 + off : r.x1 - off, y: 0, z, yaw: side === 'w' ? Math.PI / 2 : -Math.PI / 2, pose: 'flat' };
      }
      if (!freeAt(s.x, s.z, 0.2, 1.5)) continue;
    } else if (roll < 0.8) {
      const ts = tops.filter((t) => t.room === r.id && t.w > 0.7 && t.d > 0.5);
      if (!ts.length) continue;
      const t = pick(ts), long = Math.max(t.w, t.d) > 1.6;
      s = { x: t.x + rand(-1, 1) * Math.max(0, t.w / 2 - (long && t.w > t.d ? 0.8 : 0.4)), y: t.y, z: t.z + rand(-1, 1) * Math.max(0, t.d / 2 - (long && t.d >= t.w ? 0.8 : 0.35)), yaw: long ? (t.w > t.d ? Math.PI / 2 : 0) + (Math.random() < 0.5 ? Math.PI : 0) : rand(0, 6.28), pose: long ? 'lie' : 'curl' };
      if (!freeAt(s.x, s.z, 0.3, 0.9, t.y + 0.01)) continue;
    } else if (roll < 0.93) {
      s = { x: rand(r.x0 + 0.9, r.x1 - 0.9), y: 0, z: rand(r.z0 + 0.9, r.z1 - 0.9), yaw: rand(0, 6.28), pose: 'lie' };
      if (!freeAt(s.x, s.z, 0.6, 1.2)) continue;
    } else {
      const sp = pick([{ x: 24.4, y: 0, z: 22.6, pose: 'curl', room: 'play' }, { x: 17.5, y: 0, z: 22.4, pose: 'curl', room: 'play' }, { x: 16, y: 0, z: 6, pose: 'curl', room: 'kitchen' }, { x: 13, y: 0.6, z: 23.2, pose: 'lie', room: 'bath' }]);
      if (!rooms.includes(sp.room)) continue;
      s = { ...sp, yaw: rand(0, 6.28) };
    }
    if (taken.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < 3)) continue;
    return s;
  }
  return { x: 16, y: 0, z: 12, yaw: 0, pose: 'curl' };
}
const HIDE_ROOMS = ['living', 'kitchen', 'library', 'hall', 'bedroom', 'bath', 'play'];

/* ================= hunters (AI) ================= */
const VW = 128, VH = 96;
const visRT = new THREE.WebGLRenderTarget(VW, VH);
const visCam = new THREE.PerspectiveCamera(78, VW / VH, 0.1, 30);
const bufA = new Uint8Array(VW * VH * 4), bufB = new Uint8Array(VW * VH * 4);
const HUNTER_COLORS = ['#ff6b3d', '#3d8bff', '#b04dff', '#ff4d6d'];

class Hunter {
  constructor(i, x, z) {
    this.i = i; this.name = `Hunter ${i + 1}`; this.color = HUNTER_COLORS[i % 4];
    this.pos = new V3(x, 0, z); this.yaw = Math.PI; this.look = Math.PI; this.pitch = -0.15;
    this.state = 'wait'; this.path = []; this.sus = new Map(); this.focus = null;
    this.lookT = 0.12 + i * 0.07; this.scanT = 0; this.stuckT = 0; this.repathT = 0; this.swing = 0; this.confused = 0; this.t = Math.random() * 10;
    this.body = { pos: this.pos, r: 0.3, h: 1.8, vy: 0 };
    this.visited = {};
    const g = this.group = new THREE.Group();
    const bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.9, 8, 20), cm(this.color, 0.6));
    bodyM.position.y = 0.81; bodyM.castShadow = true; g.add(bodyM);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.2), cm('#111318', 0.15, 0.6)); visor.position.set(0, 1.25, 0.3); g.add(visor);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.37, 0.16, 20), cm('#20242c', 0.6)); cap.position.y = 1.62; g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.25), cm('#20242c', 0.6)); brim.position.set(0, 1.56, 0.36); g.add(brim);
    this.hammer = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 10), cm('#c9975e', 0.6)); handle.position.y = 0.37; this.hammer.add(handle);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 16), cm('#ff4d6d', 0.5)); head.rotation.z = Math.PI / 2; head.position.y = 0.78; this.hammer.add(head);
    this.hammer.position.set(0.42, 0.75, 0.1); this.hammer.rotation.x = 0.3; g.add(this.hammer);
    this.mark = textSprite('?', '#ffcc4d', '#2b2000', 0.5); this.mark.position.y = 2.25; this.mark.visible = false; g.add(this.mark);
    this.markBang = textSprite('!', '#ff5d6c', '#ffffff', 0.55); this.markBang.position.y = 2.25; this.markBang.visible = false; g.add(this.markBang);
    scene.add(g); this.sync();
  }
  sync() { this.group.position.copy(this.pos); this.group.rotation.y = this.yaw; }
  dispose() { scene.remove(this.group); }
  eye() { return new V3(this.pos.x, this.pos.y + 1.55, this.pos.z); }
  goTo(x, z) { this.path = route(this.pos.x, this.pos.z, x, z); }
  pickGoal() {
    const now = G.t;
    const rooms = HIDE_ROOMS.slice().sort((a, b) => ((this.visited[a] ?? -99) + rand(0, 25)) - ((this.visited[b] ?? -99) + rand(0, 25)));
    const r = ROOM[rooms[0]], p = pick(r.pts);
    this.goTo(p[0] + rand(-0.4, 0.4), p[1] + rand(-0.4, 0.4));
    this.visited[r.id] = now; this.state = 'patrol';
  }
  moveToward(x, z, speed, dt) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    const step = Math.min(d, speed * dt);
    this.pos.x += dx / d * step; this.pos.z += dz / d * step;
    collideBody(this.body, dt, false);
    const want = Math.atan2(dx, dz);
    this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 8);
    return d;
  }
  hear(p) {
    if (this.state === 'chase' || this.state === 'wait') return;
    this.goTo(p.x + rand(-2.5, 2.5), p.z + rand(-2.5, 2.5));
    this.state = 'patrol';
    this.mark.visible = true; this.markT = 1.2;
  }
  update(dt, targets) {
    this.t += dt;
    if (this.swing > 0) { this.swing -= dt; this.hammer.rotation.x = 0.3 - Math.sin((1 - this.swing / 0.35) * Math.PI) * 1.8; }
    else this.hammer.rotation.x = 0.3;
    if (this.markT > 0) { this.markT -= dt; if (this.markT <= 0 && this.state !== 'investigate') this.mark.visible = false; }
    if (this.state === 'wait') { this.look = this.yaw; this.sync(); return; }
    if (this.confused > 0) { this.confused -= dt; this.look = this.yaw + Math.sin(this.t * 7) * 0.8; this.sync(); return; }

    // perception
    this.lookT -= dt;
    if (this.lookT <= 0) { const dtLook = 0.25 - this.lookT; this.lookT = 0.25; this.perceive(targets, dtLook); }
    for (const t of targets) {
      const tp = t.root.position;
      if (Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z) < 0.5 + t.body.r && Math.abs(tp.y - this.pos.y) < 1.5) this.sus.set(t, Math.max(this.sus.get(t) || 0, 1.15));
    }
    let best = null, bs = 0;
    for (const t of targets) { const s = this.sus.get(t) || 0; if (s > bs) { bs = s; best = t; } }
    if (best && bs >= 1) { if (this.state !== 'chase') { this.state = 'chase'; this.focus = best; this.repathT = 0; Sound.alert(this.eye()); } }
    else if (best && bs >= 0.35 && this.state !== 'chase') { this.state = 'investigate'; this.focus = best; }
    if ((this.state === 'chase' || this.state === 'investigate') && (!this.focus || this.focus.caught || !targets.includes(this.focus))) { this.focus = null; this.pickGoal(); }
    this.mark.visible = this.state === 'investigate' || this.markT > 0; this.markBang.visible = this.state === 'chase';

    const D = G.D;
    if (this.state === 'chase') {
      const tp = this.focus.root.position;
      this.repathT -= dt;
      if (this.repathT <= 0) { this.goTo(tp.x, tp.z); this.repathT = 0.6; }
      this.follow(dt, D.huntSpeed * 1.35);
      const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
      this.faceTo(this.focus.center(), dt);
      if (d < 1.35 && Math.abs(tp.y - this.pos.y) < 2.2 && this.swing <= 0) this.tag(this.focus);
    } else if (this.state === 'investigate') {
      const c = this.focus.center(), tp = this.focus.root.position;
      const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
      if (d > 2.4) { this.repathT -= dt; if (this.repathT <= 0) { this.goTo(tp.x, tp.z); this.repathT = 1; } this.follow(dt, D.huntSpeed * 0.55, 2.4); }
      this.faceTo(c, dt);
      if ((this.sus.get(this.focus) || 0) < 0.15) { this.focus = null; this.pickGoal(); }
    } else if (this.state === 'patrol') {
      if (!this.path.length) { this.state = 'scan'; this.scanT = rand(1.6, 3.2); }
      else this.follow(dt, D.huntSpeed);
      this.look = this.yaw + Math.sin(this.t * 1.3 + this.i) * 0.6;
      this.pitch = -0.18 + Math.sin(this.t * 0.8) * 0.12;
    } else if (this.state === 'scan') {
      this.scanT -= dt;
      this.look = this.yaw + Math.sin(this.t * 1.7) * 1.2;
      this.pitch = -0.25 + Math.sin(this.t * 1.1) * 0.2;
      if (this.scanT <= 0) this.pickGoal();
    }
    // stuck detection
    if (this.state === 'patrol' || this.state === 'chase') {
      this.stuckT = this.pos.distanceTo(this.lastP || this.pos) < 0.01 * 60 * dt ? this.stuckT + dt : 0;
      this.lastP = this.pos.clone();
      if (this.stuckT > 1.5) { this.stuckT = 0; if (this.state === 'patrol') this.pickGoal(); else this.path.shift(); }
    }
    this.sync();
  }
  follow(dt, speed, stopAt = 0) {
    if (!this.path.length) return;
    const n = this.path[0], last = this.path.length === 1;
    const d = this.moveToward(n.x, n.z, speed, dt);
    if (d < (last ? Math.max(0.3, stopAt) : 0.45)) this.path.shift();
  }
  faceTo(p, dt) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const want = Math.atan2(dx, dz);
    this.look += angDiff(this.look, want) * Math.min(1, dt * 6);
    const pitch = Math.atan2(p.y - (this.pos.y + 1.55), Math.hypot(dx, dz));
    this.pitch = lerp(this.pitch, pitch, Math.min(1, dt * 5));
    if (this.state !== 'patrol') this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 4);
  }
  tag(t) {
    this.swing = 0.35; Sound.bonk(t.center());
    if (t.isClone) {
      G.removeCham(t, `${this.name} bonked a clone!`, 'good');
      G.stats.clonesFooled++;
      this.confused = 2.2; this.state = 'scan'; this.scanT = 1; this.focus = null;
      this.sus.delete(t);
      return;
    }
    G.catchCham(t, this);
    this.sus.delete(t); this.focus = null; this.state = 'scan'; this.scanT = 1.5;
  }
  perceive(targets, dt) {
    const eye = this.eye();
    visCam.position.copy(eye); visCam.rotation.set(this.pitch, this.look + Math.PI, 0, 'YXZ'); visCam.updateMatrixWorld();
    const cand = [];
    for (const t of targets) {
      if (t.root.position.distanceTo(this.pos) > 18) continue;
      const bb = new THREE.Box3().setFromObject(t.mesh), r = ndcRect(bb, visCam);
      if (!r || r.x1 < -1 || r.x0 > 1 || r.y1 < -1 || r.y0 > 1) continue;
      cand.push([t, r]);
    }
    const seen = new Set();
    if (cand.length) {
      this.group.visible = false;
      renderer.setRenderTarget(visRT);
      renderer.render(scene, visCam); renderer.readRenderTargetPixels(visRT, 0, 0, VW, VH, bufA);
      const hid = [];
      for (const c of G.chams) if (c.root.visible) { c.root.visible = false; hid.push(c); }
      renderer.render(scene, visCam); renderer.readRenderTargetPixels(visRT, 0, 0, VW, VH, bufB);
      for (const c of hid) c.root.visible = true;
      renderer.setRenderTarget(null);
      this.group.visible = true;
      const D = G.D;
      for (const [t, r] of cand) {
        const px0 = clamp(Math.floor((r.x0 * 0.5 + 0.5) * VW), 0, VW - 1), px1 = clamp(Math.ceil((r.x1 * 0.5 + 0.5) * VW), 0, VW - 1);
        const py0 = clamp(Math.floor((r.y0 * 0.5 + 0.5) * VH), 0, VH - 1), py1 = clamp(Math.ceil((r.y1 * 0.5 + 0.5) * VH), 0, VH - 1);
        let s = 0, vis = 0;
        for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
          const i = (y * VW + x) * 4;
          const dr = (bufA[i] - bufB[i]) / 255, dg = (bufA[i + 1] - bufB[i + 1]) / 255, db = (bufA[i + 2] - bufB[i + 2]) / 255;
          const d = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
          if (d > 0.012) vis++;
          if (d > 0.06) s += d - 0.06;
        }
        if (vis < 2) continue;
        seen.add(t);
        let gain = s * D.K * dt;
        if (t.speed > 0.4) gain += D.motion * dt * Math.min(1, vis / 30);
        const prev = this.sus.get(t) || 0;
        this.sus.set(t, prev + gain);
        t.lastScore = s;
        if (t.isPlayer) G.lastSeenScore = Math.max(G.lastSeenScore || 0, s);
      }
    }
    for (const [t, v] of this.sus) if (!seen.has(t)) this.sus.set(t, Math.max(0, v - 0.1 * dt));
  }
}

/* ================= game ================= */
const DIFF = {
  easy: { name: 'Easy', hunters: 2, K: 1 / 110, motion: 1.0, huntSpeed: 2.3, prep: 75, hunt: 150, aiHiders: 3, seekSkill: 'sloppy', seekCount: 4, seekTime: 240 },
  normal: { name: 'Normal', hunters: 2, K: 1 / 60, motion: 1.8, huntSpeed: 2.7, prep: 60, hunt: 180, aiHiders: 3, seekSkill: 'medium', seekCount: 5, seekTime: 240 },
  hard: { name: 'Hard', hunters: 3, K: 1 / 36, motion: 2.8, huntSpeed: 3.0, prep: 50, hunt: 180, aiHiders: 4, seekSkill: 'good', seekCount: 6, seekTime: 240 },
};
const HUNTER_SPAWNS = [[28, 17.2], [30, 17.2], [29, 20.5], [28, 22]];

const G = {
  mode: 'hide', diffKey: 'normal', D: DIFF.normal, phase: 'menu', t: 0, timer: 0,
  chams: [], hunters: [], player: null, fp: null, view: 'third', paint: false, paused: false,
  ctrl: { yaw: Math.PI, pitch: 0.35, dist: 3.4 }, paintCam: { yaw: 0, pitch: 0.2, dist: 2.6 },
  stats: {}, partyHumans: 2, partyAI: 1, party: null, tauntT: 0, forcedT: 0, cloneLeft: 2, ink: 100, specIdx: 0,
  fx: [], labels: [],

  clearRound() {
    for (const c of this.chams) c.dispose();
    for (const h of this.hunters) h.dispose();
    for (const f of this.fx) scene.remove(f.m);
    for (const l of this.labels) scene.remove(l.s);
    this.chams = []; this.hunters = []; this.fx = []; this.labels = []; this.player = null; this.fp = null;
    this.paint = false; this.lastSeenScore = 0; this.cloneLeft = 2; this.ink = 100; this.reveal = null; this.revealList = null;
    this.stats = { taunts: 0, clonesFooled: 0, maxSus: 0, start: 0, found: [] };
    setGate(true);
    UI.paintPanel(false);
    hammerVM.visible = false;
  },
  addCham(opts) { const c = new Cham(opts); this.chams.push(c); return c; },
  placeCham(c, s) { c.root.position.set(s.x, s.y, s.z); c.setYaw(s.yaw); c.setPose(s.pose); c.lastPos.copy(c.root.position); },
  async spawnAIHiders(n, skill, taken = []) {
    UI.loading(true, 'Chameleons are painting…');
    await nextFrame(); await nextFrame();
    const names = NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      const c = this.addCham({ name: names[i], color: HIDER_COLORS[(i + 2) % HIDER_COLORS.length] });
      c.setShape(Math.random() < 0.3 ? 'cube' : 'blob');
      const s = findSpot(taken, HIDE_ROOMS); taken.push(s);
      if (s.pose === 'flat' && Math.random() < 0.15) c.setSize('plump'); else if (Math.random() < 0.2) c.setSize('petite');
      this.placeCham(c, s);
      autoCamo(c, skill);
      await nextFrame();
    }
    UI.loading(false);
  },

  async start(mode) {
    Sound.init();
    this.mode = mode; this.D = DIFF[this.diffKey];
    this.clearRound();
    UI.screen(null);
    if (mode === 'hide') {
      await this.spawnAIHiders(this.D.aiHiders, 'medium', [{ x: 16, z: 12 }]);
      const p = this.player = this.addCham({ name: 'You', isPlayer: true, human: true, color: '#ffffff' });
      p.root.position.set(16, 0, 12); p.setYaw(Math.PI);
      for (let i = 0; i < this.D.hunters; i++) { const [x, z] = HUNTER_SPAWNS[i]; this.hunters.push(new Hunter(i, x, z)); }
      this.hunters.forEach((h) => { h.yaw = h.look = 0; h.sync(); });
      this.ctrl.yaw = 0; this.view = 'third';
      this.setPhase('prep', this.D.prep);
      toast('Click the game to look around. Press F to paint yourself.', 'good');
    } else if (mode === 'seek') {
      await this.spawnAIHiders(this.D.seekCount, this.D.seekSkill);
      this.startSeeker();
    } else if (mode === 'party') {
      this.party = { order: [], idx: 0 };
      for (let i = 0; i < this.partyHumans; i++) {
        const c = this.addCham({ name: `Player ${i + 1}`, human: true, color: HIDER_COLORS[i] });
        c.root.visible = false; c.root.position.set(14 + i, 0, 12);
        this.party.order.push(c);
      }
      this.handoff();
    }
  },
  handoff() {
    const P = this.party;
    this.phase = 'handoff'; UI.hud(false);
    if (document.pointerLockElement) document.exitPointerLock();
    if (P.idx < P.order.length) {
      const c = P.order[P.idx];
      UI.hand(`${c.name}: your turn to hide`, `Everyone else look away. You get ${this.D.prep + 15} seconds to paint and pose.`);
    } else UI.hand('Seeker time!', 'Whoever is hunting takes the mouse now. Find every chameleon before time runs out.');
  },
  async handGo() {
    UI.screen(null);
    const P = this.party;
    if (P.idx < P.order.length) {
      const c = this.player = P.order[P.idx];
      c.root.visible = true; c.root.position.set(16, 0, 12); c.setYaw(Math.PI);
      this.ctrl.yaw = 0; this.view = 'third';
      this.setPhase('prep', this.D.prep + 15);
      this.lock();
    } else {
      if (this.partyAI > 0) {
        const taken = P.order.map((c) => ({ x: c.root.position.x, z: c.root.position.z }));
        await this.spawnAIHiders(this.partyAI, this.D.seekSkill, taken);
      }
      this.player = null;
      this.startSeeker();
    }
  },
  startSeeker() {
    this.fp = { pos: new V3(29, 0, 19.5), vy: 0, onGround: true, r: 0.3, h: 1.75, yaw: 0, pitch: 0, speed: 0 };
    this.view = 'first';
    hammerVM.visible = true;
    this.setPhase('prep', 5);
    toast('Gate opens in 5 seconds…');
    this.lock();
  },
  setPhase(p, time) {
    this.phase = p; this.timer = time;
    UI.hud(true); UI.refreshBars();
    if (p === 'hunt') {
      setGate(false); Sound.horn();
      this.forcedT = this.mode === 'hide' ? 40 : 30;
      this.stats.start = this.t;
      for (const h of this.hunters) h.pickGoal();
    }
  },
  finishPrep() {
    if (this.mode === 'party' && this.party.idx < this.party.order.length && this.view === 'third') {
      this.paint = false; UI.paintPanel(false);
      this.party.idx++;
      this.handoff();
      return;
    }
    this.paint = false; UI.paintPanel(false);
    const time = this.mode === 'hide' ? this.D.hunt : this.D.seekTime;
    this.setPhase('hunt', time);
    toast(this.mode === 'hide' ? 'The hunters are coming. Freeze!' : 'Go find them!', 'warn');
    if (this.mode === 'hide') this.lock();
  },
  targets() { return this.chams.filter((c) => !c.caught && c.root.visible); },
  removeCham(c, msg, kind) {
    c.caught = true; burst(c); Sound.pop(c.center());
    c.root.visible = false;
    if (msg) toast(msg, kind);
    for (const h of this.hunters) h.sus.delete(c);
  },
  catchCham(c, by) {
    c.caught = true; c.caughtAt = this.t - this.stats.start;
    burst(c); Sound.pop(c.center());
    c.root.visible = false;
    this.stats.found.push(c);
    floatLabel(`${c.name} found!`, c.center(), '#ff5d6c', '#fff');
    if (c.isPlayer) {
      toast(`${by ? by.name : 'You'} found you!`, 'bad'); Sound.lose();
      this.view = 'spec'; this.specIdx = 0; this.paint = false; UI.paintPanel(false);
    } else toast(by ? `${by.name} found ${c.name}` : `You found ${c.name}!`, by ? 'bad' : 'good');
    UI.status();
    const left = this.chams.filter((x) => !x.isClone && !x.caught).length;
    if (left === 0) setTimeout(() => this.end(), 900);
  },
  forcedTaunt() {
    const alive = this.chams.filter((c) => !c.caught && !c.isClone);
    if (!alive.length) return;
    if (this.mode === 'hide') {
      toast('Forced taunt! Everyone whistles.', 'warn');
      alive.forEach((c, i) => setTimeout(() => this.whistle(c, c.isPlayer ? 0.65 : 0.4), i * 450));
    } else {
      const c = pick(alive); this.whistle(c, 0); toast('A chameleon whistled somewhere…', 'warn');
    }
  },
  whistle(c, hearChance) {
    if (c.caught) return;
    const p = c.center(); Sound.whistle(p);
    const note = textSprite('♪', '#ffffff', '#222', 0.45); note.position.copy(p).add(new V3(0, 0.9, 0)); note.material.depthTest = true; scene.add(note);
    this.labels.push({ s: note, life: 1.6, vy: 0.5 });
    for (const h of this.hunters) if (h.pos.distanceTo(p) < 22 && Math.random() < hearChance) h.hear(p);
  },
  end() {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.paint = false; UI.paintPanel(false);
    if (document.pointerLockElement) document.exitPointerLock();
    const real = this.chams.filter((c) => !c.isClone);
    const survivors = real.filter((c) => !c.caught);
    for (const c of survivors) floatLabel(`${c.name} was here!`, c.center(), '#3ad49c', '#06261a', 999);
    const huntLen = this.mode === 'hide' ? this.D.hunt : this.D.seekTime;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const items = real.map((c) => ({ name: c.name, ok: !c.caught, txt: c.caught ? `found at ${fmt(c.caughtAt ?? 0)}` : 'survived' }));
    let title, text;
    if (this.mode === 'hide') {
      const me = this.player;
      const surv = !me.caught;
      const score = Math.round((surv ? huntLen : (me.caughtAt || 0)) * 10 + this.stats.taunts * 150 + this.stats.clonesFooled * 300);
      title = surv ? 'You survived!' : survivors.length ? 'Caught, but your team survived' : 'The hunters win';
      text = `Score ${score} · taunts ${this.stats.taunts} · clones bonked ${this.stats.clonesFooled} · closest call ${Math.round(clamp(this.stats.maxSus, 0, 1) * 100)}% attention`;
      (surv ? Sound.win : Sound.lose)();
    } else {
      const found = real.length - survivors.length;
      title = survivors.length ? `You found ${found} of ${real.length}` : 'You found everyone!';
      text = survivors.length ? 'The survivors are marked in the room behind this screen.' : `Cleared in ${fmt(this.t - this.stats.start)}.`;
      (survivors.length ? Sound.lose : Sound.win)();
    }
    this.view = 'spec';
    hammerVM.visible = false;
    this.revealList = survivors.length ? survivors : real;
    $('#revealBtn').textContent = survivors.length ? 'Show hiding spots' : 'Replay where they hid';
    UI.end(title, text, items);
  },
  startReveal() {
    const list = this.revealList || [];
    if (!list.length) return;
    for (const c of list) { c.root.visible = true; }
    this.reveal = { list, i: 0, t: 0 };
    UI.screen(null);
  },
  updateReveal(dt) {
    const R = this.reveal, c = R.list[R.i];
    R.t += dt;
    const p = c.center();
    let best = 0, bd = -1;
    if (R.t <= dt) { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, h = envHit(p, new V3(Math.sin(a), 0, Math.cos(a)), 6), f = h ? h.distance : 6; if (f > bd) { bd = f; best = a; } } R.a0 = best; R.free = bd; }
    const a = R.a0 + Math.sin(R.t * 0.9) * 0.6, r = Math.min(3.2, R.free - 0.3);
    camera.position.set(p.x + Math.sin(a) * r, Math.max(1.2, p.y + 0.9), p.z + Math.cos(a) * r);
    camera.lookAt(p);
    if (R.t > 3.6) { R.i++; R.t = 0; if (R.i >= R.list.length) { this.reveal = null; for (const x of R.list) if (x.caught) x.root.visible = false; UI.screen('end'); } }
  },
  lock() { if (this.paint) return; try { const p = renderer.domElement.requestPointerLock?.(); p?.catch?.(() => {}); } catch (e) { /* needs a user gesture */ } },
  toMenu() {
    this.clearRound(); this.phase = 'menu'; UI.hud(false); UI.screen('menu');
    if (document.pointerLockElement) document.exitPointerLock();
  },
};
const nextFrame = () => new Promise((r) => setTimeout(r, 16));

/* ---------- effects ---------- */
const fxGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
function burst(c) {
  const cols = c.avgColors(10), p = c.center();
  for (let i = 0; i < 46; i++) {
    const m = new THREE.Mesh(fxGeo, new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? '#ffffff' : pick(cols) }));
    m.position.copy(p); scene.add(m);
    G.fx.push({ m, v: new V3(rand(-3, 3), rand(1.5, 5.5), rand(-3, 3)), life: rand(0.7, 1.3) });
  }
}
function floatLabel(text, pos, bg, fg, life = 2.2) {
  const s = textSprite(text, bg, fg, 0.26); s.position.copy(pos).add(new V3(0, 0.9, 0)); scene.add(s);
  G.labels.push({ s, life, vy: life > 100 ? 0 : 0.35 });
}
function updateFx(dt) {
  G.fx = G.fx.filter((f) => {
    f.life -= dt; f.v.y -= 12 * dt; f.m.position.addScaledVector(f.v, dt);
    if (f.m.position.y < 0.04) { f.m.position.y = 0.04; f.v.multiplyScalar(0.4); }
    f.m.rotation.x += dt * 8; f.m.scale.setScalar(Math.max(0.01, Math.min(1, f.life * 2)));
    if (f.life <= 0) { scene.remove(f.m); return false; }
    return true;
  });
  G.labels = G.labels.filter((l) => {
    l.life -= dt; l.s.position.y += l.vy * dt;
    if (l.life <= 0) { scene.remove(l.s); return false; }
    return true;
  });
}

/* first-person hammer view model */
const hammerVM = new THREE.Group();
{
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 12), new THREE.MeshStandardMaterial({ color: '#c9975e', roughness: 0.6 }));
  handle.position.y = 0.27; hammerVM.add(handle);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 18), new THREE.MeshStandardMaterial({ color: '#ff4d6d', roughness: 0.45 }));
  head.rotation.z = Math.PI / 2; head.position.y = 0.58; hammerVM.add(head);
  hammerVM.position.set(0.34, -0.42, -0.6); hammerVM.rotation.set(0.4, 0, -0.3);
  hammerVM.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 20; } });
  camera.add(hammerVM); hammerVM.visible = false;
}
let swingT = 0;

/* ================= input ================= */
const keys = {};
const mouse = { x: 0, y: 0, down: false, right: false, lastUV: null };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  keys[e.code] = true;
  onKey(e);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function playing() { return G.phase === 'prep' || G.phase === 'hunt'; }
function controllable() { return G.player && !G.player.caught && G.view === 'third' && playing(); }

function onKey(e) {
  if (!playing() || G.paused) return;
  const P = G.player;
  if (e.code === 'KeyF' && controllable()) { togglePaint(); e.preventDefault(); return; }
  if (e.code === 'Enter' && G.phase === 'prep' && G.view === 'third') { G.finishPrep(); return; }
  if (G.paint) {
    if (e.code === 'KeyB') UI.tool('brush'); if (e.code === 'KeyM') UI.tool('mimic'); if (e.code === 'KeyI') UI.tool('picker'); if (e.code === 'KeyG') UI.tool('fill');
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { undo(); e.preventDefault(); return; }
    if (e.code === 'Escape') togglePaint();
  }
  if (!controllable()) {
    if (G.view === 'spec' && /Digit[1-4]/.test(e.code)) G.specIdx = +e.code.slice(5) - 1;
    return;
  }
  const poseKeys = { Digit1: 'stand', Digit2: 'crouch', Digit3: 'curl', Digit4: 'lie', Digit5: 'flat' };
  if (poseKeys[e.code]) setPose(poseKeys[e.code]);
  if (e.code === 'KeyZ' && !e.ctrlKey) P.setYaw(P.yaw + Math.PI / 12);
  if (e.code === 'KeyX') P.setYaw(P.yaw - Math.PI / 12);
  if (e.code === 'KeyC') makeClone();
  if (e.code === 'KeyQ') taunt();
}
function setPose(p) {
  const P = G.player; if (!P) return;
  P.setPose(p);
  if (p === 'flat') snapToWall(P);
  UI.refreshBars();
}
function snapToWall(P) {
  const c = P.center(); let best = null;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, d = new V3(Math.sin(a), 0, Math.cos(a)), h = envHit(c, d, 1.4);
    if (h && h.face && (!best || h.distance < best.distance)) best = h;
  }
  if (!best) return;
  const n = best.face.normal.clone().transformDirection(best.object.matrixWorld); n.y = 0; if (n.lengthSq() < 0.1) return; n.normalize();
  const depth = 0.35 * POSES.flat.sz * SIZES[P.size][0];
  P.root.position.x = best.point.x + n.x * (depth + 0.02);
  P.root.position.z = best.point.z + n.z * (depth + 0.02);
  P.setYaw(Math.atan2(n.x, n.z));
}
function makeClone() {
  if (G.mode !== 'hide' || G.cloneLeft <= 0) { toast('No clones left'); return; }
  const P = G.player, c = G.addCham({ name: 'Clone', color: '#999' });
  c.copyFrom(P); c.isClone = true;
  G.cloneLeft--; UI.refreshBars();
  toast('Clone placed. Now sneak somewhere else!', 'good'); Sound.splat();
}
function taunt() {
  if (G.phase !== 'hunt' || G.mode !== 'hide') { toast('Taunts only count during the hunt'); return; }
  if (G.tauntT > 0) return;
  G.tauntT = 6; G.stats.taunts++;
  G.whistle(G.player, 0.85);
  toast('+150 taunt bonus. They heard that…', 'warn');
}

renderer.domElement.addEventListener('click', () => {
  Sound.init();
  if (!playing() || G.paint) return;
  if (!document.pointerLockElement) { G.lock(); return; }
  if (G.view === 'first' && G.phase === 'hunt') bonk();
});
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (!locked && playing() && !G.paint && G.phase !== 'handoff') { G.paused = true; UI.screen('pause'); }
  if (locked) { G.paused = false; UI.screen(null); }
});
addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (document.pointerLockElement) {
    const s = 0.0022;
    if (G.view === 'first' && G.fp) { G.fp.yaw -= e.movementX * s; G.fp.pitch = clamp(G.fp.pitch - e.movementY * s, -1.5, 1.5); }
    else { G.ctrl.yaw -= e.movementX * s; G.ctrl.pitch = clamp(G.ctrl.pitch + e.movementY * s, -0.45, 1.25); }
    return;
  }
  if (G.paint) {
    if (mouse.right) { G.paintCam.yaw -= e.movementX * 0.008; G.paintCam.pitch = clamp(G.paintCam.pitch + e.movementY * 0.006, -0.6, 1.3); }
    else if (mouse.down) paintAt(e, false);
  }
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!G.paint) return;
  if (e.button === 2) { mouse.right = true; return; }
  if (e.button !== 0) return;
  mouse.down = true; mouse.lastUV = null;
  if (e.altKey || UI.curTool === 'picker') { pickColor(e); mouse.down = false; return; }
  if (UI.curTool === 'fill') { pushUndo(); G.player.fill(UI.color); G.player.flush(); Sound.splat(); mouse.down = false; return; }
  pushUndo(); paintAt(e, true);
});
addEventListener('pointerup', () => { mouse.down = false; mouse.right = false; mouse.lastUV = null; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('wheel', (e) => {
  if (G.paint) G.paintCam.dist = clamp(G.paintCam.dist + Math.sign(e.deltaY) * 0.25, 1.2, 7);
  else if (G.view === 'third') G.ctrl.dist = clamp(G.ctrl.dist + Math.sign(e.deltaY) * 0.3, 1.6, 7);
}, { passive: true });

/* ---------- painting ---------- */
const rcPaint = new THREE.Raycaster();
const ndcV = new THREE.Vector2();
function evNdc(x, y) { ndcV.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); return ndcV; }
const undoStack = [];
function pushUndo() { const P = G.player; undoStack.push({ c: P, d: P.ctx.getImageData(0, 0, TS, TS) }); if (undoStack.length > 25) undoStack.shift(); }
function undo() { const u = undoStack.pop(); if (!u) return; u.c.ctx.putImageData(u.d, 0, 0); u.c.tex.needsUpdate = true; Sound.click(); }
function pickColor(e) {
  rcPaint.setFromCamera(evNdc(e.clientX, e.clientY), camera);
  const h = rcPaint.intersectObjects(env, false)[0];
  if (!h) return;
  const c = surfaceColor(h);
  UI.setColor('#' + new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).getHexString(), true);
  if (h.object.material.roughness != null) UI.setRough(h.object.material.roughness);
  Sound.click();
}
function paintAt(e, first) {
  const P = G.player; if (!P) return;
  const size = UI.brush;
  if (UI.curTool === 'mimic') {
    if (G.ink <= 0) { if (first) toast('Out of mimic ink. Use the brush and eyedropper.'); return; }
    const rpx = 6 + size * 1.4;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * rpx;
      rcPaint.setFromCamera(evNdc(e.clientX + Math.cos(a) * r, e.clientY + Math.sin(a) * r), camera);
      const h1 = rcPaint.intersectObject(P.mesh, false)[0]; if (!h1) continue;
      const h2 = envHit(h1.point.clone().addScaledVector(rcPaint.ray.direction, 0.01), rcPaint.ray.direction, 40); if (!h2) continue;
      P.paintDot(h1.uv, surfaceColor(h2), 2.4 + size * 0.12);
      G.ink = Math.max(0, G.ink - 0.012);
    }
    P.flush(); UI.refreshInk(); return;
  }
  rcPaint.setFromCamera(evNdc(e.clientX, e.clientY), camera);
  const h = rcPaint.intersectObject(P.mesh, false)[0];
  if (!h) { mouse.lastUV = null; return; }
  const uv = h.uv.clone();
  if (mouse.lastUV && Math.abs(mouse.lastUV.x - uv.x) < 0.25 && Math.abs(mouse.lastUV.y - uv.y) < 0.25) {
    const steps = Math.ceil(mouse.lastUV.distanceTo(uv) * TS / Math.max(1, size * 0.4));
    for (let i = 1; i <= steps; i++) P.paintDot(mouse.lastUV.clone().lerp(uv, i / steps), UI.color, size);
  } else P.paintDot(uv, UI.color, size);
  mouse.lastUV = uv;
  P.flush();
  if (first) Sound.splat();
}
function togglePaint() {
  if (!G.player) return;
  G.paint = !G.paint;
  UI.paintPanel(G.paint);
  if (G.paint) {
    G.paintCam.yaw = G.ctrl.yaw; G.paintCam.pitch = 0.15; G.paintCam.dist = 2.6;
    if (document.pointerLockElement) document.exitPointerLock();
  } else G.lock();
}

/* ---------- player seek bonk ---------- */
const rcBonk = new THREE.Raycaster();
function bonk() {
  if (swingT > 0) return;
  swingT = 0.32;
  rcBonk.setFromCamera(new THREE.Vector2(0, 0), camera); rcBonk.far = 3.3;
  const meshes = G.targets().map((c) => c.mesh);
  const h = rcBonk.intersectObjects([...env, ...meshes], false)[0];
  if (h && h.object.userData.cham) { G.catchCham(h.object.userData.cham, null); Sound.bonk(h.point); }
  else if (h) Sound.thud();
}

/* ================= update ================= */
const tmpV = new V3();
function updatePlayer(dt) {
  const P = G.player;
  if (!P || P.caught) return;
  const before = P.root.position.clone();
  if (!G.paint) {
    let mx = 0, mz = 0;
    if (keys.KeyW) mz -= 1; if (keys.KeyS) mz += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
    const moving = mx || mz;
    if (moving && !POSES[P.pose].move) { P.setPose('stand'); UI.refreshBars(); }
    if (moving) {
      const y = G.ctrl.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
      let vx = fx * -mz + rx * mx, vz = fz * -mz + rz * mx; const l = Math.hypot(vx, vz); vx /= l; vz /= l;
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 1.6 : 4.2) * (P.pose === 'crouch' ? 0.55 : P.pose === 'curl' ? 0.8 : 1) * (P.size === 'petite' ? 0.85 : 1);
      P.root.position.x += vx * sp * dt; P.root.position.z += vz * sp * dt;
      P.setYaw(P.yaw + angDiff(P.yaw, Math.atan2(vx, vz)) * Math.min(1, dt * 12));
    }
    if (keys.Space && P.body.onGround) { P.body.vy = 6.6; P.body.onGround = false; }
  }
  collideBody(P.body, dt, true);
  P.speed = P.root.position.distanceTo(before) / Math.max(dt, 1e-4);
}
function updateFP(dt) {
  const f = G.fp; if (!f) return;
  let mx = 0, mz = 0;
  if (G.phase === 'hunt' || G.phase === 'prep') { if (keys.KeyW) mz -= 1; if (keys.KeyS) mz += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1; }
  if (mx || mz) {
    const y = f.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    let vx = fx * -mz + rx * mx, vz = fz * -mz + rz * mx; const l = Math.hypot(vx, vz);
    const sp = keys.ShiftLeft ? 2 : 4.6;
    f.pos.x += vx / l * sp * dt; f.pos.z += vz / l * sp * dt;
  }
  if (keys.Space && f.onGround) { f.vy = 6.4; f.onGround = false; }
  collideBody(f, dt, true);
  camera.position.set(f.pos.x, f.pos.y + 1.6, f.pos.z);
  camera.rotation.set(f.pitch, f.yaw, 0, 'YXZ');
  if (swingT > 0) swingT -= dt;
  const s = swingT > 0 ? Math.sin((1 - swingT / 0.32) * Math.PI) : 0;
  const bob = (mx || mz) && f.onGround ? Math.sin(G.t * 10) * 0.015 : 0;
  hammerVM.rotation.set(0.4 - s * 1.5, 0, -0.3); hammerVM.position.set(0.34, -0.42 + bob, -0.6 - s * 0.1);
  // crosshair highlight
  rcBonk.setFromCamera(new THREE.Vector2(0, 0), camera); rcBonk.far = 3.3;
  const h = rcBonk.intersectObjects(env, false)[0];
  UI.crossHot(!!h);
}
const camTarget = new V3();
function thirdCam(target, yaw, pitch, dist, dt, snap) {
  const dir = new V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const h = envHit(target, dir, dist + 0.3);
  const d = h ? Math.max(0.4, h.distance - 0.25) : dist;
  const want = target.clone().addScaledVector(dir, d);
  if (snap) camera.position.copy(want); else camera.position.lerp(want, Math.min(1, dt * 14));
  camera.lookAt(target);
}
function updateCamera(dt) {
  if (G.view === 'first') return;
  if (G.view === 'spec') {
    const hs = G.hunters;
    if (hs.length) {
      const h = hs[G.specIdx % hs.length];
      camTarget.set(h.pos.x, 1.6, h.pos.z);
      thirdCam(camTarget, G.ctrl.yaw, G.ctrl.pitch, 4.5, dt);
    } else if (G.fp) { camera.position.set(G.fp.pos.x, 1.6, G.fp.pos.z); }
    return;
  }
  const P = G.player; if (!P) return;
  if (G.paint) {
    const c = P.center();
    thirdCam(c, G.paintCam.yaw, G.paintCam.pitch, G.paintCam.dist, dt, true);
  } else {
    camTarget.copy(P.root.position); camTarget.y += Math.max(0.55, P.body.h * 0.9);
    thirdCam(camTarget, G.ctrl.yaw, G.ctrl.pitch, G.ctrl.dist, dt, false);
  }
}

let lastTickSec = -1, hudT = 0;
function update(dt) {
  G.t += dt;
  updateFx(dt);
  if (G.paused || !playing()) { if (G.phase === 'end') { if (G.reveal) G.updateReveal(dt); else updateCamera(dt); } return; }
  G.timer -= dt;
  if (G.tauntT > 0) G.tauntT -= dt;
  const sec = Math.ceil(G.timer);
  if (sec <= 10 && sec !== lastTickSec && sec > 0) { lastTickSec = sec; Sound.tick(); }

  if (G.view === 'first') updateFP(dt); else updatePlayer(dt);

  if (G.phase === 'prep' && G.timer <= 0) G.finishPrep();
  else if (G.phase === 'hunt') {
    G.forcedT -= dt;
    if (G.forcedT <= 0) { G.forcedT = G.mode === 'hide' ? 40 : 30; G.forcedTaunt(); }
    const targets = G.targets();
    for (const h of G.hunters) h.update(dt, targets);
    if (G.player && G.mode === 'hide') {
      let s = 0; for (const h of G.hunters) s = Math.max(s, h.sus.get(G.player) || 0);
      G.playerSus = s; G.stats.maxSus = Math.max(G.stats.maxSus, s);
    }
    if (G.timer <= 0) G.end();
  } else for (const h of G.hunters) h.update(dt, []);
  updateCamera(dt);
  hudT -= dt; if (hudT <= 0) { hudT = 0.1; UI.tick(); }
}

let last = performance.now();
function step(dt) {
  update(dt);
  for (const c of G.chams) c.flush();
  Sound.listener(camera);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt);
  requestAnimationFrame(frame);
}

/* ================= UI ================= */
function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3000);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}
const UI = {
  curTool: 'brush', color: '#7a4a2c', brush: 10, recent: [],
  screen(name) {
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    if (name) $('#screen-' + name).classList.remove('hidden');
  },
  hud(on) { $('#hud').classList.toggle('hidden', !on); },
  loading(on, txt) { if (on) { $('#loadTitle').textContent = txt; this.screen('load'); } else if (!$('#screen-load').classList.contains('hidden')) this.screen(null); },
  hand(title, text) { $('#handTitle').textContent = title; $('#handText').textContent = text; this.screen('hand'); },
  end(title, text, items) {
    $('#endTitle').textContent = title; $('#endText').textContent = text;
    $('#endList').innerHTML = items.map((i) => `<li><span>${i.name}</span><span class="${i.ok ? 'ok' : 'no'}">${i.txt}</span></li>`).join('');
    this.hud(false); this.screen('end');
  },
  paintPanel(on) {
    $('#paintPanel').classList.toggle('hidden', !on);
    document.body.classList.toggle('painting', !!on);
    if (on && G.player) {
      $('#rough').value = Math.round(G.player.mat.roughness * 100); $('#roughVal').textContent = G.player.mat.roughness.toFixed(2);
      $('#metal').value = Math.round(G.player.mat.metalness * 100); $('#metalVal').textContent = G.player.mat.metalness.toFixed(2);
      this.refreshInk(); this.refreshBars();
    }
  },
  tool(t) { this.curTool = t; document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); },
  setColor(hex, addRecent) {
    this.color = hex; $('#color').value = hex;
    if (addRecent) { this.recent = [hex, ...this.recent.filter((c) => c !== hex)].slice(0, 14); this.drawSwatches(); }
  },
  setRough(r) { if (!G.player) return; G.player.mat.roughness = r; $('#rough').value = Math.round(r * 100); $('#roughVal').textContent = r.toFixed(2); },
  drawSwatches() {
    $('#swatches').innerHTML = this.recent.map((c) => `<i style="background:${c}" data-c="${c}" title="${c}"></i>`).join('');
  },
  refreshInk() { $('#inkBar').style.width = G.ink + '%'; },
  refreshBars() {
    const P = G.player;
    document.querySelectorAll('[data-pose]').forEach((b) => b.classList.toggle('on', !!P && b.dataset.pose === P.pose));
    document.querySelectorAll('[data-shape]').forEach((b) => b.classList.toggle('on', !!P && b.dataset.shape === P.shape));
    document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', !!P && b.dataset.size === P.size));
    $('#cloneLeft').textContent = G.mode === 'hide' ? `(${G.cloneLeft})` : '';
    const hiding = G.view === 'third';
    $('#posebar').classList.toggle('hidden', !hiding);
    $('#crosshair').classList.toggle('hidden', G.view !== 'first');
    $('#eyes').classList.toggle('hidden', !(G.mode === 'hide' && G.phase === 'hunt' && P && !P.caught));
    document.querySelector('[data-act="clone"]').classList.toggle('hidden', G.mode !== 'hide');
    document.querySelector('[data-act="taunt"]').classList.toggle('hidden', G.mode !== 'hide');
    $('#readyBtn').classList.toggle('hidden', G.phase !== 'prep');
  },
  crossHot(on) { $('#crosshair').classList.toggle('hot', on); },
  status() {
    const real = G.chams.filter((c) => !c.isClone);
    const rows = real.map((c) => `<div class="${c.caught ? 'caught' : ''}"><span class="dot" style="background:${c.color}"></span>${c.name}${c.isPlayer ? ' (you)' : ''}</div>`).join('');
    const hunters = G.hunters.length ? `<div style="margin-top:6px;color:var(--muted)">${G.hunters.length} hunters on the prowl</div>` : '';
    $('#status').innerHTML = `<div style="color:var(--muted);font-size:12px">Chameleons ${real.filter((c) => !c.caught).length}/${real.length}</div>${rows}${hunters}`;
  },
  tick() {
    const t = Math.max(0, G.timer);
    $('#timer').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    $('#timer').classList.toggle('low', t < 10.5);
    let phase = '', sub = '', hint = '';
    if (G.phase === 'prep') {
      if (G.view === 'first') { phase = 'Hunters wait'; sub = 'The gate opens soon'; }
      else { phase = G.mode === 'party' ? `${G.player.name}: hide!` : 'Prep: paint & hide'; sub = 'Hunters are locked in the garage'; }
    } else if (G.phase === 'hunt') {
      phase = G.view === 'first' ? 'Hunt' : 'Hunters are searching';
      sub = `${G.chams.filter((c) => !c.isClone && !c.caught).length} chameleons left`;
    }
    if (G.view === 'third') hint = G.paint ? 'Paint mode · Left-drag paint · Right-drag orbit · Alt+click sample · F to finish'
      : 'WASD move · Space jump · Shift sneak · F paint · 1-5 pose · Z/X turn · C clone · Q taunt' + (G.phase === 'prep' ? ' · Enter ready' : '');
    else if (G.view === 'first') hint = 'WASD move · Click bonk · Space jump · Listen for whistles';
    else if (G.view === 'spec') hint = `Spectating ${G.hunters.length ? 'Hunter ' + ((G.specIdx % G.hunters.length) + 1) : ''} · 1-4 switch · Mouse orbit`;
    $('#phase').textContent = phase; $('#sub').textContent = sub; $('#hint').textContent = hint;
    if (G.mode === 'hide' && G.phase === 'hunt') {
      const s = clamp(G.playerSus || 0, 0, 1);
      $('#eyesBar').style.width = (s * 100) + '%';
      $('#eyesTxt').textContent = s < 0.05 ? 'unseen' : s < 0.35 ? 'glanced' : s < 1 ? 'suspicious!' : 'SPOTTED';
    }
    this.refreshBars();
    this.status();
  },
};

/* --- UI wiring --- */
document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.mode').forEach((x) => x.classList.toggle('on', x === b));
  G.mode = b.dataset.mode;
  document.querySelectorAll('.party-only').forEach((x) => x.classList.toggle('hidden', G.mode !== 'party'));
  Sound.init(); Sound.click();
}));
function segWire(id, fn) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); fn(b);
  });
}
segWire('#diffSeg', (b) => { G.diffKey = b.dataset.diff; });
segWire('#humanSeg', (b) => { G.partyHumans = +b.dataset.n; });
segWire('#aiSeg', (b) => { G.partyAI = +b.dataset.n; });
$('#playBtn').addEventListener('click', () => G.start(G.mode));
$('#handGo').addEventListener('click', () => G.handGo());
$('#againBtn').addEventListener('click', () => G.start(G.mode));
$('#revealBtn').addEventListener('click', () => G.startReveal());
$('#menuBtn').addEventListener('click', () => G.toMenu());
$('#resumeBtn').addEventListener('click', () => { G.paused = false; UI.screen(null); G.lock(); });
$('#quitBtn').addEventListener('click', () => { G.paused = false; G.toMenu(); });
$('#paintDone').addEventListener('click', () => togglePaint());
document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => UI.tool(b.dataset.tool)));
$('#color').addEventListener('input', (e) => UI.setColor(e.target.value, false));
$('#color').addEventListener('change', (e) => UI.setColor(e.target.value, true));
$('#swatches').addEventListener('click', (e) => { if (e.target.dataset.c) UI.setColor(e.target.dataset.c, false); });
$('#brushSize').addEventListener('input', (e) => { UI.brush = +e.target.value; $('#sizeVal').textContent = UI.brush; });
$('#rough').addEventListener('input', (e) => UI.setRough(+e.target.value / 100));
$('#metal').addEventListener('input', (e) => { if (!G.player) return; G.player.mat.metalness = +e.target.value / 100; $('#metalVal').textContent = G.player.mat.metalness.toFixed(2); });
$('#undoBtn').addEventListener('click', undo);
$('#clearBtn').addEventListener('click', () => { if (!G.player) return; pushUndo(); G.player.blank(); });
document.querySelectorAll('[data-shape]').forEach((b) => b.addEventListener('click', () => { G.player?.setShape(b.dataset.shape); UI.refreshBars(); }));
document.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => { G.player?.setSize(b.dataset.size); UI.refreshBars(); }));
$('#rotL').addEventListener('click', () => G.player?.setYaw(G.player.yaw + Math.PI / 12));
$('#rotR').addEventListener('click', () => G.player?.setYaw(G.player.yaw - Math.PI / 12));
document.querySelectorAll('[data-pose]').forEach((b) => b.addEventListener('click', () => { if (controllable()) setPose(b.dataset.pose); }));
document.querySelector('[data-act="paint"]').addEventListener('click', () => { if (controllable()) togglePaint(); });
document.querySelector('[data-act="clone"]').addEventListener('click', () => { if (controllable()) makeClone(); });
document.querySelector('[data-act="taunt"]').addEventListener('click', () => { if (controllable()) taunt(); });
$('#readyBtn').addEventListener('click', () => { if (G.phase === 'prep') G.finishPrep(); });
UI.setColor('#7a4a2c', true);

/* attract-mode camera behind the menu */
let menuT = 0;
const _menuUpdate = update;
function menuCam(dt) {
  menuT += dt * 0.05;
  camera.position.set(16 + Math.cos(menuT) * 9, 2.6, 12 + Math.sin(menuT) * 6);
  camera.lookAt(16, 1, 12);
}
update = function (dt) { if (G.phase === 'menu') { menuCam(dt); G.t += dt; return; } _menuUpdate(dt); };

window.__mc = { G, scene, camera, renderer, autoCamo, Cham, Hunter, findSpot, env, colliders, bonk, togglePaint, paintAt, UI, step: (dt, n = 1) => { for (let i = 0; i < n; i++) step(dt); } };
requestAnimationFrame(frame);
