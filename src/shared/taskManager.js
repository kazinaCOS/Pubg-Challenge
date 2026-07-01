const fs = require('fs');
const path = require('path');

// Встроенные задания от генератора (расширяемо)
const GENERATED_TASKS = [
  { title: 'Снайпер поневоле', description: 'Использовать только снайперские винтовки', tags: ['оружие'] },
  { title: 'Рукопашный', description: 'Первое убийство сделать только кулаком или сковородкой', tags: ['оружие'] },
  { title: 'Без аптечек', description: 'Не использовать бинты и аптечки, только энергетики', tags: ['лечение'] },
  { title: 'Одиночный выстрел', description: 'Стрелять только в одиночном режиме огня', tags: ['оружие'] },
  { title: 'Пешком везде', description: 'Не использовать транспорт всю игру', tags: ['транспорт'] },
  { title: 'Лутер', description: 'Посетить не менее 5 зданий в одном городе', tags: ['локация', 'здания'] },
  { title: 'Меткий стрелок', description: 'Все выстрелы только стоя — никакого присяда при стрельбе', tags: ['оружие'] },
  { title: 'Скромник', description: 'Не брать бронежилет выше первого уровня', tags: ['снаряжение'] },
];

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
      generatorEnabled: false
    };
  }

  normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const tags = Array.isArray(item.tags) ? item.tags.filter(t => typeof t === 'string') : [];
    const id = Number.isFinite(item.id) ? item.id : null;
    if (!Number.isFinite(id)) return null;
    if (!title && !description) return null;
    return { id, title, description, tags };
  }

  normalizeItems(items = []) {
    return items.map(item => this.normalizeItem(item)).filter(Boolean);
  }

  normalizeLibrary(input) {
    const data = input && typeof input === 'object' ? input : {};
    return {
      tasks: this.normalizeItems(data.tasks),
      curses: this.normalizeItems(data.curses),
      generatorEnabled: data.generatorEnabled === true
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
      tasks: this.library.tasks.map(item => ({ ...item })),
      curses: this.library.curses.map(item => ({ ...item })),
      generatorEnabled: this.library.generatorEnabled
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

  // Проверяет конфликт: есть ли у задания теги, совпадающие с тегами активных наказаний
  hasConflict(task, activeCurses) {
    if (!task || !Array.isArray(task.tags) || !task.tags.length) return false;
    for (const curse of activeCurses) {
      if (!Array.isArray(curse.tags)) continue;
      const overlap = task.tags.some(t => curse.tags.includes(t));
      if (overlap) return true;
    }
    return false;
  }

  // Генерирует задание (из встроенного пула), не конфликтующее с активными наказаниями
  // Возвращает объект с флагом generated:true, id отрицательный (не хранится в библиотеке)
  getGeneratedTask(activeCurses = []) {
    const available = GENERATED_TASKS.filter(t => !this.hasConflict(t, activeCurses));
    const pool = available.length ? available : GENERATED_TASKS;
    const idx = Math.floor(Math.random() * pool.length);
    const t = pool[idx];
    return {
      id: -1,
      title: t.title,
      description: t.description,
      tags: t.tags,
      generated: true
    };
  }

  getRandomTask(recentTaskIds = [], activeCurses = []) {
    // Фильтруем по недавним И по конфликтам с наказаниями
    let available = this.library.tasks.filter(
      task => !recentTaskIds.includes(task.id) && !this.hasConflict(task, activeCurses)
    );
    // Если все отфильтрованы по конфликту — игнорируем конфликт, берём хотя бы не-недавние
    if (!available.length) {
      available = this.library.tasks.filter(task => !recentTaskIds.includes(task.id));
    }
    // Если все недавние — берём весь пул (без конфликта)
    if (!available.length) {
      available = this.library.tasks.filter(task => !this.hasConflict(task, activeCurses));
    }
    // Крайний случай — весь пул
    if (!available.length) {
      available = this.library.tasks;
    }
    if (!available.length) return null;
    const idx = Math.floor(Math.random() * available.length);
    return available[idx];
  }

  getRandomCurse(activeCurseIds = []) {
    const available = this.library.curses.filter(curse => !activeCurseIds.includes(curse.id));
    const pool = available.length ? available : this.library.curses;
    if (!pool.length) return null;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  }
}

module.exports = { TaskManager };
