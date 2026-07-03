const tasksGrid = document.getElementById('tasks-grid');
const activeCursesEl = document.getElementById('active-curses');
const completedEl = document.getElementById('completed');
const failedEl = document.getElementById('failed');

const modal = document.getElementById('settings-modal');
const modalBackdrop = document.querySelector('.modal-backdrop');

const settingsInputs = {
  overlayX: document.getElementById('overlay-x'),
  overlayY: document.getElementById('overlay-y'),
  overlayWidth: document.getElementById('overlay-width'),
  overlayHeight: document.getElementById('overlay-height'),
  overlayTitlesOnly: document.getElementById('overlay-titles-only'),
  overlayBgOpacity: document.getElementById('overlay-bg-opacity')
};
const opacityVal = document.getElementById('opacity-val');

let dragModeActive = false;

let settingsOpen = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const DIFF_LABEL = { easy: 'Лёгкое', medium: 'Среднее', heavy: 'Тяжёлое', brutal: 'Потужно' };
const DIFF_CLASS = { easy: 'diff-easy', medium: 'diff-medium', heavy: 'diff-heavy', brutal: 'diff-brutal' };

function renderTasks(activeTasks) {
  if (!Array.isArray(activeTasks) || activeTasks.length === 0) {
    tasksGrid.innerHTML = '<div class="no-tasks">Нет активных заданий. Нажми «Новый раунд».</div>';
    return;
  }

  tasksGrid.innerHTML = activeTasks.map(task => {
    const title = task.title || 'Без названия';
    const desc = task.description || '';
    const diff = task.difficulty || 'easy';
    const uid = task.uid || '';
    const status = task.status || 'active';
    const genMark = task.generated ? '<span class="gen-mark">🎲</span>' : '';
    const isDone = status === 'completed' || status === 'failed';
    const statusBadge = status === 'completed'
      ? '<span class="status-badge status-completed">✅ Выполнено</span>'
      : status === 'failed'
        ? '<span class="status-badge status-failed">❌ Провалено</span>'
        : '';
    return `
      <article class="task-card ${isDone ? 'task-card-done task-card-' + status : ''}">
        <div class="task-card-head">
          <span class="diff-badge ${DIFF_CLASS[diff]}">${DIFF_LABEL[diff] || diff}</span>
          ${genMark}
          ${statusBadge}
        </div>
        <div class="task-card-title">${escapeHtml(title)}</div>
        ${desc ? `<div class="task-card-desc">${escapeHtml(desc)}</div>` : ''}
        <div class="task-card-actions">
          <button class="success btn-complete-task" data-uid="${escapeHtml(uid)}" ${isDone ? 'disabled' : ''}>✅ Выполнено</button>
          <button class="danger btn-fail-task" data-uid="${escapeHtml(uid)}" ${isDone ? 'disabled' : ''}>❌ Провалено</button>
        </div>
      </article>
    `;
  }).join('');

  tasksGrid.querySelectorAll('.btn-complete-task').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      const state = await window.electronAPI.completeTask(uid);
      renderState(state);
    });
  });

  tasksGrid.querySelectorAll('.btn-fail-task').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      const state = await window.electronAPI.failTask(uid);
      renderState(state);
    });
  });
}

function renderCurses(activeCurses) {
  if (!Array.isArray(activeCurses) || !activeCurses.length) {
    activeCursesEl.textContent = 'Нет активных наказаний';
    return;
  }

  activeCursesEl.innerHTML = activeCurses.map(curse => {
    const title = curse.title || curse.text || '';
    const desc = curse.description || '';
    const removeKey = curse.genId || curse.id;
    return `
      <div class="curse-item">
        <div class="curse-title">${escapeHtml(title)}</div>
        ${desc ? `<div class="curse-desc">${escapeHtml(desc)}</div>` : ''}
        <button class="curse-close danger" data-curse-id="${escapeHtml(String(removeKey))}">Закрыть</button>
      </div>
    `;
  }).join('');

  Array.from(activeCursesEl.querySelectorAll('[data-curse-id]')).forEach(button => {
    button.addEventListener('click', async () => {
      const raw = button.getAttribute('data-curse-id');
      const curseId = raw.startsWith('gen_') ? raw : Number(raw);
      const state = await window.electronAPI.clearCurse(curseId);
      renderState(state);
    });
  });
}

function renderSettings(settings) {
  if (settingsOpen) return;
  const s = settings || {};
  settingsInputs.overlayX.value = Number.isFinite(s.overlayX) ? s.overlayX : 20;
  settingsInputs.overlayY.value = Number.isFinite(s.overlayY) ? s.overlayY : 20;
  settingsInputs.overlayWidth.value = Number.isFinite(s.overlayWidth) ? s.overlayWidth : 620;
  settingsInputs.overlayHeight.value = Number.isFinite(s.overlayHeight) ? s.overlayHeight : 260;
  if (settingsInputs.overlayTitlesOnly) settingsInputs.overlayTitlesOnly.checked = s.overlayTitlesOnly === true;
  const opPct = Number.isFinite(s.overlayBgOpacity) ? Math.round(s.overlayBgOpacity * 100) : 78;
  if (settingsInputs.overlayBgOpacity) settingsInputs.overlayBgOpacity.value = opPct;
  if (opacityVal) opacityVal.textContent = opPct;
}

function renderState(state) {
  if (!state) return;
  renderTasks(state.activeTasks || []);
  renderCurses(state.activeCurses || []);
  completedEl.textContent = String(state.completed ?? 0);
  failedEl.textContent = String(state.failed ?? 0);
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
  const opPct = settingsInputs.overlayBgOpacity ? Number(settingsInputs.overlayBgOpacity.value) : 78;
  return {
    overlayX: Number(settingsInputs.overlayX.value),
    overlayY: Number(settingsInputs.overlayY.value),
    overlayWidth: Number(settingsInputs.overlayWidth.value),
    overlayHeight: Number(settingsInputs.overlayHeight.value),
    overlayTitlesOnly: settingsInputs.overlayTitlesOnly ? settingsInputs.overlayTitlesOnly.checked : false,
    overlayBgOpacity: opPct / 100
  };
}

async function saveSettings() {
  const state = await window.electronAPI.updateSettings(getSettingsPayload());
  settingsOpen = false;
  renderState(state);
  closeSettings();
}

async function initialize() {
  document.getElementById('btn-new-round').addEventListener('click', async () => {
    const state = await window.electronAPI.newRound();
    renderState(state);
  });

  document.getElementById('btn-editor').addEventListener('click', async () => {
    await window.electronAPI.openEditor();
  });

  document.getElementById('btn-settings').addEventListener('click', () => openSettings());
  document.getElementById('btn-close-settings').addEventListener('click', () => closeSettings());
  document.getElementById('btn-save-settings').addEventListener('click', async () => { await saveSettings(); });

  // Слайдер прозрачности — live preview label
  if (settingsInputs.overlayBgOpacity) {
    settingsInputs.overlayBgOpacity.addEventListener('input', () => {
      if (opacityVal) opacityVal.textContent = settingsInputs.overlayBgOpacity.value;
    });
  }

  // Кнопка drag-resize
  const btnDrag = document.getElementById('btn-drag-overlay');
  if (btnDrag) {
    btnDrag.addEventListener('click', async () => {
      if (!dragModeActive) {
        dragModeActive = true;
        btnDrag.textContent = '✅ Готово (зафиксировать)';
        btnDrag.classList.remove('secondary');
        btnDrag.classList.add('primary');
        modal.classList.remove('open');
        settingsOpen = false;
        await window.electronAPI.startDragResize();
      } else {
        dragModeActive = false;
        btnDrag.textContent = '🖱 Переместить/изменить размер оверлея';
        btnDrag.classList.remove('primary');
        btnDrag.classList.add('secondary');
        const result = await window.electronAPI.stopDragResize();
        if (result && result.state) renderState(result.state);
        openSettings();
      }
    });
  }
  document.getElementById('btn-reset-progress').addEventListener('click', async () => {
    const result = await window.electronAPI.resetProgress();
    if (result && result.state) renderState(result.state);
  });

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
