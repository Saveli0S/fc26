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

  // Secure credential storage
  credentials: {
    get: () => ipcRenderer.invoke('credentials:get'),
    set: (credentials) => ipcRenderer.invoke('credentials:set', credentials),
    clear: () => ipcRenderer.invoke('credentials:clear'),
    has: () => ipcRenderer.invoke('credentials:has'),
  },
});
