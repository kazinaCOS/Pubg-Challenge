function registerIpcHandlers(ipcMain, handlers) {
  const channels = [
    'app:getState',
    'app:newTask',
    'app:completeTask',
    'app:failTask',
    'app:clearCurse',
    'app:updateSettings',
    'app:resetProgress',
    'app:openEditor',
    'app:getLibrary',
    'app:saveLibrary',
    'app:exportLibrary',
    'app:importLibrary'
  ];

  channels.forEach(channel => {
    ipcMain.removeHandler(channel);
  });

  ipcMain.handle('app:getState', async () => handlers.getState());
  ipcMain.handle('app:newTask', async () => handlers.newTask());
  ipcMain.handle('app:completeTask', async () => handlers.completeTask());
  ipcMain.handle('app:failTask', async () => handlers.failTask());
  ipcMain.handle('app:clearCurse', async (_event, curseId) => handlers.clearCurse(curseId));
  ipcMain.handle('app:updateSettings', async (_event, payload) => handlers.updateSettings(payload));
  ipcMain.handle('app:resetProgress', async () => handlers.resetProgress());
  ipcMain.handle('app:openEditor', async () => handlers.openEditor());
  ipcMain.handle('app:getLibrary', async () => handlers.getLibrary());
  ipcMain.handle('app:saveLibrary', async (_event, payload) => handlers.saveLibrary(payload));
  ipcMain.handle('app:exportLibrary', async () => handlers.exportLibrary());
  ipcMain.handle('app:importLibrary', async () => handlers.importLibrary());
}

module.exports = { registerIpcHandlers };
