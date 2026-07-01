const elements = {
  task: document.getElementById('overlay-task'),
  curses: document.getElementById('overlay-curses'),
  cursesEmpty: document.getElementById('overlay-curses-empty'),
  completed: document.getElementById('overlay-completed'),
  failed: document.getElementById('overlay-failed')
};

let lastSerializedState = '';

function valueText(value, fallback) {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value.text || fallback;
  }

  return String(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderCurses(activeCurses) {
  if (!Array.isArray(activeCurses) || !activeCurses.length) {
    elements.curses.innerHTML = '';
    elements.cursesEmpty.style.display = 'inline';
    return;
  }

  elements.cursesEmpty.style.display = 'none';
  elements.curses.innerHTML = activeCurses.map((curse) => `
    <div class="curse-pill">${escapeHtml(curse.text)}</div>
  `).join('');
}

function renderState(state) {
  elements.task.textContent = valueText(state.currentTask, 'Нет задания');
  elements.completed.textContent = String(state.completed ?? 0);
  elements.failed.textContent = String(state.failed ?? 0);
  renderCurses(state.activeCurses || []);
}

function renderError(message) {
  elements.task.textContent = 'Ошибка overlay';
  elements.cursesEmpty.textContent = message;
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