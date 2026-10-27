'use strict';
/* Meccha Chameleon: game logic (sessions, actors, AI, sync), input, painting, HUD. */

/* ================= sound ================= */
const Sound = (() => {
  let ac = null, master = null;
  const init = () => {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = SETTINGS.vol; master.connect(ac.destination);
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
    setVolume(v) { if (master) master.gain.value = v; },
    listener(cam) {
      if (!ac) return;
      const l = ac.listener, p = cam.position;
      const f = new V3(0, 0, -1).applyQuaternion(cam.quaternion), u = new V3(0, 1, 0).applyQuaternion(cam.quaternion);
      if (l.positionX) { l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z; l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z; }
      else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    },
    whistle(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); osc('sine', 1250, 2100, t, 0.2, 0.32, d); osc('sine', 2100, 1150, t + 0.22, 0.32, 0.32, d); },
    bonk(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); osc('triangle', 240, 70, t, 0.25, 0.5, d); noise(t, 0.1, 0.5, 900, d); },
    thud() { if (!ok()) return; osc('sine', 140, 60, ac.currentTime, 0.12, 0.25, master); },
    swoosh(pos) { if (!ok()) return; noise(ac.currentTime, 0.18, 0.25, 600, out(pos)); },
    pop(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); noise(t, 0.35, 0.7, 1800, d); osc('sine', 500, 1500, t, 0.18, 0.3, d); },
    horn() { if (!ok()) return; const t = ac.currentTime; [196, 247, 294].forEach((f, i) => osc('sawtooth', f, f, t + i * 0.03, 0.7, 0.09, master)); },
    tick() { if (!ok()) return; osc('square', 1100, null, ac.currentTime, 0.04, 0.05, master); },
    click() { if (!ok()) return; osc('sine', 720, null, ac.currentTime, 0.05, 0.08, master); },
    splat() { if (!ok()) return; noise(ac.currentTime, 0.05, 0.12, 2800, master); },
    alert(pos) { if (!ok()) return; osc('square', 700, 1400, ac.currentTime, 0.14, 0.12, out(pos)); },
    chat() { if (!ok()) return; osc('sine', 880, 1320, ac.currentTime, 0.08, 0.08, master); },
    win() { if (!ok()) return; const t = ac.currentTime; [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, null, t + i * 0.12, 0.3, 0.2, master)); },
    lose() { if (!ok()) return; const t = ac.currentTime; [392, 330, 262].forEach((f, i) => osc('triangle', f, null, t + i * 0.16, 0.35, 0.2, master)); },
  };
})();

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

/* ================= AI camouflage & spots ================= */
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
  const S = SKILLS[skillKey] || SKILLS.medium;
  ch.root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(ch.mesh), c = bb.getCenter(new V3());
  const near = envNear(c, 10);
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
  const vc = new THREE.PerspectiveCamera(50, 1, 0.05, 60), ndc = new THREE.Vector2();
  for (const vp of chosen) {
    const low = ch.pose === 'lie' || ch.pose === 'curl';
    const V = c.clone().addScaledVector(vp.d, Math.max(1.5, Math.min(vp.free - 0.4, low ? 3 : 4.5)));
    V.y = Math.max(1.6, c.y + 0.6);
    vc.position.copy(V); vc.lookAt(c); vc.updateMatrixWorld(); vc.updateProjectionMatrix();
    const r = ndcRect(bb, vc); if (!r) continue;
    const [gx, gy] = S.grid;
    for (let i = 0; i < gx; i++) for (let j = 0; j < gy; j++) {
      ndc.set(lerp(r.x0, r.x1, (i + 0.5) / gx), lerp(r.y0, r.y1, (j + 0.5) / gy));
      rcBody.setFromCamera(ndc, vc); rcBody.far = 80;
      const h1 = rcBody.intersectObject(ch.mesh, false)[0]; if (!h1) continue;
      const h2 = envHit(h1.point.clone().addScaledVector(rcBody.ray.direction, 0.01), rcBody.ray.direction, 10, near); if (!h2) continue;
      const col = surfaceColor(h2), nz = S.noise;
      ch.paintDot(h1.uv, [col[0] + rand(-nz, nz), col[1] + rand(-nz, nz), col[2] + rand(-nz, nz)], S.dot);
      if (vp === chosen[chosen.length - 1] && i === gx >> 1 && j === gy >> 1) rough = h2.object.material.roughness ?? 0.85;
    }
  }
  if (Math.random() < S.miss) {
    const g = ch.ctx; g.fillStyle = '#f2f2ee';
    g.beginPath(); g.ellipse(rand(0.1, 0.9) * TS, (1 - rand(0.45, 0.9)) * TS, rand(8, 14), rand(10, 18), rand(0, 3), 0, 7); g.fill();
  }
  ch.mat.roughness = rough;
  ch.flush(); ch.tex.needsUpdate = true;
}
function snapToWall(P, maxDist = 1.4) {
  const c = P.center(); let best = null;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, h = envHit(c, new V3(Math.sin(a), 0, Math.cos(a)), maxDist);
    if (h && h.face && (!best || h.distance < best.distance)) best = h;
  }
  if (!best) return false;
  const n = best.face.normal.clone().transformDirection(best.object.matrixWorld); n.y = 0;
  if (n.lengthSq() < 0.1) return false; n.normalize();
  const depth = (GEO_BB[P.shape].max.z - GEO_BB[P.shape].min.z) / 2 * POSES.flat.sz * SIZES[P.size][0];
  P.root.position.x = best.point.x + n.x * (depth + 0.02);
  P.root.position.z = best.point.z + n.z * (depth + 0.02);
  P.setYaw(Math.atan2(n.x, n.z));
  return true;
}
function findSpot(ch, taken) {
  const zones = ZONES.filter((z) => !z.hunters), hs = MAP.hunterSpawns;
  for (let tries = 0; tries < 500; tries++) {
    const zn = pick(zones), roll = Math.random();
    let s = null;
    if (roll < 0.55) {
      const x = rand(zn.x0 + 0.5, zn.x1 - 0.5), z = rand(zn.z0 + 0.5, zn.z1 - 0.5);
      if (!freeAt(x, z, 0.3, 1.5)) continue;
      ch.root.position.set(x, 0, z); ch.setPose('flat');
      if (!snapToWall(ch, 2.5)) continue;
      s = { x: ch.root.position.x, y: 0, z: ch.root.position.z, yaw: ch.yaw, pose: 'flat' };
      if (!freeAt(s.x, s.z, 0.16, 1.4)) continue;
    } else if (roll < 0.8) {
      const ts = tops.filter((t) => t.zone === zn.id && t.w > 0.7 && t.d > 0.5);
      if (!ts.length) continue;
      const t = pick(ts), long = Math.max(t.w, t.d) > 1.6;
      s = { x: t.x + rand(-1, 1) * Math.max(0, t.w / 2 - (long && t.w > t.d ? 0.8 : 0.4)), y: t.y, z: t.z + rand(-1, 1) * Math.max(0, t.d / 2 - (long && t.d >= t.w ? 0.8 : 0.35)), yaw: long ? (t.w > t.d ? Math.PI / 2 : 0) + (Math.random() < 0.5 ? Math.PI : 0) : rand(0, 6.28), pose: long ? 'lie' : 'curl' };
      if (!freeAt(s.x, s.z, 0.3, 0.9, t.y + 0.01)) continue;
    } else if (roll < 0.93) {
      s = { x: rand(zn.x0 + 0.9, zn.x1 - 0.9), y: 0, z: rand(zn.z0 + 0.9, zn.z1 - 0.9), yaw: rand(0, 6.28), pose: 'lie' };
      if (!freeAt(s.x, s.z, 0.6, 1.2)) continue;
    } else {
      const sp = (MAP.specials || []).filter((p) => p.zone === zn.id);
      if (!sp.length) continue;
      s = { ...pick(sp), yaw: rand(0, 6.28) };
    }
    if (taken.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < 3)) continue;
    if (hs.some(([hx, hz]) => Math.hypot(hx - s.x, hz - s.z) < 4)) continue;
    if (zoneAt(s.x, s.z)?.hunters) continue;
    return s;
  }
  const [px, pz] = MAP.playerSpawn;
  return { x: px + rand(-3, 3), y: 0, z: pz + rand(-3, 3), yaw: 0, pose: 'curl' };
}

/* ================= hunters ================= */
const VW = 128, VH = 96;
const visRT = new THREE.WebGLRenderTarget(VW, VH);
const visCam = new THREE.PerspectiveCamera(78, VW / VH, 0.1, 30);
const bufA = new Uint8Array(VW * VH * 4), bufB = new Uint8Array(VW * VH * 4);

class Hunter {
  constructor({ id, name, avatar, ai = false, local = false, x = 0, z = 0 }) {
    this.id = id; this.name = name; this.avatar = avatar; this.ai = ai; this.local = local; this.color = avatar.color;
    this.pos = new V3(x, 0, z); this.yaw = 0; this.look = 0; this.pitch = -0.15;
    this.state = 'wait'; this.path = []; this.sus = new Map(); this.focus = null;
    this.lookT = 0.12 + Math.random() * 0.2; this.scanT = 0; this.stuckT = 0; this.repathT = 0; this.swing = 0; this.confused = 0; this.t = Math.random() * 10; this.markT = 0;
    this.body = { pos: this.pos, r: 0.3, h: 1.8, vy: 0 };
    this.visited = {}; this.target = null;
    const { group, tool } = buildHunterModel(avatar);
    this.group = group; this.tool = tool;
    this.mark = textSprite('?', '#ffcc4d', '#2b2000', 0.5); this.mark.position.y = 2.35; this.mark.visible = false; group.add(this.mark);
    this.markBang = textSprite('!', '#ff5d6c', '#ffffff', 0.55); this.markBang.position.y = 2.35; this.markBang.visible = false; group.add(this.markBang);
    this.nameTag = textSprite(name, 'rgba(15,18,26,.75)', '#ffffff', 0.26); this.nameTag.position.y = 2.05; this.nameTag.visible = !ai; group.add(this.nameTag);
    scene.add(group); this.sync();
  }
  sync() { this.group.position.copy(this.pos); this.group.rotation.y = this.yaw; }
  dispose() { scene.remove(this.group); }
  eye() { return new V3(this.pos.x, this.pos.y + 1.55, this.pos.z); }
  doSwing() { this.swing = 0.35; }
  animTool(dt) {
    if (this.swing > 0) { this.swing -= dt; this.tool.rotation.x = 0.3 - Math.sin((1 - this.swing / 0.35) * Math.PI) * 1.8; }
    else this.tool.rotation.x = 0.3;
    if (this.markT > 0) this.markT -= dt;
  }
  puppet(dt) {
    this.animTool(dt);
    if (this.target) {
      const k = Math.min(1, dt * 12);
      this.pos.x = lerp(this.pos.x, this.target.x, k); this.pos.z = lerp(this.pos.z, this.target.z, k); this.pos.y = lerp(this.pos.y, this.target.y || 0, k);
      this.yaw += angDiff(this.yaw, this.target.yaw) * k;
    }
    if (this.ai) { this.mark.visible = this.state === 'investigate' || this.markT > 0; this.markBang.visible = this.state === 'chase'; }
    this.sync();
  }
  goTo(x, z) { this.path = route(this.pos.x, this.pos.z, x, z); }
  pickGoal() {
    const zones = ZONES.filter((z) => !z.hunters);
    const zs = zones.slice().sort((a, b) => ((this.visited[a.id] ?? -99) + rand(0, 25)) - ((this.visited[b.id] ?? -99) + rand(0, 25)));
    const zn = zs[0], p = pick(zn.pts);
    this.goTo(p[0] + rand(-0.4, 0.4), p[1] + rand(-0.4, 0.4));
    this.visited[zn.id] = G.t; this.state = 'patrol';
  }
  moveToward(x, z, speed, dt) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    const step = Math.min(d, speed * dt);
    this.pos.x += dx / d * step; this.pos.z += dz / d * step;
    collideBody(this.body, dt, false);
    let ground = 0; for (const c of colliders) if (c.max.y <= this.pos.y + STEP && c.max.y > ground && overlapsXZ(this.pos, 0.18, c)) ground = c.max.y;
    this.pos.y = lerp(this.pos.y, ground, Math.min(1, dt * 10));
    this.yaw += angDiff(this.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
    return d;
  }
  hear(p) {
    if (this.state === 'chase' || this.state === 'wait') return;
    this.goTo(p.x + rand(-2.5, 2.5), p.z + rand(-2.5, 2.5));
    this.state = 'patrol'; this.markT = 1.2;
  }
  update(dt, targets) {
    this.t += dt;
    this.animTool(dt);
    if (this.state === 'wait') { this.look = this.yaw; this.sync(); return; }
    if (this.confused > 0) { this.confused -= dt; this.look = this.yaw + Math.sin(this.t * 7) * 0.8; this.sync(); return; }
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
      if (d < 1.35 && Math.abs(tp.y - this.pos.y) < 2.2 && this.swing <= 0) { this.doSwing(); G.hostTag(this.focus.id, this.id); this.sus.delete(this.focus); this.focus = null; this.state = 'scan'; this.scanT = 1.5; }
    } else if (this.state === 'investigate') {
      const c = this.focus.center(), tp = this.focus.root.position, d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
      if (d > 2.4) { this.repathT -= dt; if (this.repathT <= 0) { this.goTo(tp.x, tp.z); this.repathT = 1; } this.follow(dt, D.huntSpeed * 0.55, 2.4); }
      this.faceTo(c, dt);
      if ((this.sus.get(this.focus) || 0) < 0.15) { this.focus = null; this.pickGoal(); }
    } else if (this.state === 'patrol') {
      if (!this.path.length) { this.state = 'scan'; this.scanT = rand(1.6, 3.2); } else this.follow(dt, D.huntSpeed);
      this.look = this.yaw + Math.sin(this.t * 1.3 + this.id.length) * 0.6; this.pitch = -0.18 + Math.sin(this.t * 0.8) * 0.12;
    } else if (this.state === 'scan') {
      this.scanT -= dt; this.look = this.yaw + Math.sin(this.t * 1.7) * 1.2; this.pitch = -0.25 + Math.sin(this.t * 1.1) * 0.2;
      if (this.scanT <= 0) this.pickGoal();
    }
    if (this.state === 'patrol' || this.state === 'chase') {
      this.stuckT = this.pos.distanceTo(this.lastP || this.pos) < 0.6 * dt ? this.stuckT + dt : 0;
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
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, want = Math.atan2(dx, dz);
    this.look += angDiff(this.look, want) * Math.min(1, dt * 6);
    this.pitch = lerp(this.pitch, Math.atan2(p.y - (this.pos.y + 1.55), Math.hypot(dx, dz)), Math.min(1, dt * 5));
    if (this.state !== 'patrol') this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 4);
  }
  perceive(targets, dt) {
    visCam.position.copy(this.eye()); visCam.rotation.set(this.pitch, this.look + Math.PI, 0, 'YXZ'); visCam.updateMatrixWorld();
    const cand = [];
    for (const t of targets) {
      if (t.root.position.distanceTo(this.pos) > 18) continue;
      const r = ndcRect(new THREE.Box3().setFromObject(t.mesh), visCam);
      if (!r || r.x1 < -1 || r.x0 > 1 || r.y1 < -1 || r.y0 > 1) continue;
      cand.push([t, r]);
    }
    const seen = new Set();
    if (cand.length) {
      const hiddenH = []; for (const h of G.hunters) if (h.group.visible) { h.group.visible = false; hiddenH.push(h); }
      renderer.setRenderTarget(visRT);
      renderer.render(scene, visCam); renderer.readRenderTargetPixels(visRT, 0, 0, VW, VH, bufA);
      const hid = []; for (const c of G.hiders) if (c.root.visible) { c.root.visible = false; hid.push(c); }
      renderer.render(scene, visCam); renderer.readRenderTargetPixels(visRT, 0, 0, VW, VH, bufB);
      for (const c of hid) c.root.visible = true; for (const h of hiddenH) h.group.visible = true;
      renderer.setRenderTarget(null);
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
        this.sus.set(t, (this.sus.get(t) || 0) + gain);
      }
    }
    for (const [t, v] of this.sus) if (!seen.has(t)) this.sus.set(t, Math.max(0, v - 0.1 * dt));
  }
}

/* ================= game / session ================= */
const DIFF = {
  easy: { name: 'Easy', hunters: 2, K: 1 / 110, motion: 1.0, huntSpeed: 2.3, prep: 75, hunt: 150, aiHiders: 3, seekSkill: 'sloppy', seekCount: 4, seekTime: 240, hiderSkill: 'sloppy' },
  normal: { name: 'Normal', hunters: 2, K: 1 / 60, motion: 1.8, huntSpeed: 2.7, prep: 60, hunt: 180, aiHiders: 3, seekSkill: 'medium', seekCount: 5, seekTime: 240, hiderSkill: 'medium' },
  hard: { name: 'Hard', hunters: 3, K: 1 / 36, motion: 2.8, huntSpeed: 3.0, prep: 50, hunt: 180, aiHiders: 4, seekSkill: 'good', seekCount: 6, seekTime: 240, hiderSkill: 'good' },
};

const G = {
  phase: 'menu', t: 0, timer: 0, D: DIFF.normal, P: null,
  online: false, isHost: true, myId: 'me',
  hiders: [], hunters: [], my: null, myHunter: null, fp: null,
  view: 'third', paint: false, paused: false,
  ctrl: { yaw: 0, pitch: 0.35, dist: 3.4 }, paintCam: { yaw: 0, pitch: 0.2, dist: 2.6 },
  stats: {}, tauntT: 0, forcedT: 0, cloneLeft: 2, ink: 100, specIdx: 0, fx: [], labels: [],
  solo: { kind: 'hide', map: 'mansion', diff: 'normal' }, party: null,
  lobby: { players: new Map(), settings: { map: 'mansion', mode: 'classic', hunters: 1, aiHunters: 1, aiHiders: 2, prep: 60, hunt: 180, diff: 'normal' }, chat: [], inGame: false },
  sendT: 0, texT: 0, aiSendT: 0, timerSendT: 0,

  findCham(id) { return this.hiders.find((c) => c.id === id); },
  findHunter(id) { return this.hunters.find((h) => h.id === id); },
  targets() { return this.hiders.filter((c) => !c.caught && c.root.visible); },
  realHiders() { return this.hiders.filter((c) => !c.isClone); },

  clearRound() {
    for (const c of this.hiders) c.dispose();
    for (const h of this.hunters) h.dispose();
    for (const f of this.fx) scene.remove(f.m);
    for (const l of this.labels) scene.remove(l.s);
    this.hiders = []; this.hunters = []; this.fx = []; this.labels = []; this.my = null; this.myHunter = null; this.fp = null;
    this.paint = false; this.cloneLeft = 2; this.ink = 100; this.reveal = null; this.revealList = null; this.playerSus = 0;
    this.stats = { taunts: 0, clonesFooled: 0, maxSus: 0, start: 0 };
    if (MAP) setGate(true);
    UI.paintPanel(false); toolVM.visible = false; UI.blind(false);
  },

  /* ---------- round setup (shared by solo, party and online) ---------- */
  async buildPayload(players, cfg) {
    UI.loading(true, 'Loading ' + (MAPS[cfg.map]?.name || 'map') + '…');
    await nextFrame();
    if (!MAP || MAP.id !== cfg.map) loadMap(cfg.map);
    await nextFrame();
    const D = DIFF[cfg.diff] || DIFF.normal;
    const aiHiders = [], taken = [{ x: MAP.playerSpawn[0], z: MAP.playerSpawn[1] }];
    const names = NAMES.slice().sort(() => Math.random() - 0.5);
    if (cfg.aiHiders) UI.loading(true, 'Chameleons are painting…');
    for (let i = 0; i < cfg.aiHiders; i++) {
      await nextFrame();
      const c = new Cham({ id: 'aih' + i + uid(), name: names[i % names.length], shape: pick(Object.keys(SHAPES)), eyes: pick(Object.keys(EYES)), color: TAG_COLORS[(i + 3) % TAG_COLORS.length] });
      if (Math.random() < 0.2) c.setSize('petite');
      const s = findSpot(c, taken); taken.push(s);
      c.root.position.set(s.x, s.y, s.z); c.setYaw(s.yaw); c.setPose(s.pose);
      if (s.pose === 'flat') snapToWall(c, 1.2);
      autoCamo(c, cfg.skill || D.hiderSkill);
      const p = c.root.position;
      aiHiders.push({ id: c.id, name: c.name, shape: c.shape, size: c.size, pose: c.pose, x: p.x, y: p.y, z: p.z, yaw: c.yaw, rough: c.mat.roughness, color: c.color, tex: c.texURL() });
      c.dispose();
    }
    const aiHunters = [];
    for (let i = 0; i < cfg.aiHunters; i++) aiHunters.push({ id: 'aiH' + i + uid(), name: `Hunter ${i + 1}`, avatar: randomHunterAvatar(i) });
    return { map: cfg.map, mode: cfg.mode || 'classic', cfg, players, aiHiders, aiHunters };
  },
  async setupRound(P) {
    UI.loading(true, 'Loading ' + (MAPS[P.map]?.name || 'map') + '…');
    await nextFrame();
    this.clearRound();
    if (!MAP || MAP.id !== P.map) loadMap(P.map);
    this.P = P; this.D = DIFF[P.cfg.diff] || DIFF.normal;
    for (const a of P.aiHiders) {
      const c = new Cham({ id: a.id, name: a.name, shape: a.shape, color: a.color });
      c.setSize(a.size); c.setYaw(a.yaw); c.setPose(a.pose);
      c.root.position.set(a.x, a.y, a.z);
      c.mat.roughness = a.rough; c.loadTex(a.tex);
      this.hiders.push(c);
    }
    const hs = MAP.hunterSpawns; let hi = 0, ci = 0;
    for (const p of P.players) {
      const local = p.id === this.myId, prof = p.profile || PROFILE;
      if (p.role === 'hider') {
        const c = new Cham({ id: p.id, name: p.name, ownerId: p.id, local, human: true, color: prof.tag, shape: prof.cham?.shape, eyes: prof.cham?.eyes });
        const a = ci++ * 2.4, r = ci > 1 ? 1.4 : 0;
        c.root.position.set(MAP.playerSpawn[0] + Math.cos(a) * r, 0, MAP.playerSpawn[1] + Math.sin(a) * r);
        c.setYaw(Math.PI); if (local) this.my = c;
        if (P.partyHidden) c.root.visible = false;
        this.hiders.push(c);
      } else if (p.role === 'hunter') {
        const [x, z] = hs[hi++ % hs.length];
        const h = new Hunter({ id: p.id, name: p.name, avatar: prof.hunter || randomHunterAvatar(hi), ai: false, local, x, z });
        if (local) { this.myHunter = h; h.group.visible = false; this.fp = { pos: new V3(x, 0, z), vy: 0, onGround: true, r: 0.3, h: 1.75, yaw: Math.PI, pitch: 0 }; }
        this.hunters.push(h);
      }
    }
    for (const a of P.aiHunters) { const [x, z] = hs[hi++ % hs.length]; const h = new Hunter({ ...a, ai: true, x, z }); h.yaw = h.look = Math.atan2(MAP.playerSpawn[0] - x, MAP.playerSpawn[1] - z) + Math.PI; h.sync(); this.hunters.push(h); }
    this.view = this.my ? 'third' : this.fp ? 'first' : 'spec';
    this.ctrl.yaw = 0;
    toolVM.visible = false;
    if (this.fp) setToolVM(this.myHunter.avatar.tool);
    this.stats.start = 0;
    UI.loading(false); UI.screen(null);
    this.setPhase('prep', P.cfg.prep);
    UI.status();
    if (this.my) toast('Click to look around · F to paint yourself · Enter when ready', 'good');
    else if (this.fp) toast('You are a hunter. Wait for the gate…', 'warn');
    this.lock();
  },
  setPhase(p, time) {
    this.phase = p; this.timer = time;
    UI.hud(true);
    UI.blind(p === 'prep' && this.view === 'first' && !this.party);
    if (p === 'hunt') {
      setGate(false); Sound.horn();
      this.forcedT = this.P.mode === 'infection' ? 35 : 40;
      this.stats.start = this.t;
      if (this.isHost) for (const h of this.hunters) if (h.ai) h.pickGoal();
      if (this.paint) togglePaint();
      toast(this.view === 'first' ? 'Go! Find them all.' : 'The hunters are coming. Freeze!', 'warn');
    }
    UI.refreshBars();
  },

  /* ---------- solo / party ---------- */
  async startSolo() {
    Sound.init();
    this.online = false; this.isHost = true; this.myId = 'me'; this.party = null;
    const s = this.solo, D = DIFF[s.diff];
    const me = { id: 'me', name: PROFILE.name, profile: PROFILE, role: s.kind === 'seek' ? 'hunter' : 'hider' };
    const cfg = s.kind === 'seek' ? { map: s.map, diff: s.diff, mode: 'classic', prep: 6, hunt: D.seekTime, aiHunters: 0, aiHiders: D.seekCount, skill: D.seekSkill }
      : s.kind === 'infection' ? { map: s.map, diff: s.diff, mode: 'infection', prep: D.prep, hunt: D.hunt + 60, aiHunters: 1, aiHiders: D.aiHiders + 2 }
        : { map: s.map, diff: s.diff, mode: 'classic', prep: D.prep, hunt: D.hunt, aiHunters: D.hunters, aiHiders: D.aiHiders };
    const P = await this.buildPayload([me], cfg);
    await this.setupRound(P);
  },
  async startParty(humans, ai, map, diff) {
    Sound.init();
    this.online = false; this.isHost = true; this.myId = 'me';
    const D = DIFF[diff];
    const players = [];
    for (let i = 0; i < humans; i++) players.push({ id: 'pp' + i, name: `Player ${i + 1}`, role: 'hider', profile: { ...PROFILE, tag: TAG_COLORS[i], cham: { shape: Object.keys(SHAPES)[i % 6], eyes: Object.keys(EYES)[i % 7] } } });
    players.push({ id: 'me', name: 'Seeker', role: 'none', profile: PROFILE });
    const P = await this.buildPayload(players, { map, diff, mode: 'classic', prep: D.prep + 15, hunt: D.seekTime, aiHunters: 0, aiHiders: ai, skill: D.seekSkill });
    P.partyHidden = true;
    this.party = { order: [], idx: 0 };
    await this.setupRound(P);
    this.party.order = this.hiders.filter((c) => c.human);
    this.handoff();
  },
  handoff() {
    const P = this.party;
    this.phase = 'handoff'; UI.hud(false); UI.blind(false);
    if (document.pointerLockElement) document.exitPointerLock();
    if (P.idx < P.order.length) UI.hand(`${P.order[P.idx].name}: your turn to hide`, `Everyone else look away. You get ${this.P.cfg.prep} seconds to paint and pose.`);
    else UI.hand('Seeker time!', 'Whoever is hunting takes the mouse now. Find every chameleon before time runs out.');
  },
  handGo() {
    UI.screen(null);
    const P = this.party;
    if (P.idx < P.order.length) {
      const c = this.my = P.order[P.idx]; c.local = true;
      c.root.visible = true; c.root.position.set(MAP.playerSpawn[0], 0, MAP.playerSpawn[1]); c.setYaw(Math.PI);
      this.view = 'third'; this.ctrl.yaw = 0;
      this.setPhase('prep', this.P.cfg.prep);
    } else {
      if (this.my) this.my.local = false;
      this.my = null;
      const [x, z] = MAP.hunterSpawns[0];
      const h = new Hunter({ id: 'me', name: 'Seeker', avatar: PROFILE.hunter, ai: false, local: true, x, z }); h.group.visible = false;
      this.hunters.push(h); this.myHunter = h;
      this.fp = { pos: new V3(x, 0, z), vy: 0, onGround: true, r: 0.3, h: 1.75, yaw: Math.PI, pitch: 0 };
      setToolVM(PROFILE.hunter.tool);
      this.view = 'first';
      this.setPhase('prep', 5);
    }
    this.lock();
  },
  finishPrep() {
    if (this.party && this.party.idx < this.party.order.length && this.view === 'third') {
      if (this.paint) togglePaint();
      if (this.my) this.my.local = false;
      this.party.idx++; this.handoff(); return;
    }
    if (!this.isHost) return;
    this.emit({ e: 'phase', phase: 'hunt', timer: this.P.cfg.hunt });
  },

  /* ---------- events (host-authoritative) ---------- */
  emit(ev) { if (this.online) Net.relay({ k: 'ev', ev }); this.applyEvent(ev); },
  hostTag(targetId, byId) {
    if (!this.isHost || this.phase !== 'hunt') return;
    const t = this.findCham(targetId), by = this.findHunter(byId);
    if (!t || t.caught) return;
    if (by && !by.ai && Math.hypot(by.pos.x - t.root.position.x, by.pos.z - t.root.position.z) > 4.5) return;
    if (t.isClone) { this.emit({ e: 'clonehit', id: t.id, by: byId }); return; }
    this.emit({ e: 'caught', id: t.id, by: byId, at: this.t - this.stats.start });
    if (this.P.mode === 'infection') {
      const p = t.root.position;
      if (t.human) this.emit({ e: 'convert', pid: t.id, x: p.x, z: p.z });
      else this.emit({ e: 'aihunter', id: 'aiH' + uid(), name: t.name, avatar: randomHunterAvatar(this.hunters.length), x: p.x, z: p.z });
    }
    const left = this.realHiders().filter((c) => !c.caught).length;
    if (left === 0) setTimeout(() => this.hostEnd(), 900);
  },
  requestTag(targetId) {
    const by = this.myHunter ? this.myHunter.id : null;
    if (this.isHost) this.hostTag(targetId, by);
    else Net.to(Net.hostId, { k: 'tag', target: targetId, by });
  },
  hostEnd() {
    if (!this.isHost || this.phase === 'end') return;
    const list = this.realHiders().map((c) => ({ id: c.id, name: c.name, ok: !c.caught, at: c.caughtAt ?? null, human: c.human }));
    this.emit({ e: 'end', list, winner: list.some((x) => x.ok) ? 'hiders' : 'hunters' });
  },
  applyEvent(ev) {
    switch (ev.e) {
      case 'phase': this.setPhase(ev.phase, ev.timer); break;
      case 'caught': {
        const c = this.findCham(ev.id); if (!c || c.caught) break;
        c.caught = true; c.caughtAt = ev.at; burst(c); Sound.pop(c.center()); c.root.visible = false;
        const by = this.findHunter(ev.by);
        floatLabel(`${c.name} found!`, c.center(), '#ff5d6c', '#fff');
        for (const h of this.hunters) h.sus.delete(c);
        if (by) by.doSwing();
        if (c === this.my) {
          if (this.P.mode !== 'infection') { toast(`${by ? by.name : 'A hunter'} found you!`, 'bad'); Sound.lose(); this.view = 'spec'; this.specIdx = 0; if (this.paint) togglePaint(); }
        } else toast(by?.local ? `You found ${c.name}!` : `${by ? by.name : 'A hunter'} found ${c.name}`, by?.local ? 'good' : 'bad');
        UI.status(); break;
      }
      case 'clonehit': {
        const c = this.findCham(ev.id); if (!c || c.caught) break;
        c.caught = true; burst(c); Sound.pop(c.center()); c.root.visible = false;
        const by = this.findHunter(ev.by);
        if (by) { by.doSwing(); if (by.ai) { by.confused = 2.2; by.state = 'scan'; by.scanT = 1; by.focus = null; } }
        for (const h of this.hunters) h.sus.delete(c);
        toast(`${by ? by.name : 'A hunter'} bonked a clone!`, 'good');
        if (c.ownerId === this.myId) this.stats.clonesFooled++;
        break;
      }
      case 'convert': {
        const prof = this.playerProfile(ev.pid);
        const h = new Hunter({ id: ev.pid + '_h', name: prof.name, avatar: prof.profile?.hunter || randomHunterAvatar(3), ai: false, local: ev.pid === this.myId, x: ev.x, z: ev.z });
        this.hunters.push(h);
        if (ev.pid === this.myId) {
          this.myHunter = h; h.group.visible = false; this.my = null;
          this.fp = { pos: new V3(ev.x, 0, ev.z), vy: 0, onGround: true, r: 0.3, h: 1.75, yaw: this.ctrl.yaw, pitch: 0 };
          setToolVM(h.avatar.tool); this.view = 'first'; if (this.paint) togglePaint();
          toast('You got infected! Now you hunt.', 'warn'); Sound.alert(null);
        } else toast(`${prof.name} joined the hunters!`, 'warn');
        break;
      }
      case 'aihunter': {
        const h = new Hunter({ id: ev.id, name: ev.name + ' (infected)', avatar: ev.avatar, ai: true, x: ev.x, z: ev.z });
        if (this.isHost) h.pickGoal();
        this.hunters.push(h); break;
      }
      case 'whistle': {
        const c = this.findCham(ev.id); if (!c || c.caught) break;
        const p = c.center(); Sound.whistle(p);
        const note = textSprite('♪', '#ffffff', '#222', 0.45); note.position.copy(p).add(new V3(0, 0.9, 0)); note.material.depthTest = true; scene.add(note);
        this.labels.push({ s: note, life: 1.6, vy: 0.5 });
        if (this.isHost) for (const h of this.hunters) if (h.ai && h.pos.distanceTo(p) < 22 && Math.random() < (ev.chance ?? 0.6)) h.hear(p);
        break;
      }
      case 'clone': {
        if (this.findCham(ev.id)) break;
        const owner = this.findCham(ev.owner); if (!owner) break;
        const c = new Cham({ id: ev.id, name: owner.name + "'s clone", ownerId: owner.ownerId, color: owner.color, shape: owner.shape });
        c.copyFrom(owner); c.isClone = true; c.setPose(ev.pose); c.root.position.set(ev.x, ev.y, ev.z); c.setYaw(ev.yaw);
        this.hiders.push(c); break;
      }
      case 'swing': { const h = this.findHunter(ev.id); if (h && !h.local) { h.doSwing(); Sound.swoosh(h.eye()); } break; }
      case 'end': this.showEnd(ev); break;
    }
  },
  playerProfile(pid) { return this.P?.players.find((x) => x.id === pid) || { name: 'Player', profile: {} }; },
  forcedTaunt() {
    const alive = this.realHiders().filter((c) => !c.caught);
    if (!alive.length) return;
    if (this.hunters.some((h) => !h.ai) || this.P.mode === 'infection') {
      const list = this.P.mode === 'infection' ? alive : [pick(alive)];
      list.forEach((c, i) => setTimeout(() => this.emit({ e: 'whistle', id: c.id, chance: 0.45 }), i * 400));
    } else alive.forEach((c, i) => setTimeout(() => this.emit({ e: 'whistle', id: c.id, chance: c.human ? 0.65 : 0.4 }), i * 450));
    toast('Forced taunt! Hiders whistle.', 'warn');
  },
  showEnd(ev) {
    this.phase = 'end'; if (this.paint) togglePaint();
    if (document.pointerLockElement) document.exitPointerLock();
    UI.blind(false); toolVM.visible = false;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const surv = ev.list.filter((x) => x.ok);
    for (const x of surv) { const c = this.findCham(x.id); if (c) floatLabel(`${c.name} was here!`, c.center(), '#3ad49c', '#06261a', 999); }
    let title, text;
    const amHider = this.P.players.find((p) => p.id === this.myId)?.role === 'hider';
    const me = ev.list.find((x) => x.id === this.myId);
    if (amHider && me) {
      const huntLen = this.P.cfg.hunt;
      const score = Math.round((me.ok ? huntLen : (me.at || 0)) * 10 + this.stats.taunts * 150 + this.stats.clonesFooled * 300);
      title = me.ok ? 'You survived!' : ev.winner === 'hiders' ? 'Caught, but your team survived' : 'The hunters win';
      text = `Score ${score} · taunts ${this.stats.taunts} · clones bonked ${this.stats.clonesFooled}` + (this.online ? '' : ` · closest call ${Math.round(clamp(this.stats.maxSus, 0, 1) * 100)}% attention`);
      (me.ok ? Sound.win : Sound.lose)();
    } else {
      const found = ev.list.length - surv.length;
      title = ev.winner === 'hunters' ? (this.myHunter ? 'You found everyone!' : 'Hunters win') : `Found ${found} of ${ev.list.length}`;
      text = ev.winner === 'hunters' ? `Cleared in ${fmt(this.t - this.stats.start)}.` : 'Hit "Show hiding spots" to see where the survivors were.';
      ((ev.winner === 'hunters') === !!this.myHunter ? Sound.win : Sound.lose)();
    }
    this.view = 'spec';
    this.revealList = surv.map((x) => this.findCham(x.id)).filter(Boolean);
    if (!this.revealList.length) this.revealList = this.realHiders();
    $('#revealBtn').textContent = surv.length ? 'Show hiding spots' : 'Replay where they hid';
    UI.end(title, text, ev.list.map((x) => ({ name: x.name, ok: x.ok, txt: x.ok ? 'survived' : `found at ${fmt(x.at ?? 0)}` })), this.online);
    if (this.online && this.isHost) Net.send({ t: 'lobby', lobby: { inGame: false } });
  },
  startReveal() {
    const list = this.revealList || [];
    if (!list.length) return;
    for (const c of list) c.root.visible = true;
    this.reveal = { list, i: 0, t: 0 };
    UI.screen(null);
  },
  updateReveal(dt) {
    const R = this.reveal, c = R.list[R.i];
    R.t += dt;
    const p = c.center();
    if (R.t <= dt) { let best = 0, bd = -1; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, h = envHit(p, new V3(Math.sin(a), 0, Math.cos(a)), 6), f = h ? h.distance : 6; if (f > bd) { bd = f; best = a; } } R.a0 = best; R.free = bd; }
    const a = R.a0 + Math.sin(R.t * 0.9) * 0.6, r = Math.min(3.2, R.free - 0.3);
    camera.position.set(p.x + Math.sin(a) * r, Math.max(1.2, p.y + 0.9), p.z + Math.cos(a) * r);
    camera.lookAt(p);
    if (R.t > 3.6) { R.i++; R.t = 0; if (R.i >= R.list.length) { this.reveal = null; for (const x of R.list) if (x.caught) x.root.visible = false; UI.screen('end'); } }
  },
  lock() { if (this.paint || this.phase === 'handoff') return; try { const p = renderer.domElement.requestPointerLock?.(); p?.catch?.(() => { }); } catch (e) { /* needs a user gesture */ } },
  toMenu() {
    if (this.online) { Net.close(); this.online = false; if (window.mcNative) mcNative.hostStop(); }
    this.clearRound(); this.phase = 'menu'; UI.hud(false); UI.screen('menu');
    if (document.pointerLockElement) document.exitPointerLock();
  },

  /* ---------- network sync ---------- */
  netTick(dt) {
    if (!this.online || !Net.connected) return;
    this.sendT -= dt; this.texT -= dt; this.aiSendT -= dt; this.timerSendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 12;
      if (this.my && !this.my.caught) {
        const c = this.my, p = c.root.position;
        Net.relay({ k: 'st', a: 'c', id: c.id, p: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)], y: +c.yaw.toFixed(3), po: c.pose, sh: c.shape, sz: c.size, r: +c.mat.roughness.toFixed(2), m: +c.mat.metalness.toFixed(2), mv: c.speed > 0.4 ? 1 : 0 });
      }
      if (this.myHunter && this.fp) {
        const p = this.fp.pos;
        Net.relay({ k: 'st', a: 'h', id: this.myHunter.id, p: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)], y: +(this.fp.yaw + Math.PI).toFixed(3) });
      }
    }
    if (this.my && this.my.texVer !== this.my.sentVer && this.texT <= 0) { this.texT = 0.6; this.my.sentVer = this.my.texVer; Net.relay({ k: 'tex', id: this.my.id, url: this.my.texURL() }); }
    if (this.isHost && this.aiSendT <= 0) {
      this.aiSendT = 0.1;
      const list = this.hunters.filter((h) => h.ai).map((h) => [h.id, +h.pos.x.toFixed(2), +h.pos.y.toFixed(2), +h.pos.z.toFixed(2), +h.yaw.toFixed(2), h.state]);
      if (list.length) Net.relay({ k: 'ai', list });
    }
    if (this.isHost && this.timerSendT <= 0) { this.timerSendT = 1; Net.relay({ k: 'timer', t: this.timer, phase: this.phase }); }
  },
  onRelay(from, d) {
    const fromHost = from === Net.hostId;
    switch (d.k) {
      case 'start': if (fromHost) this.setupRound(d.P); break;
      case 'ev': if (fromHost || ['whistle', 'clone', 'swing'].includes(d.ev.e)) this.applyEvent(d.ev); break;
      case 'tag': if (this.isHost) this.hostTag(d.target, d.by); break;
      case 'timer': if (fromHost && Math.abs(this.timer - d.t) > 0.6) this.timer = d.t; break;
      case 'ai': if (!fromHost) break; for (const [id, x, y, z, yaw, st] of d.list) { const h = this.findHunter(id); if (h) { h.target = { x, y, z, yaw }; if (h.state !== st && st === 'chase') Sound.alert(h.eye()); h.state = st; } } break;
      case 'st': {
        if (d.a === 'c') {
          const c = this.findCham(d.id); if (!c || c.local) break;
          if (c.shape !== d.sh) c.setShape(d.sh);
          if (c.size !== d.sz) c.setSize(d.sz);
          if (c.pose !== d.po) c.setPose(d.po);
          c.mat.roughness = d.r; c.mat.metalness = d.m;
          c.target = { x: d.p[0], y: d.p[1], z: d.p[2], yaw: d.y }; c.remoteMoving = d.mv;
        } else { const h = this.findHunter(d.id); if (h && !h.local) h.target = { x: d.p[0], y: d.p[1], z: d.p[2], yaw: d.y }; }
        break;
      }
      case 'tex': { const c = this.findCham(d.id); if (c && !c.local) c.loadTex(d.url); break; }
    }
  },
  async hostStartOnline() {
    const L = this.lobby, s = L.settings, ids = [...L.players.keys()];
    if (!ids.length) return;
    const nHunters = ids.length === 1 ? 0 : clamp(s.hunters, 1, ids.length - 1);
    const shuffled = ids.slice().sort(() => Math.random() - 0.5);
    const hunterIds = new Set(shuffled.slice(0, nHunters));
    const players = ids.map((id) => { const p = L.players.get(id); return { id, name: p.name, profile: p.profile, role: hunterIds.has(id) ? 'hunter' : 'hider' }; });
    const aiHunters = nHunters === 0 ? Math.max(1, s.aiHunters) : s.aiHunters;
    Net.send({ t: 'lobby', lobby: { inGame: true, map: s.map, mode: s.mode } });
    const P = await this.buildPayload(players, { map: s.map, diff: s.diff, mode: s.mode, prep: s.prep, hunt: s.hunt, aiHunters, aiHiders: s.aiHiders });
    Net.relay({ k: 'start', P });
    await this.setupRound(P);
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
    if (f.life <= 0) { scene.remove(f.m); f.m.material.dispose(); return false; }
    return true;
  });
  G.labels = G.labels.filter((l) => { l.life -= dt; l.s.position.y += l.vy * dt; if (l.life <= 0) { scene.remove(l.s); return false; } return true; });
}

/* first-person tool view model */
let toolVM = new THREE.Group(); camera.add(toolVM); toolVM.visible = false;
function setToolVM(kind) {
  camera.remove(toolVM);
  toolVM = buildTool(kind || 'hammer');
  toolVM.position.set(0.34, -0.5, -0.6); toolVM.rotation.set(0.4, 0, -0.3);
  toolVM.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.depthTest = false; o.renderOrder = 20; } o.castShadow = false; });
  camera.add(toolVM); toolVM.visible = true;
}
let swingT = 0;

/* ================= input ================= */
const keys = {};
const mouse = { x: 0, y: 0, down: false, right: false, lastUV: null };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') { if (e.code === 'Escape') e.target.blur(); return; }
  keys[e.code] = true; onKey(e);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function playing() { return G.phase === 'prep' || G.phase === 'hunt'; }
function controllable() { return G.my && !G.my.caught && G.view === 'third' && playing(); }
function onKey(e) {
  if (e.code === 'KeyT' && G.online && playing()) { e.preventDefault(); UI.openChat(); return; }
  if (!playing() || G.paused) return;
  const P = G.my;
  if (e.code === 'KeyF' && controllable()) { togglePaint(); e.preventDefault(); return; }
  if (e.code === 'Enter' && G.phase === 'prep' && (G.view === 'third' || (G.party && G.view === 'first'))) { if (G.party || !G.online || G.isHost) G.finishPrep(); return; }
  if (G.paint) {
    if (e.code === 'KeyB') UI.tool('brush'); if (e.code === 'KeyM') UI.tool('mimic'); if (e.code === 'KeyI') UI.tool('picker'); if (e.code === 'KeyG') UI.tool('fill');
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { undo(); e.preventDefault(); return; }
    if (e.code === 'Escape') togglePaint();
  }
  if (!controllable()) { if (G.view === 'spec' && /Digit[1-9]/.test(e.code)) G.specIdx = +e.code.slice(5) - 1; return; }
  const poseKeys = { Digit1: 'stand', Digit2: 'crouch', Digit3: 'curl', Digit4: 'lie', Digit5: 'flat' };
  if (poseKeys[e.code]) setPose(poseKeys[e.code]);
  if (e.code === 'KeyZ' && !e.ctrlKey) P.setYaw(P.yaw + Math.PI / 12);
  if (e.code === 'KeyX') P.setYaw(P.yaw - Math.PI / 12);
  if (e.code === 'KeyC') makeClone();
  if (e.code === 'KeyQ') taunt();
}
function setPose(p) { const P = G.my; if (!P) return; P.setPose(p); if (p === 'flat') snapToWall(P); UI.refreshBars(); }
function emitAny(ev) { if (G.online) Net.relay({ k: 'ev', ev }); G.applyEvent(ev); }
function makeClone() {
  if (G.cloneLeft <= 0) { toast('No clones left'); return; }
  const P = G.my, p = P.root.position;
  G.cloneLeft--; UI.refreshBars();
  emitAny({ e: 'clone', id: 'cl' + uid(), owner: P.id, x: p.x, y: p.y, z: p.z, yaw: P.yaw, pose: P.pose });
  toast('Clone placed. Now sneak somewhere else!', 'good'); Sound.splat();
}
function taunt() {
  if (G.phase !== 'hunt') { toast('Taunts only count during the hunt'); return; }
  if (G.tauntT > 0) return;
  G.tauntT = 6; G.stats.taunts++;
  emitAny({ e: 'whistle', id: G.my.id, chance: 0.85 });
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
  if (!locked && playing() && !G.paint && !UI.chatOpen) { G.paused = !G.online; UI.screen('pause'); }
  if (locked) { G.paused = false; if (!$('#screen-pause').classList.contains('hidden')) UI.screen(null); }
});
addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (document.pointerLockElement) {
    const s = 0.0022 * SETTINGS.sens, iy = SETTINGS.invertY ? -1 : 1;
    if (G.view === 'first' && G.fp) { G.fp.yaw -= e.movementX * s; G.fp.pitch = clamp(G.fp.pitch - e.movementY * s * iy, -1.5, 1.5); }
    else { G.ctrl.yaw -= e.movementX * s; G.ctrl.pitch = clamp(G.ctrl.pitch + e.movementY * s * iy, -0.45, 1.25); }
    return;
  }
  if (G.paint) {
    if (mouse.right) { G.paintCam.yaw -= e.movementX * 0.008; G.paintCam.pitch = clamp(G.paintCam.pitch + e.movementY * 0.006, -0.6, 1.3); }
    else if (mouse.down) paintAt(e, false);
  }
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!G.paint || !G.my) return;
  if (e.button === 2) { mouse.right = true; return; }
  if (e.button !== 0) return;
  mouse.down = true; mouse.lastUV = null;
  if (e.altKey || UI.curTool === 'picker') { pickColor(e); mouse.down = false; return; }
  if (UI.curTool === 'fill') { pushUndo(); G.my.fill(UI.color); G.my.flush(); Sound.splat(); mouse.down = false; return; }
  pushUndo(); paintAt(e, true);
});
addEventListener('pointerup', () => { mouse.down = false; mouse.right = false; mouse.lastUV = null; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('wheel', (e) => {
  if (G.paint) G.paintCam.dist = clamp(G.paintCam.dist + Math.sign(e.deltaY) * 0.25, 1.2, 7);
  else if (G.view === 'third' || G.view === 'spec') G.ctrl.dist = clamp(G.ctrl.dist + Math.sign(e.deltaY) * 0.3, 1.6, 7);
}, { passive: true });

/* ---------- painting ---------- */
const rcPaint = new THREE.Raycaster(), ndcV = new THREE.Vector2();
function evNdc(x, y) { ndcV.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); return ndcV; }
const undoStack = [];
function pushUndo() { const P = G.my; undoStack.push({ c: P, d: P.ctx.getImageData(0, 0, TS, TS) }); if (undoStack.length > 25) undoStack.shift(); }
function undo() { const u = undoStack.pop(); if (!u) return; u.c.ctx.putImageData(u.d, 0, 0); u.c.dirty = true; u.c.flush(); Sound.click(); }
function pickColor(e) {
  rcPaint.setFromCamera(evNdc(e.clientX, e.clientY), camera);
  const h = rcPaint.intersectObjects(env, false)[0]; if (!h) return;
  const c = surfaceColor(h);
  UI.setColor('#' + new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).getHexString(), true);
  if (h.object.material.roughness != null) UI.setRough(h.object.material.roughness);
  Sound.click();
}
function paintAt(e, first) {
  const P = G.my; if (!P) return;
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
  if (!G.my) return;
  G.paint = !G.paint;
  UI.paintPanel(G.paint);
  if (G.paint) { G.paintCam.yaw = G.ctrl.yaw; G.paintCam.pitch = 0.15; G.paintCam.dist = 2.6; if (document.pointerLockElement) document.exitPointerLock(); }
  else G.lock();
}

/* ---------- hunter bonk ---------- */
const rcBonk = new THREE.Raycaster();
function bonk() {
  if (swingT > 0) return;
  swingT = 0.32; Sound.swoosh(null);
  if (G.online) Net.relay({ k: 'ev', ev: { e: 'swing', id: G.myHunter.id } });
  rcBonk.setFromCamera(new THREE.Vector2(0, 0), camera); rcBonk.far = 3.3;
  const meshes = G.targets().map((c) => c.mesh);
  const h = rcBonk.intersectObjects([...env, ...meshes], false)[0];
  if (h && h.object.userData.cham) { Sound.bonk(h.point); G.requestTag(h.object.userData.cham.id); }
  else if (h) Sound.thud();
}

/* ================= update ================= */
function updateMyCham(dt) {
  const P = G.my;
  if (!P || P.caught) return;
  let moving = false;
  if (!G.paint && !UI.chatOpen) {
    let mx = 0, mz = 0;
    if (keys.KeyW) mz -= 1; if (keys.KeyS) mz += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
    moving = !!(mx || mz);
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
  P.animate(dt, moving);
}
function updateFP(dt) {
  const f = G.fp; if (!f) return;
  let mx = 0, mz = 0;
  if (!UI.chatOpen) { if (keys.KeyW) mz -= 1; if (keys.KeyS) mz += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1; }
  if (mx || mz) {
    const y = f.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    const vx = fx * -mz + rx * mx, vz = fz * -mz + rz * mx, l = Math.hypot(vx, vz);
    const sp = keys.ShiftLeft ? 2 : 4.6;
    f.pos.x += vx / l * sp * dt; f.pos.z += vz / l * sp * dt;
  }
  if (keys.Space && f.onGround && !UI.chatOpen) { f.vy = 6.4; f.onGround = false; }
  collideBody(f, dt, true);
  camera.position.set(f.pos.x, f.pos.y + 1.6, f.pos.z);
  camera.rotation.set(f.pitch, f.yaw, 0, 'YXZ');
  if (swingT > 0) swingT -= dt;
  const s = swingT > 0 ? Math.sin((1 - swingT / 0.32) * Math.PI) : 0;
  const bob = (mx || mz) && f.onGround ? Math.sin(G.t * 10) * 0.015 : 0;
  toolVM.rotation.set(0.4 - s * 1.5, 0, -0.3); toolVM.position.set(0.34, -0.5 + bob, -0.6 - s * 0.1);
  if (G.myHunter) { G.myHunter.pos.copy(f.pos); G.myHunter.yaw = f.yaw + Math.PI; G.myHunter.sync(); }
  rcBonk.setFromCamera(new THREE.Vector2(0, 0), camera); rcBonk.far = 3.3;
  UI.crossHot(!!rcBonk.intersectObjects(env, false)[0]);
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
    const hs = G.hunters.filter((h) => !h.local);
    if (hs.length) { const h = hs[G.specIdx % hs.length]; camTarget.set(h.pos.x, h.pos.y + 1.6, h.pos.z); thirdCam(camTarget, G.ctrl.yaw, G.ctrl.pitch, 4.5, dt); }
    else if (G.fp) camera.position.set(G.fp.pos.x, 1.6, G.fp.pos.z);
    return;
  }
  const P = G.my; if (!P) return;
  if (G.paint) thirdCam(P.center(), G.paintCam.yaw, G.paintCam.pitch, G.paintCam.dist, dt, true);
  else { camTarget.copy(P.root.position); camTarget.y += Math.max(0.55, P.body.h * 0.9); thirdCam(camTarget, G.ctrl.yaw, G.ctrl.pitch, G.ctrl.dist, dt, false); }
}
let lastTickSec = -1, hudT = 0, menuT = 0;
function update(dt) {
  G.t += dt;
  updateFx(dt);
  if (MAP && MAP.tick) MAP.tick(dt);
  if (G.phase === 'menu' || G.phase === 'lobby') {
    menuT += dt * 0.05;
    const B = MAP.bounds, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    camera.position.set(cx + Math.cos(menuT) * (B.x1 - B.x0) * 0.28, 2.4, cz + Math.sin(menuT) * (B.z1 - B.z0) * 0.25); camera.lookAt(cx, 1, cz);
    return;
  }
  if (G.phase === 'end') { if (G.reveal) G.updateReveal(dt); else updateCamera(dt); G.netTick(dt); return; }
  if (G.paused || !playing()) return;
  G.timer -= dt;
  if (G.tauntT > 0) G.tauntT -= dt;
  const sec = Math.ceil(G.timer);
  if (sec <= 10 && sec !== lastTickSec && sec > 0) { lastTickSec = sec; Sound.tick(); }
  if (G.view === 'first') updateFP(dt); else updateMyCham(dt);
  for (const c of G.hiders) {
    if (!c.local && c.target) {
      const k = Math.min(1, dt * 12), p = c.root.position;
      p.x = lerp(p.x, c.target.x, k); p.y = lerp(p.y, c.target.y, k); p.z = lerp(p.z, c.target.z, k);
      c.setYaw(c.yaw + angDiff(c.yaw, c.target.yaw) * k);
      c.animate(dt, !!c.remoteMoving);
    }
    c.speed = c.lastPos ? c.root.position.distanceTo(c.lastPos) / Math.max(dt, 1e-4) : 0;
    c.lastPos = (c.lastPos || new V3()).copy(c.root.position);
  }
  if (G.isHost) {
    if (G.phase === 'prep' && G.timer <= 0) G.finishPrep();
    else if (G.phase === 'hunt') {
      G.forcedT -= dt;
      if (G.forcedT <= 0) { G.forcedT = G.P.mode === 'infection' ? 35 : 40; G.forcedTaunt(); }
      const targets = G.targets();
      for (const h of G.hunters) { if (h.ai) h.update(dt, targets); else if (!h.local) h.puppet(dt); }
      if (G.timer <= 0) G.hostEnd();
    } else for (const h of G.hunters) { if (h.ai) h.update(dt, []); else if (!h.local) h.puppet(dt); }
  } else for (const h of G.hunters) if (!h.local) h.puppet(dt);
  if (G.my && G.phase === 'hunt') {
    let s = 0; for (const h of G.hunters) s = Math.max(s, h.sus.get(G.my) || 0);
    G.playerSus = s; G.stats.maxSus = Math.max(G.stats.maxSus, s);
  }
  updateCamera(dt);
  G.netTick(dt);
  hudT -= dt; if (hudT <= 0) { hudT = 0.1; UI.tick(); }
}
function step(dt) {
  update(dt);
  for (const c of G.hiders) c.flush();
  Sound.listener(camera);
  if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}
let last = performance.now();
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); requestAnimationFrame(frame); }

/* ================= UI ================= */
function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3000);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}
function seg(id, value, fn) {
  const el = $(id); if (!el) return;
  el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(value)));
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); Sound.click(); fn(b.dataset.v); };
}
function segHTML(opts) { return Object.entries(opts).map(([v, l]) => `<button data-v="${v}">${l}</button>`).join(''); }
function mapCards(el, cur, fn, disabled = false) {
  el.innerHTML = MAP_ORDER.map((id) => { const m = MAPS[id]; return `<button class="mapcard ${id === cur ? 'on' : ''}" data-v="${id}" ${disabled ? 'disabled' : ''} style="--c1:${m.colors[0]};--c2:${m.colors[1]}"><i></i><b>${m.name}</b><span>${m.desc}</span></button>`; }).join('');
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); Sound.click(); fn(b.dataset.v); };
}
const UI = {
  curTool: 'brush', color: '#7a4a2c', brush: 10, recent: [], chatOpen: false, charTab: 'cham',
  screen(name) {
    for (const s of $$('.screen')) s.classList.add('hidden');
    if (name) $('#screen-' + name).classList.remove('hidden');
    if (name === 'char') { Preview.start(); this.renderChar(); } else Preview.stop();
    if (name === 'online') this.startBrowser(); else this.stopBrowser();
  },
  hud(on) { $('#hud').classList.toggle('hidden', !on); },
  blind(on) { $('#blind').classList.toggle('hidden', !on); },
  loading(on, txt) { if (on) { $('#loadTitle').textContent = txt; this.screen('load'); } else if (!$('#screen-load').classList.contains('hidden')) this.screen(null); },
  hand(title, text) { $('#handTitle').textContent = title; $('#handText').textContent = text; this.screen('hand'); },
  end(title, text, items, online) {
    $('#endTitle').textContent = title; $('#endText').textContent = text;
    $('#endList').innerHTML = items.map((i) => `<li><span>${esc(i.name)}</span><span class="${i.ok ? 'ok' : 'no'}">${i.txt}</span></li>`).join('');
    $('#againBtn').textContent = online ? 'Back to lobby' : 'Play again';
    $('#menuBtn').textContent = online ? 'Leave server' : 'Menu';
    this.hud(false); this.screen('end');
  },
  paintPanel(on) {
    $('#paintPanel').classList.toggle('hidden', !on);
    document.body.classList.toggle('painting', !!on);
    if (on && G.my) {
      $('#rough').value = Math.round(G.my.mat.roughness * 100); $('#roughVal').textContent = G.my.mat.roughness.toFixed(2);
      $('#metal').value = Math.round(G.my.mat.metalness * 100); $('#metalVal').textContent = G.my.mat.metalness.toFixed(2);
      this.refreshInk(); this.refreshBars();
    }
  },
  tool(t) { this.curTool = t; $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); },
  setColor(hex, addRecent) { this.color = hex; $('#color').value = hex; if (addRecent) { this.recent = [hex, ...this.recent.filter((c) => c !== hex)].slice(0, 14); $('#swatches').innerHTML = this.recent.map((c) => `<i style="background:${c}" data-c="${c}" title="${c}"></i>`).join(''); } },
  setRough(r) { if (!G.my) return; G.my.mat.roughness = r; $('#rough').value = Math.round(r * 100); $('#roughVal').textContent = r.toFixed(2); },
  refreshInk() { $('#inkBar').style.width = G.ink + '%'; },
  refreshBars() {
    const P = G.my;
    $$('[data-pose]').forEach((b) => b.classList.toggle('on', !!P && b.dataset.pose === P.pose));
    $$('#shapeSeg button').forEach((b) => b.classList.toggle('on', !!P && b.dataset.v === P.shape));
    $$('#sizeSeg button').forEach((b) => b.classList.toggle('on', !!P && b.dataset.v === P.size));
    $('#cloneLeft').textContent = `(${G.cloneLeft})`;
    $('#posebar').classList.toggle('hidden', G.view !== 'third');
    $('#crosshair').classList.toggle('hidden', G.view !== 'first');
    $('#eyes').classList.toggle('hidden', !(G.phase === 'hunt' && P && !P.caught && G.hunters.some((h) => h.ai)));
    $('#readyBtn').classList.toggle('hidden', !(G.phase === 'prep' && (!G.online || G.isHost)));
  },
  crossHot(on) { $('#crosshair').classList.toggle('hot', on); },
  status() {
    const real = G.realHiders();
    const rows = real.map((c) => `<div class="${c.caught ? 'caught' : ''}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}${c === G.my ? ' (you)' : ''}</div>`).join('');
    const hn = G.hunters.length;
    $('#status').innerHTML = `<div class="st-h">Chameleons ${real.filter((c) => !c.caught).length}/${real.length}</div>${rows}<div class="st-h" style="margin-top:6px">${hn} hunter${hn === 1 ? '' : 's'}${G.P?.mode === 'infection' ? ' · Infection' : ''}</div>`;
  },
  tick() {
    const t = Math.max(0, G.timer);
    $('#timer').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    $('#timer').classList.toggle('low', t < 10.5);
    let phase = '', sub = '', hint = '';
    const left = G.realHiders().filter((c) => !c.caught).length;
    if (G.phase === 'prep') {
      if (G.view === 'first') { phase = 'Hunters wait'; sub = 'The gate opens soon'; }
      else { phase = G.party ? `${G.my?.name}: hide!` : 'Prep: paint & hide'; sub = 'Hunters are locked in'; }
    } else if (G.phase === 'hunt') { phase = G.view === 'first' ? 'Hunt' : G.view === 'spec' ? 'Spectating' : 'Hunters are searching'; sub = `${left} chameleon${left === 1 ? '' : 's'} left · ${MAP.name}`; }
    if (G.view === 'third') hint = G.paint ? 'Paint mode · Left-drag paint · Right-drag orbit · Alt+click sample · F to finish'
      : 'WASD move · Space jump · Shift sneak · F paint · 1-5 pose · Z/X turn · C clone · Q taunt' + (G.phase === 'prep' ? ' · Enter ready' : '') + (G.online ? ' · T chat' : '');
    else if (G.view === 'first') hint = 'WASD move · Click bonk · Space jump · Listen for whistles' + (G.online ? ' · T chat' : '');
    else if (G.view === 'spec') { const hs = G.hunters.filter((h) => !h.local); hint = hs.length ? `Spectating ${hs[G.specIdx % hs.length].name} · 1-9 switch · mouse orbit` : ''; }
    $('#phase').textContent = phase; $('#sub').textContent = sub; $('#hint').textContent = hint;
    if (G.phase === 'hunt' && G.my) {
      const s = clamp(G.playerSus || 0, 0, 1);
      $('#eyesBar').style.width = (s * 100) + '%';
      $('#eyesTxt').textContent = s < 0.05 ? 'unseen' : s < 0.35 ? 'glanced' : s < 1 ? 'suspicious!' : 'SPOTTED';
    }
    if (G.phase === 'prep' && G.view === 'first') $('#blindTime').textContent = Math.ceil(t);
    this.refreshBars(); this.status();
  },

  /* --- chat --- */
  openChat() {
    if (this.chatOpen) return;
    this.chatOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    $('#gameChat').classList.remove('hidden'); $('#gameChatInput').value = ''; setTimeout(() => $('#gameChatInput').focus(), 0);
  },
  closeChat(send) {
    const v = $('#gameChatInput').value.trim();
    if (send && v) Net.send({ t: 'chat', text: v });
    this.chatOpen = false; $('#gameChat').classList.add('hidden'); $('#gameChatInput').blur(); G.lock();
  },
  addChat(name, text, sys) {
    G.lobby.chat.push({ name, text, sys }); if (G.lobby.chat.length > 80) G.lobby.chat.shift();
    const log = $('#chatLog');
    log.innerHTML = G.lobby.chat.map((m) => m.sys ? `<div class="sys">${esc(m.text)}</div>` : `<div><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
    if (playing() || G.phase === 'end') { const el = document.createElement('div'); el.className = 'chatline'; el.innerHTML = sys ? esc(text) : `<b>${esc(name)}</b> ${esc(text)}`; $('#chatFeed').appendChild(el); setTimeout(() => el.remove(), 8000); }
    if (!sys) Sound.chat();
  },

  /* --- character screen --- */
  renderChar() {
    $('#nameInput').value = PROFILE.name;
    $$('#charTabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === this.charTab));
    const box = $('#charOpts');
    const chips = (label, opts, cur, key) => `<div class="optgroup"><span>${label}</span><div class="chips" data-key="${key}">${Object.entries(opts).map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    const swatches = (label, cols, cur, key) => `<div class="optgroup"><span>${label}</span><div class="chips sw" data-key="${key}">${cols.map((c) => `<button data-v="${c}" class="${c === cur ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>`;
    if (this.charTab === 'cham') {
      box.innerHTML = chips('Body', Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.label])), PROFILE.cham.shape, 'cham.shape')
        + chips('Face', EYES, PROFILE.cham.eyes, 'cham.eyes') + swatches('Name tag colour', TAG_COLORS, PROFILE.tag, 'tag')
        + '<p class="note">Every chameleon starts pure white. Your face disappears once you paint over it.</p>';
      Preview.showCham(PROFILE.cham.shape, PROFILE.cham.eyes);
    } else {
      box.innerHTML = swatches('Suit colour', HUNTER_COLORS, PROFILE.hunter.color, 'hunter.color') + chips('Hat', HATS, PROFILE.hunter.hat, 'hunter.hat') + chips('Face', VISORS, PROFILE.hunter.visor, 'hunter.visor') + chips('Weapon', TOOLS, PROFILE.hunter.tool, 'hunter.tool');
      Preview.showHunter(PROFILE.hunter);
    }
    box.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const key = b.parentElement.dataset.key.split('.');
      if (key.length === 2) PROFILE[key[0]][key[1]] = b.dataset.v; else PROFILE[key[0]] = b.dataset.v;
      saveProfile(); Sound.click(); this.renderChar();
      if (G.online) Net.send({ t: 'profile', name: PROFILE.name, profile: PROFILE });
    };
  },

  /* --- server browser --- */
  browserTimer: null,
  startBrowser() {
    this.stopBrowser();
    const run = async () => {
      const rows = [];
      if (window.mcNative) { for (const s of await mcNative.lanList()) rows.push({ ...s, src: 'LAN' }); }
      const favs = JSON.parse(localStorage.getItem('mc_servers') || '[]');
      const infos = await Promise.all(favs.map((a) => fetchInfo(a)));
      favs.forEach((a, i) => { const inf = infos[i]; const [h, p] = Net.normalize(a).split(':'); if (!rows.some((r) => r.host === h && +r.port === +p)) rows.push(inf ? { ...inf, src: 'Saved' } : { name: a, host: h, port: +p, src: 'Saved', offline: true }); });
      if (!$('#screen-online').classList.contains('hidden')) this.renderServers(rows);
    };
    run(); this.browserTimer = setInterval(run, 2500);
    $('#hostNote').textContent = window.mcNative ? '' : 'Hosting needs the desktop app. You can still join by address.';
    $('#hostBtn').disabled = !window.mcNative;
  },
  stopBrowser() { clearInterval(this.browserTimer); this.browserTimer = null; },
  renderServers(rows) {
    const el = $('#serverList');
    if (!rows.length) { el.innerHTML = '<div class="empty">No servers found on your network yet. Host one, or join by address.</div>'; return; }
    el.innerHTML = rows.map((r) => `<div class="srv ${r.offline ? 'off' : ''}" data-addr="${r.host}:${r.port}" data-locked="${r.locked ? 1 : 0}">
      <div><b>${esc(r.name)}</b><span>${r.src} · ${r.host}:${r.port}${r.locked ? ' · locked' : ''}</span></div>
      <div class="meta">${r.offline ? 'offline' : `${MAPS[r.map]?.name || r.map} · ${r.mode === 'infection' ? 'Infection' : 'Classic'}${r.inGame ? ' · in game' : ''}`}</div>
      <div class="cnt">${r.offline ? '-' : `${r.players}/${r.max}`}</div>
      <button class="primary" ${r.offline ? 'disabled' : ''}>Join</button></div>`).join('');
    el.onclick = (e) => { const row = e.target.closest('.srv'); if (!row || !e.target.closest('button')) return; joinServer(row.dataset.addr, row.dataset.locked === '1'); };
  },

  /* --- lobby --- */
  renderLobby() {
    const L = G.lobby, host = Net.isHost, s = L.settings;
    $('#lobbyTitle').textContent = Net.server?.name || 'Lobby';
    $('#lobbyPlayers').innerHTML = [...L.players.values()].map((p) => `<div class="lp"><span class="dot" style="background:${p.profile?.tag || '#fff'}"></span><b>${esc(p.name)}</b>${p.id === Net.hostId ? '<em>host</em>' : ''}${p.id === Net.id ? '<em class="you">you</em>' : ''}${host && p.id !== Net.id ? `<button class="kick" data-id="${p.id}">Kick</button>` : ''}</div>`).join('');
    $('#lobbyPlayers').onclick = (e) => { const b = e.target.closest('.kick'); if (b) Net.send({ t: 'kick', id: b.dataset.id }); };
    mapCards($('#lobbyMaps'), s.map, (v) => { s.map = v; pushLobby(); }, !host);
    const segs = [['#lsMode', 'mode'], ['#lsHunters', 'hunters'], ['#lsAiHunters', 'aiHunters'], ['#lsAiHiders', 'aiHiders'], ['#lsPrep', 'prep'], ['#lsHunt', 'hunt'], ['#lsDiff', 'diff']];
    for (const [id, k] of segs) { seg(id, s[k], (v) => { s[k] = isNaN(+v) ? v : +v; pushLobby(); }); $$(id + ' button').forEach((b) => (b.disabled = !host)); }
    $('#lobbyStart').classList.toggle('hidden', !host);
    $('#lobbyWait').classList.toggle('hidden', host);
    $('#lobbyWait').textContent = L.inGame ? 'A round is in progress. You will join the next one.' : 'Waiting for the host to start…';
    $('#lobbyShare').innerHTML = host && this.hostIPs ? 'Friends join with: ' + this.hostIPs.map((i) => `<code>${i.address}:${this.hostPort}</code>${i.tailscale ? ' (Tailscale)' : ''}`).join(' · ') : '';
  },
};
function pushLobby() { Net.send({ t: 'lobby', lobby: { settings: G.lobby.settings, map: G.lobby.settings.map, mode: G.lobby.settings.mode } }); UI.renderLobby(); }

/* ---------- online flows ---------- */
async function joinServer(addr, locked, password) {
  if (locked && password == null) { const pw = prompt('Server password'); if (pw == null) return; password = pw; }
  UI.loading(true, 'Connecting to ' + addr + '…');
  try {
    const w = await Net.connect(addr, password || '');
    enterLobby(w);
    const favs = JSON.parse(localStorage.getItem('mc_servers') || '[]'); const a = Net.normalize(addr);
    if (!favs.includes(a) && !/^127\.|^localhost/.test(a)) { favs.unshift(a); localStorage.setItem('mc_servers', JSON.stringify(favs.slice(0, 12))); }
  } catch (e) { UI.loading(false); UI.screen('online'); toast(e.message, 'bad'); }
}
function enterLobby(w) {
  Sound.init();
  G.online = true; G.myId = Net.id; G.isHost = Net.isHost; G.party = null;
  const L = G.lobby; L.players = new Map(w.players.map((p) => [p.id, p])); L.chat = []; L.inGame = !!w.lobby.inGame;
  if (w.lobby.settings && Object.keys(w.lobby.settings).length) L.settings = { ...L.settings, ...w.lobby.settings };
  if (Net.isHost) pushLobby();
  G.clearRound(); G.phase = 'lobby'; UI.hud(false); UI.loading(false); UI.screen('lobby'); UI.renderLobby();
  UI.addChat('', `Connected to ${Net.server?.name || 'server'}.`, true);
}
function backToLobby() {
  G.clearRound(); G.phase = 'lobby'; G.isHost = Net.isHost; UI.hud(false); UI.screen('lobby'); UI.renderLobby();
  if (document.pointerLockElement) document.exitPointerLock();
}
Net.on('join', (m) => { G.lobby.players.set(m.player.id, m.player); UI.addChat('', `${m.player.name} joined.`, true); if (G.phase === 'lobby') UI.renderLobby(); });
Net.on('leave', (m) => {
  const p = G.lobby.players.get(m.id); G.lobby.players.delete(m.id);
  if (p) UI.addChat('', `${p.name} left.`, true);
  const c = G.findCham(m.id); if (c && !c.caught) { c.caught = true; c.root.visible = false; }
  const h = G.findHunter(m.id) || G.findHunter(m.id + '_h'); if (h) { h.dispose(); G.hunters = G.hunters.filter((x) => x !== h); }
  if (G.isHost && G.phase === 'hunt' && !G.realHiders().some((x) => !x.caught)) G.hostEnd();
  if (G.phase === 'lobby') UI.renderLobby();
});
Net.on('host', () => {
  G.isHost = Net.isHost; G.lobby.inGame = false;
  UI.addChat('', Net.isHost ? 'You are now the host.' : 'The host changed.', true);
  if (playing() || G.phase === 'end') { toast('Host left. Back to the lobby.', 'warn'); backToLobby(); }
  else if (G.phase === 'lobby') UI.renderLobby();
});
Net.on('lobby', (m) => { G.lobby.settings = { ...G.lobby.settings, ...(m.lobby.settings || {}) }; G.lobby.inGame = !!m.lobby.inGame; if (G.phase === 'lobby') UI.renderLobby(); });
Net.on('profile', (m) => { const p = G.lobby.players.get(m.id); if (p) { p.name = m.name; p.profile = m.profile; } if (G.phase === 'lobby') UI.renderLobby(); });
Net.on('chat', (m) => UI.addChat(m.name, m.text));
Net.on('relay', (m) => G.onRelay(m.from, m.d));
Net.on('closed', () => { toast('Disconnected from server.', 'bad'); G.online = false; G.clearRound(); G.phase = 'menu'; UI.hud(false); UI.screen('online'); });

async function hostServer() {
  const opts = { name: $('#hName').value || `${PROFILE.name}'s server`, port: +$('#hPort').value || 7777, password: $('#hPass').value, max: +$('#hMax').value || 12 };
  UI.loading(true, 'Starting server…');
  const r = await mcNative.hostStart(opts);
  if (!r.ok) { UI.loading(false); UI.screen('online'); toast(r.error, 'bad'); return; }
  const rank = (a) => (a.startsWith('192.168.56.') || a.startsWith('172.') ? 0 : a.startsWith('100.') ? 1 : 2);
  UI.hostIPs = r.ips.filter((i) => rank(i.address) > 0).sort((a, b) => rank(b.address) - rank(a.address)); UI.hostPort = r.port;
  try { const w = await Net.connect('127.0.0.1:' + r.port, opts.password); enterLobby(w); }
  catch (e) { UI.loading(false); UI.screen('online'); toast(e.message, 'bad'); }
}

/* ---------- wiring ---------- */
G.partyCfg = { humans: 2, ai: 1, map: 'mansion', diff: 'normal' };
function wire() {
  $('#mPlay').onclick = () => { UI.screen('solo'); renderSolo(); };
  $('#mParty').onclick = () => { UI.screen('party'); renderParty(); };
  $('#mOnline').onclick = () => UI.screen('online');
  $('#mChar').onclick = () => { UI.returnTo = null; UI.screen('char'); };
  $('#mSettings').onclick = () => { UI.screen('settings'); renderSettings(); };
  $('#mQuit').onclick = () => (window.mcNative ? mcNative.quit() : window.close());
  $('#mQuit').classList.toggle('hidden', !window.mcNative);
  $$('.back').forEach((b) => (b.onclick = () => { Sound.click(); UI.screen('menu'); }));
  $('#soloStart').onclick = () => G.startSolo();
  $('#partyStart').onclick = () => G.startParty(G.partyCfg.humans, G.partyCfg.ai, G.partyCfg.map, G.partyCfg.diff);
  $('#handGo').onclick = () => G.handGo();
  $('#againBtn').onclick = () => { if (G.online) backToLobby(); else if (G.party) G.startParty(G.partyCfg.humans, G.partyCfg.ai, G.partyCfg.map, G.partyCfg.diff); else G.startSolo(); };
  $('#menuBtn').onclick = () => G.toMenu();
  $('#revealBtn').onclick = () => G.startReveal();
  $('#resumeBtn').onclick = () => { G.paused = false; UI.screen(null); G.lock(); };
  $('#quitBtn').onclick = () => { G.paused = false; G.toMenu(); };
  $('#paintDone').onclick = () => togglePaint();
  $$('[data-tool]').forEach((b) => (b.onclick = () => UI.tool(b.dataset.tool)));
  $('#color').oninput = (e) => UI.setColor(e.target.value, false);
  $('#color').onchange = (e) => UI.setColor(e.target.value, true);
  $('#swatches').onclick = (e) => { if (e.target.dataset.c) UI.setColor(e.target.dataset.c, false); };
  $('#brushSize').oninput = (e) => { UI.brush = +e.target.value; $('#sizeVal').textContent = UI.brush; };
  $('#rough').oninput = (e) => UI.setRough(+e.target.value / 100);
  $('#metal').oninput = (e) => { if (!G.my) return; G.my.mat.metalness = +e.target.value / 100; $('#metalVal').textContent = G.my.mat.metalness.toFixed(2); };
  $('#undoBtn').onclick = undo;
  $('#clearBtn').onclick = () => { if (!G.my) return; pushUndo(); G.my.blank(); };
  $('#shapeSeg').innerHTML = segHTML(Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.label])));
  $('#shapeSeg').onclick = (e) => { const b = e.target.closest('button'); if (b && G.my) { G.my.setShape(b.dataset.v); UI.refreshBars(); } };
  $('#sizeSeg').onclick = (e) => { const b = e.target.closest('button'); if (b && G.my) { G.my.setSize(b.dataset.v); UI.refreshBars(); } };
  $('#rotL').onclick = () => G.my?.setYaw(G.my.yaw + Math.PI / 12);
  $('#rotR').onclick = () => G.my?.setYaw(G.my.yaw - Math.PI / 12);
  $$('[data-pose]').forEach((b) => (b.onclick = () => { if (controllable()) setPose(b.dataset.pose); }));
  $('[data-act="paint"]').onclick = () => { if (controllable()) togglePaint(); };
  $('[data-act="clone"]').onclick = () => { if (controllable()) makeClone(); };
  $('[data-act="taunt"]').onclick = () => { if (controllable()) taunt(); };
  $('#readyBtn').onclick = () => { if (G.phase === 'prep') G.finishPrep(); };
  $('#charTabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; UI.charTab = b.dataset.v; Sound.click(); UI.renderChar(); };
  $('#nameInput').onchange = (e) => { PROFILE.name = (e.target.value.trim() || PROFILE.name).slice(0, 20); saveProfile(); if (G.online) Net.send({ t: 'profile', name: PROFILE.name, profile: PROFILE }); };
  $('#randomChar').onclick = () => { PROFILE.cham = { shape: pick(Object.keys(SHAPES)), eyes: pick(Object.keys(EYES)) }; PROFILE.hunter = { color: pick(HUNTER_COLORS), hat: pick(Object.keys(HATS)), visor: pick(Object.keys(VISORS)), tool: pick(Object.keys(TOOLS)) }; PROFILE.tag = pick(TAG_COLORS); saveProfile(); UI.renderChar(); };
  $('#refreshBtn').onclick = () => UI.startBrowser();
  $('#connectBtn').onclick = () => joinServer($('#addrInput').value, false, $('#addrPass').value);
  $('#hostBtn').onclick = () => { $('#hostForm').classList.toggle('hidden'); if (!$('#hName').value) $('#hName').value = `${PROFILE.name}'s server`; };
  $('#hostGo').onclick = hostServer;
  $('#lobbyStart').onclick = () => G.hostStartOnline();
  $('#lobbyLeave').onclick = () => G.toMenu();
  $('#lobbyChar').onclick = () => { UI.returnTo = 'lobby'; UI.screen('char'); };
  $('#charBack').onclick = () => { if (UI.returnTo === 'lobby' && G.phase === 'lobby') { UI.returnTo = null; UI.screen('lobby'); UI.renderLobby(); } else UI.screen('menu'); };
  $('#chatInput').onkeydown = (e) => { if (e.key === 'Enter' && e.target.value.trim()) { Net.send({ t: 'chat', text: e.target.value.trim() }); e.target.value = ''; } };
  $('#gameChatInput').onkeydown = (e) => { if (e.key === 'Enter') UI.closeChat(true); if (e.key === 'Escape') UI.closeChat(false); e.stopPropagation(); };
  $('#lsHunters').innerHTML = segHTML({ 1: '1', 2: '2', 3: '3' }); $('#lsAiHunters').innerHTML = segHTML({ 0: '0', 1: '1', 2: '2', 3: '3' }); $('#lsAiHiders').innerHTML = segHTML({ 0: '0', 1: '1', 2: '2', 3: '3', 4: '4' });
  $('#lsPrep').innerHTML = segHTML({ 45: '45s', 60: '60s', 90: '90s' }); $('#lsHunt').innerHTML = segHTML({ 120: '2m', 180: '3m', 240: '4m', 300: '5m' });
  $('#lsMode').innerHTML = segHTML({ classic: 'Classic', infection: 'Infection' }); $('#lsDiff').innerHTML = segHTML({ easy: 'Easy', normal: 'Normal', hard: 'Hard' });
  UI.setColor('#7a4a2c', true);
}
function renderSolo() {
  const s = G.solo;
  seg('#soloKind', s.kind, (v) => { s.kind = v; renderSolo(); });
  seg('#soloDiff', s.diff, (v) => { s.diff = v; });
  $('#soloDesc').textContent = { hide: 'You are a chameleon. Paint yourself, pose, and survive the AI hunters with your AI teammates.', seek: 'You are the hunter. AI chameleons have painted themselves somewhere. Bonk them all before time runs out.', infection: 'Start as a chameleon against one hunter. Everyone who gets caught turns into a hunter, you included. Be the last one standing.' }[s.kind];
  mapCards($('#soloMaps'), s.map, (v) => { s.map = v; });
}
function renderParty() {
  const p = G.partyCfg;
  seg('#partyHumans', p.humans, (v) => { p.humans = +v; }); seg('#partyAI', p.ai, (v) => { p.ai = +v; }); seg('#partyDiff', p.diff, (v) => { p.diff = v; });
  mapCards($('#partyMaps'), p.map, (v) => { p.map = v; });
}
function renderSettings() {
  const S = SETTINGS;
  const apply = () => { saveSettings(); camera.fov = S.fov; camera.updateProjectionMatrix(); Sound.setVolume(S.vol); };
  const bind = (id, key, fmt) => { const el = $(id); el.value = S[key]; $(id + 'Val').textContent = fmt(S[key]); el.oninput = () => { S[key] = Number(el.value); $(id + 'Val').textContent = fmt(S[key]); apply(); }; };
  bind('#setSens', 'sens', (v) => (+v).toFixed(2)); bind('#setVol', 'vol', (v) => Math.round(v * 100) + '%'); bind('#setFov', 'fov', (v) => v + '°');
  seg('#setQuality', S.quality, (v) => { S.quality = v; saveSettings(); applyQuality(); });
  seg('#setInvert', S.invertY ? 'on' : 'off', (v) => { S.invertY = v === 'on'; saveSettings(); });
  $('#fsBtn').onclick = () => (window.mcNative ? mcNative.fullscreen() : document.documentElement.requestFullscreen?.());
}

wire();
loadMap('mansion');
UI.screen('menu');
window.__mc = { G, scene, camera, renderer, autoCamo, Cham, Hunter, findSpot, env, colliders, bonk, togglePaint, paintAt, UI, Net, loadMap, step: (dt, n = 1) => { for (let i = 0; i < n; i++) step(dt); } };
requestAnimationFrame(frame);
