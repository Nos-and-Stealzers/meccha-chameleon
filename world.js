'use strict';
/* World: renderer, textures, the Hide-and-Seek Mansion map, collision + nav graph. */

const V3 = THREE.Vector3;
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

let seedState = 20260610;
function srand() {
  seedState = (seedState + 0x6D2B79F5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const sr = (a, b) => a + srand() * (b - a);
const spick = (a) => a[Math.floor(srand() * a.length)];

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151a26);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120);
scene.add(camera);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

scene.add(new THREE.HemisphereLight(0xfff3df, 0x6e5e4e, 0.6));
scene.add(new THREE.AmbientLight(0xffffff, 0.16));
const sun = new THREE.DirectionalLight(0xfff0dc, 0.5);
sun.position.set(9, 30, 5);
sun.target.position.set(16, 0, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 70 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

/* ---------- canvas textures ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  c._data = g.getImageData(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function shade(hex, amt) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, amt); return '#' + c.getHexString(); }
function speckle(g, w, h, density, alpha) {
  const n = w * h * density;
  for (let i = 0; i < n; i++) {
    g.fillStyle = srand() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    g.fillRect((srand() * w) | 0, (srand() * h) | 0, 1 + ((srand() * 2) | 0), 1 + ((srand() * 2) | 0));
  }
}
const WALL_H = 3.2;
function wainscot(g, w, h, meters, color, line, rail) {
  const y = h * (1 - meters / WALL_H);
  g.fillStyle = color; g.fillRect(0, y, w, h - y);
  g.strokeStyle = line; g.lineWidth = 4;
  for (let i = 0; i < 2; i++) g.strokeRect(i * w / 2 + 14, y + 22, w / 2 - 28, h - y - 52);
  g.fillStyle = rail; g.fillRect(0, y - 6, w, 12);
  g.fillStyle = shade(color, -0.12); g.fillRect(0, h - 20, w, 20);
}
function tiles(g, x0, y0, w, h, size, colors, grout, gw = 3) {
  g.fillStyle = grout; g.fillRect(x0, y0, w, h);
  for (let y = y0; y < y0 + h; y += size) for (let x = x0; x < x0 + w; x += size) {
    g.fillStyle = spick(colors); g.fillRect(x + gw / 2, y + gw / 2, size - gw, Math.min(size, y0 + h - y) - gw);
  }
}
function planks(g, w, h, rows, palette, seam) {
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -sr(0, 120);
    while (x < w) {
      const len = sr(90, 180);
      g.fillStyle = spick(palette); g.fillRect(x, r * rh, len, rh);
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) { const yy = r * rh + sr(4, rh - 4); g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy + sr(-3, 3), x + len * .6, yy + sr(-3, 3), x + len, yy); g.stroke(); }
      g.fillStyle = seam; g.fillRect(x, r * rh, 2, rh);
      x += len;
    }
    g.fillStyle = seam; g.fillRect(0, r * rh, w, 2);
  }
}

const TEX = {};
TEX.wallLiving = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#ece1c6'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 256 / 6) { g.fillStyle = '#4f9a94'; g.fillRect(x + 6, 0, 16, h); g.fillStyle = '#d4a94f'; g.fillRect(x + 29, 0, 3, h); }
  speckle(g, w, h, 0.3, 0.035);
  wainscot(g, w, h, 1.0, '#7b4a2c', '#5b331c', '#e8d6b0');
});
TEX.wallKitchen = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#f4e7c8'; g.fillRect(0, 0, w, h);
  for (let y = 10; y < h * 0.5; y += 48) for (let x = (y / 48 % 2) * 24; x < w; x += 48) { g.fillStyle = '#d9a441'; g.beginPath(); g.arc(x + 12, y + 12, 3, 0, 7); g.fill(); }
  const y = h * (1 - 1.4 / WALL_H);
  tiles(g, 0, y, w, h - y, 32, ['#f2c94c', '#f5d36a', '#efc23c'], '#fbf6e9');
  g.fillStyle = '#d9832b'; g.fillRect(0, y - 8, w, 10);
});
TEX.wallLibrary = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#2e5a45'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3e7359'; g.lineWidth = 2;
  for (let i = -h; i < w + h; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
  g.fillStyle = '#c9a54c';
  for (let y = 16; y < h; y += 32) for (let x = 0; x < w; x += 32) { g.beginPath(); g.arc(x + (y / 32 % 2 ? 16 : 0), y, 2.4, 0, 7); g.fill(); }
  speckle(g, w, h, 0.3, 0.04);
  wainscot(g, w, h, 1.1, '#4a2c1a', '#2f1a0e', '#6b4226');
});
TEX.wallHall = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#eee1c9'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(156,59,59,.55)';
  for (let y = 0; y < h; y += 40) for (let x = 0; x < w; x += 32) {
    const ox = (y / 40 % 2) * 16;
    g.beginPath(); g.moveTo(x + ox, y + 6); g.lineTo(x + ox + 7, y + 16); g.lineTo(x + ox, y + 26); g.lineTo(x + ox - 7, y + 16); g.closePath(); g.fill();
  }
  wainscot(g, w, h, 0.9, '#f6f2ea', '#d8d1c3', '#c9bfac');
});
TEX.wallBed = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#f4b9c6'; g.fillRect(0, 0, w, h);
  for (let y = 18; y < h; y += 42) for (let x = 18; x < w; x += 42) {
    const cx = x + ((y / 42) % 2 ? 21 : 0) + sr(-3, 3), cy = y + sr(-3, 3);
    g.fillStyle = '#7fbf8a'; g.beginPath(); g.ellipse(cx + 8, cy + 8, 6, 3, 0.6, 0, 7); g.fill();
    g.fillStyle = '#fff6f8';
    for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 4, 0, 7); g.fill(); }
    g.fillStyle = '#f2c94c'; g.beginPath(); g.arc(cx, cy, 3, 0, 7); g.fill();
  }
  g.fillStyle = '#fbf7f2'; g.fillRect(0, h - 20, w, 20);
});
TEX.wallBath = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#e9f3f9'; g.fillRect(0, 0, w, h);
  const y = h * (1 - 1.5 / WALL_H);
  tiles(g, 0, y, w, h - y, 24, ['#4fa3d1', '#5cb2de', '#4697c4'], '#f4f8fb');
  g.fillStyle = '#2f6f99'; g.fillRect(0, y - 6, w, 8);
});
TEX.wallPlay = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#ffd84d'; g.fillRect(0, 0, w, h);
  const cols = ['#ff5d5d', '#4d8dff', '#3ccf6e', '#a66bff', '#ff9f43'];
  for (let y = 20; y < h - 60; y += 44) for (let x = 20; x < w; x += 44) {
    g.fillStyle = spick(cols); g.beginPath(); g.arc(x + ((y / 44) % 2 ? 22 : 0), y, 11, 0, 7); g.fill();
  }
  const by = h * (1 - 1.0 / WALL_H);
  ['#ff5d5d', '#ff9f43', '#ffe14d', '#3ccf6e', '#4d8dff', '#a66bff'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, by + i * 7, w, 7); });
  g.fillStyle = '#4d8dff'; g.fillRect(0, h - 20, w, 20);
});
TEX.wallGarage = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#9b9ea5'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 1.2, 0.07);
  g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 2;
  for (let y = 0; y < h; y += 34) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 34 % 2) * 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 34); g.stroke(); } }
  const y = h - 40;
  for (let x = -40; x < w; x += 24) { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 12, h); g.lineTo(x + 52, y); g.lineTo(x + 40, y); g.fill(); }
});

TEX.wood = canvasTex(256, 256, (g, w, h) => planks(g, w, h, 8, ['#a86b3c', '#b47744', '#9c6234', '#b98050', '#a56838'], 'rgba(60,30,10,.55)'));
TEX.woodDark = canvasTex(256, 256, (g, w, h) => planks(g, w, h, 8, ['#6b4024', '#5e381f', '#734628', '#62391f'], 'rgba(25,10,3,.6)'));
TEX.checker = canvasTex(256, 256, (g, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#2d2d33' : '#f1ede4'; g.fillRect(x * 64, y * 64, 64, 64); } speckle(g, w, h, 0.25, 0.04); });
TEX.parquet = canvasTex(256, 256, (g, w, h) => {
  const pal = ['#8a5a32', '#94633a', '#7d5029', '#9b6a40'];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const horiz = (i + j) % 2 === 0;
    for (let k = 0; k < 4; k++) {
      g.fillStyle = spick(pal);
      if (horiz) g.fillRect(i * 64, j * 64 + k * 16, 64, 16); else g.fillRect(i * 64 + k * 16, j * 64, 16, 64);
      g.strokeStyle = 'rgba(40,20,5,.45)'; g.lineWidth = 1.5;
      if (horiz) g.strokeRect(i * 64, j * 64 + k * 16, 64, 16); else g.strokeRect(i * 64 + k * 16, j * 64, 16, 64);
    }
  }
});
TEX.carpet = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#b6a3d8'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1.6, 0.06); });
TEX.bathFloor = canvasTex(256, 256, (g, w, h) => tiles(g, 0, 0, w, h, 32, ['#f4f6f8', '#eef1f4'], '#c3ccd5', 3));
TEX.mats = canvasTex(256, 256, (g, w, h) => {
  const cols = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b'];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const c = cols[(x + y * 2) % 4]; g.fillStyle = c; g.fillRect(x * 128, y * 128, 128, 128);
    g.fillStyle = shade(c, -0.08); g.fillRect(x * 128 + 10, y * 128 + 10, 108, 108);
    g.fillStyle = c; g.fillRect(x * 128 + 14, y * 128 + 14, 100, 100);
    g.fillStyle = cols[(x + y * 2 + 1) % 4]; g.beginPath(); g.arc(x * 128 + 128, y * 128 + 64, 13, 0, 7); g.fill();
    g.fillStyle = cols[(x + y * 2 + 2) % 4]; g.beginPath(); g.arc(x * 128 + 64, y * 128 + 128, 13, 0, 7); g.fill();
  }
});
TEX.concrete = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8e9197'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2, 0.06); g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); });

TEX.rugLiving = canvasTex(256, 180, (g, w, h) => {
  g.fillStyle = '#a8323a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8c27a'; g.fillRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#1f3b5c'; g.fillRect(16, 16, w - 32, h - 32);
  g.fillStyle = '#a8323a'; g.fillRect(24, 24, w - 48, h - 48);
  g.fillStyle = '#1f3b5c'; g.beginPath(); g.moveTo(w / 2, 34); g.lineTo(w - 50, h / 2); g.lineTo(w / 2, h - 34); g.lineTo(50, h / 2); g.closePath(); g.fill();
  g.fillStyle = '#e8c27a'; g.beginPath(); g.moveTo(w / 2, 58); g.lineTo(w - 86, h / 2); g.lineTo(w / 2, h - 58); g.lineTo(86, h / 2); g.closePath(); g.fill();
  g.fillStyle = '#a8323a'; g.beginPath(); g.arc(w / 2, h / 2, 14, 0, 7); g.fill();
  speckle(g, w, h, 0.8, 0.05);
});
TEX.runner = canvasTex(512, 64, (g, w, h) => {
  g.fillStyle = '#22325a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c99a3c'; g.fillRect(0, 4, w, 4); g.fillRect(0, h - 8, w, 4);
  for (let x = 16; x < w; x += 32) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x + 10, 32); g.lineTo(x, 46); g.lineTo(x - 10, 32); g.closePath(); g.fill(); }
  speckle(g, w, h, 0.5, 0.05);
});
TEX.rugRound = canvasTex(256, 256, (g, w, h) => {
  ['#6a1f2b', '#c99a3c', '#25523e', '#6a1f2b', '#c99a3c', '#25523e', '#6a1f2b'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(128, 128, 128 - i * 18, 0, 7); g.fill(); });
  speckle(g, w, h, 0.6, 0.05);
});
TEX.rugPink = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#ff9fb6'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff1f4'; for (let y = 8; y < h; y += 24) g.fillRect(0, y, w, 8); });
TEX.books = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4e321d'; g.fillRect(0, 0, w, h);
  const rows = 5, rh = h / rows;
  const pal = ['#a83232', '#2e5c8a', '#2f7a4b', '#c8a032', '#6b3fa0', '#d9643a', '#1f2f4a', '#8b5a2b', '#e8dcc0', '#3f8f8f'];
  for (let r = 0; r < rows; r++) {
    let x = 8; const base = r * rh + rh - 6;
    g.fillStyle = '#2b1a0e'; g.fillRect(4, r * rh + 4, w - 8, rh - 10);
    while (x < w - 12) {
      const bw = sr(7, 17), bh = sr(rh * 0.6, rh * 0.86);
      if (srand() < 0.08) { x += bw; continue; }
      const c = spick(pal); g.fillStyle = c; g.fillRect(x, base - bh, bw - 1, bh);
      g.fillStyle = shade(c, 0.15); g.fillRect(x + 1, base - bh + 5, bw - 3, 3);
      if (srand() < 0.5) { g.fillStyle = '#e2c26a'; g.fillRect(x + 1, base - bh * 0.4, bw - 3, 2); }
      x += bw;
    }
    g.fillStyle = '#6b4426'; g.fillRect(0, base, w, 6);
  }
});
TEX.cabinets = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#f2efe8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { g.strokeStyle = '#c9c3b6'; g.lineWidth = 3; g.strokeRect(i * 64 + 5, 6, 54, h - 12); g.fillStyle = '#8a8f99'; g.fillRect(i * 64 + (i % 2 ? 10 : 50), h / 2 - 8, 4, 16); }
});
TEX.quilt = canvasTex(256, 256, (g, w, h) => {
  const pal = ['#ffd1dc', '#c9e4ff', '#fff2b3', '#d4f5d0', '#e7d4ff', '#ffc9a8', '#ffffff'];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const c = spick(pal); g.fillStyle = c; g.fillRect(x * 32, y * 32, 32, 32);
    if (srand() < 0.4) { g.fillStyle = shade(c, -0.12); for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x * 32 + 8 + (k % 2) * 16, y * 32 + 8 + (k > 1) * 16, 3, 0, 7); g.fill(); } }
    g.strokeStyle = 'rgba(120,90,110,.5)'; g.setLineDash([3, 3]); g.strokeRect(x * 32 + 2, y * 32 + 2, 28, 28); g.setLineDash([]);
  }
});
TEX.brick = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#d8cfc2'; g.fillRect(0, 0, w, h);
  for (let y = 0, r = 0; y < h; y += 24, r++) for (let x = (r % 2) * -32; x < w; x += 64) { g.fillStyle = spick(['#a4442e', '#b34f36', '#94392a', '#ad5a3c']); g.fillRect(x + 2, y + 2, 60, 20); }
  speckle(g, w, h, 0.5, 0.06);
});
TEX.wardrobe = canvasTex(128, 256, (g, w, h) => {
  planks(g, w, h, 1, ['#8a5a36'], 'rgba(0,0,0,.2)');
  g.strokeStyle = '#5a3820'; g.lineWidth = 4; g.strokeRect(6, 6, w / 2 - 9, h - 12); g.strokeRect(w / 2 + 3, 6, w / 2 - 9, h - 12);
  g.fillStyle = '#d9b45a'; g.beginPath(); g.arc(w / 2 - 10, h / 2, 4, 0, 7); g.arc(w / 2 + 10, h / 2, 4, 0, 7); g.fill();
});
TEX.jars = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#d7c4a1'; g.fillRect(0, 0, w, h);
  const pal = ['#e85d3f', '#f2c94c', '#7fb069', '#8c5e3c', '#f7f3e8', '#d14d72'];
  for (let r = 0; r < 4; r++) {
    const base = (r + 1) * 64 - 8; g.fillStyle = '#9c7a4f'; g.fillRect(0, base, w, 8);
    for (let x = 8; x < w - 20; x += 30) { const c = spick(pal); const jh = sr(28, 48); g.fillStyle = c; g.fillRect(x, base - jh, 22, jh); g.fillStyle = '#b8b8b8'; g.fillRect(x - 1, base - jh - 5, 24, 6); }
  }
});
TEX.toyShelf = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const pal = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b', '#b197fc'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { g.fillStyle = spick(pal); g.fillRect(c * 85 + 8, r * 85 + 30, 70, 50); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(c * 85 + 28, r * 85 + 40, 30, 6); }
});
TEX.globe = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#3a7dc9'; g.fillRect(0, 0, w, h); g.fillStyle = '#6fb35a'; for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(sr(0, w), sr(20, h - 20), sr(10, 30), sr(6, 18), sr(0, 3), 0, 7); g.fill(); } });
TEX.teepee = canvasTex(256, 256, (g, w, h) => {
  const pal = ['#fff7ea', '#ff7a7a', '#fff7ea', '#3fb7a6'];
  for (let i = 0; i < 8; i++) { g.fillStyle = pal[i % 4]; g.fillRect(i * 32, 0, 32, h); }
  g.fillStyle = '#ffcf4d'; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 190); g.lineTo(x + 8, 176); g.lineTo(x + 16, 190); g.fill(); }
});
TEX.hazard = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#222'; g.fillRect(0, 0, w, h); g.fillStyle = '#f5c518'; for (let x = -128; x < w; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); } });
TEX.clock = canvasTex(128, 256, (g, w, h) => {
  planks(g, w, h, 1, ['#5e3418'], 'rgba(0,0,0,.2)');
  g.fillStyle = '#f5ecd5'; g.beginPath(); g.arc(64, 56, 40, 0, 7); g.fill(); g.strokeStyle = '#2b1a0e'; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.moveTo(64, 56); g.lineTo(64, 28); g.moveTo(64, 56); g.lineTo(84, 64); g.stroke();
  g.fillStyle = '#c9a54c'; g.beginPath(); g.arc(64, 170, 18, 0, 7); g.fill(); g.fillRect(62, 96, 4, 74);
});
TEX.towel = canvasTex(64, 128, (g, w, h) => { for (let y = 0; y < h; y += 16) { g.fillStyle = (y / 16) % 2 ? '#ffffff' : '#ff8fa3'; g.fillRect(0, y, w, 16); } });
TEX.leaves = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#3f8a3a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 120; i++) { g.fillStyle = spick(['#2f6e2c', '#56a64c', '#3a7f36', '#6fbf5e']); g.beginPath(); g.ellipse(sr(0, w), sr(0, h), sr(4, 10), sr(2, 5), sr(0, 3), 0, 7); g.fill(); } });
TEX.crate = canvasTex(128, 128, (g, w, h) => { planks(g, w, h, 4, ['#c49a5c', '#b88d50', '#d1a86a'], 'rgba(60,30,10,.4)'); g.strokeStyle = '#7d5a2c'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke(); });
TEX.pegboard = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#c89f6a'; g.fillRect(0, 0, w, h); g.fillStyle = '#8a6a40';
  for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  g.fillStyle = '#d33'; g.fillRect(30, 30, 50, 10); g.fillStyle = '#333'; g.fillRect(100, 20, 8, 60); g.fillStyle = '#2a6'; g.fillRect(150, 40, 60, 14);
});
TEX.paintings = [];
for (let i = 0; i < 9; i++) {
  TEX.paintings.push(canvasTex(160, 120, (g, w, h) => {
    const pals = [['#f2e3c6', '#e85d3f', '#2e5c8a', '#f2c94c', '#1f2f4a'], ['#1c2b3a', '#3fb7a6', '#ff7a7a', '#ffcf4d', '#ffffff'], ['#d8e7d0', '#5a8f4e', '#2f4a2a', '#e8c27a', '#a83232'], ['#ffd1dc', '#a66bff', '#4dabf7', '#ffffff', '#ff5d5d']];
    const p = pals[i % pals.length];
    g.fillStyle = p[0]; g.fillRect(0, 0, w, h);
    if (i % 3 === 0) { g.fillStyle = p[1]; g.beginPath(); g.arc(w * .65, h * .35, 22, 0, 7); g.fill(); g.fillStyle = p[2]; g.beginPath(); g.moveTo(0, h); g.lineTo(w * .35, h * .45); g.lineTo(w * .7, h); g.fill(); g.fillStyle = p[3]; g.beginPath(); g.moveTo(w * .4, h); g.lineTo(w * .75, h * .55); g.lineTo(w, h); g.fill(); }
    else for (let k = 0; k < 9; k++) { g.fillStyle = spick(p.slice(1)); if (srand() < .5) g.fillRect(sr(0, w), sr(0, h), sr(14, 60), sr(10, 50)); else { g.beginPath(); g.arc(sr(0, w), sr(0, h), sr(6, 26), 0, 7); g.fill(); } }
  }));
}

/* ---------- mesh helpers ---------- */
const env = [];          // every static mesh (for raycasts & eyedropper)
const colliders = [];    // Box3 list
const tops = [];         // flat surfaces chameleons can hide on
function tm(key, rx = 1, ry = 1, rough = 0.85, metal = 0) {
  const base = Array.isArray(key) ? key[0] : (typeof key === 'string' ? TEX[key] : key);
  const t = base.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); t.updateMatrix();
  return new THREE.MeshStandardMaterial({ map: t, roughness: rough, metalness: metal });
}
const cm = (hex, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
function reg(m, o = {}) { m.castShadow = o.cast !== false; m.receiveShadow = true; scene.add(m); env.push(m); return m; }
function addCollider(x0, y0, z0, x1, y1, z1) { const b = new THREE.Box3(new V3(x0, y0, z0), new V3(x1, y1, z1)); colliders.push(b); return b; }
function box(x, z, w, d, h, mat, o = {}) {
  const y = o.y || 0;
  const m = reg(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), o);
  m.position.set(x, y + h / 2, z);
  if (o.collide !== false) m.userData.box = addCollider(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
  if (o.top) tops.push({ x, z, w, d, y: y + h, room: o.top });
  return m;
}
function cyl(x, z, rt, rb, h, mat, o = {}) {
  const y = o.y || 0;
  const m = reg(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 24), mat), o);
  m.position.set(x, y + h / 2, z);
  const r = Math.max(rt, rb);
  if (o.collide) addCollider(x - r, y, z - r, x + r, y + h, z + r);
  return m;
}
function sph(x, y, z, r, mat, o = {}) {
  const m = reg(new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat), o);
  m.position.set(x, y, z);
  if (o.scale) m.scale.set(...o.scale);
  if (o.collide) { const s = o.scale || [1, 1, 1]; addCollider(x - r * s[0], y - r * s[1], z - r * s[2], x + r * s[0], y + r * s[1], z + r * s[2]); }
  return m;
}
function plane(x, y, z, w, h, mat, rx = 0, ry = 0, o = {}) {
  const m = reg(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat), { cast: false, ...o });
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ');
  return m;
}
function painting(x, z, facing, w, h, idx, y = 1.65) {
  // facing: direction the painting faces: 'n','s','e','w' (normal points that way)
  const ry = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing];
  const off = 0.025;
  const nx = { e: 1, w: -1 }[facing] || 0, nz = { s: 1, n: -1 }[facing] || 0;
  const frame = reg(new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.04), cm('#b8923e', 0.5, 0.4)), { cast: false });
  frame.position.set(x + nx * off, y, z + nz * off); frame.rotation.y = ry;
  const p = plane(x + nx * (off + 0.021), y, z + nz * (off + 0.021), w, h, tm(TEX.paintings[idx % TEX.paintings.length], 1, 1, 0.7), 0, ry);
  return p;
}
function lamp(x, z, color = 0xffe2b8, intensity = 0.55) {
  const l = new THREE.PointLight(color, intensity, 13, 2);
  l.position.set(x, 2.85, z); scene.add(l);
  const fix = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.18, 0.12, 20), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
  fix.position.set(x, 3.13, z); scene.add(fix);
}

/* ---------- map layout ---------- */
const ROOMS = [
  { id: 'living', name: 'Living Room', x0: 0, z0: 0, x1: 12, z1: 10, wall: 'wallLiving', floor: 'wood', pts: [[6, 6.6], [2.8, 3.6], [9.6, 3.8], [3.6, 8.7], [9.4, 7.8]] },
  { id: 'kitchen', name: 'Kitchen', x0: 12, z0: 0, x1: 20, z1: 10, wall: 'wallKitchen', floor: 'checker', pts: [[16, 3.2], [13.8, 8.8], [18.6, 8.6], [18.6, 4.2], [13.7, 6.4], [13.6, 3.0]] },
  { id: 'library', name: 'Library', x0: 20, z0: 0, x1: 32, z1: 10, wall: 'wallLibrary', floor: 'parquet', pts: [[26, 3], [22.6, 5], [29.5, 5], [23.5, 8.4], [28.4, 8.6]] },
  { id: 'hall', name: 'Hallway', x0: 0, z0: 10, x1: 32, z1: 14, wall: 'wallHall', floor: 'woodDark', pts: [[1.8, 12], [5, 12], [10, 12], [13, 12], [16, 12], [21, 12], [26, 12], [29, 12], [30.6, 12]] },
  { id: 'bedroom', name: 'Bedroom', x0: 0, z0: 14, x1: 10, z1: 24, wall: 'wallBed', floor: 'carpet', pts: [[5, 18.2], [2.4, 16.6], [7.6, 20.2], [6.2, 22.6]] },
  { id: 'bath', name: 'Bathroom', x0: 10, z0: 14, x1: 16, z1: 24, wall: 'wallBath', floor: 'bathFloor', pts: [[13, 17.2], [12.8, 20.8]] },
  { id: 'play', name: 'Playroom', x0: 16, z0: 14, x1: 26, z1: 24, wall: 'wallPlay', floor: 'mats', pts: [[21.2, 18.4], [18.8, 16.4], [24, 16.4], [20.6, 22.4]] },
  { id: 'garage', name: 'Garage', x0: 26, z0: 14, x1: 32, z1: 24, wall: 'wallGarage', floor: 'concrete', pts: [[29, 16.4], [28.2, 19.5], [29, 22]] },
];
const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
const DOOR_W = 1.8, DOOR_H = 2.3, WALL_T = 0.1;
const DOORS = [
  { a: 'h', line: 10, at: 10, r: ['living', 'hall'] },
  { a: 'h', line: 10, at: 16, r: ['kitchen', 'hall'] },
  { a: 'h', line: 10, at: 26, r: ['library', 'hall'] },
  { a: 'v', line: 12, at: 5, r: ['living', 'kitchen'] },
  { a: 'v', line: 20, at: 5, r: ['kitchen', 'library'] },
  { a: 'h', line: 14, at: 5, r: ['bedroom', 'hall'] },
  { a: 'h', line: 14, at: 13, r: ['bath', 'hall'] },
  { a: 'h', line: 14, at: 21, r: ['play', 'hall'] },
  { a: 'h', line: 14, at: 29, r: ['garage', 'hall'] },
  { a: 'v', line: 10, at: 19, r: ['bedroom', 'bath'] },
];
function roomAt(x, z) {
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  return null;
}

function buildRoom(r) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const floor = plane((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2, w, d, tm(r.floor, w / 2, d / 2, 0.8), -Math.PI / 2, 0);
  floor.receiveShadow = true;
  const wm = (L) => tm(r.wall, L / 2, 1, 0.9);
  const seg = (axis, line, a0, a1, inset) => {
    const gaps = DOORS.filter((dd) => dd.a === axis && Math.abs(dd.line - line) < 0.01 && dd.at > a0 && dd.at < a1)
      .map((dd) => [dd.at - DOOR_W / 2, dd.at + DOOR_W / 2]).sort((p, q) => p[0] - q[0]);
    let s = a0;
    const pieces = [];
    for (const [g0, g1] of gaps) { pieces.push([s, g0]); s = g1; }
    pieces.push([s, a1]);
    const c = line + inset;
    for (const [p0, p1] of pieces) {
      const L = p1 - p0; if (L < 0.02) continue;
      if (axis === 'h') box((p0 + p1) / 2, c, L, WALL_T, WALL_H, wm(L), { cast: true });
      else box(c, (p0 + p1) / 2, WALL_T, L, WALL_H, wm(L), { cast: true });
    }
    for (const [g0, g1] of gaps) {
      if (axis === 'h') box((g0 + g1) / 2, c, g1 - g0, WALL_T, WALL_H - DOOR_H, wm(g1 - g0), { y: DOOR_H });
      else box(c, (g0 + g1) / 2, WALL_T, g1 - g0, WALL_H - DOOR_H, wm(g1 - g0), { y: DOOR_H });
    }
  };
  seg('h', r.z0, r.x0, r.x1, WALL_T / 2);
  seg('h', r.z1, r.x0, r.x1, -WALL_T / 2);
  seg('v', r.x0, r.z0, r.z1, WALL_T / 2);
  seg('v', r.x1, r.z0, r.z1, -WALL_T / 2);
  // door frames
  for (const dd of DOORS) {
    if (!dd.r.includes(r.id) || dd.r[0] !== r.id) continue;
    const fm = cm('#f3eee4', 0.6);
    if (dd.a === 'h') {
      box(dd.at - DOOR_W / 2 - 0.04, dd.line, 0.08, 0.3, DOOR_H, fm, { collide: false });
      box(dd.at + DOOR_W / 2 + 0.04, dd.line, 0.08, 0.3, DOOR_H, fm, { collide: false });
      box(dd.at, dd.line, DOOR_W + 0.16, 0.3, 0.08, fm, { y: DOOR_H - 0.02, collide: false });
    } else {
      box(dd.line, dd.at - DOOR_W / 2 - 0.04, 0.3, 0.08, DOOR_H, fm, { collide: false });
      box(dd.line, dd.at + DOOR_W / 2 + 0.04, 0.3, 0.08, DOOR_H, fm, { collide: false });
      box(dd.line, dd.at, 0.3, DOOR_W + 0.16, 0.08, fm, { y: DOOR_H - 0.02, collide: false });
    }
  }
}
ROOMS.forEach(buildRoom);
{
  const ceil = plane(16, WALL_H, 12, 32, 24, cm('#f6f1e7', 1), Math.PI / 2, 0);
  ceil.castShadow = false;
}

/* --- furniture --- */
const F = {
  wood: cm('#8a5a36', 0.7), woodDark: cm('#4a2c1a', 0.7), woodLight: cm('#c9975e', 0.75), white: cm('#f4f2ec', 0.6),
  black: cm('#1d1f24', 0.4), steel: cm('#b9bfc8', 0.35, 0.6), red: cm('#b8323d', 0.95), green: cm('#3d6b4f', 0.95),
  leather: cm('#6e3b22', 0.55), cream: cm('#efe3c8', 0.95), terracotta: cm('#c4683f', 0.9), gold: cm('#c9a54c', 0.4, 0.5),
  blue: cm('#3d6fb0', 0.9), pink: cm('#ff8fb1', 0.9), yellow: cm('#ffd43b', 0.8), purple: cm('#8c6bd6', 0.9), teal: cm('#3fb7a6', 0.9),
};
function plant(x, z, s = 1) {
  cyl(x, z, 0.24 * s, 0.18 * s, 0.45 * s, F.terracotta, { collide: true });
  sph(x, 0.45 * s + 0.38 * s, z, 0.42 * s, tm('leaves', 2, 1), { collide: true, scale: [1, 1.15, 1] });
}
function chair(x, z, face, mat) {
  box(x, z, 0.46, 0.46, 0.05, mat, { y: 0.44 });
  for (const [dx, dz] of [[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]]) box(x + dx, z + dz, 0.05, 0.05, 0.44, mat, { collide: false });
  const bz = z - face * 0.21;
  box(x, bz, 0.46, 0.05, 0.5, mat, { y: 0.49, collide: false });
}
// Living room
plane(6, 0.008, 4.8, 5.2, 3.6, tm('rugLiving', 1, 1, 1), -Math.PI / 2, 0);
box(6, 1.05, 4.0, 1.0, 0.45, F.red, { top: 'living' });
box(6, 0.4, 4.0, 0.3, 1.0, F.red);
box(3.85, 0.95, 0.32, 1.2, 0.7, F.red); box(8.15, 0.95, 0.32, 1.2, 0.7, F.red);
box(5, 1.1, 1.8, 0.7, 0.14, cm('#c94450', 0.95), { y: 0.45, collide: false }); box(7, 1.1, 1.8, 0.7, 0.14, cm('#c94450', 0.95), { y: 0.45, collide: false });
box(6, 3.4, 1.6, 0.8, 0.08, F.wood, { y: 0.4, top: 'living' });
for (const [dx, dz] of [[-.7, -.32], [.7, -.32], [-.7, .32], [.7, .32]]) box(6 + dx, 3.4 + dz, 0.06, 0.06, 0.4, F.wood, { collide: false });
box(5, 9.55, 2.6, 0.6, 0.55, F.woodDark, { top: 'living' });
box(5, 9.62, 1.7, 0.08, 0.95, F.black, { y: 0.6 });
box(0.5, 5, 0.8, 2.4, 1.3, tm('brick', 1, 1));
box(0.91, 5, 0.02, 1.2, 0.8, cm('#151515', 1), { collide: false });
box(0.55, 5, 1.0, 2.7, 0.12, F.woodDark, { y: 1.3, top: 'living' });
painting(0.1, 5, 'e', 1.4, 0.9, 0, 2.1);
box(11.6, 2.2, 0.6, 2.2, 2.2, tm('books', 1, 1, 0.9));
box(2.2, 7.55, 1.0, 1.0, 0.45, F.green, { top: 'living' }); box(2.2, 8.1, 1.0, 0.25, 0.95, F.green); box(1.75, 7.55, 0.15, 1.0, 0.65, F.green); box(2.65, 7.55, 0.15, 1.0, 0.65, F.green);
plant(0.75, 0.75); plant(11.35, 7.6);
cyl(10.7, 0.75, 0.03, 0.03, 1.6, F.gold); cyl(10.7, 0.75, 0.18, 0.3, 0.35, cm('#fff1d0', 1), { y: 1.5 }); cyl(10.7, 0.75, 0.2, 0.2, 0.03, F.gold);
painting(6, 0.1, 's', 2.0, 1.0, 1, 1.95);
painting(11.9, 7, 'w', 1.0, 0.8, 2);
lamp(6, 5, 0xffe2b8, 0.6);
// Kitchen
box(15.5, 0.45, 6.4, 0.7, 0.88, tm('cabinets', 3, 1, 0.6));
box(15.5, 0.47, 6.5, 0.76, 0.06, cm('#e9e6e0', 0.35), { y: 0.88, top: 'kitchen' });
box(14, 0.47, 0.8, 0.6, 0.015, F.black, { y: 0.94, collide: false });
for (const [dx, dz] of [[-.2, -.13], [.2, -.13], [-.2, .13], [.2, .13]]) cyl(14 + dx, 0.47 + dz, 0.08, 0.08, 0.01, cm('#444', 0.5), { y: 0.955 });
box(17, 0.47, 0.8, 0.5, 0.015, F.steel, { y: 0.94, collide: false });
box(19.4, 0.5, 0.9, 0.8, 2.0, cm('#dfe3e8', 0.3, 0.25));
box(19.4, 0.92, 0.04, 0.04, 0.6, F.steel, { y: 0.9, collide: false });
box(15.5, 0.3, 6.4, 0.4, 0.8, tm('cabinets', 3, 1, 0.6), { y: 1.6 });
box(16, 6, 2.0, 1.2, 0.06, F.woodLight, { y: 0.78, top: 'kitchen' });
for (const [dx, dz] of [[-.92, -.52], [.92, -.52], [-.92, .52], [.92, .52]]) box(16 + dx, 6 + dz, 0.07, 0.07, 0.78, F.woodLight, { collide: false });
chair(15.4, 4.85, 1, F.woodLight); chair(16.6, 4.85, 1, F.woodLight); chair(15.4, 7.15, -1, F.woodLight); chair(16.6, 7.15, -1, F.woodLight);
for (let i = 0; i < 5; i++) sph(15.8 + i * 0.1, 0.92, 6 + (i % 2) * 0.1, 0.07, pick([cm('#e85d3f'), cm('#f2c94c'), cm('#7fb069')]), {});
box(12.4, 8.2, 0.5, 2.4, 2.0, tm('jars', 1, 1));
plane(17, 0.008, 1.3, 1.4, 0.6, tm('rugPink', 2, 1, 1), -Math.PI / 2, 0);
painting(19.9, 6.5, 'w', 0.8, 0.6, 3);
lamp(16, 4); lamp(16, 7.5, 0xfff0d0, 0.3);
// Library
for (const x of [22.5, 25.5, 28.5]) box(x, 0.4, 2.6, 0.6, 2.6, tm('books', 1, 1, 0.9));
box(31.6, 3, 0.6, 2.6, 2.6, tm('books', 1, 1, 0.9)); box(31.6, 7, 0.6, 2.6, 2.6, tm('books', 1, 1, 0.9));
{ const rug = reg(new THREE.Mesh(new THREE.CircleGeometry(2.3, 48), tm('rugRound', 1, 1, 1)), { cast: false }); rug.rotation.x = -Math.PI / 2; rug.position.set(26, 0.008, 5.5); }
box(26, 5.5, 1.8, 1.0, 0.06, F.woodDark, { y: 0.74, top: 'library' });
for (const [dx, dz] of [[-.82, -.42], [.82, -.42], [-.82, .42], [.82, .42]]) box(26 + dx, 5.5 + dz, 0.07, 0.07, 0.74, F.woodDark, { collide: false });
cyl(25.5, 5.4, 0.02, 0.02, 0.4, F.gold, { y: 0.8 }); cyl(25.5, 5.4, 0.08, 0.16, 0.14, cm('#2f7a4b', 0.5), { y: 1.18 });
box(21, 8.6, 1.0, 1.0, 0.45, F.leather, { top: 'library' }); box(21, 9.15, 1.0, 0.25, 0.95, F.leather);
box(30.2, 8.8, 1.0, 1.0, 0.45, F.leather, { top: 'library' }); box(30.2, 9.35, 1.0, 0.25, 0.95, F.leather);
cyl(24.6, 9.3, 0.04, 0.2, 0.8, F.woodDark, { collide: true }); sph(24.6, 1.15, 9.3, 0.35, tm('globe', 1, 1, 0.5), {});
painting(20.1, 2.2, 'e', 1.0, 1.2, 4); painting(20.1, 8, 'e', 1.0, 1.2, 5);
lamp(26, 5, 0xffe0b0, 0.65);
// Hallway
plane(16, 0.008, 12, 29, 1.4, tm('runner', 3, 1, 1), -Math.PI / 2, 0);
painting(2.5, 10.1, 's', 1.2, 0.9, 6); painting(6.5, 10.1, 's', 1.0, 0.8, 7); painting(13, 10.1, 's', 1.4, 1.0, 8);
painting(21, 10.1, 's', 1.6, 1.0, 1); painting(30.5, 10.1, 's', 1.0, 1.2, 3);
painting(9, 13.9, 'n', 1.2, 0.9, 2); painting(17, 13.9, 'n', 1.4, 0.9, 5); painting(25, 13.9, 'n', 1.2, 0.9, 0);
box(13, 10.35, 1.2, 0.35, 0.85, F.woodDark, { top: 'hall' }); cyl(13.3, 10.35, 0.08, 0.12, 0.35, cm('#3fb7a6', 0.4), { y: 0.85 });
box(17, 13.65, 1.6, 0.45, 0.45, F.wood, { top: 'hall' });
box(31.65, 12, 0.5, 0.6, 2.2, tm('clock', 1, 1, 0.7));
plant(0.6, 10.6, 0.9); plant(0.6, 13.4, 0.9);
for (const x of [5, 16, 27]) lamp(x, 12, 0xffe6c4, 0.4);
// Bedroom
box(3, 22.8, 2.2, 2.2, 0.45, F.wood);
box(3, 22.7, 2.1, 2.0, 0.25, tm('quilt', 1, 1, 1), { y: 0.45, top: 'bedroom' });
box(3, 23.85, 2.3, 0.12, 1.2, F.wood);
box(2.5, 23.45, 0.8, 0.4, 0.14, F.white, { y: 0.7, collide: false }); box(3.5, 23.45, 0.8, 0.4, 0.14, F.white, { y: 0.7, collide: false });
sph(3.3, 0.86, 22.4, 0.16, cm('#9c6b3e', 1), {}); sph(3.3, 1.08, 22.4, 0.11, cm('#9c6b3e', 1), {});
box(4.65, 23.6, 0.5, 0.45, 0.55, F.white, { top: 'bedroom' }); cyl(4.65, 23.6, 0.12, 0.17, 0.25, cm('#ffd1dc', 1), { y: 0.75 });
box(9.6, 22.3, 0.65, 1.8, 2.3, tm('wardrobe', 1, 1, 0.75));
box(7.6, 14.45, 1.6, 0.5, 0.9, F.white, { top: 'bedroom' });
box(9.3, 15.2, 0.8, 0.5, 0.45, F.pink, { top: 'bedroom' });
sph(1.2, 0.3, 18, 0.6, cm('#ff9f43', 1), { collide: true, scale: [1, 0.55, 1] });
{ const rug = reg(new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), tm('rugPink', 3, 3, 1)), { cast: false }); rug.rotation.x = -Math.PI / 2; rug.position.set(5, 0.008, 18.6); }
painting(5, 23.9, 'n', 1.2, 0.8, 4); painting(0.1, 20, 'e', 1.0, 1.0, 6);
lamp(5, 19);
// Bathroom
box(13, 23.2, 2.6, 1.2, 0.6, F.white, { top: 'bath' });
box(13, 23.2, 2.3, 0.9, 0.02, cm('#a8d8f0', 0.15), { y: 0.56, collide: false });
box(15.6, 20.5, 0.45, 0.55, 0.42, F.white); box(15.82, 20.5, 0.18, 0.52, 0.45, F.white, { y: 0.42 });
box(10.4, 16.5, 0.6, 1.0, 0.85, cm('#5a8fb0', 0.6), { top: 'bath' });
plane(10.11, 1.6, 16.5, 0.9, 0.7, cm('#cfe3ee', 0.05, 0.9), 0, Math.PI / 2);
plane(14.6, 1.1, 23.89, 0.5, 0.9, tm('towel', 1, 1, 1), 0, Math.PI);
plane(12.8, 0.008, 21.8, 1.2, 0.6, tm('rugPink', 2, 1, 1), -Math.PI / 2, 0);
cyl(15.4, 15.0, 0.24, 0.2, 0.55, cm('#d8c49a', 1), { collide: true });
lamp(13, 19, 0xf0f6ff, 0.45);
// Playroom
box(16.38, 17, 0.55, 2.4, 1.4, tm('toyShelf', 1, 1), { top: 'play' });
box(19, 19.6, 1.2, 0.8, 0.05, F.yellow, { y: 0.48, top: 'play' });
for (const [dx, dz] of [[-.52, -.32], [.52, -.32], [-.52, .32], [.52, .32]]) box(19 + dx, 19.6 + dz, 0.06, 0.06, 0.48, F.blue, { collide: false });
const pitX0 = 22.5, pitX1 = 25.85, pitZ0 = 20.8, pitZ1 = 23.85;
box((pitX0 + pitX1) / 2, pitZ0, pitX1 - pitX0, 0.12, 0.5, F.blue); box(pitX0, (pitZ0 + pitZ1) / 2, 0.12, pitZ1 - pitZ0, 0.5, F.blue);
{
  const n = 260, inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ roughness: 0.45 }), n);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const pal = [0xff5d5d, 0x4d8dff, 0x3ccf6e, 0xffd43b, 0xa66bff, 0xff9f43];
  for (let i = 0; i < n; i++) { m4.setPosition(sr(pitX0 + 0.2, pitX1 - 0.15), sr(0.1, 0.42), sr(pitZ0 + 0.2, pitZ1 - 0.15)); inst.setMatrixAt(i, m4); inst.setColorAt(i, col.setHex(spick(pal))); }
  reg(inst);
}
{ const t = reg(new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.3, 7, 1, true), tm('teepee', 1, 1, 1))); t.material.side = THREE.DoubleSide; t.position.set(17.5, 1.15, 22.4); }
const blockCols = ['#ff5d5d', '#4d8dff', '#3ccf6e', '#ffd43b', '#a66bff'];
for (let i = 0; i < 6; i++) box(20 + (i % 4) * 0.5 + sr(-.05, .05), 15 + Math.floor(i / 4) * 0.5, 0.42, 0.42, 0.42, cm(blockCols[i % 5], 0.7));
box(20.02, 15.5, 0.42, 0.42, 0.42, cm(blockCols[4], 0.7), { y: 0.42 });
sph(24.6, 0.3, 15.2, 0.32, cm('#ff5d5d', 0.5), { collide: true });
painting(21, 23.9, 'n', 2.0, 1.1, 7); painting(25.9, 18, 'w', 1.2, 0.9, 8);
lamp(21, 19, 0xfff4e0, 0.55);
// Garage
box(31.5, 19, 0.7, 2.2, 0.9, tm('crate', 2, 1), { top: 'garage' });
plane(31.89, 1.7, 19, 2.2, 1.1, tm('pegboard', 1, 1), 0, -Math.PI / 2);
box(27, 23.2, 0.8, 0.8, 0.8, tm('crate', 1, 1)); box(27.9, 23.2, 0.8, 0.8, 0.8, tm('crate', 1, 1)); box(27.4, 23.2, 0.8, 0.8, 0.8, tm('crate', 1, 1), { y: 0.8 });
cyl(30.8, 23.2, 0.3, 0.3, 0.9, cm('#2e6db4', 0.5, 0.3), { collide: true });
lamp(29, 19, 0xe8f0ff, 0.5);

/* gate that keeps hunters in the garage during prep */
const gate = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.16), tm('hazard', 3, 4, 0.7));
gate.position.set(29, DOOR_H / 2, 14); gate.castShadow = true;
const gateBox = new THREE.Box3(new V3(29 - DOOR_W / 2, 0, 13.92), new V3(29 + DOOR_W / 2, DOOR_H, 14.08));
function setGate(closed) {
  if (closed) { if (!gate.parent) scene.add(gate); if (!colliders.includes(gateBox)) colliders.push(gateBox); }
  else { scene.remove(gate); const i = colliders.indexOf(gateBox); if (i >= 0) colliders.splice(i, 1); }
}

/* ---------- surface colour sampling ---------- */
const _uv = new THREE.Vector2();
function surfaceColor(hit) {
  const o = hit.object, m = o.material;
  if (o.isInstancedMesh && hit.instanceId != null && o.instanceColor) {
    const c = new THREE.Color(); o.getColorAt(hit.instanceId, c); return [c.r * 255, c.g * 255, c.b * 255];
  }
  if (m.map && hit.uv) {
    _uv.copy(hit.uv); m.map.updateMatrix(); m.map.transformUv(_uv);
    const d = m.map.image._data;
    const x = clamp(Math.floor(_uv.x * d.width), 0, d.width - 1), y = clamp(Math.floor(_uv.y * d.height), 0, d.height - 1);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = (x + dx + d.width) % d.width, yy = clamp(y + dy, 0, d.height - 1), i = (yy * d.width + xx) * 4;
      r += d.data[i]; g += d.data[i + 1]; b += d.data[i + 2]; n++;
    }
    return [r / n * m.color.r, g / n * m.color.g, b / n * m.color.b];
  }
  return [m.color.r * 255, m.color.g * 255, m.color.b * 255];
}
const rcEnv = new THREE.Raycaster();
function envHit(origin, dir, far = 60, list = env) {
  rcEnv.set(origin, dir); rcEnv.far = far;
  const h = rcEnv.intersectObjects(list, false);
  return h[0] || null;
}
const _envBoxes = new Map();
function envNear(p, radius) {
  const out = [];
  for (const m of env) {
    let b = _envBoxes.get(m);
    if (!b) { b = new THREE.Box3().setFromObject(m); _envBoxes.set(m, b); }
    if (b.distanceToPoint(p) < radius) out.push(m);
  }
  return out;
}

/* ---------- collision ---------- */
function pushOut(p, r, b) {
  const cx = clamp(p.x, b.min.x, b.max.x), cz = clamp(p.z, b.min.z, b.max.z);
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
  else {
    const l = p.x - b.min.x, rr = b.max.x - p.x, t = p.z - b.min.z, bt = b.max.z - p.z, m = Math.min(l, rr, t, bt);
    if (m === l) p.x = b.min.x - r; else if (m === rr) p.x = b.max.x + r; else if (m === t) p.z = b.min.z - r; else p.z = b.max.z + r;
  }
  return true;
}
function overlapsXZ(p, r, b) {
  const cx = clamp(p.x, b.min.x, b.max.x), cz = clamp(p.z, b.min.z, b.max.z);
  return (p.x - cx) ** 2 + (p.z - cz) ** 2 < r * r;
}
const STEP = 0.32;
function collideBody(body, dt, gravity = true) {
  const p = body.pos;
  for (let it = 0; it < 2; it++) for (const c of colliders) {
    if (c.max.y <= p.y + STEP || c.min.y >= p.y + body.h) continue;
    pushOut(p, body.r, c);
  }
  p.x = clamp(p.x, 0.15, 31.85); p.z = clamp(p.z, 0.15, 23.85);
  if (!gravity) return;
  body.vy -= 20 * dt;
  let ny = p.y + body.vy * dt;
  body.onGround = false;
  if (body.vy <= 0) {
    let ground = 0;
    for (const c of colliders) if (c.max.y <= p.y + STEP && c.max.y > ground && overlapsXZ(p, body.r * 0.6, c)) ground = c.max.y;
    if (ny <= ground) { ny = ground; body.vy = 0; body.onGround = true; }
  } else {
    for (const c of colliders) if (c.min.y >= p.y + body.h - 0.02 && ny + body.h > c.min.y && overlapsXZ(p, body.r * 0.8, c)) { ny = c.min.y - body.h; body.vy = 0; }
    if (ny + body.h > WALL_H) { ny = WALL_H - body.h; body.vy = 0; }
  }
  p.y = ny;
}
function freeAt(x, z, r, h, y0 = 0) {
  if (x < 0.3 || z < 0.3 || x > 31.7 || z > 23.7) return false;
  for (const c of colliders) {
    if (c.max.y <= y0 + 0.05 || c.min.y >= y0 + h) continue;
    if (overlapsXZ({ x, z }, r, c)) return false;
  }
  return true;
}

/* ---------- navigation graph ---------- */
const NODES = [];
for (const r of ROOMS) for (const [x, z] of r.pts) NODES.push({ x, z, rooms: [r.id], edges: [] });
for (const d of DOORS) {
  const x = d.a === 'h' ? d.at : d.line, z = d.a === 'h' ? d.line : d.at;
  NODES.push({ x, z, rooms: d.r.slice(), edges: [], door: true });
}
function segClear(ax, az, bx, bz, r = 0.26, endTol = 0) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.2)), tMax = L > 0 ? Math.max(0, (L - endTol) / L) : 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n * tMax, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const c of colliders) { if (c === gateBox || c.max.y <= STEP || c.min.y >= 1.8) continue; if (overlapsXZ({ x, z }, r, c)) return false; }
  }
  return true;
}
for (const a of NODES) for (const b of NODES) if (a !== b && a.rooms.some((r) => b.rooms.includes(r)) && segClear(a.x, a.z, b.x, b.z)) a.edges.push(b);
for (const a of NODES) if (!a.edges.length) { let best = null, bd = 1e9; for (const b of NODES) { if (b === a || !a.rooms.some((r) => b.rooms.includes(r))) continue; const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < bd) { bd = d; best = b; } } if (best) { a.edges.push(best); best.edges.push(a); } }
function nearestNode(x, z) {
  const r = roomAt(x, z);
  let best = null, bd = 1e9;
  for (const n of NODES) {
    if (r && !n.rooms.includes(r.id)) continue;
    const d = (n.x - x) ** 2 + (n.z - z) ** 2 + (segClear(x, z, n.x, n.z, 0.2) ? 0 : 400); if (d < bd) { bd = d; best = n; }
  }
  if (!best) for (const n of NODES) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
  return best;
}
function route(fx, fz, tx, tz) {
  const ra = roomAt(fx, fz), rb = roomAt(tx, tz);
  if (ra && rb && ra === rb && segClear(fx, fz, tx, tz, 0.2, 0.7)) return [{ x: tx, z: tz }];
  const s = nearestNode(fx, fz), g = nearestNode(tx, tz);
  const dist = new Map([[s, 0]]), prev = new Map(), open = [s], done = new Set();
  while (open.length) {
    open.sort((a, b) => dist.get(a) - dist.get(b));
    const u = open.shift(); if (done.has(u)) continue; done.add(u);
    if (u === g) break;
    for (const v of u.edges) {
      const nd = dist.get(u) + Math.hypot(u.x - v.x, u.z - v.z);
      if (nd < (dist.get(v) ?? 1e9)) { dist.set(v, nd); prev.set(v, u); open.push(v); }
    }
  }
  const path = []; let c = g;
  while (c) { path.unshift({ x: c.x, z: c.z }); c = prev.get(c); }
  path.push({ x: tx, z: tz });
  while (path.length > 1 && segClear(fx, fz, path[1].x, path[1].z, 0.22, path.length === 2 ? 0.7 : 0)) path.shift();
  return path;
}
