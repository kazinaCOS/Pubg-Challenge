const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { StateManager } = require('./src/shared/stateManager');
const { TaskManager } = require('./src/shared/taskManager');
const { registerIpcHandlers } = require('./src/shared/ipc');

let controlWindow = null;
let overlayWindow = null;
let editorWindow = null;
let stateManager = null;
let taskManager = null;

function getUserDataDir() {
  return app.getPath('userData');
}

function ensureUserDataFiles() {
  const userDataDir = getUserDataDir();
  fs.mkdirSync(userDataDir, { recursive: true });

  const targetStatePath = path.join(userDataDir, 'state.json');
  const targetTasksPath = path.join(userDataDir, 'tasks.json');

  const bundledStatePath = path.join(__dirname, 'src', 'data', 'state.json');
  const bundledTasksPath = path.join(__dirname, 'src', 'data', 'tasks.json');

  if (!fs.existsSync(targetStatePath)) {
    if (fs.existsSync(bundledStatePath)) {
      fs.copyFileSync(bundledStatePath, targetStatePath);
    } else {
      fs.writeFileSync(targetStatePath, JSON.stringify({
        currentTaskId: null,
        activeCurseIds: [],
        completed: 0,
        failed: 0,
        recentTaskIds: [],
        settings: { overlayX: 20, overlayY: 20, overlayWidth: 620, overlayHeight: 260, generatorEnabled: false }
      }, null, 2), 'utf8');
    }
  }

  if (!fs.existsSync(targetTasksPath)) {
    if (fs.existsSync(bundledTasksPath)) {
      fs.copyFileSync(bundledTasksPath, targetTasksPath);
    } else {
      fs.writeFileSync(targetTasksPath, JSON.stringify({ tasks: [], curses: [], generatorEnabled: false }, null, 2), 'utf8');
    }
  }

  return { statePath: targetStatePath, tasksPath: targetTasksPath };
}

function getDataPaths() {
  return ensureUserDataFiles();
}

function createStateManager() {
  return new StateManager(getDataPaths().statePath);
}

function createTaskManager() {
  return new TaskManager(getDataPaths().tasksPath);
}

function getPublicState() {
  return stateManager.getResolvedState(taskManager);
}

function getOverlayBoundsFromState() {
  const state = stateManager.getPublicState();
  const s = state.settings || {};
  return {
    x: Number.isFinite(s.overlayX) ? s.overlayX : 20,
    y: Number.isFinite(s.overlayY) ? s.overlayY : 20,
    width: Number.isFinite(s.overlayWidth) ? Math.max(300, s.overlayWidth) : 620,
    height: Number.isFinite(s.overlayHeight) ? Math.max(120, s.overlayHeight) : 260
  };
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 560,
    height: 760,
    title: 'PUBG Challenge - Control',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  controlWindow.removeMenu();
  controlWindow.loadFile(path.join(__dirname, 'src', 'control', 'control.html'));

  controlWindow.once('ready-to-show', () => {
    controlWindow.show();
  });

  controlWindow.on('close', () => {
    if (editorWindow && !editorWindow.isDestroyed()) editorWindow.close();
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
    app.quit();
  });

  controlWindow.on('closed', () => { controlWindow = null; });
}

function createOverlayWindow() {
  const bounds = getOverlayBoundsFromState();

  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 300,
    minHeight: 120,
    title: 'PUBG Challenge - Overlay',
    transparent: true,
    frame: false,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    autoHideMenuBar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  overlayWindow.removeMenu();
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  // screen-saver — самый высокий уровень, работает поверх fullscreen игр
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'src', 'overlay', 'overlay.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive();
  });

  overlayWindow.on('resized', async () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const b = overlayWindow.getBounds();
    stateManager.updateSettings({ overlayWidth: b.width, overlayHeight: b.height });
    await stateManager.saveState();
  });

  overlayWindow.on('moved', async () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const b = overlayWindow.getBounds();
    stateManager.updateSettings({ overlayX: b.x, overlayY: b.y });
    await stateManager.saveState();
  });

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

function createEditorWindow() {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.focus();
    return;
  }

  editorWindow = new BrowserWindow({
    width: 960,
    height: 760,
    title: 'PUBG Challenge - Editor',
    autoHideMenuBar: true,
    show: false,
    parent: controlWindow || null,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  editorWindow.removeMenu();
  editorWindow.loadFile(path.join(__dirname, 'src', 'editor', 'editor.html'));

  editorWindow.once('ready-to-show', () => { editorWindow.show(); });
  editorWindow.on('closed', () => { editorWindow = null; });
}

function applyOverlayBoundsFromState() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const bounds = getOverlayBoundsFromState();
  overlayWindow.setBounds(bounds);
}

function getActiveCurses() {
  const raw = stateManager.getPublicState();
  return raw.activeCurseIds.map(id => taskManager.getCurseById(id)).filter(Boolean);
}

function pickNextTask() {
  const state = stateManager.getPublicState();
  const activeCurses = getActiveCurses();
  const genEnabled = state.settings.generatorEnabled;

  if (genEnabled && taskManager.library.tasks.length === 0) {
    // Только генератор
    const gen = taskManager.getGeneratedTask(activeCurses);
    stateManager.setGeneratedTask(gen);
    return;
  }

  if (genEnabled) {
    // 50/50: генератор или рукописное
    const useGen = Math.random() < 0.5;
    if (useGen) {
      const gen = taskManager.getGeneratedTask(activeCurses);
      stateManager.setGeneratedTask(gen);
      return;
    }
  }

  // Рукописное задание
  const nextTask = taskManager.getRandomTask(state.recentTaskIds || [], activeCurses);
  if (nextTask) {
    stateManager.setCurrentTask(nextTask.id);
    stateManager.addRecentTask(nextTask.id);
  }
}

function ensureInitialTask() {
  const rawState = stateManager.getPublicState();
  if (!rawState.currentTaskId) {
    pickNextTask();
  }
}

async function confirmResetProgress() {
  const result = await dialog.showMessageBox(controlWindow || null, {
    type: 'warning',
    buttons: ['Сбросить', 'Отмена'],
    defaultId: 1,
    cancelId: 1,
    title: 'Сброс прогресса',
    message: 'Сбросить выполненные и проваленные задания?',
    detail: 'Это действие обнулит счётчики.'
  });
  return result.response === 0;
}

function registerHandlers() {
  registerIpcHandlers(ipcMain, {
    getState: async () => getPublicState(),

    newTask: async () => {
      pickNextTask();
      await stateManager.saveState();
      return getPublicState();
    },

    completeTask: async () => {
      stateManager.incrementCompleted();
      pickNextTask();
      await stateManager.saveState();
      return getPublicState();
    },

    failTask: async () => {
      stateManager.incrementFailed();

      if (stateManager.getActiveCursesCount() < 3) {
        const activeCurses = getActiveCurses();
        const availableCurse = taskManager.getRandomCurse(stateManager.getActiveCurseIds());
        if (availableCurse) {
          stateManager.addActiveCurse(availableCurse.id);
        }
      }

      pickNextTask();
      await stateManager.saveState();
      return getPublicState();
    },

    clearCurse: async (curseId) => {
      stateManager.removeActiveCurse(curseId);
      await stateManager.saveState();
      return getPublicState();
    },

    updateSettings: async (payload) => {
      stateManager.updateSettings(payload || {});
      await stateManager.saveState();
      applyOverlayBoundsFromState();
      return getPublicState();
    },

    resetProgress: async () => {
      const confirmed = await confirmResetProgress();
      if (!confirmed) return { confirmed: false, state: getPublicState() };
      stateManager.resetProgress();
      await stateManager.saveState();
      return { confirmed: true, state: getPublicState() };
    },

    openEditor: async () => {
      createEditorWindow();
      return { ok: true };
    },

    getLibrary: async () => taskManager.getLibrary(),

    saveLibrary: async (payload) => {
      taskManager.saveLibrary(payload || {});
      await stateManager.removeMissingIds(taskManager);
      await stateManager.saveState();
      return {
        library: taskManager.getLibrary(),
        state: getPublicState()
      };
    },

    // Экспорт tasks.json в файл на диске
    exportLibrary: async () => {
      const result = await dialog.showSaveDialog(controlWindow || null, {
        title: 'Экспорт библиотеки заданий',
        defaultPath: 'pubg-tasks.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePath) return { ok: false };
      const lib = taskManager.getLibrary();
      fs.writeFileSync(result.filePath, JSON.stringify(lib, null, 2), 'utf8');
      return { ok: true, filePath: result.filePath };
    },

    // Импорт tasks.json из файла на диске
    importLibrary: async () => {
      const result = await dialog.showOpenDialog(controlWindow || null, {
        title: 'Импорт библиотеки заданий',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (result.canceled || !result.filePaths.length) return { ok: false };
      const raw = fs.readFileSync(result.filePaths[0], 'utf8');
      const parsed = JSON.parse(raw);
      taskManager.saveLibrary(parsed);
      await stateManager.removeMissingIds(taskManager);
      await stateManager.saveState();
      return { ok: true, library: taskManager.getLibrary(), state: getPublicState() };
    }
  });
}

async function initializeApp() {
  ensureUserDataFiles();
  stateManager = createStateManager();
  taskManager = createTaskManager();
  await stateManager.loadState();
  ensureInitialTask();
  await stateManager.saveState();
  registerHandlers();
  createControlWindow();
  createOverlayWindow();
}

app.whenReady().then(async () => {
  await initializeApp();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow();
      createOverlayWindow();
    }
  });
});

app.on('before-quit', async () => {
  if (stateManager) await stateManager.saveState();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
