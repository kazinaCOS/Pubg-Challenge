const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getState: () => ipcRenderer.invoke('app:getState'),
  newRound: () => ipcRenderer.invoke('app:newRound'),
  completeTask: (taskUid) => ipcRenderer.invoke('app:completeTask', taskUid),
  failTask: (taskUid) => ipcRenderer.invoke('app:failTask', taskUid),
  clearCurse: (curseId) => ipcRenderer.invoke('app:clearCurse', curseId),
  updateSettings: (payload) => ipcRenderer.invoke('app:updateSettings', payload),
  resetProgress: () => ipcRenderer.invoke('app:resetProgress'),
  openEditor: () => ipcRenderer.invoke('app:openEditor'),
  getLibrary: () => ipcRenderer.invoke('app:getLibrary'),
  saveLibrary: (payload) => ipcRenderer.invoke('app:saveLibrary', payload),
  exportLibrary: () => ipcRenderer.invoke('app:exportLibrary'),
  importLibrary: () => ipcRenderer.invoke('app:importLibrary')
});
