const test=require('node:test'), assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
test('a 10 FPS renderer must advance the game clock by one second per wall second',()=>{
 const s=fs.readFileSync(path.join(root,'game.js'),'utf8');const match=s.match(/function frame\(now\) \{[^\n]+\}/);assert.ok(match);
 const c={last:0,elapsed:0,Math,G:{phase:'hunt'},adaptQuality(){},step(dt){c.elapsed+=dt;},requestAnimationFrame(){}};vm.createContext(c);vm.runInContext(match[0],c);
 for(let now=100;now<=1000;now+=100)c.frame(now);
 assert.ok(Math.abs(c.elapsed-1)<1e-8,`simulation ran ${c.elapsed}s in 1s (slow-motion bug)`);
});

test('automatic quality chooses a cheap path on weak GPUs without lowering strong GPUs',()=>{
 const file=path.join(root,'perf.js');assert.ok(fs.existsSync(file));const {chooseQuality}=require(file);
 assert.equal(typeof chooseQuality,'function','GPU quality classifier missing');
 for(const gpu of ['Google SwiftShader','llvmpipe','Intel(R) UHD Graphics 620','Intel Iris Xe','Adreno 640','Apple GPU']) assert.equal(chooseQuality(gpu,4),'low',gpu);
 assert.equal(chooseQuality('NVIDIA GeForce RTX 4060',12),'high');assert.equal(chooseQuality('AMD Radeon RX 7800 XT',12),'high');
 assert.equal(chooseQuality('',8),'medium');
});
test('fast map materials preserve paint colours/textures and restore when High is selected',()=>{
 const {applyMapQuality}=require('../perf.js');assert.equal(typeof applyMapQuality,'function','fast map quality path missing');
 class Lambert{constructor(p){Object.assign(this,p);this.isMeshLambertMaterial=true;}dispose(){this.disposed=true;}}
 const mat={isMeshStandardMaterial:true,color:{marker:'paint-colour'},map:{marker:'texture'},emissive:{marker:'glow'},opacity:.6,transparent:true,alphaTest:.2,side:2,depthWrite:false,vertexColors:true};
 const mesh={isMesh:true,material:mat},lamps=Array.from({length:15},()=>({isPointLight:true,visible:true}));
 const group={traverse(fn){for(const o of [mesh,...lamps])fn(o);}};
 applyMapQuality({MeshLambertMaterial:Lambert},group,'low');assert.equal(mesh.material.map,mat.map);assert.equal(mesh.material.color,mat.color);assert.equal(mesh.material.alphaTest,.2);assert.equal(mesh.material.depthWrite,false);assert.equal(lamps.filter(l=>l.visible).length,3);
 applyMapQuality({MeshLambertMaterial:Lambert},group,'high');assert.equal(mesh.material,mat);assert.equal(lamps.filter(l=>l.visible).length,15);
});
test('paired hunter views split row-by-row with no colour or pixel displacement',()=>{
 const {splitVision}=require('../perf.js');assert.equal(typeof splitVision,'function','batched vision readback missing');
 const data=Uint8Array.from([1,2,3,4,5,6,7,8, 9,10,11,12,13,14,15,16]);const a=new Uint8Array(8),b=new Uint8Array(8);
 splitVision(data,1,2,a,b);assert.deepEqual([...a],[1,2,3,4,9,10,11,12]);assert.deepEqual([...b],[5,6,7,8,13,14,15,16]);
});
test('a high-refresh display does not render more than 65 game frames per second',()=>{
 const s=fs.readFileSync(path.join(root,'game.js'),'utf8'),fn=s.match(/function frame\(now\) \{[^\n]+\}/)[0];
 const c={last:0,renders:0,Math,G:{phase:'hunt'},adaptQuality(){},step(){c.renders++},requestAnimationFrame(){}};vm.createContext(c);vm.runInContext(fn,c);
 for(let i=1;i<=180;i++)c.frame(i*1000/180);assert.ok(c.renders<=65,`rendered ${c.renders} frames at 180 Hz`);assert.ok(c.renders>=55);
});
