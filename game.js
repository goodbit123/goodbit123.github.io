// game.js
// Squid Dash — prototype implementation
// Placeholders & asset config (swap these at top for easy replacement)
const ASSETS = {
  sprite: {
    squid_base: null // placeholder image path or null for colored rect
  },
  audio: {
    // placeholders; implement audio loading later
    click: null,
    dash: null,
    collect: null,
    bg: null
  }
};

// ---------- Config ----------
const CONFIG = {
  canvasWidth: 960,
  canvasHeight: 540,
  blockSize: 48, // base block size
  gravity: 1400, // px per second^2
  jumpImpulse: -650, // px per second
  moveSpeed: 240, // horizontal speed (player-controlled)
  dashDistance: 240, // px instantaneous-ish (we interpolate)
  dashDuration: 0.12, // seconds of dash motion
  dashCooldown: 3.0, // seconds
  physicsFPS: 24, // fixed timestep
  platformGapMin: 1.0, // blocks
  platformGapMax: 3.5, // blocks
  initialPlatformBlocks: 6, // first platform width
  subsequentPlatformMin: 2,
  subsequentPlatformMax: 5,
  maxPlatformsAhead: 8
};

// ---------- State ----------
let canvas, ctx;
let device = null; // 'PC' or 'Mobile'
let ui = {};
let lastTime = 0;
let accumulator = 0;
const dt = 1 / CONFIG.physicsFPS;

let gameState = {
  running: false,
  firstRunCompleted: false,
  diedOnce: false,
  score: 0,
  blocksPassed: 0
};

// Player
const player = {
  x: 120,
  y: 0,
  vx: 0,
  vy: 0,
  width: CONFIG.blockSize * 0.9,
  height: CONFIG.blockSize * 0.9,
  onGround: false,
  canDash: true,
  dashTimer: 0,
  dashCooldownTimer: 0,
  facing: 1,
  skin: 'pink' // skin id (placeholder)
};

// Level / platforms
let platforms = []; // {x, y, wBlocks, h}
let worldOffset = 0; // camera offset in x
let totalTravelled = 0; // px travelled to the right

// Input
const input = {
  left: false,
  right: false,
  jump: false,
  dash: false
};

// Leaderboard keys
const COOKIE_NAME = 'squiddash_lb';
const COOKIE_SECRET = 'local_install_secret_v1'; // local secret per-install (not secure server-side)

// -------------------- Helpers --------------------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function nowMs() { return performance.now(); }
function pxToBlocks(px) { return px / CONFIG.blockSize; }

// Async SHA-256 -> hex
async function sha256hex(message) {
  const enc = new TextEncoder();
  const data = enc.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Cookie helpers (simple)
function setCookie(name, value, days=365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}
function getCookie(name) {
  const matches = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[]\\\/+^])/g, '\\$1') + '=([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}

// Leaderboard: local cookie with SHA-256 signature
async function loadLeaderboard() {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw);
    const signature = obj.sig;
    const payload = JSON.stringify(obj.payload);
    const check = await sha256hex(payload + COOKIE_SECRET);
    if (check !== signature) {
      console.warn('Leaderboard signature mismatch — data ignored');
      return [];
    }
    return obj.payload; // array
  } catch (e) {
    console.warn('Failed to parse leaderboard cookie', e);
    return [];
  }
}
async function saveLeaderboard(entries) {
  const payload = entries;
  const payloadStr = JSON.stringify(payload);
  const sig = await sha256hex(payloadStr + COOKIE_SECRET);
  const obj = { sig, payload };
  setCookie(COOKIE_NAME, JSON.stringify(obj));
}

// Validate username
function validUsername(name) {
  return /^[a-zA-Z0-9_-]{1,20}$/.test(name);
}

// Smooth score tween
let displayedScore = 0;
function tweenScoreTo(target) {
  // simple linear interpolation each frame — updated in render
  displayedScore = displayedScore; // kept for render loop
}

// -------------------- UI wiring --------------------
function $(id) { return document.getElementById(id); }

function createMobileUI() {
  // Create simple on-screen buttons for mobile
  const container = document.createElement('div');
  container.id = 'mobileControls';
  container.style.position = 'absolute';
  container.style.left = '0';
  container.style.right = '0';
  container.style.bottom = '10px';
  container.style.pointerEvents = 'none';
  container.style.display = 'flex';
  container.style.justifyContent = 'space-between';
  container.style.padding = '0 20px';
  container.style.zIndex = 20;

  const leftGroup = document.createElement('div');
  leftGroup.style.pointerEvents = 'auto';

  ['leftBtn', 'rightBtn'].forEach(k => {
    const b = document.createElement('button');
    b.className = 'mobileBtn';
    if (k === 'leftBtn') b.textContent = '◀';
    else b.textContent = '▶';
    b.style.width = '64px';
    b.style.height = '64px';
    b.style.margin = '6px';
    b.style.opacity = 0.85;
    b.onpointerdown = () => { if (k === 'leftBtn') input.left = true; else input.right = true; };
    b.onpointerup = () => { if (k === 'leftBtn') input.left = false; else input.right = false; };
    b.onpointercancel = b.onpointerup;
    leftGroup.appendChild(b);
  });

  const rightGroup = document.createElement('div');
  rightGroup.style.pointerEvents = 'auto';

  const jumpBtn = document.createElement('button');
  jumpBtn.textContent = 'Jump';
  jumpBtn.style.width = '80px';
  jumpBtn.style.height = '64px';
  jumpBtn.style.margin = '6px';
  jumpBtn.onpointerdown = () => { input.jump = true; };
  jumpBtn.onpointerup = () => { input.jump = false; };
  jumpBtn.onpointercancel = jumpBtn.onpointerup;

  const dashBtn = document.createElement('button');
  dashBtn.textContent = 'Dash';
  dashBtn.style.width = '80px';
  dashBtn.style.height = '64px';
  dashBtn.style.margin = '6px';
  dashBtn.onpointerdown = () => { input.dash = true; };
  dashBtn.onpointerup = () => { input.dash = false; };
  dashBtn.onpointercancel = dashBtn.onpointerup;

  rightGroup.appendChild(jumpBtn);
  rightGroup.appendChild(dashBtn);

  container.appendChild(leftGroup);
  container.appendChild(rightGroup);
  document.body.appendChild(container);
}

// UI state toggles
function showDeviceSelect() {
  $('deviceSelect').classList.remove('hidden');
  $('mainMenu').classList.add('hidden');
  $('gameContainer').classList.add('hidden');
  $('gameOver').classList.add('hidden');
}
function showMainMenu() {
  $('deviceSelect').classList.add('hidden');
  $('mainMenu').classList.remove('hidden');
  $('gameContainer').classList.add('hidden');
  $('gameOver').classList.add('hidden');
}
function showGame() {
  $('deviceSelect').classList.add('hidden');
  $('mainMenu').classList.add('hidden');
  $('gameContainer').classList.remove('hidden');
  $('gameOver').classList.add('hidden');
}
function showGameOver() {
  $('deviceSelect').classList.add('hidden');
  $('mainMenu').classList.add('hidden');
  $('gameContainer').classList.add('hidden');
  $('gameOver').classList.remove('hidden');
}

// -------------------- Level generation --------------------
function resetLevel() {
  platforms = [];
  worldOffset = 0;
  totalTravelled = 0;
  gameState.score = 0;
  gameState.blocksPassed = 0;
  displayedScore = 0;
  // Create initial platform (first platform always 6 blocks wide)
  const firstW = CONFIG.initialPlatformBlocks * CONFIG.blockSize;
  const x0 = 48;
  const y0 = canvas.height / 1.8;
  platforms.push({ x: x0, y: y0, w: firstW, h: CONFIG.blockSize });
  // Generate a few platforms ahead
  let cursor = x0 + firstW + 120;
  for (let i = 0; i < 8; i++) {
    const wBlocks = randInt(CONFIG.subsequentPlatformMin, CONFIG.subsequentPlatformMax);
    const w = wBlocks * CONFIG.blockSize;
    const gap = (rand(CONFIG.platformGapMin, CONFIG.platformGapMax) * CONFIG.blockSize);
    const y = clamp(y0 + randInt(-2, 4) * (CONFIG.blockSize / 2), canvas.height * 0.25, canvas.height * 0.9);
    platforms.push({ x: cursor, y, w, h: CONFIG.blockSize });
    cursor += w + gap;
  }
}
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function ensurePlatforms() {
  const rightmost = platforms.reduce((m, p) => Math.max(m, p.x + p.w), -Infinity);
  while (rightmost - worldOffset < canvas.width + 400) {
    const last = platforms[platforms.length - 1];
    const wBlocks = randInt(CONFIG.subsequentPlatformMin, CONFIG.subsequentPlatformMax);
    const w = wBlocks * CONFIG.blockSize;
    const gap = (rand(CONFIG.platformGapMin, CONFIG.platformGapMax) * CONFIG.blockSize);
    const y = clamp(last.y + randInt(-2, 2) * (CONFIG.blockSize / 2), canvas.height * 0.15, canvas.height * 0.95);
    const x = last.x + last.w + gap;
    platforms.push({ x, y, w, h: CONFIG.blockSize });
  }
}

// -------------------- Physics & collision --------------------
function resolveCollisions() {
  player.onGround = false;
  // simple AABB collision with platforms
  for (const p of platforms) {
    const px = p.x - worldOffset;
    const py = p.y;
    if (player.x + player.width > px && player.x < px + p.w) {
      // vertical collision check
      const playerBottom = player.y + player.height;
      const platTop = py;
      const overlapY = playerBottom - platTop;
      if (overlapY > 0 && player.vy >= 0 && playerBottom - player.vy * dt <= platTop + 10) {
        // landed
        player.y = platTop - player.height;
        player.vy = 0;
        player.onGround = true;
        player.canDash = true; // allow dash reset on landing
      }
    }
  }
  // floor death: touching bottom of canvas = instant death
  if (player.y + player.height >= canvas.height) {
    // death
    handleDeath();
  }
}

// -------------------- Game events --------------------
function handleDeath() {
  if (!gameState.running) return;
  gameState.running = false;
  gameState.diedOnce = true;
  gameState.firstRunCompleted = true;
  $('finalScore').textContent = `Score: ${Math.floor(gameState.score)}`;
  // show post-game buttons (Play Again & Main Menu)
  $('playAgainBtn').classList.remove('hidden');
  $('returnMenuBtn').classList.remove('hidden');
  // Put UI into game over
  showGameOver();
  // Save leaderboard prompt flow
  if (!getCookie('squiddash_user')) {
    promptForUsernameAndSave();
  } else {
    // already have username; auto-save score
    saveScoreForUser(getCookie('squiddash_user'), Math.floor(gameState.score));
  }
}

async function promptForUsernameAndSave() {
  // prompt simple browser prompt for demo (replace with nice UI later)
  let name = prompt('Enter a username (letters, numbers, _ and - only):');
  if (!name) return;
  if (!validUsername(name)) {
    alert('Invalid username. Use only letters, numbers, _ and - (1-20 chars).');
    return;
  }
  setCookie('squiddash_user', name);
  await saveScoreForUser(name, Math.floor(gameState.score));
}

async function saveScoreForUser(username, score) {
  const entries = await loadLeaderboard();
  entries.push({ username, score, date: (new Date()).toISOString() });
  // sort desc
  entries.sort((a,b) => b.score - a.score);
  entries.splice(10); // keep top 10
  await saveLeaderboard(entries);
}

// -------------------- Input handlers --------------------
function setupInput() {
  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (device !== 'PC') return;
    if (e.code === 'KeyA') input.left = true;
    if (e.code === 'KeyD') input.right = true;
    if (e.code === 'KeyW' || e.code === 'Space') input.jump = true;
    if (e.code === 'ShiftLeft' || e.code === 'KeyJ') input.dash = true;
  });
  window.addEventListener('keyup', (e) => {
    if (device !== 'PC') return;
    if (e.code === 'KeyA') input.left = false;
    if (e.code === 'KeyD') input.right = false;
    if (e.code === 'KeyW' || e.code === 'Space') input.jump = false;
    if (e.code === 'ShiftLeft' || e.code === 'KeyJ') input.dash = false;
  });
}

// -------------------- Game loop --------------------
function startGameLoop() {
  lastTime = performance.now();
  accumulator = 0;
  requestAnimationFrame(loop);
}

function loop(timestamp) {
  const frameTime = Math.min(0.1, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  accumulator += frameTime;
  // fixed-step physics
  while (accumulator >= dt) {
    step(dt);
    accumulator -= dt;
  }
  render();
  if (gameState.running) requestAnimationFrame(loop);
}

function step(dt) {
  // horizontal movement controlled directly (no auto-scroll)
  let moveDir = 0;
  if (input.left) moveDir -= 1;
  if (input.right) moveDir += 1;
  player.vx = moveDir * CONFIG.moveSpeed;

  // apply horizontal movement
  player.x += player.vx * dt;
  // allow movement in world coordinates; update totalTravelled when moving right
  if (player.vx > 0) {
    totalTravelled += player.vx * dt;
  }

  // Jump
  if (input.jump) {
    if (player.onGround) {
      player.vy = CONFIG.jumpImpulse;
      player.onGround = false;
    }
  }

  // Gravity
  player.vy += CONFIG.gravity * dt;
  player.y += player.vy * dt;

  // Dash logic: dash triggers mid-air or on ground, but limited with cooldown
  if (input.dash && player.canDash && player.dashCooldownTimer <= 0) {
    triggerDash();
  }

  // Update dash timers (smoothly move during dash)
  if (player.dashTimer > 0) {
    // dash in facing direction or direction of input
    const dir = (input.right ? 1 : input.left ? -1 : player.facing);
    const dashProgress = (CONFIG.dashDuration - player.dashTimer) / CONFIG.dashDuration;
    // simple velocity boost during dash (overrides vy slightly to reduce fall)
    const dashSpeed = (CONFIG.dashDistance / CONFIG.dashDuration);
    player.x += dir * dashSpeed * dt;
    player.dashTimer -= dt;
    if (player.dashTimer <= 0) {
      player.dashCooldownTimer = CONFIG.dashCooldown;
      player.canDash = false;
    }
  } else {
    // reduce cooldown
    if (player.dashCooldownTimer > 0) player.dashCooldownTimer -= dt;
  }

  // Camera: slight follow when player nears the right of the viewport
  const camLead = canvas.width * 0.35;
  const playerScreenX = player.x - worldOffset;
  if (playerScreenX > camLead) {
    // move camera so player is slightly to the left of camLead (smooth)
    worldOffset += (playerScreenX - camLead) * 0.12;
  }
  if (playerScreenX < canvas.width * 0.15) {
    // if player goes left far, move camera left gently
    worldOffset -= (canvas.width * 0.15 - playerScreenX) * 0.08;
    worldOffset = Math.max(0, worldOffset);
  }

  // remove platforms behind and ensure ahead
  platforms = platforms.filter(p => (p.x + p.w) > worldOffset - 100);
  ensurePlatforms();

  // collision
  resolveCollisions();

  // update score (2 pts per block passed)
  const blocks = Math.floor(pxToBlocks(totalTravelled));
  gameState.blocksPassed = blocks;
  gameState.score = blocks * 2;

  // update dash cooldown display variable
  player.dashCooldownTimer = Math.max(0, player.dashCooldownTimer);

  // update skin facing
  if (moveDir !== 0) player.facing = moveDir;
}

// Trigger dash (init)
function triggerDash() {
  player.dashTimer = CONFIG.dashDuration;
  // allow immediate use effect
  // small upward correction so dash is a mid-air move (optional)
  player.vy *= 0.6;
}

// -------------------- Rendering --------------------
function render() {
  // clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // background (simple gradient + light ray)
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#00364d');
  g.addColorStop(1, '#006b85');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // subtle light rays (simple)
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(i * 150 - (worldOffset % 150), 0, 40, canvas.height);
  }
  ctx.globalAlpha = 1;

  // render platforms
  ctx.fillStyle = '#705050';
  for (const p of platforms) {
    const sx = Math.round(p.x - worldOffset);
    const sy = Math.round(p.y);
    ctx.fillRect(sx, sy, p.w, p.h);
    // platform top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(sx, sy - 6, p.w, 6);
    ctx.fillStyle = '#705050';
  }

  // render player (colored rounded rect as placeholder for skin)
  const px = Math.round(player.x - worldOffset);
  const py = Math.round(player.y);
  // skin color mapping (placeholder)
  const skinColors = {
    pink: '#ff7fbf',
    ninja: '#222222',
    astronaut: '#bfe6ff'
  };
  ctx.fillStyle = skinColors[player.skin] || '#ff7fbf';
  roundRect(ctx, px, py, player.width, player.height, 10, true, false);
  // eye dot
  ctx.fillStyle = '#000';
  ctx.fillRect(px + player.width * 0.55, py + player.height * 0.35, 4, 6);

  // HUD
  // Score (smooth interpolation)
  displayedScore += (gameState.score - displayedScore) * 0.18;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '20px Arial';
  ctx.fillText(`Blocks: ${gameState.blocksPassed}`, 18, 32);
  ctx.fillText(`Score: ${Math.floor(displayedScore)}`, 18, 60);

  // Dash cooldown UI (ring-like)
  const cdX = canvas.width - 80;
  const cdY = 40;
  const radius = 24;
  ctx.beginPath();
  ctx.strokeStyle = '#ffffff22';
  ctx.lineWidth = 6;
  ctx.arc(cdX, cdY, radius, 0, Math.PI * 2);
  ctx.stroke();
  // filled arc showing cooldown
  const pct = player.dashCooldownTimer / CONFIG.dashCooldown;
  ctx.beginPath();
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 6;
  ctx.arc(cdX, cdY, radius, -Math.PI/2, -Math.PI/2 + (1 - pct) * Math.PI * 2);
  ctx.stroke();

  // First-run dimmed UI: if not firstRunCompleted, grey out leaderboards & gameover area (we only emulate by text)
  if (!gameState.firstRunCompleted) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px Arial';
    ctx.fillText('Leaderboard (locked until first run)', canvas.width - 360, 32);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = '#fff';
    ctx.fillText('Leaderboard (available)', canvas.width - 320, 32);
  }
}

// Rounded rect helper
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// -------------------- Start / UI bindings --------------------
function prepareUI() {
  // device selection
  $('selectPC').addEventListener('click', () => {
    device = 'PC';
    onDeviceChosen();
  });
  $('selectMobile').addEventListener('click', () => {
    device = 'Mobile';
    onDeviceChosen();
  });

  $('playBtn').addEventListener('click', () => {
    startRun();
  });
  $('playAgainBtn').addEventListener('click', () => {
    // reset and start
    startRun();
  });
  $('returnMenuBtn').addEventListener('click', () => {
    showMainMenu();
  });

  // hide Play Again & Main Menu until after first death
  $('playAgainBtn').classList.add('hidden');
  $('returnMenuBtn').classList.add('hidden');
}

function onDeviceChosen() {
  // show friendly face (simple console log here)
  console.log('Device chosen:', device);
  if (device === 'Mobile') {
    createMobileUI();
  }
  showMainMenu();
}

function initCanvas() {
  canvas = $('gameCanvas');
  canvas.width = CONFIG.canvasWidth;
  canvas.height = CONFIG.canvasHeight;
  // scale for high-dpi devices
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(CONFIG.canvasWidth * ratio);
  canvas.height = Math.floor(CONFIG.canvasHeight * ratio);
  canvas.style.width = CONFIG.canvasWidth + 'px';
  canvas.style.height = CONFIG.canvasHeight + 'px';
  ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
}

// Start a run
function startRun() {
  // reset player & level
  player.x = 120;
  player.width = CONFIG.blockSize * 0.9;
  player.height = CONFIG.blockSize * 0.9;
  player.y = 0;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.canDash = true;
  player.dashTimer = 0;
  player.dashCooldownTimer = 0;
  player.skin = 'pink';

  resetLevel();
  // position player above first platform
  const p0 = platforms[0];
  player.x = p0.x + 40;
  player.y = p0.y - player.height - 2;

  gameState.running = true;
  gameState.firstRunCompleted = gameState.firstRunCompleted || false;
  gameState.diedOnce = gameState.diedOnce || false;
  displayedScore = 0;

  showGame();
  startGameLoop();
}

// initial boot
function boot() {
  prepareUI();
  initCanvas();
  setupInput();
  showDeviceSelect();

  // keyboard hints on PC (show in console for this prototype)
  console.log('Controls: A/D move, W or Space jump, Shift or J dash. Mobile: use on-screen buttons.');

  // wire up device select buttons exist check
  // attach click listeners (they already exist in prepareUI)
}
boot();

// Expose some helpers for debugging in console
window.SquidDash = {
  startRun,
  resetLevel,
  loadLeaderboard,
  saveLeaderboard
};

