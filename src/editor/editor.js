const tasksList = document.getElementById('tasks-list');
const cursesList = document.getElementById('curses-list');
const btnAddTask = document.getElementById('btn-add-task');
const btnAddCurse = document.getElementById('btn-add-curse');
const btnSaveAll = document.getElementById('btn-save-all');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const generatorToggle = document.getElementById('generator-toggle');

let library = { tasks: [], curses: [], generatorEnabled: false };

function nextId(items) {
  const ids = items.map(item => item.id).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderList(container, items, type) {
  if (!items.length) {
    container.innerHTML = `<div class="item empty-hint">Нет записей. Нажмите «+ Добавить».</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="item" data-id="${item.id}" data-type="${type}">
      <div class="item-fields">
        <input
          class="item-title"
          type="text"
          data-field="title"
          data-type="${type}"
          data-id="${item.id}"
          placeholder="Название"
          value="${escapeHtml(item.title || '')}"
        >
        <textarea
          class="item-desc"
          data-field="description"
          data-type="${type}"
          data-id="${item.id}"
          placeholder="Описание (подробности)"
          rows="2"
        >${escapeHtml(item.description || '')}</textarea>
        <input
          class="item-tags"
          type="text"
          data-field="tags"
          data-type="${type}"
          data-id="${item.id}"
          placeholder="Теги через запятую (транспорт, оружие...)"
          value="${escapeHtml((item.tags || []).join(', '))}"
        >
      </div>
      <button class="danger btn-delete" data-delete-type="${type}" data-delete-id="${item.id}">✕</button>
    </div>
  `).join('');

  Array.from(container.querySelectorAll('.btn-delete')).forEach(button => {
    button.addEventListener('click', () => {
      const id = Number(button.getAttribute('data-delete-id'));
      const t = button.getAttribute('data-delete-type');
      if (t === 'task') {
        library.tasks = library.tasks.filter(item => item.id !== id);
      } else {
        library.curses = library.curses.filter(item => item.id !== id);
      }
      render();
    });
  });
}

function collectItems(container, type) {
  const items = [];
  container.querySelectorAll(`.item[data-type="${type}"]`).forEach(row => {
    const id = Number(row.getAttribute('data-id'));
    const titleEl = row.querySelector(`input[data-field="title"]`);
    const descEl = row.querySelector(`textarea[data-field="description"]`);
    const tagsEl = row.querySelector(`input[data-field="tags"]`);
    const title = titleEl ? titleEl.value.trim() : '';
    const description = descEl ? descEl.value.trim() : '';
    const tagsRaw = tagsEl ? tagsEl.value.trim() : '';
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    if (!title && !description) return;
    items.push({ id, title, description, tags });
  });
  return items;
}

function normalizeBeforeSave() {
  const tasks = collectItems(tasksList, 'task');
  const curses = collectItems(cursesList, 'curse');

  const fixedTasks = tasks.map((item, index) => ({
    id: Number.isFinite(item.id) && item.id > 0 ? item.id : index + 1,
    title: item.title,
    description: item.description,
    tags: item.tags
  }));

  const maxTaskId = fixedTasks.reduce((max, item) => Math.max(max, item.id), 0);
  const fixedCurses = curses.map((item, index) => ({
    id: Number.isFinite(item.id) && item.id > 0 ? item.id : maxTaskId + index + 1,
    title: item.title,
    description: item.description,
    tags: item.tags
  }));

  library = {
    tasks: fixedTasks,
    curses: fixedCurses,
    generatorEnabled: library.generatorEnabled
  };
}

function render() {
  renderList(tasksList, library.tasks, 'task');
  renderList(cursesList, library.curses, 'curse');
  if (generatorToggle) {
    generatorToggle.checked = library.generatorEnabled === true;
  }
}

async function loadLibrary() {
  library = await window.electronAPI.getLibrary();
  render();
}

btnAddTask.addEventListener('click', () => {
  library.tasks.push({ id: nextId(library.tasks), title: '', description: '', tags: [] });
  render();
  // Фокус на последний добавленный
  const inputs = tasksList.querySelectorAll('.item-title');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

btnAddCurse.addEventListener('click', () => {
  library.curses.push({ id: nextId([...library.tasks, ...library.curses]), title: '', description: '', tags: [] });
  render();
  const inputs = cursesList.querySelectorAll('.item-title');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

btnSaveAll.addEventListener('click', async () => {
  normalizeBeforeSave();
  const result = await window.electronAPI.saveLibrary(library);
  library = result.library;
  render();
  showToast('Сохранено ✓');
});

if (btnExport) {
  btnExport.addEventListener('click', async () => {
    const result = await window.electronAPI.exportLibrary();
    if (result.ok) showToast(`Экспортировано: ${result.filePath}`);
  });
}

if (btnImport) {
  btnImport.addEventListener('click', async () => {
    const result = await window.electronAPI.importLibrary();
    if (result.ok) {
      library = result.library;
      render();
      showToast('Импортировано ✓');
    }
  });
}

if (generatorToggle) {
  generatorToggle.addEventListener('change', () => {
    library.generatorEnabled = generatorToggle.checked;
  });
}

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

window.addEventListener('DOMContentLoaded', async () => {
  await loadLibrary();
});
