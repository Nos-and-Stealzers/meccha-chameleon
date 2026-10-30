// v4.4 feel checks with real CDP mouse/key input in the Electron app.
// Launch an isolated profile; usage: node tools/feel-runtime.cjs <CDP-port> <output-dir>
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict'), WS = require('ws');
const port = process.argv[2] || 9341, out = process.argv[3];
assert.ok(out, 'give an output directory (screenshots + JSON report)');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const p = pages.find(p => p.type === 'page' && p.url.endsWith('/index.html'));
  assert.ok(p, 'Electron page missing');
  const ws = new WS(p.webSocketDebuggerUrl, { maxPayload: 1 << 28 });
  await new Promise(r => ws.once('open', r));
  let id = 0; const pending = {}, errors = [], report = { checks: [], errors };
  const call = (method, params = {}) => new Promise((res, rej) => { const n = ++id; const t = setTimeout(() => rej(Error(method + ' timed out')), 120000); pending[n] = d => { clearTimeout(t); d.error ? rej(Error(JSON.stringify(d.error))) : res(d.result); }; ws.send(JSON.stringify({ id: n, method, params })); });
  ws.on('message', m => { const d = JSON.parse(m); if (pending[d.id]) pending[d.id](d); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails); });
  const ev = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const mouse = (type, x, y, button = 'none', buttons = 0) => call('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1 });
  const key = async (code, type) => { const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code; const args = { code, key, windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : 0 }; if (type) await call('Input.dispatchKeyEvent', { ...args, type }); else { await call('Input.dispatchKeyEvent', { ...args, type: 'keyDown' }); await wait(30); await call('Input.dispatchKeyEvent', { ...args, type: 'keyUp' }); } };
  const shot = async name => { const r = await call('Page.captureScreenshot', { format: 'png' }); const f = path.join(out, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  const check = (ok, name) => { assert.ok(ok, name); report.checks.push(name); };
  const findPoint = `(()=>{const P=G.my,c=P.center().project(camera);P.rebake();P.root.updateMatrixWorld(true);camera.updateMatrixWorld(true);for(const dy of [0,.04,.08,.12,-.04]){rcPaint.setFromCamera(new THREE.Vector2(c.x,c.y+dy),camera);const h=rcPaint.intersectObject(P.mesh,false)[0];if(h)return [(c.x+1)*innerWidth/2,(1-c.y-dy)*innerHeight/2]}throw Error('no skin')})()`;
  const previewState = `({cursor:!BrushPreview.cursor.hidden,footprint:BrushPreview.group.visible,radius:BrushPreview.group.scale.x,mode:BrushPreview.cursor.className,panel:document.querySelector('#paintPanel').checkVisibility(),parent:document.querySelector('#paintPanel').parentElement.id,normal: new THREE.Vector3(0,0,1).applyQuaternion(BrushPreview.group.quaternion).toArray()})`;
  try {
    await call('Runtime.enable');
    await call('Page.reload');
    for (let i = 0; i < 300; i++) { if (await ev('!!window.__mc && G.phase === "menu"')) break; await wait(100); }
    const storage = await ev('JSON.stringify({...localStorage})');
    // practice hub paint, actual F key + a real mouse stroke
    await ev(`enterHub(); G.my.root.position.set(12,0,14); G.my.setYaw(0); G.my.setPose('stand',true); G.my.blank(); G.ctrl.yaw=.5;G.paused=false;`);
    await key('KeyF');
    await ev(`G.paintCam.yaw=.5;G.paintCam.pitch=.18;G.paintCam.dist=1.25;UI.tool('brush');UI.setBrush(14);UI.setColor('#39d8b0',false);G.paused=false;__mc.step(.016,2);`);
    await wait(600);
    let xy = await ev(findPoint);
    await mouse('mouseMoved', ...xy); await wait(200);
    report.hub = await ev(previewState);
    check(report.hub.cursor && report.hub.footprint && report.hub.panel && report.hub.parent === 'hubHud', 'practice has visible screen cursor, world footprint and toolbox');
    check(Math.abs(report.hub.radius - 14 / 118) < 1e-9, 'world footprint uses the same radius as the actual surface brush');
    await mouse('mousePressed', ...xy, 'left', 1);
    for (let i = 0; i < 5; i++) { await mouse('mouseMoved', xy[0] + i * 2, xy[1] - i * 8, 'left', 1); await wait(20); }
    await mouse('mouseReleased', xy[0] + 8, xy[1] - 32, 'left', 0);
    check(await ev('G.my.painted'), 'real drag paints the body');
    report.hubScreenshot = await shot('paint-hub');
    // Toolbar occlusion and tool sizes
    await mouse('mouseMoved', ...xy); await wait(80); await key('BracketRight');
    check(await ev('UI.brush===16'), 'bracket shortcut increases brush size');
    await mouse('mouseMoved', await ev('innerWidth-150'), 160); await wait(80);
    check(await ev('BrushPreview.cursor.hidden && !BrushPreview.group.visible'), 'brush hides over the toolbox (no paint-through UI)');
    // Paint turn advertised on the panel: actual Z key, then keep orbit when exiting paint.
    const y0 = await ev('G.my.yaw');
    await key('KeyZ'); await wait(500);
    const y1 = await ev('G.my.yaw');
    check(y1 > y0 + 0.2 && y1 < y0 + 0.3, 'Z actually turns the character 15 degrees in paint mode');
    await ev('G.paintCam.yaw=1.1'); await key('KeyF'); await wait(180);
    check(await ev('Math.abs(angDiff(G.ctrl.yaw,1.1))<.001'), 'leaving paint keeps the orbit angle (no camera snap-back)');
    // Round paint -> world sample -> first-person seek movement.
    await ev(`G.solo={kind:'hide',map:'mansion',diff:'normal'}; G.lock=()=>{}; void G.startSolo();`);
    for (let i = 0; i < 300; i++) { if (await ev('G.phase === "prep"')) break; await wait(100); }
    await ev('G.intro=null;G.paused=false;'); await key('KeyF');
    await ev(`G.paintCam.yaw=0;G.paintCam.pitch=.15;G.paintCam.dist=1.2;UI.tool('brush');UI.setBrush(12);UI.setColor('#ffaa47',false);__mc.step(.016,2);`);
    await wait(600); xy = await ev(findPoint); await mouse('mouseMoved', ...xy); await wait(150);
    report.round = await ev(previewState);
    check(report.round.cursor && report.round.footprint && report.round.parent === 'hud', 'round HUD has the same visible brush footprint and cursor');
    report.roundScreenshot = await shot('paint-round');
    await ev(`UI.tool('picker')`); await mouse('mouseMoved', xy[0] - 190, xy[1] - 50); await wait(100);
    check(await ev(`!BrushPreview.cursor.hidden && BrushPreview.group.visible && BrushPreview.cursor.className.includes('picker')`), 'eyedropper previews the world surface normal');
    report.sampleScreenshot = await shot('sample-surface');
    // Camera orbit follows actual CDP pointer-lock mouse input without the old angular delay.
    await key('KeyF');
    await ev(`G.lock=Object.getPrototypeOf(G).lock||G.lock;G.paused=false;G.intro=null;G.timer=1000;G.my.root.position.set(5,0,6);G.ctrl.yaw=.6;G.ctrl.pitch=.3;CAM.ok=false;`);
    // Explicit pointer request uses a user gesture from this click.
    await ev(`G.lock=function(){renderer.domElement.requestPointerLock().catch(()=>{})};`);
    await wait(1300); // Chromium rejects immediate re-lock for a short interval after an exit.
    await mouse('mousePressed', 650, 380, 'left', 1); await mouse('mouseReleased', 650, 380, 'left', 0); await wait(150);
    check(await ev('!!document.pointerLockElement'), 'real canvas click acquires pointer lock');
    await ev(`window.__feel={maxCamError:0,frames:0};window.__feelRender=renderer.render.bind(renderer);renderer.render=(s,c)=>{if(c===camera&&G.view==='third'&&!G.paint){const off=camera.position.clone().sub(CAM.pivot);if(off.length()>.01)__feel.maxCamError=Math.max(__feel.maxCamError,Math.abs(angDiff(Math.atan2(off.x,off.z),G.ctrl.yaw)));__feel.frames++;}return __feelRender(s,c)};`);
    const yawBefore = await ev('G.ctrl.yaw');
    for (let i = 0; i <= 24; i++) { await mouse('mouseMoved', 650 + i * 9, 380); await wait(8); }
    await wait(100);
    report.turning = await ev(`({...__feel,delta:angDiff(${yawBefore},G.ctrl.yaw)})`);
    await ev('renderer.render=__feelRender');
    check(Math.abs(report.turning.delta) > .2 && report.turning.maxCamError < .001, 'real mouse turn has no follow-camera angular lag');
    report.playScreenshot = await shot('playing-mansion');
    const p0 = await ev('G.my.root.position.toArray()'); await key('KeyW', 'keyDown'); await wait(550); await key('KeyW', 'keyUp');
    const p1 = await ev('G.my.root.position.toArray()');
    check(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > .2, 'real WASD moves the hider after painting');
    if (await ev('!!document.pointerLockElement')) await ev('document.exitPointerLock()');
    await ev(`G.solo={kind:'seek',map:'market',diff:'normal'};void G.startSolo();`);
    for (let i = 0; i < 300; i++) { if (await ev('G.phase==="prep" && MAP.id==="market"')) break; await wait(100); }
    await ev('G.paused=false;G.setPhase("hunt",180)');
    const fp0 = await ev('G.fp.pos.toArray()'); await key('KeyW', 'keyDown'); await wait(800); await key('KeyW', 'keyUp');
    const fp1 = await ev('G.fp.pos.toArray()');
    check(Math.hypot(fp1[0] - fp0[0], fp1[2] - fp0[2]) > .3, 'real WASD first-person hunter leaves the pen');
    report.seekScreenshot = await shot('playing-market-seek');
    check(await ev('JSON.stringify({...localStorage})') === storage, 'tests did not modify the saved profile');
    check(errors.length === 0, 'no renderer exceptions');
    fs.writeFileSync(path.join(out, 'feel.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { ws.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
