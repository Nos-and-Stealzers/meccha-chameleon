const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const server = require('./server/server.js');

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

/* `--servers` opens the Server Manager instead of the game: it runs every server in servers.json from one window. */
const MANAGER = process.argv.includes('--servers');
// Keep existing profiles and server settings through the rename. Never reset player progress.
const profileOverride = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', profileOverride || path.join(app.getPath('appData'), MANAGER ? 'Meccha Chameleon Servers' : 'Meccha Chameleon'));
app.setName('peperhide');
const firstInstance = app.requestSingleInstanceLock();
if (!firstInstance) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

let win = null, hosted = null, listener = null;
const prefs = { contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') };

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640,
    title: 'peperhide', backgroundColor: '#11151f',
    icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true, webPreferences: prefs,
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
}

ipcMain.handle('host:start', async (_e, opts) => {
  if (hosted) { hosted.stop(); hosted = null; }
  try {
    hosted = await server.start({ ...opts, log: (...a) => console.log('[host]', ...a) });
    return { ok: true, port: hosted.port, ips: hosted.ips };
  } catch (e) { hosted = null; return { ok: false, error: e.code === 'EADDRINUSE' ? `Port ${opts.port} is already in use.` : e.message }; }
});
ipcMain.handle('host:stop', () => { if (hosted) { hosted.stop(); hosted = null; } return true; });
ipcMain.handle('lan:list', () => { if (!listener) listener = server.createListener(); return listener.list(); });
ipcMain.handle('net:ips', () => server.lanIPs());
ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('app:fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
ipcMain.handle('app:openManager', () => {
  const args = app.isPackaged ? ['--servers'] : [app.getAppPath(), '--servers'];
  spawn(process.execPath, args, { detached: true, stdio: 'ignore' }).unref();
  return true;
});

/* ================= Server Manager ================= */
const CFG_FILE = () => path.join(app.getPath('userData'), 'servers.json');
const DEFAULT_CFG = {
  autoStart: true,
  servers: [
    { name: 'peperhide Server 1', port: 7781, max: 15, password: '', enabled: true },
    { name: 'peperhide Server 2', port: 7782, max: 15, password: '', enabled: true },
  ],
};
let cfg = null;
const inst = [];   // runtime per config index: { srv, state, error, log[], retryT, startedAt }

function loadCfg() {
  try { cfg = JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')); } catch { cfg = JSON.parse(JSON.stringify(DEFAULT_CFG)); saveCfg(); }
  cfg.servers = (cfg.servers || []).slice(0, 8);
}
function saveCfg() { fs.mkdirSync(path.dirname(CFG_FILE()), { recursive: true }); fs.writeFileSync(CFG_FILE(), JSON.stringify(cfg, null, 2)); }
function validate(list) {
  const ports = new Set();
  for (const [i, s] of list.entries()) {
    s.port = Math.round(+s.port); s.max = Math.max(2, Math.min(24, Math.round(+s.max) || 15)); s.name = String(s.name || `peperhide Server ${i + 1}`).slice(0, 40);
    if (!(s.port >= 1024 && s.port <= 65535)) return `Server ${i + 1}: port must be 1024-65535.`;
    if (ports.has(s.port)) return `Two servers use port ${s.port}. Every server needs its own port.`;
    ports.add(s.port);
  }
  return null;
}
function slot(i) { return (inst[i] ||= { srv: null, state: 'stopped', error: '', log: [], retryT: null, startedAt: 0 }); }
function logTo(i, line) { const s = slot(i); s.log.push(new Date().toLocaleTimeString() + '  ' + line); if (s.log.length > 200) s.log.shift(); }
async function startOne(i) {
  const s = slot(i), c = cfg.servers[i];
  if (!c || s.srv || s.state === 'starting') return;
  clearTimeout(s.retryT); s.state = 'starting'; s.error = '';
  try {
    s.srv = await server.start({ name: c.name, port: c.port, max: c.max, password: c.password, dedicated: true, log: (...a) => logTo(i, a.join(' ')) });
    s.state = 'running'; s.startedAt = Date.now();
  } catch (e) {
    s.srv = null; s.state = 'error'; s.error = e.code === 'EADDRINUSE' ? `Port ${c.port} is in use. Retrying in 10 s.` : e.message;
    logTo(i, 'Failed: ' + s.error);
    s.retryT = setTimeout(() => { if (s.state === 'error') startOne(i); }, 10000);
  }
}
function stopOne(i) { const s = slot(i); clearTimeout(s.retryT); if (s.srv) { s.srv.stop(); logTo(i, 'Stopped'); } s.srv = null; s.state = 'stopped'; s.error = ''; }
function stopAll() { for (let i = 0; i < inst.length; i++) stopOne(i); }
function status() {
  return {
    cfg, ips: server.lanIPs(),
    servers: cfg.servers.map((c, i) => { const s = slot(i), info = s.srv ? s.srv.info() : null; return { state: s.state, error: s.error, info, uptime: s.srv ? Date.now() - s.startedAt : 0, log: s.log.slice(-60) }; }),
  };
}
ipcMain.handle('mgr:status', () => status());
ipcMain.handle('mgr:startAll', async () => { for (let i = 0; i < cfg.servers.length; i++) if (cfg.servers[i].enabled !== false) await startOne(i); return status(); });
ipcMain.handle('mgr:stopAll', () => { stopAll(); return status(); });
ipcMain.handle('mgr:start', async (_e, i) => { await startOne(i); return status(); });
ipcMain.handle('mgr:stop', (_e, i) => { stopOne(i); return status(); });
ipcMain.handle('mgr:save', (_e, next) => {
  const err = validate(next.servers || []);
  if (err) return { ok: false, error: err };
  const running = inst.map((s, i) => !!(s && s.srv));
  stopAll(); inst.length = 0;
  cfg = { autoStart: !!next.autoStart, servers: next.servers.slice(0, 8) }; saveCfg();
  running.forEach((r, i) => { if (r && cfg.servers[i]) startOne(i); });
  return { ok: true, status: status() };
});
ipcMain.handle('mgr:openConfig', () => { require('electron').shell.showItemInFolder(CFG_FILE()); return true; });

function createManager() {
  loadCfg();
  win = new BrowserWindow({
    width: 980, height: 680, minWidth: 820, minHeight: 520, title: 'peperhide Server Manager', backgroundColor: '#0b0e15',
    icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true, webPreferences: prefs,
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'servers.html'));
  win.on('close', (e) => {
    if (!inst.some((s) => s && s.srv)) return;
    const n = inst.reduce((a, s) => a + (s && s.srv ? s.srv.info().players : 0), 0);
    const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Stop servers and close', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Stop servers?', message: 'Closing the manager stops every server.', detail: n ? `${n} player${n === 1 ? ' is' : 's are'} connected right now.` : 'Nobody is connected.' });
    if (r === 1) e.preventDefault();
  });
  if (cfg.autoStart) (async () => { for (let i = 0; i < cfg.servers.length; i++) if (cfg.servers[i].enabled !== false) await startOne(i); })();
}

if (firstInstance) app.whenReady().then(MANAGER ? createManager : createWindow);
app.on('window-all-closed', () => { stopAll(); if (hosted) hosted.stop(); if (listener) listener.close(); app.quit(); });
