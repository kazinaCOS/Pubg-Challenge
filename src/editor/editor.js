const tasksList = document.getElementById('tasks-list');
const cursesList = document.getElementById('curses-list');
const btnAddTask = document.getElementById('btn-add-task');
const btnAddCurse = document.getElementById('btn-add-curse');
const btnSaveAll = document.getElementById('btn-save-all');

let library = {
  tasks: [],
  curses: []
};

function nextId(items) {
  const ids = items.map((item) => item.id).filter(Number.isFinite);
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
    container.innerHTML = `<div class="item"><textarea data-type="${type}" data-id="" placeholder="Пусто"></textarea></div>`;
    container.querySelector('textarea').value = '';
    return;
  }

  container.innerHTML = items.map((item) => `
    <div class="item">
      <textarea data-type="${type}" data-id="${item.id}">${escapeHtml(item.text)}</textarea>
      <button class="danger" data-delete-type="${type}" data-delete-id="${item.id}">Удалить</button>
    </div>
  `).join('');

  Array.from(container.querySelectorAll('[data-delete-id]')).forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.getAttribute('data-delete-id'));
      if (type === 'task') {
        library.tasks = library.tasks.filter((item) => item.id !== id);
        render();
      } else {
        library.curses = library.curses.filter((item) => item.id !== id);
        render();
      }
    });
  });
}

function collectItems(container, type) {
  const textareas = Array.from(container.querySelectorAll(`textarea[data-type="${type}"]`));

  return textareas
    .map((textarea) => ({
      id: Number(textarea.getAttribute('data-id')),
      text: textarea.value.trim()
    }))
    .filter((item) => item.text)
    .map((item) => ({
      id: Number.isFinite(item.id) && item.id > 0 ? item.id : null,
      text: item.text
    }));
}

function normalizeBeforeSave() {
  const tasks = collectItems(tasksList, 'task');
  const curses = collectItems(cursesList, 'curse');

  const fixedTasks = tasks.map((item, index) => ({
    id: Number.isFinite(item.id) ? item.id : index + 1,
    text: item.text
  }));

  const maxTaskId = fixedTasks.reduce((max, item) => Math.max(max, item.id), 0);
  const fixedCurses = curses.map((item, index) => ({
    id: Number.isFinite(item.id) ? item.id : maxTaskId + index + 1,
    text: item.text
  }));

  library = {
    tasks: fixedTasks,
    curses: fixedCurses
  };
}

function render() {
  renderList(tasksList, library.tasks, 'task');
  renderList(cursesList, library.curses, 'curse');
}

async function loadLibrary() {
  library = await window.electronAPI.getLibrary();
  render();
}

btnAddTask.addEventListener('click', () => {
  library.tasks.push({
    id: nextId(library.tasks),
    text: ''
  });
  render();
});

btnAddCurse.addEventListener('click', () => {
  library.curses.push({
    id: nextId([...library.tasks, ...library.curses]),
    text: ''
  });
  render();
});

btnSaveAll.addEventListener('click', async () => {
  normalizeBeforeSave();
  const result = await window.electronAPI.saveLibrary(library);
  library = result.library;
  render();
});

window.addEventListener('DOMContentLoaded', async () => {
  await loadLibrary();
});