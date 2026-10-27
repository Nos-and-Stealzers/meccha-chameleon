const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mcNative', {
  isElectron: true,
  hostStart: (opts) => ipcRenderer.invoke('host:start', opts),
  hostStop: () => ipcRenderer.invoke('host:stop'),
  lanList: () => ipcRenderer.invoke('lan:list'),
  ips: () => ipcRenderer.invoke('net:ips'),
  quit: () => ipcRenderer.invoke('app:quit'),
  fullscreen: () => ipcRenderer.invoke('app:fullscreen'),
});
