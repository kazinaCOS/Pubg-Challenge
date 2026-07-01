const fs = require('fs');
const path = require('path');

class TaskManager {
  constructor(tasksPath) {
    this.tasksPath = tasksPath;
    this.library = this.getDefaultLibrary();
    this.loadLibrary();
  }

  getDefaultLibrary() {
    return {
      tasks: [],
      curses: []
    };
  }

  normalizeItems(items = []) {
    return items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: Number.isFinite(item.id) ? item.id : null,
        text: typeof item.text === 'string' ? item.text.trim() : ''
      }))
      .filter((item) => Number.isFinite(item.id) && item.text);
  }

  normalizeLibrary(input) {
    const data = input && typeof input === 'object' ? input : {};
    return {
      tasks: this.normalizeItems(data.tasks),
      curses: this.normalizeItems(data.curses)
    };
  }

  ensureFile() {
    const dir = path.dirname(this.tasksPath);
    fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(this.tasksPath)) {
      fs.writeFileSync(this.tasksPath, JSON.stringify(this.getDefaultLibrary(), null, 2), 'utf8');
      return;
    }

    const content = fs.readFileSync(this.tasksPath, 'utf8');
    if (!content.trim()) {
      fs.writeFileSync(this.tasksPath, JSON.stringify(this.getDefaultLibrary(), null, 2), 'utf8');
    }
  }

  loadLibrary() {
    this.ensureFile();
    const raw = fs.readFileSync(this.tasksPath, 'utf8');
    const parsed = JSON.parse(raw);
    this.library = this.normalizeLibrary(parsed);
    return this.library;
  }

  getLibrary() {
    return {
      tasks: this.library.tasks.map((item) => ({ ...item })),
      curses: this.library.curses.map((item) => ({ ...item }))
    };
  }

  saveLibrary(payload = {}) {
    this.library = this.normalizeLibrary(payload);
    fs.writeFileSync(this.tasksPath, JSON.stringify(this.library, null, 2), 'utf8');
    return this.getLibrary();
  }

  getTaskById(id) {
    return this.library.tasks.find((item) => item.id === id) || null;
  }

  getCurseById(id) {
    return this.library.curses.find((item) => item.id === id) || null;
  }

  getRandomTask(recentTaskIds = []) {
    const available = this.library.tasks.filter((task) => !recentTaskIds.includes(task.id));
    const pool = available.length ? available : this.library.tasks;

    if (!pool.length) {
      return null;
    }

    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }

  getRandomCurse(activeCurseIds = []) {
    const available = this.library.curses.filter((curse) => !activeCurseIds.includes(curse.id));
    const pool = available.length ? available : this.library.curses;

    if (!pool.length) {
      return null;
    }

    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }
}

module.exports = {
  TaskManager
};