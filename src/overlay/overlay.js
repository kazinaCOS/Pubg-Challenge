const elements = {
  tasks: document.getElementById('overlay-tasks'),
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

const DIFF_LABEL = { easy: 'Лёгкое', medium: 'Среднее', hard: 'Сложное' };
const DIFF_CLASS = { easy: 'diff-easy', medium: 'diff-medium', hard: 'diff-hard' };

function renderTasks(activeTasks) {
  if (!Array.isArray(activeTasks) || !activeTasks.length) {
    elements.tasks.innerHTML = '<div class="no-task">Нет заданий</div>';
    return;
  }

  elements.tasks.innerHTML = activeTasks.map(task => {
    const title = task.title || task.text || 'Без названия';
    const desc = task.description || '';
    const diff = task.difficulty || 'easy';
    const genMark = task.generated ? ' 🎲' : '';
    return `
      <div class="task-row">
        <span class="diff-pill ${DIFF_CLASS[diff]}">${DIFF_LABEL[diff] || diff}${genMark}</span>
        <div class="task-info">
          <span class="task-title">${escapeHtml(title)}</span>
          ${desc ? `<span class="task-desc">${escapeHtml(desc)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
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
  renderTasks(state.activeTasks || []);
  elements.completed.textContent = String(state.completed ?? 0);
  elements.failed.textContent = String(state.failed ?? 0);
  renderCurses(state.activeCurses || []);
}

function renderError(message) {
  elements.tasks.innerHTML = `<div class="no-task">Ошибка: ${escapeHtml(message)}</div>`;
  elements.completed.textContent = '!';
  elements.failed.textContent = '!';
}

function serializeState(state) {
  return JSON.stringify({
    activeTasks: state.activeTasks,
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
