const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const THREE = require('../three.min.js');
function skinHarness() {
  const source = fs.readFileSync(path.join(root, 'chars.js'), 'utf8');
  const cls = source.slice(source.indexOf('class Cham {'), source.indexOf('/* ================= hunter avatars'));
  const c = { THREE, V3: THREE.Vector3, TS: 512, PSCALE: 1, clamp: (n, a, b) => Math.max(a, Math.min(b, n)) };
  vm.createContext(c); vm.runInContext(cls + '\nglobalThis.Cham = Cham;', c);
  const data = new Uint8ClampedArray(512 * 512 * 4); data.fill(255);
  const ctx = { fillStyle: '#ffffff', beginPath() {}, arc(x, y, r) { this.circle = { x, y, r }; }, fill() { const { x, y, r } = this.circle; for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) if ((i + .5 - x) ** 2 + (j + .5 - y) ** 2 <= r * r) data.set([255, 0, 0, 255], (j * 512 + i) * 4); }, getImageData(x, y, w, h) { const d = new Uint8ClampedArray(w * h * 4); for(let j=0;j<h;j++) d.set(data.subarray(((y+j)*512+x)*4,((y+j)*512+x+w)*4),j*w*4); return {data:d,width:w,height:h}; }, putImageData(im,x,y) {for(let j=0;j<im.height;j++) data.set(im.data.subarray(j*im.width*4,(j+1)*im.width*4),((y+j)*512+x)*4);} };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-.1,-.1,0, .1,-.1,0, 0,.1,0, 10,0,0, 10.1,0,0, 10,.1,0],3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([.45,.45, .55,.45, .5,.55, .552,.45, .562,.45, .552,.46],2));
  geo.setIndex([0,1,2,3,4,5]);
  const mesh = new THREE.Mesh(geo); mesh.updateMatrixWorld(true);
  const skin = Object.create(c.Cham.prototype); Object.assign(skin, {ctx, mesh});
  return { skin, data, hit: { object: mesh, point: new THREE.Vector3(0,0,0), face: { normal: new THREE.Vector3(0,0,1) }, uv: new THREE.Vector2(.5,.5) } };
}
function harness() {
  const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  const paint = source.slice(source.indexOf('/* ---------- painting ---------- */'), source.indexOf('/* ---------- hunter bonk ---------- */'));
  const dots = [], rays = [];
  const P = { mesh: {}, root: { updateMatrixWorld() {} }, rebake() {}, paintDot(uv, color, size, hit) { dots.push({ uv, color, size, hit }); }, flush() {} };
  class Raycaster {
    constructor() { this.ray = { direction: new THREE.Vector3(0, 0, -1) }; }
    setFromCamera(v) { this.ndc = v.clone(); rays.push(v.clone()); }
    intersectObject() { return [{ distance: 1, uv: new THREE.Vector2((this.ndc.x + 1) / 2, .5), point: new THREE.Vector3(), face: {normal: new THREE.Vector3(0, 0, 1)} }]; }
  }
  const c = { THREE: { ...THREE, Raycaster }, G: { my: P, ink: 100, phase: 'prep' }, UI: { brush: 2, color: '#ff0000', curTool: 'brush', refreshInk() {} }, mouse: { lastUV: null }, camera: {}, renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } }, innerWidth: 800, innerHeight: 600, TS: 512, PSCALE: 1, Math, Sound: { splat() {}, click() {} }, toast() {}, envHit: () => ({ object: {}, distance: Infinity }), surfaceColor: () => [100, 120, 140] };
  vm.createContext(c); vm.runInContext(paint, c);
  return { c, dots, rays };
}
test('surface brush does not bleed onto distant body parts packed beside the hit UV', () => {
  const { skin, data, hit } = skinHarness();
  hit.uv.set(.54,.45); hit.point.set(.08,-.1,0);
  skin.paintDot(hit.uv, '#ff0000', 12, hit);
  const pixel = (u,v) => [...data.subarray((Math.floor((1-v)*512)*512+Math.floor(u*512))*4,(Math.floor((1-v)*512)*512+Math.floor(u*512))*4+3)];
  assert.deepEqual(pixel(.554,.452), [255,255,255], 'UV-neighbor triangle ten metres away was painted');
  assert.deepEqual(pixel(.535,.455), [255,0,0], 'actual nearby skin was not painted');
});
test('surface brush crosses a real skin edge even when UV islands are far apart', () => {
  const {skin,data,hit}=skinHarness();
  skin.mesh.geometry.attributes.position.array.set([.1,-.1,0, .2,.1,0, 0,.1,0],9);
  skin.mesh.geometry.attributes.uv.array.set([.8,.2,.9,.2,.8,.3],6);
  hit.point.set(.045,0,0);hit.uv.set(.525,.5);
  skin.paintDot(hit.uv,'#ff0000',12,hit);
  const k=(Math.floor(.76*512)*512+Math.floor(.82*512))*4;
  assert.deepEqual([...data.subarray(k,k+3)],[255,0,0],'adjacent skin across atlas seam stayed white');
});
test('surface brush leaves reverse-facing skin unpainted', () => {
  const {skin,data,hit}=skinHarness();
  skin.mesh.geometry.attributes.position.array.set([-.1,-.1,-.03, .1,-.1,-.03, 0,.1,-.03],9);
  skin.mesh.geometry.attributes.uv.array.set([.8,.2,.9,.2,.85,.3],6);
  skin.mesh.geometry.setIndex([0,1,2,3,5,4]);
  skin.paintDot(hit.uv,'#ff0000',20,hit);
  const k=(Math.floor(.75*512)*512+Math.floor(.85*512))*4;
  assert.deepEqual([...data.subarray(k,k+3)],[255,255,255],'brush painted through the body onto its back');
});
test('repeated stationary dabs still paint after changing colour', () => {
  const {c,dots}=harness();
  c.paintAt({clientX:400,clientY:300},true);c.UI.color='#0000ff';
  c.paintAt({clientX:400,clientY:300},false);
  assert.equal(dots.length,2);assert.equal(dots[1].color,'#0000ff');
});
test('paint controls are attached to the visible hub HUD during practice painting', () => {
  const source = fs.readFileSync(path.join(root, 'ui.js'), 'utf8');
  const method = source.slice(source.indexOf('  paintPanel(on) {'), source.indexOf('  tool(t) {'));
  const nodes = new Map();
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, {classList:{toggle(){}},appendChild(child){child.parentElement=this;}}); return nodes.get(id); };
  const c = { $: node, document:{body:{classList:{toggle(){}}}}, G:{phase:'hub',my:{mat:{roughness:.85,metalness:0}}}, SHAPES:{},isUnlocked(){return true},segHTML(){return ''} };
  vm.createContext(c); vm.runInContext('globalThis.UI = {'+method+'refreshInk(){},refreshBars(){}};',c);
  node('#paintPanel').parentElement = node('#hud');
  c.UI.paintPanel(true);
  assert.equal(node('#paintPanel').parentElement,node('#hubHud'),'panel is inside #hud, which is hidden in the hub');
});
test('mimic stops dabbing when the remaining ink runs out', () => {
  const { c, dots } = harness(); c.UI.curTool = 'mimic'; c.G.ink = .001;
  c.paintAt({clientX:400,clientY:300}, true);
  assert.equal(dots.length, 1, 'one tiny ink remainder must not buy a full 16-dab burst');
  assert.equal(c.G.ink, 0);
  assert.ok(dots[0].hit, 'mimic must use the same surface-constrained footprint');
});
test('undo restores the unpainted state as well as pixels', () => {
  const {c} = harness(); const P=c.G.my;
  P.ctx={getImageData(){return {data:[255,255,255]};},putImageData(){}}; P.painted=false;
  c.pushUndo(); P.painted=true; c.undo();
  assert.equal(P.painted,false,'undoing the first stroke left a blank body marked painted');
});
test('undo never writes into the disposed avatar from a previous round', () => {
  const {c}=harness(); let staleWrites=0;
  c.G.my.ctx={getImageData(){return {data:[]};},putImageData(){staleWrites++;}};
  c.pushUndo(); c.G.my={}; c.undo(); assert.equal(staleWrites,0);
});
test('brush rays use the current animated pick geometry', () => {
  const { c } = harness(); let bakes = 0, matrices = 0;
  c.G.my.rebake = () => bakes++; c.G.my.root = {updateMatrixWorld(){matrices++;}};
  c.paintAt({clientX:400,clientY:300},true);
  assert.equal(bakes,1,'animated bones moved but the brush still picks the old pose');
  assert.equal(matrices,1);
});
test('picker and fill tools never fall through into a brush drag', () => {
  for(const tool of ['picker','fill']) {
    const {c,dots}=harness(); c.UI.curTool=tool;
    c.paintAt({clientX:400,clientY:300},false);
    assert.equal(dots.length,0,tool+' painted an unwanted brush dab');
  }
});
test('fast brush drags cover the screen segment instead of skipping large UV jumps', () => {
  const { c, dots } = harness();
  c.paintAt({ clientX: 300, clientY: 300 }, true);
  c.paintAt({ clientX: 500, clientY: 300 }, false);
  assert.ok(dots.length > 20, `only ${dots.length} disconnected dabs for a 200px stroke`);
  for (let i = 1; i < dots.length; i++) assert.ok(Math.abs(dots[i].uv.x - dots[i - 1].uv.x) <= .011, 'stroke has an unpainted gap');
});
