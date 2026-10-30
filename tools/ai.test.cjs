const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const THREE = require('../three.min.js'), V3 = THREE.Vector3;
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
function harness(overrides = {}) {
  const G = { t: 10, D: { huntSpeed: 2.7, hiderSkill: 'pro' }, phase: 'hunt', hunters: [], hiders: [], hostTag() { this.tags = (this.tags || 0) + 1; } };
  const c = { THREE, V3, Math, Map, Set, G, BrushPreview: { group: { visible: false } }, STEP: .3, colliders: [],
    rand: (a,b) => (a+b)/2, clamp: (x,a,b) => Math.min(b,Math.max(a,x)), lerp: (a,b,t) => a+(b-a)*t, angDiff: (a,b) => b-a,
    envHit: () => null, segClear: () => true, freeAt: () => true, route: (x,z,tx,tz) => [{x:tx,z:tz}],
    collideBody() {}, overlapsXZ: () => false, Sound: { alert() {} }, searchAround: () => [],
    stepNoise() {}, autoCamo() {}, POSES: {}, ...overrides };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('class Hunter {'), source.indexOf('/* ================= game / session')) + '\nthis.Hunter=Hunter;', c);
  vm.runInContext(source.slice(source.indexOf('const BOLT ='), source.indexOf('function update(dt)')), c);
  const h = Object.assign(Object.create(c.Hunter.prototype), {
    id: 'hunter', ai: true, pos: new V3(), yaw: 0, look: 0, pitch: 0, t: 0,
    state: 'chase', path: [], sus: new Map(), lastVis: new Set(), observed: new Map(),
    lookT: 100, pingCD: 100, confused: 0, swing: 0, markT: 0, stuckT: 0, repathT: 0,
    shootCD: 100, mark: {}, markBang: {}, animTool() {}, sync() {}, callout() {},
    follow() {}, faceTo(p) { this.facing = p.clone(); }, pickGoal() { this.state = 'patrol'; this.path=[]; }
  });
  G.hunters.push(h);
  return { c, G, h };
}
function target(x=5,z=0) { return { id: 'hider', ai: true, root: { position: new V3(x,0,z) }, body: {r:.2}, center() { return this.root.position.clone().add(new V3(0,.4,0)); } }; }

test('occluded hider cannot be tagged or detected by proximity through a wall', () => {
  const {h,G} = harness({ envHit: () => ({ distance: .2 }) }); const t=target(.6);
  h.focus=t; h.lastSeen=new V3(.6,0,0); h.seenT=9.9; h.lastVis.add(t);
  h.observed.set(t,{pos:new V3(.6,0,0),time:9.9});
  h.update(.05,[t]);
  assert.equal(G.tags||0,0); assert.equal(h.sus.get(t)||0,0);
});
test('cached visibility does not refresh last-seen from the live hidden position', () => {
  const {h} = harness(); const t=target(9,4);
  h.focus=t; h.lastSeen=new V3(5,0,0); h.seenT=9.9; h.lastVis.add(t);
  h.observed.set(t,{pos:new V3(5,0,0),time:9.9});
  h.update(.05,[t]); assert.equal(h.lastSeen.x,5); assert.equal(h.seenT,9.9);
});
test('high stale suspicion does not reacquire a hidden target while searching', () => {
  const {h} = harness(); const t=target(8);
  h.state='search'; h.focus=null; h.scanT=4; h.checks=[]; h.sus.set(t,1.2);
  h.update(.05,[t]); assert.equal(h.state,'search'); assert.equal(h.focus,null);
});

test('follow consumes reached corners before moving and never steps back toward them', () => {
  const {h,c}=harness(); h.follow=c.Hunter.prototype.follow; h.pos.set(1,0,0);
  h.path=[{x:.8,z:0},{x:3,z:0}]; let moved;
  h.moveToward=(x,z)=>{moved=x;return Math.abs(x-h.pos.x)};
  h.follow(.05,3); assert.equal(moved,3);
});
test('investigation stopping distance prevents a movement step toward a nearby target', () => {
  const {h,c}=harness(); h.follow=c.Hunter.prototype.follow; h.path=[{x:2,z:0}];
  h.moveToward=()=>assert.fail('already inside stopping distance');
  h.follow(.1,3,2.4); assert.equal(h.path.length,0);
});
test('goTo rejects a route containing an obstructed intermediate edge', () => {
  const {h}=harness({segClear:()=>false,route:()=>[{x:2,z:0},{x:5,z:0}]});
  h.goTo(5,0); assert.equal(h.path.length,0);
});

function mobileTarget(x=0,z=0) {
  const c=target(x,z); c.yaw=0;c.pose='stand';c.body.pos=c.root.position;c.body.vy=0;
  c.setYaw=y=>c.yaw=y;c.setPose=p=>c.pose=p;c.flush=()=>{};
  return c;
}
test('a blocked hider escape times out in place rather than teleporting to its destination', () => {
  const {c,G}=harness();const t=mobileTarget();
  t.bolt={path:[{x:10,z:0}],spot:{x:10,y:0,z:0,yaw:0,pose:'curl'},t:12};
  G.hiders=[t];c.stepBolt(t,.05);
  assert.equal(t.root.position.x,0);assert.equal(t.bolt,null);assert.equal(t.remoteMoving,0);
});
test('hiders reject elevated escape destinations they cannot walk onto', () => {
  const {c,G}=harness({findSpot:()=>({x:10,y:3,z:0,yaw:0,pose:'curl'}),freeAt:()=>true});
  const t=mobileTarget();G.hiders=[t];G.hunters=[];c.startBolt(t);
  assert.ok(!t.bolt);assert.equal(t.root.position.y,0);
});
test('hiders do not inspect a hunters private suspicion or react through walls', () => {
  const {c,G,h}=harness({envHit:()=>({distance:.2})});const t=mobileTarget();t.thinkT=0;
  h.state='investigate';h.pos.set(3,0,0);h.sus={get(){assert.fail('private suspicion is not perceptible')}};
  G.hiders=[t];c.updateAIHiders(.3);assert.ok(!t.boltTried);
});

test('switching investigation targets uses the new targets sampled position', () => {
  const {h}=harness();const a=target(4),b=target(8);
  h.state='investigate';h.focus=a;h.lastSeen=new V3(4,0,0);h.seenT=10;
  h.sus.set(b,.8);h.observed.set(b,{pos:new V3(7,0,0),time:10});
  h.update(.05,[a,b]);assert.equal(h.focus,b);assert.equal(h.lastSeen.x,7);
});
test('render-diff overlap does not grant an observation to a wall-occluded hider', () => {
  const A=new Uint8Array(16),B=new Uint8Array(16);
  const {h,G}=harness({envHit:()=>({distance:.2}),VW:2,VH:2,AREA_COMP:1,scene:{},
    bufA:A,bufB:B,bufPair:new Uint8Array(32),visCam:new THREE.PerspectiveCamera(),
    ndcRect:()=>({x0:-1,x1:1,y0:-1,y1:1}),visRT:{viewport:new THREE.Vector4(),scissor:new THREE.Vector4()},
    PeperPerf:{splitVision(){A.fill(255);B.fill(0)}},
    renderer:{getRenderTarget(){},getViewport:v=>v,getScissor:v=>v,getScissorTest:()=>false,
      setRenderTarget(){},setViewport(){},setScissor(){},setScissorTest(){},render(){},readRenderTargetPixels(){}}
  });
  const t=target(4);t.mesh=new THREE.Mesh(new THREE.BoxGeometry(.4,.8,.4));
  G.hunters=[];G.hiders=[t];G.fxHide=[];G.D.K=.1;
  h.perceive([t],.25);assert.equal(h.observed.has(t),false);assert.equal(h.sus.get(t)||0,0);
});

test('a hunter abandons an investigation after sustained blocked movement', () => {
  const {h,G}=harness();const t=target(7);h.focus=t;h.state='investigate';h.lastSeen=new V3(7,0,0);h.seenT=10;h.sus.set(t,.7);
  for(let i=0;i<40;i++){G.t+=.05;h.observed.set(t,{pos:new V3(7,0,0),time:G.t});h.update(.05,[t]);}
  assert.notEqual(h.state,'investigate');
});
test('hiders cannot teleport down from an elevated starting spot to escape', () => {
  const {c,G}=harness({findSpot:()=>({x:10,y:0,z:0,yaw:0,pose:'curl'}),freeAt:()=>true});
  const t=mobileTarget();t.root.position.y=3;G.hiders=[t];G.hunters=[];c.startBolt(t);
  assert.ok(!t.bolt);assert.equal(t.root.position.y,3);
});

test('patrol chooses another room waypoint when its preferred overlook is blocked', () => {
  const zn={id:'room',x0:2,x1:10,z0:-2,z1:2,pts:[[4,0],[8,0]]};
  const {h,c}=harness({ZONES:[zn],teamMem:()=>({seen:{},claim:{}}),hidingChecks:()=>[{x:4,y:.2,z:0}],overlookPoint:()=>[4,0],segClear:(a,z,b)=>b!==4});
  h.pickGoal=c.Hunter.prototype.pickGoal;h.visited={};h.pickGoal();
  assert.equal(h.path.at(-1)?.x,8);assert.equal(h.state,'patrol');
});

test('repeated replans still advance a hunter monotonically to its stopping radius', () => {
  const {h,c}=harness({route:()=>[{x:0,z:0},{x:5,z:0}]});
  h.follow=c.Hunter.prototype.follow;h.body={pos:h.pos,r:.3,h:1.8};
  let previous=0;
  for(let i=0;i<60;i++){if(i%4===0)h.goTo(5,0);h.follow(.05,3);assert.ok(h.pos.x>=previous-1e-9);previous=h.pos.x;}
  assert.ok(h.pos.x>=4.64&&h.pos.x<=4.66);
});
test('unoccluded close contact can still detect and tag a hider', () => {
  const {h,G}=harness();const t=target(.6);h.state='patrol';h.focus=null;
  h.update(.05,[t]);assert.equal(G.tags,1);assert.equal(h.state,'scan');
});
test('hiders can react to a visible human seeker without reading private suspicion', () => {
  const {c,G,h}=harness();const t=mobileTarget();t.thinkT=0;G.hiders=[t];
  h.pos.set(3,0,0);h.look=-Math.PI/2;h.ai=false;h.state='wait';
  h.sus={get(){assert.fail('private suspicion read')}};
  c.Math=Object.create(Math);c.Math.random=()=>0;let observed;
  c.startBolt=(target,p)=>{observed=p;};c.updateAIHiders(.3);
  assert.equal(t.boltTried,true);assert.equal(observed.x,3);assert.notEqual(observed,h.pos);
});
test('a successful hider escape walks to its destination without a long final snap', () => {
  const {c,G}=harness({findSpot:()=>({x:6,y:0,z:0,yaw:0,pose:'curl'}),freeAt:()=>true});
  const t=mobileTarget();G.hiders=[t];G.hunters=[];c.startBolt(t);assert.ok(t.bolt);
  let previous=0;
  for(let i=0;i<100&&t.bolt;i++){c.stepBolt(t,.05);assert.ok(t.root.position.x-previous<=.35);previous=t.root.position.x;}
  assert.equal(t.bolt,null);assert.equal(t.root.position.x,6);assert.equal(t.pose,'curl');
});

test('chase uses the sampled last-seen position immediately after losing sight', () => {
  const {h,G} = harness(); const t = target(9,4);
  h.focus=t; h.sus.set(t,1.2); h.lastSeen=new V3(5,0,0); h.seenT=9.9;
  h.update(.05,[t]);
  assert.equal(h.path[0].x,5); assert.equal(h.path[0].z,0);
  assert.equal(h.facing.x,5); assert.equal(G.tags||0,0);
});
test('chasing a hider on an unstandable top walks to a free spot within tag reach instead of freezing', () => {
  const blocked = (x, z) => Math.abs(x - 5) < 0.5 && Math.abs(z) < 0.5;
  const { h } = harness({ freeAt: (x, z) => !blocked(x, z), route: (x, z, tx, tz) => blocked(tx, tz) ? [] : [{ x: tx, z: tz }] });
  h.goNear(5, 0);
  assert.equal(h.path.length, 1);
  const p = h.path[0];
  assert.ok(!blocked(p.x, p.z), 'approach point must be standable');
  assert.ok(Math.hypot(p.x - 5, p.z) <= 1.15, 'approach point must stay within tag reach');
  assert.ok(p.x < 5, 'approach from the hunter side');
});
test('chasing a hider beside a bench tags from the closest reachable spot instead of looping', () => {
  const tagged = [];
  const { h, G } = harness({ freeAt: (x, z) => Math.hypot(x - 5, z) >= 1.3 });
  G.hostTag = (id) => tagged.push(id);
  const t = target(5, 0); t.root.position.y = 0.45;
  h.pos.set(3.4, 0, 0); h.state = 'chase'; h.focus = t; h.sus.set(t, 1.2);
  h.lastSeen = new V3(5, 0.45, 0); h.seenT = 9.95; h.lastVis.add(t); h.observed.set(t, { pos: new V3(5, 0.45, 0), time: 9.95 });
  h.path = []; h.repathT = 1; h.swing = 0;
  h.update(.05, [t]);
  assert.deepEqual(tagged, ['hider']);
});
test('chase tag reach stays short while the hunter still has route left', () => {
  const tagged = [];
  const { h, G } = harness();
  G.hostTag = (id) => tagged.push(id);
  const t = target(5, 0);
  h.pos.set(3.4, 0, 0); h.state = 'chase'; h.focus = t; h.sus.set(t, 1.2);
  h.lastSeen = new V3(5, 0, 0); h.seenT = 9.95; h.lastVis.add(t); h.observed.set(t, { pos: new V3(5, 0, 0), time: 9.95 });
  h.repathT = 1; h.path = [{ x: 4.6, z: 0 }]; h.follow = () => {};
  h.update(.05, [t]);
  assert.deepEqual(tagged, []);
});
test('goTo verifies a route with the clearance it was planned with, not the wider body radius', () => {
  let asked;
  const { h } = harness({ segClear: (ax, az, bx, bz, r) => r <= 0.26, route: (x, z, tx, tz, r) => { asked = r; return [{ x: tx, z: tz }]; } });
  h.body = { r: 0.3 };
  h.goTo(5, 0);
  assert.equal(asked, 0.26); assert.equal(h.path.length, 1);
});
