const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getStoragePath: () => ipcRenderer.invoke('get-storage-path'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  isDev: () => ipcRenderer.invoke('is-dev'),

  // Platform info
  platform: process.platform,

  // App info
  isElectron: true,
});
