// Sandboxed preload: exposes only two calls to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blsDesktop', {
  version: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
});
