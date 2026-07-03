const fs = require('fs');

const DIFFICULTIES = ['easy', 'medium', 'heavy', 'brutal'];

// Шанс по умолчанию для каждой сложности (суммарно не обязаны быть 100)
const DEFAULT_DIFF_WEIGHTS = { easy: 3, medium: 2, heavy: 1, brutal: 0 };

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
      templates: [],
      curseTemplates: [],
      difficultyWeights: { ...DEFAULT_DIFF_WEIGHTS },
      curseDifficultyWeights: { ...DEFAULT_DIFF_WEIGHTS },
      // Шансы категорий (тегов): { "тег": weight } — перекрывает шанс сложности
      categoryWeights: {},
      curseCategoryWeights: {},
      // Группы взаимоисключений: [{id, label, items:[{type, id}]}]
      exclusionGroups: []
    };
  }

  normalizeExclusionGroups(input) {
    if (!Array.isArray(input)) return [];
    const VALID_TYPES = new Set(['task', 'curse', 'template', 'curseTemplate']);
    return input
      .filter(g => g && typeof g === 'object')
      .map(g => ({
        id: typeof g.id === 'string' ? g.id : String(g.id || Math.random().toString(36).slice(2)),
        label: typeof g.label === 'string' ? g.label.trim() : '',
        items: Array.isArray(g.items)
          ? g.items.filter(it => it && VALID_TYPES.has(it.type) && Number.isFinite(Number(it.id)))
                   .map(it => ({ type: it.type, id: Number(it.id) }))
          : []
      }));
  }

  // Возвращает {taskIds: Set, curseIds: Set, templateIds: Set, curseTemplateIds: Set}
  // содержащие id элементов, которые нельзя выбрать, т.к. другой элемент из той же группы уже активен.
  // activeTasks = [{id, generated, templateId?}], activeCurseIds = [id], generatedCurses = [{templateId?}]
  getExcludedByActive(activeTasks = [], activeCurseIds = [], generatedCurses = []) {
    const excl = { taskIds: new Set(), curseIds: new Set(), templateIds: new Set(), curseTemplateIds: new Set() };
    const groups = this.library.exclusionGroups || [];

    for (const group of groups) {
      const items = group.items || [];
      // Проверяем, есть ли в группе хотя бы один активный элемент
      let hit = false;

      for (const it of items) {
        if (it.type === 'task') {
          if (activeTasks.some(t => !t.generated && t.id === it.id)) { hit = true; break; }
        } else if (it.type === 'curse') {
          if (activeCurseIds.includes(it.id)) { hit = true; break; }
        } else if (it.type === 'template') {
          if (activeTasks.some(t => t.generated && t.templateId === it.id)) { hit = true; break; }
        } else if (it.type === 'curseTemplate') {
          if (generatedCurses.some(c => c.templateId === it.id)) { hit = true; break; }
        }
      }

      if (hit) {
        // Все остальные элементы группы исключаются
        for (const it of items) {
          if (it.type === 'task') excl.taskIds.add(it.id);
          else if (it.type === 'curse') excl.curseIds.add(it.id);
          else if (it.type === 'template') excl.templateIds.add(it.id);
          else if (it.type === 'curseTemplate') excl.curseTemplateIds.add(it.id);
        }
      }
    }

    return excl;
  }

  normalizeWeight(w) {
    if (w == null) return null; // null = не задан, используется приоритет
    return Number.isFinite(Number(w)) && Number(w) >= 0 ? Number(w) : null;
  }

  normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    const id = Number.isFinite(item.id) ? item.id : null;
    if (!Number.isFinite(id)) return null;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const tags = Array.isArray(item.tags) ? item.tags.filter(t => typeof t === 'string') : [];
    const difficulty = DIFFICULTIES.includes(item.difficulty) ? item.difficulty : 'easy';
    const weight = this.normalizeWeight(item.weight);
    if (!title && !description) return null;
    return { id, title, description, tags, difficulty, ...(weight != null ? { weight } : {}) };
  }

  normalizeTemplate(item) {
    if (!item || typeof item !== 'object') return null;
    const id = Number.isFinite(item.id) ? item.id : null;
    if (!Number.isFinite(id)) return null;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const tags = Array.isArray(item.tags) ? item.tags.filter(t => typeof t === 'string') : [];
    const difficulty = DIFFICULTIES.includes(item.difficulty) ? item.difficulty : 'easy';
    const weight = this.normalizeWeight(item.weight);
    if (!title && !description) return null;
    return { id, title, description, tags, difficulty, ...(weight != null ? { weight } : {}) };
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

  normalizeDiffWeights(input, defaults = DEFAULT_DIFF_WEIGHTS) {
    const result = {};
    for (const d of DIFFICULTIES) {
      const v = input && Number.isFinite(Number(input[d])) && Number(input[d]) >= 0
        ? Number(input[d])
        : (defaults[d] ?? 0);
      result[d] = v;
    }
    return result;
  }

  normalizeCategoryWeights(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const result = {};
    for (const [k, v] of Object.entries(input)) {
      if (typeof k === 'string' && Number.isFinite(Number(v)) && Number(v) >= 0) {
        result[k] = Number(v);
      }
    }
    return result;
  }

  // Вычисляет итоговый вес элемента с учётом приоритета:
  // 1. Базовый: вес сложности из difficultyWeights
  // 2. Если у элемента есть тег с categoryWeight — берём максимальный из совпавших тегов (перекрывает диф)
  // 3. Если у элемента стоит индивидуальный weight > 0 — он перекрывает всё
  resolveItemWeight(item, diffWeights, catWeights) {
    // 1. Базовый — по сложности
    const diff = item.difficulty || 'easy';
    let w = (diffWeights && diffWeights[diff] != null) ? diffWeights[diff] : 1;

    // 2. Категория (теги) — берём максимальный совпавший
    if (catWeights && Array.isArray(item.tags) && item.tags.length) {
      let catW = null;
      for (const tag of item.tags) {
        if (catWeights[tag] != null) {
          catW = catW == null ? catWeights[tag] : Math.max(catW, catWeights[tag]);
        }
      }
      if (catW != null) w = catW;
    }

    // 3. Индивидуальный weight — перекрывает всё
    if (item.weight != null && Number.isFinite(item.weight) && item.weight >= 0) {
      w = item.weight;
    }

    return w;
  }

  // Взвешенный выбор из пула с учётом приоритета шансов
  weightedPickByPriority(pool, diffWeights, catWeights) {
    if (!pool.length) return null;
    const weights = pool.map(item => this.resolveItemWeight(item, diffWeights, catWeights));
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) return this.randomFrom(pool); // все нули → случайный
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  normalizeItems(items = []) {
    return items.map(item => this.normalizeItem(item)).filter(Boolean);
  }

  normalizeTemplates(items = []) {
    return items.map(item => this.normalizeTemplate(item)).filter(Boolean);
  }

  normalizeCurse(item) {
    if (!item || typeof item !== 'object') return null;
    const id = Number.isFinite(item.id) ? item.id : null;
    if (!Number.isFinite(id)) return null;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const tags = Array.isArray(item.tags) ? item.tags.filter(t => typeof t === 'string') : [];
    const difficulty = DIFFICULTIES.includes(item.difficulty) ? item.difficulty : 'easy';
    const weight = this.normalizeWeight(item.weight);
    if (!title && !description) return null;
    return { id, title, description, tags, difficulty, ...(weight != null ? { weight } : {}) };
  }

  normalizeCurses(items = []) {
    return items.map(item => this.normalizeCurse(item)).filter(Boolean);
  }

  normalizeCurseTemplate(item) {
    if (!item || typeof item !== 'object') return null;
    const id = Number.isFinite(item.id) ? item.id : null;
    if (!Number.isFinite(id)) return null;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const tags = Array.isArray(item.tags) ? item.tags.filter(t => typeof t === 'string') : [];
    const difficulty = DIFFICULTIES.includes(item.difficulty) ? item.difficulty : 'easy';
    const weight = this.normalizeWeight(item.weight);
    if (!title && !description) return null;
    return { id, title, description, tags, difficulty, ...(weight != null ? { weight } : {}) };
  }

  normalizeCurseTemplates(items = []) {
    return items.map(item => this.normalizeCurseTemplate(item)).filter(Boolean);
  }

  normalizeLibrary(input) {
    const data = input && typeof input === 'object' ? input : {};
    return {
      tasks: this.normalizeItems(data.tasks),
      curses: this.normalizeCurses(data.curses),
      generatorEnabled: data.generatorEnabled === true,
      pools: this.normalizePools(data.pools),
      templates: this.normalizeTemplates(data.templates),
      curseTemplates: this.normalizeCurseTemplates(data.curseTemplates),
      difficultyWeights: this.normalizeDiffWeights(data.difficultyWeights),
      curseDifficultyWeights: this.normalizeDiffWeights(data.curseDifficultyWeights),
      categoryWeights: this.normalizeCategoryWeights(data.categoryWeights),
      curseCategoryWeights: this.normalizeCategoryWeights(data.curseCategoryWeights),
      exclusionGroups: this.normalizeExclusionGroups(data.exclusionGroups)
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
      templates: this.library.templates.map(item => ({ ...item })),
      curseTemplates: this.library.curseTemplates.map(item => ({ ...item })),
      difficultyWeights: { ...this.library.difficultyWeights },
      curseDifficultyWeights: { ...this.library.curseDifficultyWeights },
      categoryWeights: { ...this.library.categoryWeights },
      curseCategoryWeights: { ...this.library.curseCategoryWeights },
      exclusionGroups: JSON.parse(JSON.stringify(this.library.exclusionGroups || []))
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

  // Подставляет случайные значения из пулов — одно значение на ключ для всего шаблона
  // Т.е. {оружие} в названии и описании будет одним и тем же словом
  fillTemplate(template) {
    const pools = this.library.pools;

    // Сначала находим все уникальные ключи в шаблоне и фиксируем значения
    const allText = (template.title || '') + ' ' + (template.description || '');
    const keys = new Set();
    allText.replace(/\{([^}]+)\}/g, (_, key) => { keys.add(key); return ''; });

    const resolved = {};
    for (const key of keys) {
      const pool = pools[key];
      if (pool && pool.length) {
        resolved[key] = pool[Math.floor(Math.random() * pool.length)];
      }
    }

    const fill = (str) => str.replace(/\{([^}]+)\}/g, (match, key) => {
      return resolved[key] !== undefined ? resolved[key] : match;
    });

    return {
      id: -1,
      title: fill(template.title || ''),
      description: fill(template.description || ''),
      tags: template.tags.slice(),
      difficulty: template.difficulty || 'easy',
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

  // Взвешенный выбор сложности из difficultyWeights
  pickDifficulty(weights) {
    const w = weights || DEFAULT_DIFF_WEIGHTS;
    const entries = DIFFICULTIES.map(d => [d, w[d] || 0]).filter(([, v]) => v > 0);
    if (!entries.length) return 'easy';
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let r = Math.random() * total;
    for (const [d, v] of entries) {
      r -= v;
      if (r <= 0) return d;
    }
    return entries[entries.length - 1][0];
  }

  // Простой случайный выбор из массива (без весов)
  randomFrom(pool) {
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Генерирует задание из пула шаблонов с заданной сложностью, избегая конфликтов
  getGeneratedTask(activeCurses = [], difficulty = null) {
    let templates = this.library.templates;
    if (!templates.length) return null;

    if (difficulty) {
      const byDiff = templates.filter(t => t.difficulty === difficulty);
      if (byDiff.length) templates = byDiff;
    }

    let available = templates.filter(t => !this.hasConflict(t, activeCurses));
    if (!available.length) available = templates;

    const template = this.randomFrom(available);
    return this.fillTemplate(template);
  }

  // Генерирует наказание из пула curseTemplates с учётом сложности
  getGeneratedCurse(difficulty = null) {
    let templates = this.library.curseTemplates;
    if (!templates.length) return null;

    if (difficulty) {
      const byDiff = templates.filter(t => t.difficulty === difficulty);
      if (byDiff.length) templates = byDiff;
    }

    const template = this.randomFrom(templates);
    const filled = this.fillTemplate(template);
    filled.generated = true;
    filled.isCurse = true;
    filled.difficulty = template.difficulty || 'easy';
    return filled;
  }

  // Рукописное задание — взвешенный выбор с приоритетом diff→category→individual
  getRandomTask(recentTaskIds = [], activeCurses = [], difficulty = null, excludeIds = [], excludeTemplateIds = []) {
    let pool = this.library.tasks;

    if (difficulty) {
      const byDiff = pool.filter(t => t.difficulty === difficulty);
      if (byDiff.length) pool = byDiff;
    }

    const allExclude = [...new Set([...recentTaskIds, ...excludeIds])];
    const dw = this.library.difficultyWeights;
    const cw = this.library.categoryWeights;

    let available = pool.filter(t => !allExclude.includes(t.id) && !this.hasConflict(t, activeCurses));
    if (!available.length) available = pool.filter(t => !allExclude.includes(t.id));
    if (!available.length) available = pool.filter(t => !excludeIds.includes(t.id) && !this.hasConflict(t, activeCurses));
    if (!available.length) available = pool.filter(t => !excludeIds.includes(t.id));
    if (!available.length) available = pool.filter(t => !this.hasConflict(t, activeCurses));
    if (!available.length) available = pool;
    if (!available.length) return null;

    return this.weightedPickByPriority(available, dw, cw);
  }

  // Генерируемое задание — взвешенный выбор шаблона
  getGeneratedTaskFiltered(activeCurses = [], difficulty = null, excludeTemplateIds = []) {
    let templates = this.library.templates;
    if (!templates.length) return null;

    if (difficulty) {
      const byDiff = templates.filter(t => t.difficulty === difficulty);
      if (byDiff.length) templates = byDiff;
    }

    const dw = this.library.difficultyWeights;
    const cw = this.library.categoryWeights;

    let available = templates
      .filter(t => !excludeTemplateIds.includes(t.id))
      .filter(t => !this.hasConflict(t, activeCurses));
    if (!available.length) available = templates.filter(t => !excludeTemplateIds.includes(t.id));
    if (!available.length) available = templates.filter(t => !this.hasConflict(t, activeCurses));
    if (!available.length) available = templates;
    if (!available.length) return null;

    return this.fillTemplate(this.weightedPickByPriority(available, dw, cw));
  }

  // Рукописное наказание по сложности, без дублей активных
  getRandomCurse(activeCurseIds = [], excludeIds = [], difficulty = null, excludeCurseTemplateIds = []) {
    let pool = this.library.curses;

    if (difficulty) {
      const byDiff = pool.filter(c => c.difficulty === difficulty);
      if (byDiff.length) pool = byDiff;
    }

    const dw = this.library.curseDifficultyWeights;
    const cw = this.library.curseCategoryWeights;

    const allExclude = [...new Set([...activeCurseIds, ...excludeIds])];
    let available = pool.filter(c => !allExclude.includes(c.id));
    if (!available.length) available = pool.filter(c => !activeCurseIds.includes(c.id));
    if (!available.length) available = pool;
    if (!available.length) return null;
    return this.weightedPickByPriority(available, dw, cw);
  }

  // Генерируемое наказание с взвешенным выбором шаблона
  getGeneratedCurseFiltered(difficulty = null, excludeCurseTemplateIds = []) {
    let templates = this.library.curseTemplates;
    if (!templates.length) return null;

    if (difficulty) {
      const byDiff = templates.filter(t => t.difficulty === difficulty);
      if (byDiff.length) templates = byDiff;
    }

    const dw = this.library.curseDifficultyWeights;
    const cw = this.library.curseCategoryWeights;

    let available = templates.filter(t => !excludeCurseTemplateIds.includes(t.id));
    if (!available.length) available = templates;
    if (!available.length) return null;

    const template = this.weightedPickByPriority(available, dw, cw);
    const filled = this.fillTemplate(template);
    filled.generated = true;
    filled.isCurse = true;
    filled.difficulty = template.difficulty || 'easy';
    return filled;
  }

  // Выбирает сложность для следующего задания на основе difficultyWeights
  pickTaskDifficulty() {
    return this.pickDifficulty(this.library.difficultyWeights);
  }

  // Выбирает сложность для следующего наказания на основе curseDifficultyWeights
  pickCurseDifficulty() {
    return this.pickDifficulty(this.library.curseDifficultyWeights);
  }
}

module.exports = { TaskManager };
