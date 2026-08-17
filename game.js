'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const GRID_COLORS = { dark: '#22222e', light: '#dcdce6' };

// Keys reserved up front so the parallel features (pause menu, high scores,
// skin selector) never collide on localStorage key names.
const STORAGE_KEYS = {
  theme: 'tetris.theme',
  records: 'tetris.records',
  skin: 'tetris.skin',
  startLevel: 'tetris.startLevel',
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    // localStorage can throw (e.g. file://); the game must stay playable without persistence
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore — persistence is best-effort
  }
}

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const playBtn = document.getElementById('play-btn');
const themeSwitch = document.getElementById('theme-switch');

const pauseMainView = document.getElementById('pause-main-view');
const pauseControlsView = document.getElementById('pause-controls-view');
const pauseMenuItems = Array.from(document.querySelectorAll('#pause-main-menu .pause-item'));
const pauseLevelValueEl = document.getElementById('pause-level-value');
const pauseResumeBtn = document.getElementById('pause-resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const pauseControlsBtn = document.getElementById('pause-controls-btn');
const pauseLevelDecBtn = document.getElementById('pause-level-dec');
const pauseLevelIncBtn = document.getElementById('pause-level-inc');
const pauseControlsBackBtn = document.getElementById('pause-controls-back-btn');

const SCREENS = {
  start: document.getElementById('screen-start'),
  pause: document.getElementById('screen-pause'),
  gameover: document.getElementById('screen-gameover'),
};

function hideScreens() {
  Object.values(SCREENS).forEach(el => el.classList.add('hidden'));
  overlay.classList.add('hidden');
}

function showScreen(name) {
  hideScreens();
  overlay.classList.remove('hidden');
  SCREENS[name].classList.remove('hidden');
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, theme;
let combo, maxCombo, inputLocked;
let startLevel = loadJSON(STORAGE_KEYS.startLevel, 1);

// Pause menu sub-state: which view is shown ('main' | 'controls') and which
// item is keyboard-highlighted within the main view's item list.
let pauseView = 'main';
let pauseMenuIndex = 0;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared > 0;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const clearedAny = clearLines();
  if (clearedAny) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLORS[theme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  showScreen('gameover');
}

function setTheme(newTheme) {
  theme = newTheme;
  document.body.classList.toggle('light-theme', theme === 'light');
  saveJSON(STORAGE_KEYS.theme, theme);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    hideScreens();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
    showScreen('pause');
  }
}

// Resets the pause menu to its main view and first item every time it opens,
// so it never reopens deep inside "Ver controles" from a previous pause.
function openPauseMenu() {
  pauseView = 'main';
  pauseMenuIndex = 0;
  renderPauseMenu();
}

function renderPauseMenu() {
  const inMain = pauseView === 'main';
  pauseMainView.classList.toggle('hidden', !inMain);
  pauseControlsView.classList.toggle('hidden', inMain);
  pauseMenuItems.forEach((el, i) => {
    el.classList.toggle('focused', inMain && i === pauseMenuIndex);
  });
  pauseLevelValueEl.textContent = startLevel;
}

function adjustStartLevel(delta) {
  startLevel = Math.min(10, Math.max(1, startLevel + delta));
  saveJSON(STORAGE_KEYS.startLevel, startLevel);
  renderPauseMenu();
}

function closePauseControls() {
  pauseView = 'main';
  renderPauseMenu();
}

function activatePauseMainItem(item) {
  switch (item) {
    case 'resume':
      togglePause();
      break;
    case 'restart':
      startGame();
      break;
    case 'controls':
      pauseView = 'controls';
      renderPauseMenu();
      break;
    // 'level' has no Enter/Space action; it is adjusted with ArrowLeft/ArrowRight.
  }
}

// Routes keydown events while the pause menu is open, instead of the normal
// in-game controls. Called from the main keydown listener when `paused` is true.
function handlePauseMenuKey(e) {
  if (pauseView === 'controls') {
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Backspace') {
      e.preventDefault();
      closePauseControls();
    }
    return;
  }
  switch (e.code) {
    case 'ArrowUp':
      e.preventDefault();
      pauseMenuIndex = (pauseMenuIndex - 1 + pauseMenuItems.length) % pauseMenuItems.length;
      renderPauseMenu();
      break;
    case 'ArrowDown':
      e.preventDefault();
      pauseMenuIndex = (pauseMenuIndex + 1) % pauseMenuItems.length;
      renderPauseMenu();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (pauseMenuItems[pauseMenuIndex].dataset.item === 'level') adjustStartLevel(-1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (pauseMenuItems[pauseMenuIndex].dataset.item === 'level') adjustStartLevel(1);
      break;
    case 'Enter':
    case 'Space':
      e.preventDefault();
      activatePauseMainItem(pauseMenuItems[pauseMenuIndex].dataset.item);
      break;
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // lockPiece() may have ended the game in this very frame: draw the final state,
  // then stop instead of re-scheduling a frame endGame() already cancelled.
  if (gameOver || paused) {
    animId = null;
    return;
  }
  animId = requestAnimationFrame(loop);
}

function startGame() {
  // kill any pending frame before rebuilding state, so a restart never leaves two loops running
  cancelAnimationFrame(animId);
  animId = null;
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  combo = 0;
  maxCombo = 0;
  inputLocked = false;
  paused = false;
  gameOver = false;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  hideScreens();
  animId = requestAnimationFrame(loop);
}

function init() {
  // no active run until the player presses JUGAR
  cancelAnimationFrame(animId);
  animId = null;
  paused = false;
  gameOver = true;
  inputLocked = false;
  combo = 0;
  maxCombo = 0;
  const savedTheme = loadJSON(STORAGE_KEYS.theme, 'dark');
  setTheme(savedTheme);
  themeSwitch.checked = savedTheme === 'light';
  showScreen('start');
}

document.addEventListener('keydown', e => {
  // P/Escape must always be able to close the pause menu, regardless of which
  // sub-view is showing — routed first so the player can never get trapped.
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (inputLocked) return;
    togglePause();
    return;
  }
  if (inputLocked) return;
  if (paused) { handlePauseMenuKey(e); return; }
  if (gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

playBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// Each button also moves the keyboard highlight to its own item first, so
// mouse and keyboard navigation stay in sync. Only one listener per click
// target (the button itself, not its ancestor .pause-item) so nothing
// double-fires on bubble.
function focusPauseItem(item) {
  const i = pauseMenuItems.findIndex(el => el.dataset.item === item);
  if (i !== -1) pauseMenuIndex = i;
}

pauseResumeBtn.addEventListener('click', () => { focusPauseItem('resume'); togglePause(); });
pauseRestartBtn.addEventListener('click', () => { focusPauseItem('restart'); startGame(); });
pauseControlsBtn.addEventListener('click', () => {
  focusPauseItem('controls');
  pauseView = 'controls';
  renderPauseMenu();
});
pauseControlsBackBtn.addEventListener('click', () => closePauseControls());
pauseLevelDecBtn.addEventListener('click', () => { focusPauseItem('level'); adjustStartLevel(-1); });
pauseLevelIncBtn.addEventListener('click', () => { focusPauseItem('level'); adjustStartLevel(1); });

themeSwitch.addEventListener('change', () => {
  setTheme(themeSwitch.checked ? 'light' : 'dark');
});

init();
