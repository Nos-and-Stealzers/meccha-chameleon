'use strict';
/* Characters: paintable chameleon bodies (merged, atlas-UV'd geometry), face styles, hunter avatars, profile, preview. */

const TS = 256;
const BODY_V0 = 0.3;                    // body occupies v in [0.3,1]; extras live in the bottom strip
const REG = { body: [0, BODY_V0, 1, 1], footL: [0, 0, 0.25, 0.28], footR: [0.25, 0, 0.5, 0.28], arms: [0.5, 0, 0.75, 0.28], extra: [0.75, 0, 1, 0.28] };

function mtx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
}
function part(geo, rect, m4, boxAtlas = false) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const uv = g.attributes.uv;
  if (boxAtlas) {
    for (let i = 0; i < uv.count; i++) { const f = Math.floor(i / 6), cu = f % 3, cv = Math.floor(f / 3); uv.setXY(i, (cu + uv.getX(i)) / 3, (cv + uv.getY(i)) / 2); }
  }
  const [u0, v0, u1, v1] = rect;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  if (m4) g.applyMatrix4(m4);
  return g;
}
function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingBox();
  const c = out.boundingBox.getCenter(new V3());
  out.translate(-c.x, -c.y, -c.z);
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}
const sphereG = () => new THREE.SphereGeometry(1, 14, 10);
function feet(spread = 0.15, s = 1) {
  return [part(sphereG(), REG.footL, mtx(-spread, 0.06 * s, 0.05, 0, 0, 0, 0.13 * s, 0.08 * s, 0.19 * s)), part(sphereG(), REG.footR, mtx(spread, 0.06 * s, 0.05, 0, 0, 0, 0.13 * s, 0.08 * s, 0.19 * s))];
}
function arms(x, y, s = 1) {
  return [part(new THREE.CapsuleGeometry(0.07 * s, 0.22 * s, 4, 10), [0.5, 0, 0.625, 0.28], mtx(-x, y, 0, 0, 0, -0.4)), part(new THREE.CapsuleGeometry(0.07 * s, 0.22 * s, 4, 10), [0.625, 0, 0.75, 0.28], mtx(x, y, 0, 0, 0, 0.4))];
}
const capsuleEye = { eyes: [[0.065, 0.811], [0.935, 0.811]], mouth: [0, 0.77], wrap: true };
const SHAPES = {
  blob: { label: 'Mochi', desc: 'Classic blob', face: capsuleEye, build: () => [part(new THREE.CapsuleGeometry(0.35, 0.8, 8, 28), REG.body, mtx(0, 0.84)), ...feet(), ...arms(0.38, 0.72)] },
  cube: {
    label: 'Blocky', desc: 'Classic cube', face: { eyes: [[(1 + 0.3) / 3, 0.902], [(1 + 0.7) / 3, 0.902]], mouth: [0.5, 0.86] },
    build: () => [part(new THREE.BoxGeometry(0.7, 1.36, 0.7), REG.body, mtx(0, 0.1 + 0.68), true), part(new THREE.BoxGeometry(0.2, 0.12, 0.3), REG.footL, mtx(-0.17, 0.06, 0.05)), part(new THREE.BoxGeometry(0.2, 0.12, 0.3), REG.footR, mtx(0.17, 0.06, 0.05)), part(new THREE.BoxGeometry(0.12, 0.38, 0.12), [0.5, 0, 0.625, 0.28], mtx(-0.42, 0.78)), part(new THREE.BoxGeometry(0.12, 0.38, 0.12), [0.625, 0, 0.75, 0.28], mtx(0.42, 0.78))],
  },
  bun: { label: 'Bun', desc: 'Round and chubby', face: { eyes: [[0.205, 0.735], [0.295, 0.735]], mouth: [0.25, 0.69] }, build: () => [part(new THREE.SphereGeometry(0.58, 32, 20), REG.body, mtx(0, 0.64, 0, 0, 0, 0, 1, 0.95, 1)), ...feet(0.2, 1.1), ...arms(0.56, 0.62, 0.9)] },
  noodle: { label: 'Noodle', desc: 'Tall and slim', face: { eyes: [[0.07, 0.85], [0.93, 0.85]], mouth: [0, 0.815], wrap: true }, build: () => [part(new THREE.CapsuleGeometry(0.25, 1.3, 8, 24), REG.body, mtx(0, 0.1 + 0.9)), ...feet(0.11, 0.85), ...arms(0.29, 1.0, 0.85)] },
  kitty: {
    label: 'Kitty', desc: 'Ears and a tail', face: capsuleEye,
    build: () => [part(new THREE.CapsuleGeometry(0.35, 0.8, 8, 28), REG.body, mtx(0, 0.84)), ...feet(), ...arms(0.38, 0.72),
      part(new THREE.ConeGeometry(0.12, 0.26, 12), [0.75, 0, 0.875, 0.14], mtx(-0.17, 1.6, 0, 0, 0, 0.3)), part(new THREE.ConeGeometry(0.12, 0.26, 12), [0.875, 0, 1, 0.14], mtx(0.17, 1.6, 0, 0, 0, -0.3)),
      part(new THREE.CapsuleGeometry(0.05, 0.5, 4, 10), [0.75, 0.14, 1, 0.28], mtx(0, 0.45, -0.42, -0.8, 0, 0))],
  },
  dino: {
    label: 'Dino', desc: 'Spikes and a tail', face: capsuleEye,
    build: () => [part(new THREE.CapsuleGeometry(0.35, 0.8, 8, 28), REG.body, mtx(0, 0.84)), ...feet(), ...arms(0.38, 0.72),
      ...[0, 1, 2, 3].map((i) => part(new THREE.ConeGeometry(0.08, 0.2, 8), [0.75 + i * 0.0625, 0, 0.8125 + i * 0.0625, 0.14], mtx(0, 0.55 + i * 0.25, -0.38 + Math.abs(i - 1.5) * 0.02, -Math.PI / 2 + 0.25, 0, 0))),
      part(new THREE.ConeGeometry(0.15, 0.6, 12), [0.75, 0.14, 1, 0.28], mtx(0, 0.32, -0.6, -Math.PI / 2 - 0.35, 0, 0))],
  },
};
const GEO = {}, GEO_BB = {};
for (const k in SHAPES) { GEO[k] = mergeGeos(SHAPES[k].build()); GEO_BB[k] = GEO[k].boundingBox.clone(); }

const EYES = { dots: 'Dots', happy: 'Happy', sleepy: 'Sleepy', sparkle: 'Sparkle', angry: 'Grumpy', derp: 'Derp', cool: 'Cool' };
function drawFace(g, shape, style) {
  const F = SHAPES[shape].face;
  const at = (u, v, fn) => { const x = u * TS, y = (1 - v) * TS; fn(x, y); if (F.wrap && x < 16) fn(x + TS, y); if (F.wrap && x > TS - 16) fn(x - TS, y); };
  g.fillStyle = '#1b1d22'; g.strokeStyle = '#1b1d22'; g.lineCap = 'round'; g.lineWidth = 3.5;
  F.eyes.forEach(([u, v], i) => at(u, v, (x, y) => {
    g.beginPath();
    if (style === 'happy') { g.arc(x, y + 4, 6, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    else if (style === 'sleepy') { g.moveTo(x - 6, y + 2); g.lineTo(x + 6, y + 2); g.stroke(); }
    else if (style === 'angry') { g.ellipse(x, y + 2, 5, 7, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(x - 8, y - 9 + (i ? 4 : 0)); g.lineTo(x + 8, y - 9 + (i ? 0 : 4)); g.stroke(); }
    else if (style === 'derp') { g.ellipse(x, y, i ? 4 : 7, i ? 6 : 10, 0, 0, 7); g.fill(); }
    else if (style === 'cool') { g.fillRect(x - 9, y - 5, 18, 9); }
    else { g.ellipse(x, y, 6, 10, 0, 0, 7); g.fill(); if (style === 'sparkle') { g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 2, y - 4, 2.6, 0, 7); g.fill(); g.fillStyle = '#1b1d22'; } }
  }));
  if (style === 'cool') at((F.eyes[0][0] + F.eyes[1][0] + (F.wrap ? 1 : 0)) / 2 % 1, F.eyes[0][1], (x, y) => { g.fillRect(x - 8, y - 2, 16, 3); });
  g.fillStyle = 'rgba(255,140,160,.5)';
  F.eyes.forEach(([u, v]) => at(u + (u < 0.5 ? 0.035 : -0.035) * (F.wrap ? 1 : 0.6), v - 0.055, (x, y) => { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }));
  at(F.mouth[0], F.mouth[1], (x, y) => { g.strokeStyle = '#1b1d22'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y - 3, 4, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); });
}

const SIZES = { petite: [0.55, 0.55], normal: [1, 1], plump: [1.45, 1.12] };
const POSES = {
  stand: { sx: 1, sy: 1, sz: 1, move: true },
  crouch: { sx: 1.12, sy: 0.62, sz: 1.12, move: true },
  curl: { sx: 1.15, sy: 0.5, sz: 1.15, move: true },
  lie: { sx: 1, sy: 1, sz: 0.8, lie: true, move: false },
  flat: { sx: 1.15, sy: 1, sz: 0.42, move: false },
};
const NAMES = ['Kiwi', 'Mango', 'Pickle', 'Basil', 'Mochi', 'Yuzu', 'Pesto', 'Taro', 'Olive', 'Sprout', 'Gumbo', 'Biscuit'];
const TAG_COLORS = ['#3ad49c', '#ff7ab3', '#4da3ff', '#ffb057', '#b197fc', '#ffd43b', '#63e6be', '#ff8787', '#74c0fc', '#e599f7'];

class Cham {
  constructor({ id, name, ownerId = null, local = false, human = false, color = '#3ad49c', shape = 'blob', eyes = 'dots' }) {
    this.id = id || uid(); this.name = name; this.ownerId = ownerId; this.local = local; this.human = human; this.color = color; this.eyes = eyes;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = TS;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.85, metalness: 0 });
    this.root = new THREE.Group(); scene.add(this.root);
    this.shape = SHAPES[shape] ? shape : 'blob'; this.size = 'normal'; this.pose = 'stand'; this.yaw = 0;
    this.body = { pos: this.root.position, vy: 0, onGround: true, r: 0.3, h: 1.5 };
    this.caught = false; this.isClone = false; this.painted = false; this.speed = 0; this.walkT = 0; this.texVer = 0;
    this.target = null; this.mesh = null;
    this.blank();
    this.rebuild();
  }
  get isPlayer() { return this.local && this.human; }
  blank() {
    const g = this.ctx; g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, TS, TS);
    drawFace(g, this.shape, this.eyes);
    this.tex.needsUpdate = true; this.painted = false; this.texVer++;
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
    m.rotation.set(p.lie ? -Math.PI / 2 : 0, 0, 0); m.scale.set(p.sx * sx, p.sy * sy, p.sz * sx); m.position.set(0, 0, 0);
    m.updateMatrix();
    const bb = GEO_BB[this.shape].clone().applyMatrix4(m.matrix);
    this.baseY = -bb.min.y; m.position.y = this.baseY;
    this.body.h = bb.max.y - bb.min.y;
    this.body.r = (this.pose === 'flat' ? 0.17 : 0.3) * sx * (this.shape === 'bun' ? 1.4 : 1);
    this.root.rotation.y = this.yaw;
  }
  setPose(p) { if (POSES[p]) { this.pose = p; this.applyPose(); } }
  setShape(s) { if (!SHAPES[s] || s === this.shape) return; const was = this.painted; this.shape = s; if (!was) this.blank(); this.rebuild(); }
  setSize(s) { if (SIZES[s]) { this.size = s; this.applyPose(); } }
  setYaw(y) { this.yaw = y; this.root.rotation.y = y; }
  center() { return new V3(this.root.position.x, this.root.position.y + this.body.h / 2, this.root.position.z); }
  animate(dt, moving) {
    if (moving && POSES[this.pose].move) { this.walkT += dt * 11; this.mesh.position.y = this.baseY + Math.abs(Math.sin(this.walkT)) * 0.07; this.mesh.rotation.z = Math.sin(this.walkT) * 0.06; }
    else if (this.walkT) { this.walkT = 0; this.mesh.position.y = this.baseY; this.mesh.rotation.z = 0; }
  }
  paintDot(uv, rgb, r) {
    const g = this.ctx, x = uv.x * TS, y = (1 - uv.y) * TS;
    g.fillStyle = Array.isArray(rgb) ? `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})` : rgb;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (uv.y > BODY_V0 && this.shape !== 'cube') {
      if (x < r) { g.beginPath(); g.arc(x + TS, y, r, 0, 7); g.fill(); }
      if (x > TS - r) { g.beginPath(); g.arc(x - TS, y, r, 0, 7); g.fill(); }
    }
    this.painted = true; this.dirty = true;
  }
  fill(rgb) { this.ctx.fillStyle = rgb; this.ctx.fillRect(0, 0, TS, TS); this.painted = true; this.dirty = true; }
  flush() { if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; this.texVer++; } }
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
  texURL() { return this.canvas.toDataURL('image/webp', 0.82); }
  loadTex(url) {
    const img = new Image();
    img.onload = () => { this.ctx.drawImage(img, 0, 0, TS, TS); this.tex.needsUpdate = true; this.painted = true; };
    img.src = url;
  }
  dispose() { scene.remove(this.root); this.tex.dispose(); this.mat.dispose(); }
}

/* ---------- hunter avatars ---------- */
const HUNTER_COLORS = ['#ff6b3d', '#3d8bff', '#b04dff', '#ff4d6d', '#2fbf71', '#ffb020', '#20c4d8', '#5b5f6b'];
const HATS = { cap: 'Cap', tophat: 'Top hat', cowboy: 'Cowboy', beanie: 'Beanie', crown: 'Crown', bunny: 'Bunny ears', chef: 'Chef', none: 'None' };
const VISORS = { visor: 'Visor', shades: 'Shades', goggles: 'Goggles', none: 'Bare' };
const TOOLS = { hammer: 'Toy hammer', pan: 'Frying pan', fish: 'Fish', baguette: 'Baguette', bat: 'Bat', plunger: 'Plunger' };
function buildTool(kind) {
  const g = new THREE.Group();
  const M = (geo, col, x, y, z, rx = 0, ry = 0, rz = 0, rough = 0.5, metal = 0) => { const m = new THREE.Mesh(geo, cm(col, rough, metal)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  if (kind === 'pan') { M(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10), '#3a2a20', 0, 0.21, 0); M(new THREE.CylinderGeometry(0.22, 0.2, 0.05, 24), '#2d2f33', 0, 0.62, 0, Math.PI / 2, 0, 0, 0.35, 0.6); }
  else if (kind === 'fish') { M(new THREE.SphereGeometry(0.14, 16, 10), '#5aa9d6', 0, 0.5, 0, 0, 0, 0, 0.3).scale.set(0.7, 2.4, 1); M(new THREE.ConeGeometry(0.13, 0.2, 3), '#3f7fb0', 0, 0.12, 0, Math.PI, 0, 0); M(new THREE.SphereGeometry(0.025, 8, 6), '#111', 0.06, 0.78, 0.09); }
  else if (kind === 'baguette') { M(new THREE.CapsuleGeometry(0.07, 0.75, 6, 12), '#d9a05b', 0, 0.42, 0, 0, 0, 0.05, 0.9); }
  else if (kind === 'bat') { M(new THREE.CylinderGeometry(0.08, 0.03, 0.85, 14), '#c9975e', 0, 0.42, 0, 0, 0, 0, 0.6); }
  else if (kind === 'plunger') { M(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 10), '#c9975e', 0, 0.31, 0); M(new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#d23a3a', 0, 0.66, 0, Math.PI, 0, 0, 0.4); }
  else { M(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 10), '#c9975e', 0, 0.37, 0, 0, 0, 0, 0.6); M(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 16), '#ff4d6d', 0, 0.78, 0, 0, 0, Math.PI / 2); }
  return g;
}
function buildHunterModel(av) {
  const g = new THREE.Group();
  const col = av.color || HUNTER_COLORS[0];
  const add = (geo, color, x, y, z, rx = 0, ry = 0, rz = 0, rough = 0.6, metal = 0) => { const m = new THREE.Mesh(geo, cm(color, rough, metal)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.36, 0.9, 8, 20), col, 0, 0.81, 0);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.15, 12, 8), shade(col, -0.18), s * 0.17, 0.08, 0.06).scale.set(1, 0.6, 1.3);
  const v = av.visor || 'visor';
  if (v === 'visor') add(new THREE.BoxGeometry(0.5, 0.16, 0.2), '#111318', 0, 1.25, 0.3, 0, 0, 0, 0.15, 0.6);
  else if (v === 'shades') { for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.2, 0.11, 0.05), '#0d0d10', s * 0.13, 1.27, 0.35, 0, 0, 0, 0.1, 0.5); add(new THREE.BoxGeometry(0.1, 0.03, 0.04), '#0d0d10', 0, 1.29, 0.36); }
  else if (v === 'goggles') { add(new THREE.TorusGeometry(0.36, 0.03, 8, 24), '#2b2b2b', 0, 1.27, 0, Math.PI / 2, 0, 0); for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16), '#a9e4ff', s * 0.13, 1.27, 0.34, Math.PI / 2, 0, 0, 0.1, 0.3); }
  else { for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.05, 10, 8), '#111', s * 0.12, 1.28, 0.33); }
  const h = av.hat || 'cap';
  if (h === 'cap') { add(new THREE.CylinderGeometry(0.33, 0.37, 0.16, 20), '#20242c', 0, 1.62, 0); add(new THREE.BoxGeometry(0.4, 0.04, 0.25), '#20242c', 0, 1.56, 0.36); }
  else if (h === 'tophat') { add(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 24), '#151518', 0, 1.6, 0); add(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 24), '#151518', 0, 1.86, 0); add(new THREE.CylinderGeometry(0.255, 0.255, 0.07, 24), '#b8323d', 0, 1.66, 0); }
  else if (h === 'cowboy') { add(new THREE.CylinderGeometry(0.55, 0.55, 0.03, 28), '#8a5a2b', 0, 1.6, 0).scale.set(1, 1, 0.85); add(new THREE.CylinderGeometry(0.24, 0.3, 0.3, 20), '#8a5a2b', 0, 1.76, 0); }
  else if (h === 'beanie') { add(new THREE.SphereGeometry(0.37, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#e8590c', 0, 1.5, 0); add(new THREE.SphereGeometry(0.08, 10, 8), '#fff', 0, 1.88, 0); }
  else if (h === 'crown') { add(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 8, 1, true), '#ffd43b', 0, 1.62, 0, 0, 0, 0, 0.3, 0.8).material.side = THREE.DoubleSide; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(new THREE.ConeGeometry(0.05, 0.12, 6), '#ffd43b', Math.cos(a) * 0.29, 1.77, Math.sin(a) * 0.29, 0, 0, 0, 0.3, 0.8); } }
  else if (h === 'bunny') { for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.07, 0.38, 4, 10), '#ffffff', s * 0.14, 1.85, 0, 0, 0, s * -0.15); }
  else if (h === 'chef') { add(new THREE.CylinderGeometry(0.3, 0.28, 0.3, 20), '#ffffff', 0, 1.68, 0); add(new THREE.SphereGeometry(0.34, 20, 12), '#ffffff', 0, 1.9, 0).scale.set(1, 0.6, 1); }
  const tool = buildTool(av.tool || 'hammer');
  tool.position.set(0.42, 0.75, 0.1); tool.rotation.x = 0.3; g.add(tool);
  return { group: g, tool };
}

/* ---------- profile ---------- */
const DEFAULT_PROFILE = { name: 'Player' + Math.floor(Math.random() * 900 + 100), tag: TAG_COLORS[0], cham: { shape: 'blob', eyes: 'dots' }, hunter: { color: HUNTER_COLORS[0], hat: 'cap', visor: 'visor', tool: 'hammer' } };
const PROFILE = (() => {
  const p = JSON.parse(localStorage.getItem('mc_profile') || 'null');
  return p ? { ...DEFAULT_PROFILE, ...p, cham: { ...DEFAULT_PROFILE.cham, ...(p.cham || {}) }, hunter: { ...DEFAULT_PROFILE.hunter, ...(p.hunter || {}) } } : DEFAULT_PROFILE;
})();
function saveProfile() { localStorage.setItem('mc_profile', JSON.stringify(PROFILE)); }
saveProfile();
function randomHunterAvatar(i) { return { color: HUNTER_COLORS[i % HUNTER_COLORS.length], hat: Object.keys(HATS)[i % 7], visor: Object.keys(VISORS)[i % 3], tool: Object.keys(TOOLS)[i % 6] }; }

/* ---------- avatar preview (separate renderer) ---------- */
const Preview = (() => {
  let r = null, sc, cam, obj = null, cham = null, spin = 0, running = false;
  function ensure() {
    if (r) return;
    const canvas = $('#previewCanvas');
    r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.9));
    const d = new THREE.DirectionalLight(0xffffff, 0.7); d.position.set(2, 4, 3); sc.add(d);
    const fl = new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), new THREE.MeshStandardMaterial({ color: 0x2a3142, roughness: 1 })); fl.rotation.x = -Math.PI / 2; sc.add(fl);
    cam = new THREE.PerspectiveCamera(32, 1, 0.1, 20); cam.position.set(0, 1.25, 4.6); cam.lookAt(0, 0.85, 0);
  }
  function clear() { if (obj) { sc.remove(obj); obj = null; } if (cham) { cham.tex.dispose(); cham.mat.dispose(); cham = null; } }
  function showCham(shape, eyes) {
    ensure(); clear();
    const c = document.createElement('canvas'); c.width = c.height = TS; const g = c.getContext('2d');
    g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, TS, TS); drawFace(g, shape, eyes);
    const tex = new THREE.CanvasTexture(c), mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const m = new THREE.Mesh(GEO[shape], mat); m.position.y = -GEO_BB[shape].min.y;
    obj = new THREE.Group(); obj.add(m); sc.add(obj); cham = { tex, mat };
  }
  function showHunter(av) { ensure(); clear(); obj = buildHunterModel(av).group; sc.add(obj); }
  function loop() {
    if (!running) return;
    const cv = $('#previewCanvas'), w = cv.clientWidth, h = cv.clientHeight;
    if (w && (cv.width !== w * r.getPixelRatio() || cv.height !== h * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    spin += 0.012; if (obj) obj.rotation.y = Math.sin(spin) * 0.9;
    r.render(sc, cam); requestAnimationFrame(loop);
  }
  return { showCham, showHunter, start() { ensure(); if (!running) { running = true; loop(); } }, stop() { running = false; } };
})();
