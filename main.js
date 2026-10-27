const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const server = require('./server/server.js');

app.commandLine.appendSwitch('ignore-gpu-blocklist');

let win = null, hosted = null, listener = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640,
    title: 'Meccha Chameleon', backgroundColor: '#11151f',
    icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') },
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (hosted) hosted.stop(); if (listener) listener.close(); app.quit(); });
