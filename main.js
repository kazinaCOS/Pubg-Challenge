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
  const targetTaskPackPath = path.join(userDataDir, 'task-pack.json');

  const bundledStatePath = path.join(__dirname, 'src', 'data', 'state.json');
  const bundledTaskPackPath = path.join(__dirname, 'src', 'data', 'task-pack.json');
  const legacyBundledTasksPath = path.join(__dirname, 'src', 'data', 'tasks.json');
  

  if (!fs.existsSync(targetStatePath)) {
    if (fs.existsSync(bundledStatePath)) {
      fs.copyFileSync(bundledStatePath, targetStatePath);
    } else {
      fs.writeFileSync(
        targetStatePath,
        JSON.stringify(
          {
            currentTaskId: null,
            activeCurseIds: [],
            completed: 0,
            failed: 0,
            recentTaskIds: [],
            settings: {
              overlayX: 20,
              overlayY: 20
            }
          },
          null,
          2
        ),
        'utf8'
      );
    }
  }

  if (!fs.existsSync(targetTaskPackPath)) {
    if (fs.existsSync(bundledTaskPackPath)) {
      fs.copyFileSync(bundledTaskPackPath, targetTaskPackPath);
    } else if (fs.existsSync(legacyBundledTasksPath)) {
      fs.copyFileSync(legacyBundledTasksPath, targetTaskPackPath);
    } else {
      fs.writeFileSync(
        targetTaskPackPath,
        JSON.stringify(
          {
            version: 1,
            name: 'Default PUBG Pack',
            tasks: [],
            curses: [],
            generator: {
              enabled: false,
              weight: 0.35,
              templates: []
            }
          },
          null,
          2
        ),
        'utf8'
      );
    }
  }

  return {
    statePath: targetStatePath,
    taskPackPath: targetTaskPackPath
  };
}

function getDataPaths() {
  return ensureUserDataFiles();
}

function createStateManager() {
  return new StateManager(getDataPaths().statePath);
}

function createTaskManager() {
  return new TaskManager(getDataPaths().taskPackPath);
}

function getPublicState() {
  return stateManager.getResolvedState(taskManager);
}

function getOverlayBoundsFromState() {
  const state = stateManager.getPublicState();
  const settings = state.settings || {};

  return {
    x: Number.isFinite(settings.overlayX) ? settings.overlayX : 20,
    y: Number.isFinite(settings.overlayY) ? settings.overlayY : 20,
    width: 620,
    height: 260
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
    if (editorWindow && !editorWindow.isDestroyed()) {
      editorWindow.close();
    }

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }

    app.quit();
  });

  controlWindow.on('closed', () => {
    controlWindow = null;
  });
}

function createOverlayWindow() {
  const bounds = getOverlayBoundsFromState();

  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 500,
    minHeight: 220,
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
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'src', 'overlay', 'overlay.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function createEditorWindow() {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.focus();
    return;
  }

  editorWindow = new BrowserWindow({
    width: 900,
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

  editorWindow.once('ready-to-show', () => {
    editorWindow.show();
  });

  editorWindow.on('closed', () => {
    editorWindow = null;
  });
}

function applyOverlayPositionFromState() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const bounds = getOverlayBoundsFromState();
  const currentBounds = overlayWindow.getBounds();

  overlayWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: currentBounds.width,
    height: currentBounds.height
  });
}

function ensureInitialTask() {
  const rawState = stateManager.getPublicState();

  if (!rawState.currentTaskId) {
    const nextTask = taskManager.getRandomTask(rawState.recentTaskIds || []);
    if (nextTask) {
      stateManager.setCurrentTask(nextTask.id);
      stateManager.addRecentTask(nextTask.id);
    }
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
      const state = stateManager.getPublicState();
      const nextTask = taskManager.getRandomTask(state.recentTaskIds || []);
      if (nextTask) {
        stateManager.setCurrentTask(nextTask.id);
        stateManager.addRecentTask(nextTask.id);
      }
      await stateManager.saveState();
      return getPublicState();
    },

    completeTask: async () => {
      stateManager.incrementCompleted();
      const state = stateManager.getPublicState();
      const nextTask = taskManager.getRandomTask(state.recentTaskIds || []);
      if (nextTask) {
        stateManager.setCurrentTask(nextTask.id);
        stateManager.addRecentTask(nextTask.id);
      }
      await stateManager.saveState();
      return getPublicState();
    },

    failTask: async () => {
      stateManager.incrementFailed();

      if (stateManager.getActiveCursesCount() < 3) {
        const availableCurse = taskManager.getRandomCurse(stateManager.getActiveCurseIds());
        if (availableCurse) {
          stateManager.addActiveCurse(availableCurse.id);
        }
      }

      const state = stateManager.getPublicState();
      const nextTask = taskManager.getRandomTask(state.recentTaskIds || []);
      if (nextTask) {
        stateManager.setCurrentTask(nextTask.id);
        stateManager.addRecentTask(nextTask.id);
      }

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
      applyOverlayPositionFromState();
      return getPublicState();
    },

    resetProgress: async () => {
      const confirmed = await confirmResetProgress();

      if (!confirmed) {
        return { confirmed: false, state: getPublicState() };
      }

      stateManager.resetProgress();
      await stateManager.saveState();
      return { confirmed: true, state: getPublicState() };
    },

    openEditor: async () => {
      createEditorWindow();
      return { ok: true };
    },

    getLibrary: async () => {
      return taskManager.getLibrary();
    },

    saveLibrary: async (payload) => {
      taskManager.saveLibrary(payload || {});
      await stateManager.removeMissingIds(taskManager);
      await stateManager.saveState();
      return {
        library: taskManager.getLibrary(),
        state: getPublicState()
      };
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
  if (stateManager) {
    await stateManager.saveState();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});