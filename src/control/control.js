const stateElements = {
  currentTaskTitle: document.getElementById('current-task-title'),
  currentTaskDesc: document.getElementById('current-task-desc'),
  activeCurses: document.getElementById('active-curses'),
  completed: document.getElementById('completed'),
  failed: document.getElementById('failed')
};

const buttons = {
  newTask: document.getElementById('btn-new-task'),
  complete: document.getElementById('btn-complete'),
  fail: document.getElementById('btn-fail'),
  editor: document.getElementById('btn-editor'),
  settings: document.getElementById('btn-settings'),
  saveSettings: document.getElementById('btn-save-settings'),
  resetProgress: document.getElementById('btn-reset-progress'),
  closeSettings: document.getElementById('btn-close-settings')
};

const modal = document.getElementById('settings-modal');
const modalBackdrop = document.querySelector('.modal-backdrop');

const settingsInputs = {
  overlayX: document.getElementById('overlay-x'),
  overlayY: document.getElementById('overlay-y'),
  overlayWidth: document.getElementById('overlay-width'),
  overlayHeight: document.getElementById('overlay-height')
};

// Флаг — пока настройки открыты, не перезаписываем поля из state
let settingsOpen = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderTask(task) {
  if (!task) {
    stateElements.currentTaskTitle.textContent = 'Нет задания';
    stateElements.currentTaskDesc.textContent = '';
    return;
  }
  const title = typeof task === 'object' ? (task.title || task.text || '') : String(task);
  const desc = typeof task === 'object' ? (task.description || '') : '';
  stateElements.currentTaskTitle.textContent = title || 'Нет задания';
  stateElements.currentTaskDesc.textContent = desc;
}

function renderCurses(activeCurses) {
  if (!Array.isArray(activeCurses) || !activeCurses.length) {
    stateElements.activeCurses.textContent = 'Нет активных наказаний';
    return;
  }

  stateElements.activeCurses.innerHTML = activeCurses.map(curse => {
    const title = curse.title || curse.text || '';
    const desc = curse.description || '';
    // Сгенерированные наказания идентифицируются по genId, рукописные — по id
    const removeKey = curse.genId || curse.id;
    return `
      <div class="curse-item">
        <div class="curse-title">${escapeHtml(title)}</div>
        ${desc ? `<div class="curse-desc">${escapeHtml(desc)}</div>` : ''}
        <button class="curse-close danger" data-curse-id="${escapeHtml(String(removeKey))}">Закрыть</button>
      </div>
    `;
  }).join('');

  Array.from(stateElements.activeCurses.querySelectorAll('[data-curse-id]')).forEach(button => {
    button.addEventListener('click', async () => {
      const raw = button.getAttribute('data-curse-id');
      // genId — строка вида 'gen_...', рукописное — число
      const curseId = raw.startsWith('gen_') ? raw : Number(raw);
      const state = await window.electronAPI.clearCurse(curseId);
      renderState(state);
    });
  });
}

function renderSettings(settings) {
  // Не трогаем инпуты пока модалка открыта — пользователь может редактировать
  if (settingsOpen) return;
  const s = settings || {};
  settingsInputs.overlayX.value = Number.isFinite(s.overlayX) ? s.overlayX : 20;
  settingsInputs.overlayY.value = Number.isFinite(s.overlayY) ? s.overlayY : 20;
  settingsInputs.overlayWidth.value = Number.isFinite(s.overlayWidth) ? s.overlayWidth : 620;
  settingsInputs.overlayHeight.value = Number.isFinite(s.overlayHeight) ? s.overlayHeight : 260;
}

function renderState(state) {
  if (!state) return;
  renderTask(state.currentTask);
  renderCurses(state.activeCurses || []);
  stateElements.completed.textContent = String(state.completed ?? 0);
  stateElements.failed.textContent = String(state.failed ?? 0);
  renderSettings(state.settings);
}

async function refreshState() {
  const state = await window.electronAPI.getState();
  renderState(state);
}

function openSettings() {
  settingsOpen = true;
  modal.classList.add('open');
}

function closeSettings() {
  settingsOpen = false;
  modal.classList.remove('open');
}

function getSettingsPayload() {
  return {
    overlayX: Number(settingsInputs.overlayX.value),
    overlayY: Number(settingsInputs.overlayY.value),
    overlayWidth: Number(settingsInputs.overlayWidth.value),
    overlayHeight: Number(settingsInputs.overlayHeight.value)
  };
}

async function saveSettings() {
  const state = await window.electronAPI.updateSettings(getSettingsPayload());
  settingsOpen = false; // разрешаем рендер перед закрытием
  renderState(state);
  closeSettings();
}

async function resetProgress() {
  const result = await window.electronAPI.resetProgress();
  if (result && result.state) renderState(result.state);
}

async function initialize() {
  buttons.newTask.addEventListener('click', async () => {
    const state = await window.electronAPI.newTask();
    renderState(state);
  });

  buttons.complete.addEventListener('click', async () => {
    const state = await window.electronAPI.completeTask();
    renderState(state);
  });

  buttons.fail.addEventListener('click', async () => {
    const state = await window.electronAPI.failTask();
    renderState(state);
  });

  buttons.editor.addEventListener('click', async () => {
    await window.electronAPI.openEditor();
  });

  buttons.settings.addEventListener('click', () => openSettings());
  buttons.closeSettings.addEventListener('click', () => closeSettings());
  buttons.saveSettings.addEventListener('click', async () => { await saveSettings(); });
  buttons.resetProgress.addEventListener('click', async () => { await resetProgress(); });

  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', () => closeSettings());
  }

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSettings();
  });

  await refreshState();
  setInterval(refreshState, 700);
}

window.addEventListener('DOMContentLoaded', async () => {
  await initialize();
});
