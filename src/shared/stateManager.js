const fs = require('fs');
const path = require('path');

class StateManager {
  constructor(statePath) {
    this.statePath = statePath;
    this.state = this.getDefaultState();
  }

  getDefaultState() {
    return {
      activeTasks: [],          // массив объектов { uid, id, difficulty, title, description, tags, generated? }
      activeCurseIds: [],
      generatedCurses: [],      // сгенерированные наказания (полные объекты с genId)
      completed: 0,
      failed: 0,
      recentTaskIds: [],
      settings: {
        overlayX: 20,
        overlayY: 20,
        overlayWidth: 620,
        overlayHeight: 260,
        generatorEnabled: false
      }
    };
  }

  normalizeSettings(inputSettings = {}) {
    const defaults = this.getDefaultState().settings;
    return {
      overlayX: Number.isFinite(inputSettings.overlayX) ? inputSettings.overlayX : defaults.overlayX,
      overlayY: Number.isFinite(inputSettings.overlayY) ? inputSettings.overlayY : defaults.overlayY,
      overlayWidth: Number.isFinite(inputSettings.overlayWidth) ? Math.max(300, inputSettings.overlayWidth) : defaults.overlayWidth,
      overlayHeight: Number.isFinite(inputSettings.overlayHeight) ? Math.max(120, inputSettings.overlayHeight) : defaults.overlayHeight,
      generatorEnabled: inputSettings.generatorEnabled === true
    };
  }

  normalizeActiveTask(t) {
    if (!t || typeof t !== 'object') return null;
    if (typeof t.uid !== 'string' || !t.uid) return null;
    const title = typeof t.title === 'string' ? t.title : '';
    const description = typeof t.description === 'string' ? t.description : '';
    const tags = Array.isArray(t.tags) ? t.tags : [];
    const difficulty = ['easy', 'medium', 'heavy'].includes(t.difficulty) ? t.difficulty : 'easy';
    const status = ['active', 'completed', 'failed'].includes(t.status) ? t.status : 'active';
    return {
      uid: t.uid,
      id: Number.isFinite(t.id) ? t.id : -1,
      difficulty,
      title,
      description,
      tags,
      generated: t.generated === true,
      status
    };
  }

  normalizeState(input) {
    const defaults = this.getDefaultState();
    const state = input && typeof input === 'object' ? input : {};

    // Обратная совместимость: если есть currentTaskId — переносим в activeTasks
    let activeTasks = [];
    if (Array.isArray(state.activeTasks)) {
      activeTasks = state.activeTasks.map(t => this.normalizeActiveTask(t)).filter(Boolean);
    } else if (Number.isFinite(state.currentTaskId) && state.currentTaskId !== null) {
      // старый формат — оставим пустым, ensureInitialRound заполнит
      activeTasks = [];
    }

    return {
      activeTasks,
      activeCurseIds: Array.isArray(state.activeCurseIds) ? state.activeCurseIds.filter(Number.isFinite).slice(0, 3) : [],
      generatedCurses: Array.isArray(state.generatedCurses) ? state.generatedCurses.slice(0, 3) : [],
      completed: Number.isFinite(state.completed) ? state.completed : defaults.completed,
      failed: Number.isFinite(state.failed) ? state.failed : defaults.failed,
      recentTaskIds: Array.isArray(state.recentTaskIds) ? state.recentTaskIds.filter(Number.isFinite).slice(0, 30) : [],
      settings: this.normalizeSettings(state.settings)
    };
  }

  ensureFile() {
    const dir = path.dirname(this.statePath);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.statePath)) {
      fs.writeFileSync(this.statePath, JSON.stringify(this.getDefaultState(), null, 2), 'utf8');
      return;
    }
    const content = fs.readFileSync(this.statePath, 'utf8');
    if (!content.trim()) {
      fs.writeFileSync(this.statePath, JSON.stringify(this.getDefaultState(), null, 2), 'utf8');
    }
  }

  async loadState() {
    this.ensureFile();
    try {
      const raw = fs.readFileSync(this.statePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.state = this.normalizeState(parsed);
      if (Array.isArray(parsed.generatedCurses)) {
        this.state.generatedCurses = parsed.generatedCurses.slice(0, 3);
      }
    } catch (_error) {
      this.state = this.getDefaultState();
      await this.saveState();
    }
    return this.getPublicState();
  }

  getPublicState() {
    return {
      activeTasks: this.state.activeTasks.slice(),
      activeCurseIds: this.state.activeCurseIds.slice(),
      generatedCurses: (this.state.generatedCurses || []).slice(),
      completed: this.state.completed,
      failed: this.state.failed,
      recentTaskIds: this.state.recentTaskIds.slice(),
      settings: { ...this.state.settings }
    };
  }

  getResolvedState(taskManager) {
    const raw = this.getPublicState();

    // Активные задания — уже полные объекты в state
    const activeTasks = raw.activeTasks;

    // Активные наказания = рукописные (по id) + сгенерированные (объекты)
    const writtenCurses = raw.activeCurseIds.map(id => taskManager.getCurseById(id)).filter(Boolean);
    const activeCurses = [...writtenCurses, ...(this.state.generatedCurses || [])];

    return {
      activeTasks,
      activeCurseIds: raw.activeCurseIds.slice(),
      activeCurses,
      completed: raw.completed,
      failed: raw.failed,
      recentTaskIds: raw.recentTaskIds.slice(),
      settings: raw.settings
    };
  }

  // Устанавливает массив активных заданий (до 3)
  setActiveTasks(tasks) {
    this.state.activeTasks = tasks.slice(0, 3).map(t => ({ ...t, status: t.status || 'active' }));
  }

  // Помечает задание выполненным по uid
  markTaskCompleted(uid) {
    const t = this.state.activeTasks.find(t => t.uid === uid);
    if (t) t.status = 'completed';
    return t || null;
  }

  // Помечает задание проваленным по uid
  markTaskFailed(uid) {
    const t = this.state.activeTasks.find(t => t.uid === uid);
    if (t) t.status = 'failed';
    return t || null;
  }

  // Кол-во проваленных в текущем раунде
  countFailedInRound() {
    return this.state.activeTasks.filter(t => t.status === 'failed').length;
  }

  getActiveTasks() {
    return this.state.activeTasks.slice();
  }

  addRecentTask(taskId) {
    if (!Number.isFinite(taskId) || taskId === -1) return;
    this.state.recentTaskIds = this.state.recentTaskIds.filter(id => id !== taskId);
    this.state.recentTaskIds.unshift(taskId);
    if (this.state.recentTaskIds.length > 30) this.state.recentTaskIds.length = 30;
  }

  incrementCompleted() { this.state.completed += 1; }
  incrementFailed() { this.state.failed += 1; }

  // Рукописное наказание по id
  addActiveCurse(curseId) {
    if (!Number.isFinite(curseId)) return;
    if (this.state.activeCurseIds.includes(curseId)) return;
    if (this.getActiveCursesCount() >= 3) return;
    this.state.activeCurseIds.push(curseId);
  }

  // Сгенерированное наказание (полный объект)
  addGeneratedCurse(curse) {
    if (!curse) return;
    if (this.getActiveCursesCount() >= 3) return;
    if (!this.state.generatedCurses) this.state.generatedCurses = [];
    curse.genId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.state.generatedCurses.push(curse);
  }

  // curseId — число (рукописное) или строка genId (сгенерированное)
  removeActiveCurse(curseId) {
    if (typeof curseId === 'string' && curseId.startsWith('gen_')) {
      this.state.generatedCurses = (this.state.generatedCurses || []).filter(c => c.genId !== curseId);
    } else {
      this.state.activeCurseIds = this.state.activeCurseIds.filter(id => id !== curseId);
    }
  }

  getActiveCurseIds() { return this.state.activeCurseIds.slice(); }

  getActiveCursesCount() {
    return this.state.activeCurseIds.length + (this.state.generatedCurses || []).length;
  }

  updateSettings(newSettings = {}) {
    this.state.settings = this.normalizeSettings({ ...this.state.settings, ...newSettings });
  }

  resetProgress() {
    this.state.completed = 0;
    this.state.failed = 0;
  }

  async removeMissingIds(taskManager) {
    // Убираем задания которых больше нет в библиотеке (не generated)
    this.state.activeTasks = this.state.activeTasks.filter(t => {
      if (t.generated) return true; // сгенерированные оставляем
      return !!taskManager.getTaskById(t.id);
    });
    this.state.activeCurseIds = this.state.activeCurseIds.filter(id => !!taskManager.getCurseById(id));
    this.state.recentTaskIds = this.state.recentTaskIds.filter(id => !!taskManager.getTaskById(id));
  }

  async saveState() {
    const dir = path.dirname(this.statePath);
    fs.mkdirSync(dir, { recursive: true });
    const toSave = {
      activeTasks: this.state.activeTasks,
      activeCurseIds: this.state.activeCurseIds,
      generatedCurses: this.state.generatedCurses || [],
      completed: this.state.completed,
      failed: this.state.failed,
      recentTaskIds: this.state.recentTaskIds,
      settings: this.state.settings
    };
    fs.writeFileSync(this.statePath, JSON.stringify(toSave, null, 2), 'utf8');
    return true;
  }
}

module.exports = { StateManager };
