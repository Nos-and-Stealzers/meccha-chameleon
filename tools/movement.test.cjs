const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../three.min.js');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
function functionSource(text, name) {
  const start = text.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  const open = text.indexOf('{', start); let depth = 1, end = open + 1;
  for (; depth; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; }
  return text.slice(start, end);
}
function harness() {
  const noop = () => {};
  const c = { THREE, V3: THREE.Vector3, Math, window: { mcNative: true }, keys: {},
    MAP: { bounds: { x0: -20, x1: 20, z0: -20, z1: 20 }, floorY: 0, ceilH: 10 }, colliders: [],
    G: { t: 1, stam: 1, phase: 'hunt', ctrl: { yaw: 0 }, fx: [], targets: () => [] },
    UI: { refreshBars: noop, stamina: noop, crossHot: noop }, Sound: { jump: noop, pant: noop, step: noop, thud: noop },
    POSES: { stand: { move: true }, crouch: { move: true, speed: .5 }, flat: {}, lie: {} },
    SETTINGS: { fov: 75 }, swingT: 0, camera: new THREE.PerspectiveCamera(), toolVM: new THREE.Group(),
    rcBonk: new THREE.Raycaster(), env: [], stepNoise: noop, dustPuff: noop, toast: noop, lyingPose: p => p === 'lie',
    clamp: (n,a,b) => Math.max(a,Math.min(b,n)), lerp: (a,b,t) => a+(b-a)*t,
    angDiff: (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a)) };
  vm.createContext(c);
  const core = source('core.js');
  vm.runInContext(core.slice(core.indexOf('function pushOut('), core.indexOf('function freeAt(')), c);
  const game = source('game.js');
  for (const name of ['sprintHeld','crouchHeld','updateStamina','updateMyCham','updateFP']) vm.runInContext(functionSource(game,name), c);
  vm.runInContext(source('systems.js').split('/* ======================= buried check')[0] + '\nglobalThis.Stick = Stick;', c);
  const rootObj = new THREE.Group();
  const P = { root: rootObj, body: { pos: rootObj.position, vy: 0, onGround: true, r: .15, h: .8 },
    pose: 'stand', yaw: 0, dims: new THREE.Vector3(.3,.8,.3), autoCrouch: false,
    setPose(p) { this.pose = p; this.body.h = p === 'crouch' ? .4 : .8; }, setYaw(y) { this.yaw = y; },
    animate: noop, rebake: noop };
  c.G.my = P;
  return c;
}
function wall(c, x, width=.04) { c.colliders.push(new THREE.Box3(new THREE.Vector3(x,0,-5),new THREE.Vector3(x+width,3,5))); }

function hunter(c) {
  c.G.fp = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, vy: 0, onGround: true, r: .3, h: 1.7 };
  return c.G.fp;
}
test('sprinting hunter cannot tunnel through a thin edited wall', () => {
  const c=harness(), f=hunter(c); wall(c,.35); c.keys.KeyD=true; c.keys.ShiftLeft=true;
  c.updateFP(.1);
  assert.ok(f.pos.x <= .35-.3+1e-6, `crossed wall: ${f.pos.x}`);
});

test('ceiling drop wins over a blocked crawl direction', () => {
  const c=harness(), P=c.G.my;
  P.stick={kind:'ceil'}; c.keys.KeyW=true; c.keys.KeyC=true;
  c.Stick.ahead=()=>({}); let released=false; c.Stick.release=()=>{released=true;P.stick=null;};
  c.Stick.update(P,.05,true);
  assert.equal(released,true,'wall ahead swallowed drop input');
});

test('descending a wall releases at the feet even when the rotated root is above the floor', () => {
  const c=harness(), P=c.G.my; c.CHAM_H=.8;
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute([0,-.5,0, 0,.3,0, .1,0,.1],3));
  P.mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial()); P.root.add(P.mesh); P.rig={pickGeo:geo};
  P.root.position.set(.012,.504,0); P.setOrient=()=>{};
  P.stick={kind:'wall',n:new THREE.Vector3(1,0,0),point:new THREE.Vector3()}; c.keys.KeyS=true;
  c.Stick.update(P,.1,true);
  assert.equal(P.stick,null,'root position prevented floor release');
});

test('hunter movement is gated by wheel, panel, paint and pause as well as chat', () => {
  for (const flag of ['wheelOpen','panelOpen','chatOpen','paint','paused']) {
    const c=harness(), f=hunter(c); (flag==='paint'||flag==='paused' ? c.G : c.UI)[flag]=true;
    c.keys.KeyD=true; c.keys.Space=true; c.updateFP(.05);
    assert.equal(f.pos.x,0,flag+' allowed walking'); assert.equal(f.pos.y,0,flag+' allowed jumping');
  }
});

test('surface flush fits every vertex, not only one vertex per triangle', () => {
  const c=harness(), P=c.G.my;
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute([-.1,.2,0, -.4,.3,0, -.2,.4,.1],3));
  P.mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial()); P.root.add(P.mesh); P.rig={pickGeo:geo};
  P.stick={kind:'wall',n:new THREE.Vector3(1,0,0),point:new THREE.Vector3()};
  c.Stick.flush(P); P.root.updateMatrixWorld(true);
  for(let i=0;i<3;i++) {
    const v=new THREE.Vector3().fromBufferAttribute(geo.attributes.position,i).applyMatrix4(P.mesh.matrixWorld);
    assert.ok(v.x>=.012-1e-6,`vertex ${i} buried at ${v.x}`);
  }
});

test('sticking clears sprint state and regenerates stamina', () => {
  const c=harness(), P=c.G.my; P.stick={kind:'wall'}; P.sprinting=true; P.wasMoving=true;
  c.G.stam=.2; c.G.stamRest=0; c.Stick.update=()=>{};
  c.updateMyCham(.1);
  assert.equal(P.sprinting,false); assert.equal(P.wasMoving,false);
  assert.ok(c.G.stam>.2,'stamina froze on the wall');
});

test('sprinting hider cannot tunnel through a thin edited wall', () => {
  const c=harness(); wall(c,.22); c.keys.KeyD=true; c.keys.ShiftLeft=true;
  c.updateMyCham(.1);
  assert.ok(c.G.my.root.position.x <= .22-.15+1e-6, `crossed wall: ${c.G.my.root.position.x}`);
});

test('map bounds contain the whole body radius for both roles', () => {
  for(const radius of [.09,.15,.3]) {
    const c=harness(), f=hunter(c); f.r=radius; f.pos.x=19.6;
    c.moveBody(f,1,0);
    assert.ok(f.pos.x<=20-radius+1e-8,`radius ${radius} clips outside map at ${f.pos.x}`);
  }
});

test('camera-relative diagonals preserve walk speed for both roles', () => {
  for(const role of ['hider','hunter']) {
    const c=harness(); const f=role==='hunter'?hunter(c):c.G.my.body;
    c.keys.KeyW=true; c.keys.KeyD=true;
    if(role==='hunter') c.updateFP(.1); else c.updateMyCham(.1);
    assert.ok(Math.abs(Math.hypot(f.pos.x,f.pos.z)-(role==='hunter'?.46:.34))<1e-8);
    assert.ok(f.pos.x>0 && f.pos.z<0);
  }
});

test('crouch, jump, sprint exhaustion and wall sliding remain functional', () => {
  const c=harness(), P=c.G.my;
  c.keys.KeyC=true; c.keys.KeyW=true; c.updateMyCham(.1);
  assert.equal(P.pose,'crouch'); assert.ok(Math.abs(P.root.position.z+.17)<1e-8);
  c.keys.KeyC=false; c.keys.Space=true; c.updateMyCham(.05);
  assert.equal(P.pose,'stand'); assert.ok(P.root.position.y>0); assert.equal(P.body.onGround,false);
  c.G.stam=.015; c.updateStamina(.1,true); assert.equal(c.G.tired,true);
  c.updateStamina(2,false); assert.equal(c.G.tired,false);
  P.root.position.set(0,0,0); P.body.vy=0; P.body.onGround=true;
  wall(c,.22); c.keys.Space=false; c.keys.KeyD=true; c.updateMyCham(.1);
  assert.ok(P.root.position.x<=.070001); assert.ok(P.root.position.z<-.2,'wall blocked tangential motion');
});
