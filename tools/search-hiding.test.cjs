const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const THREE = require('../three.min.js'), V3 = THREE.Vector3;
const s = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
function fn(name) { const st = s.indexOf('function ' + name + '('); assert.ok(st >= 0, name); const o = s.indexOf('{', st); let d = 1, e = o + 1; for (; d; e++) { if (s[e] === '{') d++; else if (s[e] === '}') d--; } return s.slice(st, e); }
function harness(extra = {}) {
  const tm = { seen: {}, claim: {}, lease: {}, checks: {} };
  const c = { THREE, V3, Math, Map, Set, G: { t: 10, D: { huntSpeed: 2.7 }, hunters: [] },
    teamMem: () => tm, envHit: () => null, freeAt: () => true, NODES: [], rand: (a, b) => (a + b) / 2,
    ...extra };
  vm.createContext(c);
  vm.runInContext(s.slice(s.indexOf('class Hunter {'), s.indexOf('/* ================= game / session')) + '\nthis.Hunter=Hunter;', c);
  const h = Object.assign(Object.create(c.Hunter.prototype), { id: 'H', state: 'scan', pos: new V3(), path: [], yaw: 0, look: 0, pitch: 0,
    roomGoal: 'kitchen', sweepI: 0, sweepT: 0, sweepPlanned: false, checks: [], scanT: 10, faceTo() {},
    goTo(x, z) { this.path = [{ x, z }]; }, follow() {} });
  c.G.hunters.push(h); return { c, h, tm };
}
test('room memory is cleared only when a physical geometry sweep finishes, not when patrol selects it', () => {
  assert.ok(!/tm\.seen\[zn\.id\]\s*=/.test(s.slice(s.indexOf('  pickGoal() {'), s.indexOf('  callout(p)'))), 'goal selection falsely clears room');
  const { h, tm, c } = harness(); tm.claim.H = 'kitchen';
  h.checks = [{ x: 0, y: .2, z: 2 }];
  h.sweepRoom(.1); assert.equal(tm.seen.kitchen, undefined, 'room cleared before inspecting');
  for (let i = 0; i < 12; i++) h.sweepRoom(.1);
  assert.equal(tm.seen.kitchen, c.G.t); assert.equal(tm.claim.H, undefined);
});
test('sweep repositions to a clear overlook rather than staring through a wall', () => {
  const { h, c } = harness({ NODES: [{ x: 2, z: 2 }, { x: 3, z: 1 }], envHit: (p) => p.x < 1 ? { distance: .2 } : null });
  h.checks = [{ x: 3, y: .3, z: 3 }]; h.sweepRoom(.1);
  assert.ok(h.path.length && h.path[0].x >= 2, 'did not walk to a real LOS point');
});
test('occluded furniture is not broadcast to teammates as checked', () => {
  const { h, tm } = harness({ envHit: () => ({ distance: .2 }) });
  h.checks = [{ x: 0, y: .3, z: 3 }];
  for (let i = 0; i < 10; i++) h.sweepRoom(.1);
  assert.equal(Object.keys(tm.checks).length, 0, 'cleared something behind a wall');
});
test('overlookPoint rejects a nearby nav point with an obstructed view', () => {
  const c = { V3, envHit: p => p.x < 1 ? { distance: .2 } : null };
  vm.createContext(c); vm.runInContext(fn('overlookPoint'), c);
  const p = c.overlookPoint({ x: 2, y: .3, z: 2 }, { pts: [[0, 2], [4, 2]] });
  assert.deepEqual(p, [4, 2]);
});
test('hiding score prefers covered/under-table spots to exposed floor and rewards spread', () => {
  const c = { V3, Math, POSES: { flat: { wall: true }, curl: {} }, MAP: { hunterSpawns: [] }, gateBox: null, unders: [{ x: 5, z: 5, w: 2, d: 2 }], envHit: () => null };
  vm.createContext(c); vm.runInContext(fn('hidingScore'), c);
  const floor = { x: 1, y: 0, z: 1, pose: 'curl' }, under = { x: 5, y: 0, z: 5, pose: 'curl' }, wall = { x: 5, y: 0, z: 5, pose: 'flat' };
  assert.ok(c.hidingScore(under, []) > c.hidingScore(floor, []) + 5, 'under-table should beat open floor');
  assert.ok(c.hidingScore(wall, []) > c.hidingScore(floor, []));
  assert.ok(c.hidingScore(under, [{ x: 15, z: 15 }]) > c.hidingScore(under, [{ x: 6, z: 5 }]), 'should spread out');
});
