const fs = require('fs');
const path = require('path');

class StateManager {
  constructor(statePath) {
    this.statePath = statePath;
    this.state = this.getDefaultState();
  }

  getDefaultState() {
    return {
      currentTaskId: null,
      activeCurseIds: [],
      completed: 0,
      failed: 0,
      recentTaskIds: [],
      settings: {
        overlayX: 20,
        overlayY: 20
      }
    };
  }

  normalizeSettings(inputSettings = {}) {
    const defaults = this.getDefaultState().settings;

    return {
      overlayX: Number.isFinite(inputSettings.overlayX) ? inputSettings.overlayX : defaults.overlayX,
      overlayY: Number.isFinite(inputSettings.overlayY) ? inputSettings.overlayY : defaults.overlayY
    };
  }

  normalizeState(input) {
    const defaults = this.getDefaultState();
    const state = input && typeof input === 'object' ? input : {};

    return {
      currentTaskId: Number.isFinite(state.currentTaskId) ? state.currentTaskId : defaults.currentTaskId,
      activeCurseIds: Array.isArray(state.activeCurseIds) ? state.activeCurseIds.filter(Number.isFinite).slice(0, 3) : [],
      completed: Number.isFinite(state.completed) ? state.completed : defaults.completed,
      failed: Number.isFinite(state.failed) ? state.failed : defaults.failed,
      recentTaskIds: Array.isArray(state.recentTaskIds) ? state.recentTaskIds.filter(Number.isFinite).slice(0, 10) : [],
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
    } catch (_error) {
      this.state = this.getDefaultState();
      await this.saveState();
    }

    return this.getPublicState();
  }

  getPublicState() {
    return {
      currentTaskId: this.state.currentTaskId,
      activeCurseIds: this.state.activeCurseIds.slice(),
      completed: this.state.completed,
      failed: this.state.failed,
      recentTaskIds: this.state.recentTaskIds.slice(),
      settings: {
        overlayX: this.state.settings.overlayX,
        overlayY: this.state.settings.overlayY
      }
    };
  }

  getResolvedState(taskManager) {
    const raw = this.getPublicState();

    return {
      currentTaskId: raw.currentTaskId,
      currentTask: taskManager.getTaskById(raw.currentTaskId),
      activeCurseIds: raw.activeCurseIds.slice(),
      activeCurses: raw.activeCurseIds.map((id) => taskManager.getCurseById(id)).filter(Boolean),
      completed: raw.completed,
      failed: raw.failed,
      recentTaskIds: raw.recentTaskIds.slice(),
      settings: raw.settings
    };
  }

  setCurrentTask(taskId) {
    this.state.currentTaskId = Number.isFinite(taskId) ? taskId : null;
  }

  addRecentTask(taskId) {
    if (!Number.isFinite(taskId)) {
      return;
    }

    this.state.recentTaskIds = this.state.recentTaskIds.filter((id) => id !== taskId);
    this.state.recentTaskIds.unshift(taskId);

    if (this.state.recentTaskIds.length > 10) {
      this.state.recentTaskIds.length = 10;
    }
  }

  incrementCompleted() {
    this.state.completed += 1;
  }

  incrementFailed() {
    this.state.failed += 1;
  }

  addActiveCurse(curseId) {
    if (!Number.isFinite(curseId)) {
      return;
    }

    if (this.state.activeCurseIds.includes(curseId)) {
      return;
    }

    if (this.state.activeCurseIds.length >= 3) {
      return;
    }

    this.state.activeCurseIds.push(curseId);
  }

  removeActiveCurse(curseId) {
    this.state.activeCurseIds = this.state.activeCurseIds.filter((id) => id !== curseId);
  }

  getActiveCurseIds() {
    return this.state.activeCurseIds.slice();
  }

  getActiveCursesCount() {
    return this.state.activeCurseIds.length;
  }

  updateSettings(newSettings = {}) {
    this.state.settings = this.normalizeSettings({
      ...this.state.settings,
      ...newSettings
    });
  }

  resetProgress() {
    this.state.completed = 0;
    this.state.failed = 0;
  }

  async removeMissingIds(taskManager) {
    if (!taskManager.getTaskById(this.state.currentTaskId)) {
      this.state.currentTaskId = null;
    }

    this.state.activeCurseIds = this.state.activeCurseIds.filter((id) => !!taskManager.getCurseById(id));
    this.state.recentTaskIds = this.state.recentTaskIds.filter((id) => !!taskManager.getTaskById(id));

    if (!this.state.currentTaskId) {
      const nextTask = taskManager.getRandomTask(this.state.recentTaskIds || []);
      if (nextTask) {
        this.state.currentTaskId = nextTask.id;
        this.addRecentTask(nextTask.id);
      }
    }
  }

  async saveState() {
    const dir = path.dirname(this.statePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
    return true;
  }
}

module.exports = {
  StateManager
};