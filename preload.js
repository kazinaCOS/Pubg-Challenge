const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getState: () => ipcRenderer.invoke('app:getState'),
  newTask: () => ipcRenderer.invoke('app:newTask'),
  completeTask: () => ipcRenderer.invoke('app:completeTask'),
  failTask: () => ipcRenderer.invoke('app:failTask'),
  clearCurse: (curseId) => ipcRenderer.invoke('app:clearCurse', curseId),
  updateSettings: (payload) => ipcRenderer.invoke('app:updateSettings', payload),
  resetProgress: () => ipcRenderer.invoke('app:resetProgress'),
  openEditor: () => ipcRenderer.invoke('app:openEditor'),
  getLibrary: () => ipcRenderer.invoke('app:getLibrary'),
  saveLibrary: (payload) => ipcRenderer.invoke('app:saveLibrary', payload)
});