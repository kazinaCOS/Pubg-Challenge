const fs = require('fs');

class TaskManager {
  constructor(tasksPath) {
    this.tasksPath = tasksPath;
    this.library = this.getDefaultLibrary();
    this.loadLibrary();
  }

  getDefaultLibrary() {
    return {
      tasks: [],
      curses: [],
      generatorEnabled: false,
      pools: {},
      templates: []
    };
  }

  normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    const id = Number.isFinite(item.id) ? item.id : null;
    if (!Number.isFinite(id)) return null;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const tags = Array.isArray(item.tags) ? item.tags.filter(t => typeof t === 'string') : [];
    if (!title && !description) return null;
    return { id, title, description, tags };
  }

  normalizeTemplate(item) {
    if (!item || typeof item !== 'object') return null;
    const id = Number.isFinite(item.id) ? item.id : null;
    if (!Number.isFinite(id)) return null;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const tags = Array.isArray(item.tags) ? item.tags.filter(t => typeof t === 'string') : [];
    if (!title && !description) return null;
    return { id, title, description, tags };
  }

  normalizePools(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const result = {};
    for (const [key, val] of Object.entries(input)) {
      if (typeof key === 'string' && Array.isArray(val)) {
        result[key] = val.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim());
      }
    }
    return result;
  }

  normalizeItems(items = []) {
    return items.map(item => this.normalizeItem(item)).filter(Boolean);
  }

  normalizeTemplates(items = []) {
    return items.map(item => this.normalizeTemplate(item)).filter(Boolean);
  }

  normalizeLibrary(input) {
    const data = input && typeof input === 'object' ? input : {};
    return {
      tasks: this.normalizeItems(data.tasks),
      curses: this.normalizeItems(data.curses),
      generatorEnabled: data.generatorEnabled === true,
      pools: this.normalizePools(data.pools),
      templates: this.normalizeTemplates(data.templates)
    };
  }

  ensureFile() {
    const fs2 = require('fs');
    const path = require('path');
    const dir = path.dirname(this.tasksPath);
    fs2.mkdirSync(dir, { recursive: true });
    if (!fs2.existsSync(this.tasksPath)) {
      fs2.writeFileSync(this.tasksPath, JSON.stringify(this.getDefaultLibrary(), null, 2), 'utf8');
      return;
    }
    const content = fs2.readFileSync(this.tasksPath, 'utf8');
    if (!content.trim()) {
      fs2.writeFileSync(this.tasksPath, JSON.stringify(this.getDefaultLibrary(), null, 2), 'utf8');
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
      tasks: this.library.tasks.map(item => ({ ...item })),
      curses: this.library.curses.map(item => ({ ...item })),
      generatorEnabled: this.library.generatorEnabled,
      pools: JSON.parse(JSON.stringify(this.library.pools)),
      templates: this.library.templates.map(item => ({ ...item }))
    };
  }

  saveLibrary(payload = {}) {
    this.library = this.normalizeLibrary(payload);
    fs.writeFileSync(this.tasksPath, JSON.stringify(this.library, null, 2), 'utf8');
    return this.getLibrary();
  }

  getTaskById(id) {
    return this.library.tasks.find(item => item.id === id) || null;
  }

  getCurseById(id) {
    return this.library.curses.find(item => item.id === id) || null;
  }

  // Подставляет случайные значения из пулов в шаблон вида "Убить {количество} с {оружие}"
  fillTemplate(template) {
    const pools = this.library.pools;

    const fill = (str) => str.replace(/\{([^}]+)\}/g, (match, key) => {
      const pool = pools[key];
      if (!pool || !pool.length) return match; // оставляем как есть если пул не найден
      return pool[Math.floor(Math.random() * pool.length)];
    });

    return {
      id: -1,
      title: fill(template.title),
      description: fill(template.description),
      tags: template.tags.slice(),
      generated: true,
      templateId: template.id
    };
  }

  // Конфликт: есть ли пересечение тегов задания с тегами активных наказаний
  hasConflict(task, activeCurses) {
    if (!task || !Array.isArray(task.tags) || !task.tags.length) return false;
    for (const curse of activeCurses) {
      if (!Array.isArray(curse.tags)) continue;
      if (task.tags.some(t => curse.tags.includes(t))) return true;
    }
    return false;
  }

  // Генерирует задание из пула шаблонов, избегая конфликтов с наказаниями
  getGeneratedTask(activeCurses = []) {
    const templates = this.library.templates;
    if (!templates.length) return null;

    // Пробуем найти шаблон без конфликта
    let available = templates.filter(t => !this.hasConflict(t, activeCurses));
    if (!available.length) available = templates; // если все конфликтуют — берём любой

    const template = available[Math.floor(Math.random() * available.length)];
    return this.fillTemplate(template);
  }

  getRandomTask(recentTaskIds = [], activeCurses = []) {
    let pool = this.library.tasks;

    // Убираем недавние И конфликтные
    let available = pool.filter(t => !recentTaskIds.includes(t.id) && !this.hasConflict(t, activeCurses));

    // Если всё отфильтровано по конфликту — игнорируем конфликт, берём не-недавние
    if (!available.length) available = pool.filter(t => !recentTaskIds.includes(t.id));

    // Если все недавние — убираем хотя бы конфликтные
    if (!available.length) available = pool.filter(t => !this.hasConflict(t, activeCurses));

    // Крайний случай — весь пул
    if (!available.length) available = pool;

    if (!available.length) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  getRandomCurse(activeCurseIds = []) {
    const available = this.library.curses.filter(c => !activeCurseIds.includes(c.id));
    const pool = available.length ? available : this.library.curses;
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

module.exports = { TaskManager };
