'use strict';

// ─── Состояние ───────────────────────────────────────────────────────────────
let library = { tasks: [], curses: [], generatorEnabled: false, pools: {}, templates: [] };

// ─── DOM-узлы ────────────────────────────────────────────────────────────────
const tasksList      = document.getElementById('tasks-list');
const cursesList     = document.getElementById('curses-list');
const templatesList  = document.getElementById('templates-list');
const poolsList      = document.getElementById('pools-list');
const previewOutput  = document.getElementById('preview-output');
const generatorToggle = document.getElementById('generator-toggle');

const btnAddTask     = document.getElementById('btn-add-task');
const btnAddCurse    = document.getElementById('btn-add-curse');
const btnAddTemplate = document.getElementById('btn-add-template');
const btnAddPool     = document.getElementById('btn-add-pool');
const btnSaveAll     = document.getElementById('btn-save-all');
const btnExport      = document.getElementById('btn-export');
const btnImport      = document.getElementById('btn-import');
const btnPreview     = document.getElementById('btn-preview');

// ─── Вкладки ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ─── Утилиты ─────────────────────────────────────────────────────────────────
function esc(v) {
  return String(v)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function nextId(items) {
  const ids = items.map(i => i.id).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function randFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Рендер: задания/наказания ───────────────────────────────────────────────
function renderItemList(container, items, type) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-hint">Нет записей. Нажми «+ Добавить».</div>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="item" data-id="${item.id}" data-type="${type}">
      <div class="item-fields">
        <input class="item-title" type="text" data-field="title" data-type="${type}" data-id="${item.id}"
          placeholder="Название" value="${esc(item.title || '')}">
        <textarea class="item-desc" data-field="description" data-type="${type}" data-id="${item.id}"
          placeholder="Описание" rows="2">${esc(item.description || '')}</textarea>
        <input class="item-tags" type="text" data-field="tags" data-type="${type}" data-id="${item.id}"
          placeholder="Теги через запятую (транспорт, оружие...)"
          value="${esc((item.tags || []).join(', '))}">
      </div>
      <button class="danger btn-delete" data-delete-type="${type}" data-delete-id="${item.id}">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.deleteId);
      if (type === 'task') library.tasks = library.tasks.filter(i => i.id !== id);
      else library.curses = library.curses.filter(i => i.id !== id);
      renderItemList(container, type === 'task' ? library.tasks : library.curses, type);
    });
  });
}

function collectItemList(container, type) {
  const result = [];
  container.querySelectorAll(`.item[data-type="${type}"]`).forEach(row => {
    const id = Number(row.dataset.id);
    const title = row.querySelector(`input[data-field="title"]`).value.trim();
    const desc = row.querySelector(`textarea[data-field="description"]`).value.trim();
    const tagsRaw = row.querySelector(`input[data-field="tags"]`).value.trim();
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    if (!title && !desc) return;
    result.push({ id, title, description: desc, tags });
  });
  return result;
}

// ─── Рендер: шаблоны ─────────────────────────────────────────────────────────
function renderTemplates() {
  const items = library.templates;
  if (!items.length) {
    templatesList.innerHTML = `<div class="empty-hint">Нет шаблонов. Нажми «+ Добавить».</div>`;
    return;
  }
  templatesList.innerHTML = items.map(item => `
    <div class="item" data-tmpl-id="${item.id}">
      <div class="item-fields">
        <input class="item-title" type="text" data-tmpl-field="title" data-tmpl-id="${item.id}"
          placeholder="Название шаблона — можно {пул}" value="${esc(item.title || '')}">
        <textarea class="item-desc" data-tmpl-field="description" data-tmpl-id="${item.id}"
          placeholder="Описание шаблона — можно {пул}" rows="2">${esc(item.description || '')}</textarea>
        <input class="item-tags" type="text" data-tmpl-field="tags" data-tmpl-id="${item.id}"
          placeholder="Теги (транспорт, оружие...)"
          value="${esc((item.tags || []).join(', '))}">
      </div>
      <button class="danger btn-delete-tmpl" data-tmpl-id="${item.id}">✕</button>
    </div>
  `).join('');

  templatesList.querySelectorAll('.btn-delete-tmpl').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.tmplId);
      library.templates = library.templates.filter(t => t.id !== id);
      renderTemplates();
    });
  });
}

function collectTemplates() {
  const result = [];
  templatesList.querySelectorAll('.item[data-tmpl-id]').forEach(row => {
    const id = Number(row.dataset.tmplId);
    const title = row.querySelector(`input[data-tmpl-field="title"]`).value.trim();
    const desc = row.querySelector(`textarea[data-tmpl-field="description"]`).value.trim();
    const tagsRaw = row.querySelector(`input[data-tmpl-field="tags"]`).value.trim();
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    if (!title && !desc) return;
    result.push({ id, title, description: desc, tags });
  });
  return result;
}

// ─── Рендер: пулы ────────────────────────────────────────────────────────────
function renderPools() {
  const pools = library.pools || {};
  const keys = Object.keys(pools);

  if (!keys.length) {
    poolsList.innerHTML = `<div class="empty-hint">Нет пулов. Нажми «+ Добавить пул».</div>`;
    return;
  }

  poolsList.innerHTML = keys.map(key => `
    <div class="pool-card" data-pool-key="${esc(key)}">
      <div class="pool-header">
        <input class="pool-name-input" type="text" data-pool-old-key="${esc(key)}"
          placeholder="имя пула" value="${esc(key)}">
        <button class="danger btn-delete-pool" data-pool-key="${esc(key)}">✕ Удалить пул</button>
      </div>
      <div class="pool-values">
        ${(pools[key] || []).map((val, idx) => `
          <div class="pool-value-row">
            <input class="pool-value-input" type="text"
              data-pool-key="${esc(key)}" data-val-idx="${idx}"
              value="${esc(val)}">
            <button class="btn-delete-val danger" data-pool-key="${esc(key)}" data-val-idx="${idx}">✕</button>
          </div>
        `).join('')}
      </div>
      <button class="btn-add-val secondary" data-pool-key="${esc(key)}">+ Добавить значение</button>
    </div>
  `).join('');

  // Удалить пул
  poolsList.querySelectorAll('.btn-delete-pool').forEach(btn => {
    btn.addEventListener('click', () => {
      delete library.pools[btn.dataset.poolKey];
      renderPools();
    });
  });

  // Добавить значение в пул
  poolsList.querySelectorAll('.btn-add-val').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.poolKey;
      if (!library.pools[key]) library.pools[key] = [];
      library.pools[key].push('');
      renderPools();
      // Фокус на последнее поле
      const card = poolsList.querySelector(`.pool-card[data-pool-key="${key}"]`);
      if (card) {
        const inputs = card.querySelectorAll('.pool-value-input');
        if (inputs.length) inputs[inputs.length - 1].focus();
      }
    });
  });

  // Удалить значение из пула
  poolsList.querySelectorAll('.btn-delete-val').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.poolKey;
      const idx = Number(btn.dataset.valIdx);
      library.pools[key].splice(idx, 1);
      renderPools();
    });
  });
}

function collectPools() {
  const result = {};
  poolsList.querySelectorAll('.pool-card').forEach(card => {
    const nameInput = card.querySelector('.pool-name-input');
    const key = nameInput ? nameInput.value.trim() : '';
    if (!key) return;
    const values = [];
    card.querySelectorAll('.pool-value-input').forEach(inp => {
      const v = inp.value.trim();
      if (v) values.push(v);
    });
    result[key] = values;
  });
  return result;
}

// ─── Полный рендер ────────────────────────────────────────────────────────────
function render() {
  renderItemList(tasksList, library.tasks, 'task');
  renderItemList(cursesList, library.curses, 'curse');
  renderTemplates();
  renderPools();
  if (generatorToggle) generatorToggle.checked = library.generatorEnabled === true;
}

// ─── Сбор всего перед сохранением ────────────────────────────────────────────
function collectAll() {
  const tasks = collectItemList(tasksList, 'task');
  const curses = collectItemList(cursesList, 'curse');
  const templates = collectTemplates();
  const pools = collectPools();

  // Переназначаем id если нужно
  const fixIds = (items, offset = 0) => items.map((item, i) => ({
    ...item,
    id: Number.isFinite(item.id) && item.id > 0 ? item.id : offset + i + 1
  }));

  const fixedTasks = fixIds(tasks);
  const maxTaskId = fixedTasks.reduce((m, i) => Math.max(m, i.id), 0);
  const fixedCurses = fixIds(curses, maxTaskId);
  const maxCurseId = fixedCurses.reduce((m, i) => Math.max(m, i.id), maxTaskId);
  const fixedTemplates = fixIds(templates, maxCurseId);

  library = {
    tasks: fixedTasks,
    curses: fixedCurses,
    generatorEnabled: generatorToggle ? generatorToggle.checked : library.generatorEnabled,
    pools,
    templates: fixedTemplates
  };
}

// ─── Превью генератора ────────────────────────────────────────────────────────
function previewGenerate() {
  // Собираем актуальное состояние без сохранения на диск
  collectAll();

  const templates = library.templates;
  const pools = library.pools;

  if (!templates.length) {
    previewOutput.textContent = 'Нет шаблонов — добавь хотя бы один.';
    return;
  }

  const template = randFrom(templates);

  const fill = str => str.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = pools[key];
    if (!pool || !pool.length) return `[${key}?]`; // подсказка что пул не найден
    return randFrom(pool);
  });

  const title = fill(template.title);
  const desc = fill(template.description);

  previewOutput.innerHTML = `
    <div class="preview-title">${esc(title)}</div>
    ${desc ? `<div class="preview-desc">${esc(desc)}</div>` : ''}
    <div class="preview-meta">Шаблон #${template.id}${template.tags.length ? ' · теги: ' + template.tags.join(', ') : ''}</div>
  `;
}

// ─── Загрузка ─────────────────────────────────────────────────────────────────
async function loadLibrary() {
  library = await window.electronAPI.getLibrary();
  render();
}

// ─── Кнопки ──────────────────────────────────────────────────────────────────
btnAddTask.addEventListener('click', () => {
  library.tasks.push({ id: nextId(library.tasks), title: '', description: '', tags: [] });
  renderItemList(tasksList, library.tasks, 'task');
  const inputs = tasksList.querySelectorAll('.item-title');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

btnAddCurse.addEventListener('click', () => {
  const allIds = [...library.tasks, ...library.curses];
  library.curses.push({ id: nextId(allIds), title: '', description: '', tags: [] });
  renderItemList(cursesList, library.curses, 'curse');
  const inputs = cursesList.querySelectorAll('.item-title');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

btnAddTemplate.addEventListener('click', () => {
  const allIds = [...library.tasks, ...library.curses, ...library.templates];
  library.templates.push({ id: nextId(allIds), title: '', description: '', tags: [] });
  renderTemplates();
  const inputs = templatesList.querySelectorAll('.item-title');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

btnAddPool.addEventListener('click', () => {
  const key = `новый_пул_${Date.now()}`;
  library.pools[key] = [];
  renderPools();
  // Фокус на имя нового пула
  const cards = poolsList.querySelectorAll('.pool-card');
  if (cards.length) {
    const lastInput = cards[cards.length - 1].querySelector('.pool-name-input');
    if (lastInput) { lastInput.focus(); lastInput.select(); }
  }
});

btnSaveAll.addEventListener('click', async () => {
  collectAll();
  const result = await window.electronAPI.saveLibrary(library);
  library = result.library;
  render();
  showToast('Сохранено ✓');
});

btnExport.addEventListener('click', async () => {
  collectAll();
  const result = await window.electronAPI.exportLibrary();
  if (result.ok) showToast(`Экспортировано: ${result.filePath}`);
});

btnImport.addEventListener('click', async () => {
  const result = await window.electronAPI.importLibrary();
  if (result.ok) {
    library = result.library;
    render();
    showToast('Импортировано ✓');
  }
});

btnPreview.addEventListener('click', () => previewGenerate());

if (generatorToggle) {
  generatorToggle.addEventListener('change', () => {
    library.generatorEnabled = generatorToggle.checked;
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message) {
  let toast = document.getElementById('editor-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'editor-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadLibrary();
});
