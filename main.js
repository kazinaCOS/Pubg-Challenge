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

  // state.json — только создаём если нет
  if (!fs.existsSync(targetStatePath)) {
    if (fs.existsSync(bundledStatePath)) {
      fs.copyFileSync(bundledStatePath, targetStatePath);
    } else {
      fs.writeFileSync(targetStatePath, JSON.stringify({
        activeTasks: [],
        activeCurseIds: [],
        generatedCurses: [],
        completed: 0,
        failed: 0,
        recentTaskIds: [],
        settings: { overlayX: 20, overlayY: 20, overlayWidth: 620, overlayHeight: 260, generatorEnabled: false }
      }, null, 2), 'utf8');
    }
  }

  // tasks.json — создаём если нет, или мигрируем если не хватает полей
  if (!fs.existsSync(targetTasksPath)) {
    if (fs.existsSync(bundledTasksPath)) {
      fs.copyFileSync(bundledTasksPath, targetTasksPath);
    } else {
      fs.writeFileSync(targetTasksPath, JSON.stringify({ tasks: [], curses: [], generatorEnabled: false, pools: {}, templates: [], curseTemplates: [] }, null, 2), 'utf8');
    }
  } else {
    migrateTasksFile(targetTasksPath, bundledTasksPath);
  }

  return { statePath: targetStatePath, tasksPath: targetTasksPath };
}

// Мигрирует userData/tasks.json: добавляет недостающие поля из bundled.
function migrateTasksFile(targetPath, bundledPath) {
  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    const data = JSON.parse(raw);
    let changed = false;

    if (fs.existsSync(bundledPath)) {
      const bundled = JSON.parse(fs.readFileSync(bundledPath, 'utf8'));

      // tasks: пустой массив → берём из bundled
      if (!Array.isArray(data.tasks) || data.tasks.length === 0) {
        data.tasks = bundled.tasks || [];
        changed = true;
      } else {
        // Добавляем поле difficulty если отсутствует
        let diffChanged = false;
        data.tasks = data.tasks.map(t => {
          if (!t.difficulty) { diffChanged = true; return { ...t, difficulty: 'easy' }; }
          return t;
        });
        if (diffChanged) changed = true;
      }
      // curses: пустой массив → берём из bundled
      if (!Array.isArray(data.curses) || data.curses.length === 0) {
        data.curses = bundled.curses || [];
        changed = true;
      }
      // pools: поле отсутствует → берём из bundled
      if (!data.pools || Object.keys(data.pools).length === 0) {
        data.pools = bundled.pools || {};
        changed = true;
      }
      // templates: поле отсутствует → берём из bundled
      if (!Array.isArray(data.templates) || data.templates.length === 0) {
        data.templates = bundled.templates || [];
        changed = true;
      }
      // curseTemplates: поле отсутствует → берём из bundled
      if (!Array.isArray(data.curseTemplates) || data.curseTemplates.length === 0) {
        data.curseTemplates = bundled.curseTemplates || [];
        changed = true;
      }
    } else {
      if (!data.pools) { data.pools = {}; changed = true; }
      if (!data.templates) { data.templates = []; changed = true; }
    }

    if (changed) {
      fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (_e) {
    // Битый файл — не трогаем
  }
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
    height: 820,
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

function getActiveCurseObjects() {
  const raw = stateManager.getPublicState();
  const written = raw.activeCurseIds.map(id => taskManager.getCurseById(id)).filter(Boolean);
  return [...written, ...(raw.generatedCurses || [])];
}

// Генерирует uid для задания в раунде
function makeUid() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Выбирает одно задание заданной сложности (50/50 генератор/рукописное если включён)
function pickOneTask(difficulty, activeCurses) {
  const genEnabled = stateManager.getPublicState().settings.generatorEnabled;

  if (genEnabled) {
    const hasWritten = taskManager.library.tasks.filter(t => t.difficulty === difficulty).length > 0;
    const hasTemplates = taskManager.library.templates.filter(t => t.difficulty === difficulty).length > 0;

    if (!hasWritten && hasTemplates) {
      const gen = taskManager.getGeneratedTask(activeCurses, difficulty);
      if (gen) return { ...gen, uid: makeUid() };
    } else if (hasWritten || hasTemplates) {
      const useGen = Math.random() < 0.5;
      if (useGen && hasTemplates) {
        const gen = taskManager.getGeneratedTask(activeCurses, difficulty);
        if (gen) return { ...gen, uid: makeUid() };
      }
    }
  }

  // Рукописное
  const recentIds = stateManager.getPublicState().recentTaskIds;
  const task = taskManager.getRandomTask(recentIds, activeCurses, difficulty);
  if (task) {
    stateManager.addRecentTask(task.id);
    return { ...task, uid: makeUid() };
  }

  // Fallback: без фильтра по difficulty
  const taskAny = taskManager.getRandomTask(recentIds, activeCurses);
  if (taskAny) {
    stateManager.addRecentTask(taskAny.id);
    return { ...taskAny, uid: makeUid() };
  }

  return null;
}

// Формирует раунд: 1 easy + 2 случайных любой сложности
function buildRound() {
  const activeCurses = getActiveCurseObjects();
  const tasks = [];

  const easyTask = pickOneTask('easy', activeCurses);
  if (easyTask) tasks.push(easyTask);

  // 2 рандомных (любая сложность)
  const difficulties = ['easy', 'medium', 'hard'];
  for (let i = 0; i < 2; i++) {
    const diff = difficulties[Math.floor(Math.random() * difficulties.length)];
    const t = pickOneTask(diff, activeCurses);
    if (t) tasks.push(t);
  }

  return tasks;
}

// Выбирает следующее наказание
function pickNextCurse() {
  const genEnabled = stateManager.getPublicState().settings.generatorEnabled;
  const activeCurseIds = stateManager.getActiveCurseIds();

  if (genEnabled && taskManager.library.curses.length === 0) {
    const gen = taskManager.getGeneratedCurse();
    if (gen) stateManager.addGeneratedCurse(gen);
    return;
  }

  if (genEnabled) {
    const useGen = Math.random() < 0.5;
    if (useGen) {
      const gen = taskManager.getGeneratedCurse();
      if (gen) stateManager.addGeneratedCurse(gen);
      return;
    }
  }

  const curse = taskManager.getRandomCurse(activeCurseIds);
  if (curse) stateManager.addActiveCurse(curse.id);
}

function ensureInitialRound() {
  const rawState = stateManager.getPublicState();
  if (!rawState.activeTasks || rawState.activeTasks.length === 0) {
    const tasks = buildRound();
    stateManager.setActiveTasks(tasks);
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

    // Новый раунд — заменить все 3 задания
    newRound: async () => {
      const tasks = buildRound();
      stateManager.setActiveTasks(tasks);
      await stateManager.saveState();
      return getPublicState();
    },

    // Выполнить конкретное задание по uid — убрать из раунда, добавить новое
    completeTask: async (taskUid) => {
      if (taskUid) {
        stateManager.removeActiveTask(taskUid);
      }
      stateManager.incrementCompleted();
      // Добавляем новое задание вместо выполненного
      const activeCurses = getActiveCurseObjects();
      const difficulties = ['easy', 'medium', 'hard'];
      const diff = difficulties[Math.floor(Math.random() * difficulties.length)];
      const newTask = pickOneTask(diff, activeCurses);
      if (newTask) {
        const current = stateManager.getActiveTasks();
        current.push(newTask);
        stateManager.setActiveTasks(current);
      }
      await stateManager.saveState();
      return getPublicState();
    },

    // Провалить конкретное задание по uid — убрать из раунда, если все провалены — дать наказания
    failTask: async (taskUid) => {
      stateManager.incrementFailed();
      if (taskUid) {
        stateManager.removeActiveTask(taskUid);
      }

      // Если в раунде больше нет заданий — выдаём наказания за провал
      const remaining = stateManager.getActiveTasks();
      if (remaining.length === 0) {
        // Наказание за каждое проваленное задание в раунде (было 3, осталось 0 — это 1 провал за раз)
        // Считаем сколько было провалено: дать 1 наказание за каждый вызов failTask без задания
        if (stateManager.getActiveCursesCount() < 3) {
          pickNextCurse();
        }
        // Запускаем новый раунд автоматически
        const tasks = buildRound();
        stateManager.setActiveTasks(tasks);
      } else {
        // Раунд ещё идёт — добавляем новое задание вместо проваленного
        const activeCurses = getActiveCurseObjects();
        const difficulties = ['easy', 'medium', 'hard'];
        const diff = difficulties[Math.floor(Math.random() * difficulties.length)];
        const newTask = pickOneTask(diff, activeCurses);
        if (newTask) {
          const current = stateManager.getActiveTasks();
          current.push(newTask);
          stateManager.setActiveTasks(current);
        }
        // Наказание за провал
        if (stateManager.getActiveCursesCount() < 3) {
          pickNextCurse();
        }
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
      // Синхронизируем generatorEnabled в настройках состояния
      stateManager.updateSettings({ generatorEnabled: payload.generatorEnabled === true });
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
      stateManager.updateSettings({ generatorEnabled: parsed.generatorEnabled === true });
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
  ensureInitialRound();
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
