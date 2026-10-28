// Run against an isolated dev Electron instance, never the player's profile.
// electron.exe . --remote-debugging-port=9441 --user-data-dir=<scratch-profile>
// node tools/painting-runtime.cjs 9441 [output-prefix]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const WS = require('ws');
const port = process.argv[2] || '9441';
const output = process.argv[3] || path.join(process.env.TMPDIR || os.tmpdir(), 'peperhide-paint-runtime');
async function verify() {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = pages.find(p => p.type === 'page' && p.url.endsWith('/index.html'));
  assert.ok(page, 'dev Electron index.html target missing');
  const ws = new WS(page.webSocketDebuggerUrl), pending = new Map(), errors = [];
  let id = 0;
  const call = (method, params={}) => new Promise((resolve, reject) => {
    const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(method+' timed out')); },120000);
    pending.set(n, msg => { clearTimeout(timer); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); });
    ws.send(JSON.stringify({id:n,method,params}));
  });
  ws.on('message', raw => { const msg=JSON.parse(raw); if(pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id);} if(msg.method==='Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails); });
  await new Promise(resolve => ws.once('open',resolve));
  try {
    await call('Runtime.enable');
    await call('Page.reload');
    for(let i=0;i<200;i++) {
      const r=await call('Runtime.evaluate',{expression:'!!window.__mc && G.phase === "menu"',returnByValue:true});
      if(r.result.value)break;
      await new Promise(r=>setTimeout(r,50));
    }
    const r = await call('Runtime.evaluate', {expression: `(${runtimeChecks.toString()})()`, awaitPromise:true, returnByValue:true});
    if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    const result=r.result.value;
    assert.equal(errors.length,0,JSON.stringify(errors));
    const shot=await call('Page.captureScreenshot',{format:'png'});
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output+'.png',Buffer.from(shot.data,'base64'));
    const rr=await call('Runtime.evaluate',{expression:`(${roundChecks.toString()})()`,awaitPromise:true,returnByValue:true});
    if(rr.exceptionDetails)throw new Error(rr.exceptionDetails.exception?.description||rr.exceptionDetails.text);
    result.round=rr.result.value;
    const roundShot=await call('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(output+'-round.png',Buffer.from(roundShot.data,'base64'));
    assert.equal(errors.length,0,JSON.stringify(errors));
    fs.writeFileSync(output+'.json',JSON.stringify({...result,rendererExceptions:errors},null,2));
    console.log(JSON.stringify({...result,screenshot:output+'.png',roundScreenshot:output+'-round.png',report:output+'.json',rendererExceptions:errors},null,2));
  } finally {ws.close();}
}
async function runtimeChecks() {
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const checks=[]; const pass=name=>checks.push(name);
  const savedStorage=JSON.stringify({...localStorage});
  enterHub(); togglePaint(); await wait(100);
  G.paused=true;
  check(G.paint && document.querySelector('#paintPanel').checkVisibility(), 'practice paint toolbox is invisible');
  pass('practice toolbox visible and interactive');
  const P=G.my, canvas=renderer.domElement;
  const pixels=()=>P.ctx.getImageData(0,0,TS,TS).data;
  const equal=(a,b)=>a.length===b.length && a.every((n,i)=>n===b[i]);
  const countColor=(a,r,g,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]===r&&a[i+1]===g&&a[i+2]===b)n++;return n;};
  function frame(yaw=0) {
    G.paintCam.yaw=yaw; G.paintCam.dist=1.2;
    P.rebake(); P.root.updateMatrixWorld(true);
    thirdCam(P.center(),yaw,.15,1.2,0,true);
    camera.updateMatrixWorld(true); renderer.render(scene,camera);
  }
  function target() {
    const r=new THREE.Raycaster(), center=P.center().project(camera);
    // Find a broad torso hit rather than the gap between the legs.
    for(const dy of [0,.04,.08,.12,-.04,-.08,-.12,.16,-.16]) {
      r.setFromCamera(new THREE.Vector2(center.x,center.y+dy),camera);
      const h=r.intersectObject(P.mesh,false)[0];
      if(h)return {clientX:(center.x+1)*innerWidth/2,clientY:(1-center.y-dy)*innerHeight/2,hit:h};
    }
    throw new Error('no visible skin hit');
  }
  function click(t) {
    canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:t.clientX,clientY:t.clientY}));
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,clientX:t.clientX,clientY:t.clientY}));
  }
  frame(); P.blank(); const before=pixels(); const t=target();
  UI.tool('brush');UI.setColor('#ff0000',false);UI.brush=10;
  const texBefore=P.texVer;
  click(t);
  check(countColor(pixels(),255,0,0)>20,'brush click changed no skin');
  check(P.texVer>texBefore,'brush did not flush texture version');
  pass('pointer-driven brush paints real CanvasTexture');
  undo();check(equal(before,pixels())&&!P.painted,'undo did not restore exact pixels and blank state');
  pass('undo restores exact image and blank flag');
  UI.tool('fill');UI.setColor('#2266cc',false);click(t);
  check(countColor(pixels(),34,102,204)===TS*TS,'fill did not paint whole atlas');
  undo();check(equal(before,pixels()),'fill undo failed');
  pass('fill and undo preserve exact atlas');
  const expectedHit=(()=>{const r=new THREE.Raycaster();r.setFromCamera(evNdc(t.clientX,t.clientY),camera);return r.intersectObjects(env,false)[0];})();
  check(expectedHit,'no environment for picker');
  const c=surfaceColor(expectedHit),expected='#'+new THREE.Color(c[0]/255,c[1]/255,c[2]/255).getHexString();
  UI.tool('picker');click(t);check(UI.color===expected&&equal(before,pixels()),'eyedropper changed skin or sampled wrong albedo');
  pass('eyedropper samples environment albedo without painting');
  UI.tool('mimic');const oldPhase=G.phase;G.phase='prep';G.ink=.001;
  let dabs=0;const dot=P.paintDot;P.paintDot=function(...args){dabs++;return dot.apply(this,args);};
  click(t);P.paintDot=dot;G.phase=oldPhase;
  check(dabs===1&&G.ink===0,'low mimic ink allowed an extra burst or missed body');
  check(!equal(before,pixels()),'mimic painted no real pixels');
  pass('mimic paints sampled background and respects final ink budget');
  undo();
  const samples=[];
  UI.tool('brush');UI.setColor('#ff0000',false);
  for(const pose of ['stand','crouch','flat']) for(const yaw of [0,Math.PI/2,Math.PI]) {
    P.setPose(pose,true);frame(yaw);P.fill('#ffffff');UI.brush=10;
    const t=target(),start=performance.now();click(t);
    const red=countColor(pixels(),255,0,0);
    check(red>10,pose+' at yaw '+yaw+' did not paint');
    samples.push({pose,yaw,redPixels:red,clickMs:Math.round((performance.now()-start)*100)/100});
  }
  pass('surface brush works in three poses from front, side and back');
  P.setPose('stand',true);frame();P.fill('#ffffff');UI.brush=2;
  let small=target();click(small);const smallPixels=countColor(pixels(),255,0,0);
  P.fill('#ffffff');UI.brush=48;click(small);const largePixels=countColor(pixels(),255,0,0);
  check(largePixels>smallPixels*2,'brush-size control does not enlarge footprint');
  pass('small and large brush settings change world-space coverage');
  P.blank();UI.brush=8;frame();const drag=target();
  canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:drag.clientX,clientY:drag.clientY-18}));
  window.dispatchEvent(new MouseEvent('mousemove',{clientX:drag.clientX,clientY:drag.clientY+18,movementY:36}));
  window.dispatchEvent(new PointerEvent('pointerup',{button:0}));
  check(countColor(pixels(),255,0,0)>20&&!mouse.down,'drag stroke or release failed');
  pass('pointer down/move/up stroke paints and releases');
  renderer.render(scene,camera);await wait(100);
  check(JSON.stringify({...localStorage})===savedStorage,'painting checks mutated saved profile');
  pass('profile/localStorage unchanged');
  return {checks,phase:G.phase,nativeBridge:!!window.mcNative,webgl:renderer.getContext().getParameter(renderer.getContext().VERSION),smallPixels,largePixels,samples};
}
async function roundChecks() {
  const savedStorage=JSON.stringify({...localStorage});
  G.solo.kind='hide';G.solo.map='mansion';G.solo.diff='easy';
  await G.startSolo();G.intro=null;G.paused=true;
  if(!G.paint)togglePaint();
  const P=G.my;P.setPose('stand',true);P.rebake();P.root.updateMatrixWorld(true);
  thirdCam(P.center(),0,.15,1.2,0,true);camera.updateMatrixWorld(true);
  if(document.querySelector('#paintPanel').parentElement.id!=='hud'||!document.querySelector('#paintPanel').checkVisibility())throw new Error('round paint toolbox failed to move back from hub');
  UI.tool('brush');UI.setColor('#00cc66',false);UI.brush=10;P.blank();
  const ray=new THREE.Raycaster(),c=P.center().project(camera);let hit;
  for(const dy of [0,.04,.08,.12,-.04]){ray.setFromCamera(new THREE.Vector2(c.x,c.y+dy),camera);hit=ray.intersectObject(P.mesh,false)[0];if(hit){paintAt({clientX:(c.x+1)*innerWidth/2,clientY:(1-c.y-dy)*innerHeight/2},true);break;}}
  const d=P.ctx.getImageData(0,0,TS,TS).data;let green=0;for(let i=0;i<d.length;i+=4)if(d[i]===0&&d[i+1]===204&&d[i+2]===102)green++;
  if(!green)throw new Error('round brush painted no green skin');
  renderer.render(scene,camera);await new Promise(r=>setTimeout(r,1800));
  if(JSON.stringify({...localStorage})!==savedStorage)throw new Error('round painting changed saved profile');
  return {phase:G.phase,map:MAP.id,visibleToolbox:true,greenPixels:green,profileUnchanged:true};
}
verify().catch(e=>{console.error(e);process.exitCode=1;});
