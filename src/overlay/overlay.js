const elements = {
  taskTitle: document.getElementById('overlay-task-title'),
  taskDesc: document.getElementById('overlay-task-desc'),
  curses: document.getElementById('overlay-curses'),
  cursesEmpty: document.getElementById('overlay-curses-empty'),
  completed: document.getElementById('overlay-completed'),
  failed: document.getElementById('overlay-failed')
};

let lastSerializedState = '';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getTaskTitle(task) {
  if (!task) return 'Нет задания';
  if (typeof task === 'object') return task.title || task.text || 'Нет задания';
  return String(task);
}

function getTaskDesc(task) {
  if (!task || typeof task !== 'object') return '';
  return task.description || '';
}

function renderCurses(activeCurses) {
  if (!Array.isArray(activeCurses) || !activeCurses.length) {
    elements.curses.innerHTML = '';
    elements.cursesEmpty.style.display = 'inline';
    return;
  }

  elements.cursesEmpty.style.display = 'none';
  elements.curses.innerHTML = activeCurses.map(curse => {
    const title = curse.title || curse.text || '';
    const desc = curse.description || '';
    return `
      <div class="curse-pill">
        <span class="curse-pill-title">${escapeHtml(title)}</span>
        ${desc ? `<span class="curse-pill-desc">${escapeHtml(desc)}</span>` : ''}
      </div>
    `;
  }).join('');
}

function renderState(state) {
  const title = getTaskTitle(state.currentTask);
  const desc = getTaskDesc(state.currentTask);

  elements.taskTitle.textContent = title;
  elements.taskDesc.textContent = desc;
  elements.taskDesc.style.display = desc ? 'block' : 'none';

  elements.completed.textContent = String(state.completed ?? 0);
  elements.failed.textContent = String(state.failed ?? 0);
  renderCurses(state.activeCurses || []);
}

function renderError(message) {
  elements.taskTitle.textContent = 'Ошибка overlay';
  elements.taskDesc.textContent = message;
  elements.completed.textContent = '!';
  elements.failed.textContent = '!';
}

function serializeState(state) {
  return JSON.stringify({
    currentTask: state.currentTask,
    activeCurses: state.activeCurses,
    completed: state.completed,
    failed: state.failed
  });
}

async function updateFromMain() {
  try {
    if (!window.electronAPI || typeof window.electronAPI.getState !== 'function') {
      renderError('getState недоступен');
      return;
    }

    const state = await window.electronAPI.getState();

    if (!state || typeof state !== 'object') {
      renderError('state не получен');
      return;
    }

    const serialized = serializeState(state);
    if (serialized !== lastSerializedState) {
      lastSerializedState = serialized;
      renderState(state);
    }
  } catch (error) {
    renderError(error && error.message ? error.message : 'неизвестная ошибка');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  await updateFromMain();
  setInterval(updateFromMain, 300);
});
