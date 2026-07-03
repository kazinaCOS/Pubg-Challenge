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

const DIFF_LABEL = { easy: 'Лёгкое', medium: 'Среднее', heavy: 'Тяжёлое', brutal: 'Потужно' };
const DIFF_CLASS = { easy: 'diff-easy', medium: 'diff-medium', heavy: 'diff-heavy', brutal: 'diff-brutal' };

function renderTasks(activeTasks, titlesOnly) {
  if (!Array.isArray(activeTasks) || !activeTasks.length) {
    elements.tasks.innerHTML = '<div class="no-task">Нет заданий</div>';
    return;
  }

  elements.tasks.innerHTML = activeTasks.map(task => {
    const title = task.title || task.text || 'Без названия';
    const desc = task.description || '';
    const diff = task.difficulty || 'easy';
    const genMark = task.generated ? ' 🎲' : '';
    const status = task.status || 'active';

    let statusMark = '';
    let rowClass = 'task-row';
    if (status === 'completed') {
      statusMark = '<span class="overlay-status overlay-status-done">✅</span>';
      rowClass += ' task-row-done';
    } else if (status === 'failed') {
      statusMark = '<span class="overlay-status overlay-status-fail">❌</span>';
      rowClass += ' task-row-fail';
    }

    return `
      <div class="${rowClass}">
        <span class="diff-pill ${DIFF_CLASS[diff]}">${DIFF_LABEL[diff] || diff}${genMark}</span>
        <div class="task-info">
          <span class="task-title">${escapeHtml(title)}${statusMark}</span>
          ${(!titlesOnly && desc) ? `<span class="task-desc">${escapeHtml(desc)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderCurses(activeCurses, titlesOnly) {
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
        ${(!titlesOnly && desc) ? `<span class="curse-pill-desc">${escapeHtml(desc)}</span>` : ''}
      </div>
    `;
  }).join('');
}

function renderState(state) {
  const titlesOnly = !!(state.settings && state.settings.overlayTitlesOnly);
  renderTasks(state.activeTasks || [], titlesOnly);
  elements.completed.textContent = String(state.completed ?? 0);
  elements.failed.textContent = String(state.failed ?? 0);
  renderCurses(state.activeCurses || [], titlesOnly);
  // Прозрачность фона
  const op = Number.isFinite(state.settings && state.settings.overlayBgOpacity)
    ? state.settings.overlayBgOpacity
    : 0.78;
  document.documentElement.style.setProperty('--overlay-bg-opacity', op);
  autoScale();
}

// Авто-масштабирование: уменьшает шрифт пока контент не влезет
function autoScale() {
  const panel = document.querySelector('.panel');
  if (!panel) return;
  const container = document.documentElement;
  const maxH = container.clientHeight;

  // Сброс
  panel.style.fontSize = '';

  let fontSize = 14; // базовый px
  panel.style.fontSize = fontSize + 'px';

  // Уменьшаем шаг за шагом до минимума 9px
  while (panel.scrollHeight > maxH && fontSize > 9) {
    fontSize -= 0.5;
    panel.style.fontSize = fontSize + 'px';
  }

  // Если всё равно не влезло — включаем скролл
  if (panel.scrollHeight > maxH) {
    panel.style.overflowY = 'auto';
  } else {
    panel.style.overflowY = 'visible';
  }
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
    failed: state.failed,
    settings: state.settings
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

// ─── Drag & Resize (вместо системного т.к. frame:false+transparent) ─────────────────────
const EDGE = 8; // ширина зоны resize по краям

function getEdge(e) {
  const W = window.innerWidth, H = window.innerHeight;
  const x = e.clientX, y = e.clientY;
  const l = x < EDGE, r = x > W - EDGE, t = y < EDGE, b = y > H - EDGE;
  if (l && t) return 'nw';
  if (r && t) return 'ne';
  if (l && b) return 'sw';
  if (r && b) return 'se';
  if (l) return 'w';
  if (r) return 'e';
  if (t) return 'n';
  if (b) return 's';
  return null;
}

const CURSORS = { n:'n-resize', s:'s-resize', e:'e-resize', w:'w-resize', ne:'ne-resize', nw:'nw-resize', se:'se-resize', sw:'sw-resize' };

function initDragResize(dragHandle, dragBorder) {
  let mode = null; // 'move' | edge string
  let startX, startY, startBounds;
  let dragActive = false;

  // Прокси для получения текущих bounds из window
  function getCurrentBounds() {
    return {
      x: window.screenX, y: window.screenY,
      width: window.outerWidth, height: window.outerHeight
    };
  }

  function updateCursor(e) {
    const edge = getEdge(e);
    document.body.style.cursor = edge ? (CURSORS[edge] || 'default') : 'default';
    if (dragHandle) dragHandle.style.cursor = 'move';
  }

  // Моусьдовн move на всём window в режиме
  document.addEventListener('mousemove', (e) => {
    if (!dragActive) return;
    if (!mode) { updateCursor(e); return; }
    const dx = e.screenX - startX;
    const dy = e.screenY - startY;
    const b = { ...startBounds };

    if (mode === 'move') {
      window.electronAPI.moveOverlay({ x: b.x + dx, y: b.y + dy });
      return;
    }

    // resize
    let { x, y, width, height } = b;
    if (mode.includes('e')) width += dx;
    if (mode.includes('s')) height += dy;
    if (mode.includes('w')) { x += dx; width -= dx; }
    if (mode.includes('n')) { y += dy; height -= dy; }
    window.electronAPI.resizeOverlay({ x, y, width, height });
  });

  document.addEventListener('mouseup', () => { mode = null; });

  // drag-handle: move
  if (dragHandle) {
    dragHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      mode = 'move';
      startX = e.screenX; startY = e.screenY;
      startBounds = getCurrentBounds();
    });
  }

  // Границы окна: resize
  document.addEventListener('mousedown', (e) => {
    if (!dragActive) return;
    if (dragHandle && dragHandle.contains(e.target)) return; // уже обработан
    const edge = getEdge(e);
    if (!edge) return;
    e.preventDefault();
    mode = edge;
    startX = e.screenX; startY = e.screenY;
    startBounds = getCurrentBounds();
  });

  return {
    setActive(val) {
      dragActive = val;
      if (!val) { mode = null; document.body.style.cursor = ''; }
    }
  };
}

window.addEventListener('DOMContentLoaded', async () => {
  await updateFromMain();
  setInterval(updateFromMain, 300);

  // Режим drag-resize
  const dragHandle = document.getElementById('drag-handle');
  const dragBorder = document.getElementById('drag-border');
  const drCtrl = initDragResize(dragHandle, dragBorder);

  if (window.electronAPI && window.electronAPI.onDragMode) {
    window.electronAPI.onDragMode((active) => {
      drCtrl.setActive(active);
      if (dragHandle) dragHandle.style.display = active ? 'flex' : 'none';
      if (dragBorder) dragBorder.style.display = active ? 'block' : 'none';
    });
  }
});

window.addEventListener('resize', autoScale);
