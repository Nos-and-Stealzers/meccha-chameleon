const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mcNative', {
  isElectron: true,
  hostStart: (opts) => ipcRenderer.invoke('host:start', opts),
  hostStop: () => ipcRenderer.invoke('host:stop'),
  lanList: () => ipcRenderer.invoke('lan:list'),
  ips: () => ipcRenderer.invoke('net:ips'),
  quit: () => ipcRenderer.invoke('app:quit'),
  fullscreen: () => ipcRenderer.invoke('app:fullscreen'),
  openManager: () => ipcRenderer.invoke('app:openManager'),
});

contextBridge.exposeInMainWorld('mcServers', {
  status: () => ipcRenderer.invoke('mgr:status'),
  startAll: () => ipcRenderer.invoke('mgr:startAll'),
  stopAll: () => ipcRenderer.invoke('mgr:stopAll'),
  start: (i) => ipcRenderer.invoke('mgr:start', i),
  stop: (i) => ipcRenderer.invoke('mgr:stop', i),
  save: (cfg) => ipcRenderer.invoke('mgr:save', cfg),
  openConfig: () => ipcRenderer.invoke('mgr:openConfig'),
});
