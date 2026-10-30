// Turning / camera regressions (v4.4.0): runs the real game.js functions in a Node VM with vendored three.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../three.min.js');
const root = path.resolve(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8').replace(/\r\n/g, '\n');
function functionSource(text, name) {
  const start = text.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  const open = text.indexOf('{', start); let depth = 1, end = open + 1;
  for (; depth; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; }
  return text.slice(start, end);
}
const between = (a, b) => { const i = game.indexOf(a), j = game.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return game.slice(i, j); };
function ctx(extra = {}) {
  const noop = () => {};
  const c = {
    THREE, V3: THREE.Vector3, Math, performance: { now: () => c.now }, now: 1000,
    clamp: (n, a, b) => Math.max(a, Math.min(b, n)), lerp: (a, b, t) => a + (b - a) * t,
    angDiff: (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; },
    camera: new THREE.PerspectiveCamera(70, 1.6, 0.05, 100), envHit: () => null, keys: {},
    SETTINGS: { sens: 1, invertY: false }, UI: { chatOpen: false, tool: noop, setBrush: noop, wheelOpen: false, paintPanel: noop, wheel: noop, refreshBars: noop },
    G: { view: 'third', ctrl: { yaw: 0, pitch: 0.3, dist: 2.3 }, paintCam: { yaw: 0, pitch: 0.2, dist: 1.7 }, fp: null, phase: 'prep', paused: false, online: false, lock: noop },
    document: { pointerLockElement: null, exitPointerLock: noop }, toast: noop,
    ...extra,
  };
  vm.createContext(c);
  return c;
}
function body(c) {
  const P = { yaw: 0, stick: null, turnGoal: null, rebaked: 0, setYaw(y) { this.yaw = y; }, rebake() { this.rebaked++; }, setPose() {}, pose: 'stand', emote: null };
  c.G.my = P; return P;
}

test('frame limiter never drops a due frame on a 240 Hz screen', () => {
  const c = ctx(); vm.runInContext(functionSource(game, 'frameDue'), c);
  for (const ms of [4.17, 4.0, 6.9, 16.7]) assert.equal(c.frameDue(ms, 0), true, 'uncapped renders every vsync');
  assert.equal(c.frameDue(4.17, 60), false); assert.equal(c.frameDue(12.5, 60), false);
  assert.equal(c.frameDue(15.2, 60), true, 'vsync jitter just under 16.67 ms must not drop the frame');
  assert.equal(c.frameDue(16.67, 60), true);
  assert.equal(c.frameDue(6.94, 144), true);
});

test('follow camera turns 1:1 with the mouse (no rotation lag or orbit chord)', () => {
  const c = ctx();
  vm.runInContext(between('const CAM = {', 'function updateCamera(') + ';globalThis.CAM = CAM;', c);
  const tgt = new THREE.Vector3(1, 0.7, 2), dt = 1 / 240;
  c.thirdCam(tgt, 0, 0.3, 2.3, dt, false);
  const yaws = [0.4, 1.3, 2.9, -2.0];
  for (const yaw of yaws) {
    c.thirdCam(tgt, yaw, 0.3, 2.3, dt, false);
    const off = c.camera.position.clone().sub(tgt);
    assert.ok(Math.abs(c.angDiff(Math.atan2(off.x, off.z), yaw)) < 1e-6, `camera yaw lags: ${Math.atan2(off.x, off.z)} vs ${yaw}`);
    assert.ok(Math.abs(off.length() - 2.3) < 1e-6, `orbit distance changed while turning: ${off.length()}`);
  }
});

test('a wall cutting in pulls the camera in on the same frame, open space eases out', () => {
  const c = ctx();
  vm.runInContext(between('const CAM = {', 'function updateCamera(') + ';globalThis.CAM = CAM;', c);
  const tgt = new THREE.Vector3(0, 0.7, 0);
  c.thirdCam(tgt, 0, 0.3, 2.3, 1 / 60, false);
  c.envHit = () => ({ distance: 0.9 });
  c.thirdCam(tgt, 0, 0.3, 2.3, 1 / 60, false);
  assert.ok(c.camera.position.distanceTo(tgt) <= 0.9 - 0.12 + 1e-9, 'camera stayed behind the wall');
  c.envHit = () => null;
  c.thirdCam(tgt, 0, 0.3, 2.3, 1 / 60, false);
  const d = c.camera.position.distanceTo(tgt);
  assert.ok(d > 0.78 && d < 2.3, `should ease back out, got ${d}`);
});

test('mouse look preserves abrupt high-DPI flicks and rejects only invalid driver data', () => {
  const c = ctx();
  vm.runInContext(between('const lookFilter =', 'document.addEventListener(\'pointerlockchange\', () => { lookFilter'), c);
  let t = 0; const d = (x) => { t += 4; const r = c.lookDelta(x, 0, t); return r && Array.from(r); };
  assert.deepEqual(d(6), [6, 0]); assert.deepEqual(d(9), [9, 0]);
  for (const x of [912, 2400, 1800, 3200]) assert.deepEqual(d(x), [x, 0], 'abrupt high-DPI flick was swallowed');
  assert.equal(d(100000), null, 'impossible driver delta is dropped');
  assert.equal(d(NaN), null, 'NaN driver delta is dropped');
  for (const x of [60, 140, 240, 320, 380]) assert.deepEqual(d(x), [x, 0], `flick delta ${x} swallowed`);
  c.G.ctrl.yaw = 0; c.applyLook(100, 0);
  assert.ok(Math.abs(c.G.ctrl.yaw + 0.22) < 1e-9, 'sensitivity 1 = 0.0022 rad per count');
});

test('Z/X tap eases 15 degrees and holding keeps turning smoothly', () => {
  const c = ctx(); const P = body(c);
  vm.runInContext(between('const TURN =', 'function setPose(') + ';globalThis.TURN = TURN;', c);
  c.turnStep(P, 1);
  for (let i = 0; i < 30; i++) c.updateTurn(P, 1 / 60);
  assert.ok(Math.abs(P.yaw - Math.PI / 12) < 1e-3, `tap turned ${P.yaw}`);
  assert.ok(P.turnGoal == null && P.rebaked === 1, 'settles and re-bakes the pick mesh once');
  P.yaw = 0; c.keys.KeyX = true; c.turnStep(P, -1);
  const steps = [];
  for (let i = 0; i < 60; i++) { const y = P.yaw; c.updateTurn(P, 1 / 60); steps.push(Math.abs(P.yaw - y)); }
  assert.ok(P.yaw < -Math.PI / 12 - 1.5, `holding X should keep turning, got ${P.yaw}`);
  assert.ok(Math.max(...steps) < 0.08, `turning must be smooth, biggest frame step ${Math.max(...steps)}`);
  c.keys.KeyX = false;
});

test('Z/X turn the body in paint mode and leaving paint keeps the paint camera angle', () => {
  const c = ctx(); const P = body(c);
  vm.runInContext(between('const TURN =', 'function setPose(') + ';globalThis.TURN = TURN;', c);
  for (const n of ['playing', 'active', 'controllable', 'onKey', 'togglePaint']) vm.runInContext(functionSource(game, n), c);
  vm.runInContext('globalThis.CAM = { ok: true };', c);
  c.G.paint = true;
  c.onKey({ code: 'KeyZ', ctrlKey: false, preventDefault() {} });
  assert.ok(P.turnGoal != null && P.turnGoal > 0, 'Z ignored in paint mode');
  c.G.paint = false; c.togglePaint(); assert.equal(c.G.paint, true);
  c.G.paintCam.yaw = 2.2; c.G.paintCam.pitch = 0.5;
  c.togglePaint();
  assert.equal(c.G.paint, false); assert.equal(c.G.ctrl.yaw, 2.2, 'camera snapped back to the pre-paint angle');
});

test('turn controls in paint mode roll a wall-stuck body instead of being ignored', () => {
  let rolled = 0;
  const c = ctx({ Stick: { rollBy(P, a) { rolled += a; } } }); const P = body(c); P.stick = { kind: 'wall' };
  vm.runInContext(between('const TURN =', 'function setPose(') + ';globalThis.TURN = TURN;', c);
  for (const n of ['playing', 'active', 'controllable', 'onKey']) vm.runInContext(functionSource(game, n), c);
  c.G.paint = true; c.onKey({ code: 'KeyZ', ctrlKey: false });
  assert.ok(Math.abs(rolled - Math.PI / 12) < 1e-9, 'paint Z did not roll along the wall normal');
});
