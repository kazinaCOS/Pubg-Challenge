'use strict';

// ─── Состояние ───────────────────────────────────────────────────────────────
let library = { tasks: [], curses: [], generatorEnabled: false, pools: {}, templates: [], curseTemplates: [] };

const filters = {
  tasks:  { search: '', diff: '', tag: '' },
  curses: { search: '', tag: '' },
  tmpls:  { search: '', diff: '', tag: '' }
};

// ─── DOM-узлы ────────────────────────────────────────────────────────────────
const tasksList           = document.getElementById('tasks-list');
const cursesList          = document.getElementById('curses-list');
const templatesList       = document.getElementById('templates-list');
const curseTemplatesList  = document.getElementById('curse-templates-list');
const poolsList           = document.getElementById('pools-list');
const previewOutput       = document.getElementById('preview-output');
const generatorToggle     = document.getElementById('generator-toggle');

const btnAddTask          = document.getElementById('btn-add-task');
const btnAddCurse         = document.getElementById('btn-add-curse');
const btnAddTemplate      = document.getElementById('btn-add-template');
const btnAddCurseTemplate = document.getElementById('btn-add-curse-template');
const btnAddPool          = document.getElementById('btn-add-pool');
const btnSaveAll          = document.getElementById('btn-save-all');
const btnExport           = document.getElementById('btn-export');
const btnImport           = document.getElementById('btn-import');
const btnPreview          = document.getElementById('btn-preview');

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

function allIds() {
  return [...library.tasks, ...library.curses, ...library.templates, ...(library.curseTemplates || [])];
}

function randFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Рендер: задания (с полем difficulty) ────────────────────────────────────
function renderTaskList(container, items, allItems) {
  if (!items.length) {
    container.innerHTML = (filters.tasks.search || filters.tasks.diff || filters.tasks.tag)
      ? `<div class="empty-hint">Нет заданий по фильтру.</div>`
      : `<div class="empty-hint">Нет записей. Нажми «+ Добавить».</div>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="item" data-id="${item.id}" data-type="task">
      <div class="item-fields">
        <div class="item-top-row">
          <input class="item-title" type="text" data-field="title" data-type="task" data-id="${item.id}"
            placeholder="Название" value="${esc(item.title || '')}">
          <select class="item-diff" data-field="difficulty" data-type="task" data-id="${item.id}">
            <option value="easy" ${item.difficulty === 'easy' || !item.difficulty ? 'selected' : ''}>Лёгкое</option>
            <option value="medium" ${item.difficulty === 'medium' ? 'selected' : ''}>Среднее</option>
            <option value="heavy" ${item.difficulty === 'heavy' ? 'selected' : ''}>Тяжёлое</option>
          </select>
        </div>
        <textarea class="item-desc" data-field="description" data-type="task" data-id="${item.id}"
          placeholder="Описание" rows="2">${esc(item.description || '')}</textarea>
        <input class="item-tags" type="text" data-field="tags" data-type="task" data-id="${item.id}"
          placeholder="Теги через запятую (транспорт, оружие...)"
          value="${esc((item.tags || []).join(', '))}">
      </div>
      <button class="danger btn-delete" data-delete-type="task" data-delete-id="${item.id}">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.deleteId);
      library.tasks = (allItems || library.tasks).filter(i => i.id !== id);
      renderTaskListFiltered();
    });
  });
}

// ─── Рендер: наказания ───────────────────────────────────────────────────────
function renderCurseList(container, items, allItems) {
  if (!items.length) {
    container.innerHTML = (filters.curses.search || filters.curses.tag)
      ? `<div class="empty-hint">Нет наказаний по фильтру.</div>`
      : `<div class="empty-hint">Нет записей. Нажми «+ Добавить».</div>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="item" data-id="${item.id}" data-type="curse">
      <div class="item-fields">
        <input class="item-title" type="text" data-field="title" data-type="curse" data-id="${item.id}"
          placeholder="Название" value="${esc(item.title || '')}">
        <textarea class="item-desc" data-field="description" data-type="curse" data-id="${item.id}"
          placeholder="Описание" rows="2">${esc(item.description || '')}</textarea>
        <input class="item-tags" type="text" data-field="tags" data-type="curse" data-id="${item.id}"
          placeholder="Теги через запятую (транспорт, оружие...)"
          value="${esc((item.tags || []).join(', '))}">
      </div>
      <button class="danger btn-delete" data-delete-type="curse" data-delete-id="${item.id}">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.deleteId);
      library.curses = (allItems || library.curses).filter(i => i.id !== id);
      renderCurseListFiltered();
    });
  });
}

function collectTaskList(container) {
  const result = [];
  container.querySelectorAll(`.item[data-type="task"]`).forEach(row => {
    const id = Number(row.dataset.id);
    const title = row.querySelector(`input[data-field="title"]`).value.trim();
    const desc  = row.querySelector(`textarea[data-field="description"]`).value.trim();
    const tagsRaw = row.querySelector(`input[data-field="tags"]`).value.trim();
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    const diffEl = row.querySelector(`select[data-field="difficulty"]`);
    const difficulty = diffEl ? diffEl.value : 'easy';
    if (!title && !desc) return;
    result.push({ id, title, description: desc, tags, difficulty });
  });
  return result;
}

function collectCurseList(container) {
  const result = [];
  container.querySelectorAll(`.item[data-type="curse"]`).forEach(row => {
    const id = Number(row.dataset.id);
    const title = row.querySelector(`input[data-field="title"]`).value.trim();
    const desc  = row.querySelector(`textarea[data-field="description"]`).value.trim();
    const tagsRaw = row.querySelector(`input[data-field="tags"]`).value.trim();
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    if (!title && !desc) return;
    result.push({ id, title, description: desc, tags });
  });
  return result;
}

// ─── Рендер: шаблоны (общий для заданий и наказаний) ────────────────────────
function renderTemplateList(container, items, dataAttr, deleteFn, showDiff = false) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-hint">Нет шаблонов. Нажми «+ Добавить».</div>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="item" data-${dataAttr}-id="${item.id}">
      <div class="item-fields">
        ${showDiff ? `
        <div class="item-top-row">
          <input class="item-title" type="text" data-${dataAttr}-field="title" data-${dataAttr}-id="${item.id}"
            placeholder="Название — можно {пул}" value="${esc(item.title || '')}">
          <select class="item-diff" data-${dataAttr}-field="difficulty" data-${dataAttr}-id="${item.id}">
            <option value="easy" ${item.difficulty === 'easy' || !item.difficulty ? 'selected' : ''}>Лёгкое</option>
            <option value="medium" ${item.difficulty === 'medium' ? 'selected' : ''}>Среднее</option>
            <option value="hard" ${item.difficulty === 'hard' ? 'selected' : ''}>Сложное</option>
          </select>
        </div>
        ` : `
        <input class="item-title" type="text" data-${dataAttr}-field="title" data-${dataAttr}-id="${item.id}"
          placeholder="Название — можно {пул}" value="${esc(item.title || '')}">
        `}
        <textarea class="item-desc" data-${dataAttr}-field="description" data-${dataAttr}-id="${item.id}"
          placeholder="Описание — можно {пул}" rows="2">${esc(item.description || '')}</textarea>
        <input class="item-tags" type="text" data-${dataAttr}-field="tags" data-${dataAttr}-id="${item.id}"
          placeholder="Теги (транспорт, оружие...)"
          value="${esc((item.tags || []).join(', '))}">
      </div>
      <button class="danger btn-del-tmpl" data-${dataAttr}-del="${item.id}">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-del-tmpl').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute(`data-${dataAttr}-del`));
      deleteFn(id);
    });
  });
}

function renderTemplates() {
  renderTemplateList(templatesList, library.templates, 'tmpl', id => {
    library.templates = library.templates.filter(t => t.id !== id);
    renderTemplates();
  }, true);
}

function renderCurseTemplates() {
  renderTemplateList(curseTemplatesList, library.curseTemplates || [], 'ctmpl', id => {
    library.curseTemplates = (library.curseTemplates || []).filter(t => t.id !== id);
    renderCurseTemplates();
  }, false);
}

function collectTemplateList(container, dataAttr, hasDiff = false) {
  const result = [];
  container.querySelectorAll(`.item[data-${dataAttr}-id]`).forEach(row => {
    const id = Number(row.getAttribute(`data-${dataAttr}-id`));
    const title = row.querySelector(`input[data-${dataAttr}-field="title"]`).value.trim();
    const desc  = row.querySelector(`textarea[data-${dataAttr}-field="description"]`).value.trim();
    const tagsRaw = row.querySelector(`input[data-${dataAttr}-field="tags"]`).value.trim();
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    if (!title && !desc) return;
    const entry = { id, title, description: desc, tags };
    if (hasDiff) {
      const diffEl = row.querySelector(`select[data-${dataAttr}-field="difficulty"]`);
      entry.difficulty = diffEl ? diffEl.value : 'easy';
    }
    result.push(entry);
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

  poolsList.querySelectorAll('.btn-delete-pool').forEach(btn => {
    btn.addEventListener('click', () => { delete library.pools[btn.dataset.poolKey]; renderPools(); });
  });

  poolsList.querySelectorAll('.btn-add-val').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.poolKey;
      if (!library.pools[key]) library.pools[key] = [];
      library.pools[key].push('');
      renderPools();
      const card = poolsList.querySelector(`.pool-card[data-pool-key="${key}"]`);
      if (card) {
        const inputs = card.querySelectorAll('.pool-value-input');
        if (inputs.length) inputs[inputs.length - 1].focus();
      }
    });
  });

  poolsList.querySelectorAll('.btn-delete-val').forEach(btn => {
    btn.addEventListener('click', () => {
      library.pools[btn.dataset.poolKey].splice(Number(btn.dataset.valIdx), 1);
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
  renderTaskListFiltered();
  renderCurseListFiltered();
  renderTemplatesFiltered();
  renderCurseTemplates();
  renderPools();
  if (generatorToggle) generatorToggle.checked = library.generatorEnabled === true;
}

// ─── Сбор всего перед сохранением ────────────────────────────────────────────
function collectAll() {
  const tasks          = collectTaskList(tasksList);
  const curses         = collectCurseList(cursesList);
  const templates      = collectTemplateList(templatesList, 'tmpl', true);
  const curseTemplates = collectTemplateList(curseTemplatesList, 'ctmpl', false);
  const pools          = collectPools();

  const fixIds = (items, offset = 0) => items.map((item, i) => ({
    ...item,
    id: Number.isFinite(item.id) && item.id > 0 ? item.id : offset + i + 1
  }));

  const fixedTasks         = fixIds(tasks);
  const maxTaskId          = fixedTasks.reduce((m, i) => Math.max(m, i.id), 0);
  const fixedCurses        = fixIds(curses, maxTaskId);
  const maxCurseId         = fixedCurses.reduce((m, i) => Math.max(m, i.id), maxTaskId);
  const fixedTemplates     = fixIds(templates, maxCurseId);
  const maxTmplId          = fixedTemplates.reduce((m, i) => Math.max(m, i.id), maxCurseId);
  const fixedCurseTmpls    = fixIds(curseTemplates, maxTmplId);

  library = {
    tasks: fixedTasks,
    curses: fixedCurses,
    generatorEnabled: generatorToggle ? generatorToggle.checked : library.generatorEnabled,
    pools,
    templates: fixedTemplates,
    curseTemplates: fixedCurseTmpls
  };
}

// ─── Превью генератора ────────────────────────────────────────────────────────
function previewGenerate() {
  collectAll();
  const templates = library.templates;
  const pools     = library.pools;

  if (!templates.length) {
    previewOutput.textContent = 'Нет шаблонов заданий — добавь хотя бы один.';
    return;
  }

  const template = randFrom(templates);

  const fill = str => str.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = pools[key];
    if (!pool || !pool.length) return `[${key}?]`;
    return randFrom(pool);
  });

  const title = fill(template.title);
  const desc  = fill(template.description);
  const diff  = template.difficulty || 'easy';
  const diffLabel = { easy: 'Лёгкое', medium: 'Среднее', hard: 'Сложное' }[diff] || diff;

  previewOutput.innerHTML = `
    <div class="preview-diff diff-${diff}">${esc(diffLabel)}</div>
    <div class="preview-title">${esc(title)}</div>
    ${desc ? `<div class="preview-desc">${esc(desc)}</div>` : ''}
    <div class="preview-meta">Шаблон #${template.id}${template.tags.length ? ' · теги: ' + template.tags.join(', ') : ''}</div>
  `;
}

// ─── Загрузка ─────────────────────────────────────────────────────────────────
async function loadLibrary() {
  library = await window.electronAPI.getLibrary();
  if (!library.curseTemplates) library.curseTemplates = [];
  render();
}

// ─── Кнопки ──────────────────────────────────────────────────────────────────
btnAddTask.addEventListener('click', () => {
  library.tasks.push({ id: nextId(allIds()), title: '', description: '', tags: [], difficulty: 'easy' });
  renderTaskListFiltered();
  const inputs = tasksList.querySelectorAll('.item-title');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

btnAddCurse.addEventListener('click', () => {
  library.curses.push({ id: nextId(allIds()), title: '', description: '', tags: [] });
  renderCurseListFiltered();
  const inputs = cursesList.querySelectorAll('.item-title');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

btnAddTemplate.addEventListener('click', () => {
  library.templates.push({ id: nextId(allIds()), title: '', description: '', tags: [], difficulty: 'easy' });
  renderTemplatesFiltered();
  const inputs = templatesList.querySelectorAll('.item-title');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

btnAddCurseTemplate.addEventListener('click', () => {
  if (!library.curseTemplates) library.curseTemplates = [];
  library.curseTemplates.push({ id: nextId(allIds()), title: '', description: '', tags: [] });
  renderCurseTemplates();
  const inputs = curseTemplatesList.querySelectorAll('.item-title');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

btnAddPool.addEventListener('click', () => {
  const key = `новый_пул_${Date.now()}`;
  library.pools[key] = [];
  renderPools();
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
  if (!library.curseTemplates) library.curseTemplates = [];
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
    if (!library.curseTemplates) library.curseTemplates = [];
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

// ─── Фильтры ────────────────────────────────────────────────────────────────
function buildTagChips(container, items, filterKey, tagKey, onUpdate) {
  // Собираем уникальные теги
  const allTags = new Set();
  items.forEach(item => (item.tags || []).forEach(t => allTags.add(t)));
  if (!allTags.size) { container.innerHTML = ''; return; }
  const current = filters[filterKey][tagKey];
  container.innerHTML = `<button class="chip ${!current ? 'active' : ''}" data-tag="">Все</button>` +
    [...allTags].sort().map(t =>
      `<button class="chip ${current === t ? 'active' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`
    ).join('');
  container.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      filters[filterKey][tagKey] = btn.dataset.tag;
      container.querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b === btn));
      onUpdate();
    });
  });
}

function applyFilter(items, f) {
  let result = items;
  if (f.search) {
    const q = f.search.toLowerCase();
    result = result.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q) ||
      (i.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (f.diff) result = result.filter(i => i.difficulty === f.diff);
  if (f.tag)  result = result.filter(i => (i.tags || []).includes(f.tag));
  return result;
}

function initTaskFilters() {
  const searchEl = document.getElementById('task-search');
  const diffChips = document.getElementById('task-diff-chips');
  const tagChips  = document.getElementById('task-tag-chips');

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      filters.tasks.search = searchEl.value.trim();
      renderTaskListFiltered();
    });
  }
  if (diffChips) {
    diffChips.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        filters.tasks.diff = btn.dataset.diff;
        diffChips.querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b === btn));
        renderTaskListFiltered();
      });
    });
  }
  // tag chips rebuilt on each render
  function rebuildTagChips() {
    buildTagChips(tagChips, library.tasks, 'tasks', 'tag', renderTaskListFiltered);
  }
  window._rebuildTaskTagChips = rebuildTagChips;
}

function renderTaskListFiltered() {
  const visible = applyFilter(library.tasks, filters.tasks);
  renderTaskList(tasksList, visible, library.tasks);
  if (window._rebuildTaskTagChips) window._rebuildTaskTagChips();
}

function initCurseFilters() {
  const searchEl = document.getElementById('curse-search');
  const tagChips  = document.getElementById('curse-tag-chips');

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      filters.curses.search = searchEl.value.trim();
      renderCurseListFiltered();
    });
  }
  function rebuildTagChips() {
    buildTagChips(tagChips, library.curses, 'curses', 'tag', renderCurseListFiltered);
  }
  window._rebuildCurseTagChips = rebuildTagChips;
}

function renderCurseListFiltered() {
  const visible = applyFilter(library.curses, filters.curses);
  renderCurseList(cursesList, visible, library.curses);
  if (window._rebuildCurseTagChips) window._rebuildCurseTagChips();
}

function initTmplFilters() {
  const searchEl = document.getElementById('tmpl-search');
  const diffChips = document.getElementById('tmpl-diff-chips');
  const tagChips  = document.getElementById('tmpl-tag-chips');

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      filters.tmpls.search = searchEl.value.trim();
      renderTemplatesFiltered();
    });
  }
  if (diffChips) {
    diffChips.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        filters.tmpls.diff = btn.dataset.diff;
        diffChips.querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b === btn));
        renderTemplatesFiltered();
      });
    });
  }
  function rebuildTagChips() {
    buildTagChips(tagChips, library.templates, 'tmpls', 'tag', renderTemplatesFiltered);
  }
  window._rebuildTmplTagChips = rebuildTagChips;
}

function renderTemplatesFiltered() {
  const visible = applyFilter(library.templates, filters.tmpls);
  renderTemplateList(templatesList, visible, 'tmpl', id => {
    library.templates = library.templates.filter(t => t.id !== id);
    renderTemplatesFiltered();
  }, true);
  if (window._rebuildTmplTagChips) window._rebuildTmplTagChips();
}

// Toast ────────────────────────────────────────────────────────────────────
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
  initTaskFilters();
  initCurseFilters();
  initTmplFilters();
  await loadLibrary();
});
