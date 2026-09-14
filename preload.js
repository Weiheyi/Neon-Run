// 预加载脚本：向渲染进程安全暴露窗口控制能力（contextIsolation 开启）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neonAPI', {
  // opts: { width, height } 或 { fullscreen: boolean }
  setWindow: (opts) => ipcRenderer.send('neon:set-window', opts),
  minimizeWindow: () => ipcRenderer.send('neon:minimize-window'),
  maximizeWindow: () => ipcRenderer.send('neon:maximize-window'),
  closeWindow: () => ipcRenderer.send('neon:close-window'),
  getWindowState: () => ipcRenderer.invoke('neon:get-window-state'),
  getVersion: () => ipcRenderer.invoke('neon:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('neon:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('neon:update-download'),
  installUpdate: () => ipcRenderer.invoke('neon:update-install'),
  onUpdateState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('neon:update-state', handler);
    return () => ipcRenderer.removeListener('neon:update-state', handler);
  },
  onWindowState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('neon:window-state', handler);
    return () => ipcRenderer.removeListener('neon:window-state', handler);
  }
});
