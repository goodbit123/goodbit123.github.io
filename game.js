let gameState = "chooseDevice"; // other states: "menu", "playing", "gameOver"
let chosenDevice = null;

// -------------------- Assets (placeholders up top) --------------------
const ASSETS = {
  sprite: {
    squid_base: null // placeholder image path or null for colored rect
  },
  audio: {
    click: null,
    dash: null,
    collect: null,
    bg: null
  }
};

// -------------------- Config --------------------
const CONFIG = {
  canvasWidth: 960,
  canvasHeight: 540,
  blockSize: 48,
  gravity: 1400,          // px / s^2
  jumpImpulse: -650,      // px / s
  moveSpeed: 260,         // slight boost for snappier feel at 60 fps
  dashDistance: 260,      // px
  dashDuration: 0.12,     // s
  dashCooldown: 3.0,      // s
  physicsFPS: 60,         // <<< upgraded to 60
  platformGapMin: 1.0,    // blocks
  platformGapMax: 3.5,    // blocks
  initialPlatformBlocks: 6,
  subsequentPlatformMin: 2,
  subsequentPlatformMax: 5,
  maxPlatformsAhead: 8
};

// -------------------- State --------------------
let canvas, ctx;
let device = null; // 'PC' or 'Mobile'
let lastTime = 0;
let accumulator = 0;
const FIXED_DT = 1 / CONFIG.physicsFPS;

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
  skin: 'pink'
};

// Level / platforms
let platforms = []; // {x, y, w, h}
let worldOffset = 0; // camera x
let totalTravelled = 0; // px

// FX
const bubbles = []; // parallax ambient bubbles
const dashTrail = []; // tiny squares emitted while dashing

// Input
const input = {
  left: false,
  right: false,
  jump: false,
  dash: false
};

// Leaderboard keys (local, signed cookie)
const COOKIE_NAME = 'squiddash_lb';
const COOKIE_SECRET = 'local_install_secret_v1';

// -------------------- Helpers --------------------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function pxToBlocks(px) { return px / CONFIG.blockSize; }

async function sha256hex(message) {
  const enc = new TextEncoder();
  const data = enc.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Cookie helpers
function setCookie(name, value, days=365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}
function getCookie(name) {
  const matches = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\\[\\]\\\\\\/+^])/g, '\\$1') + '=([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}

// Leaderboard (signed)
async function loadLeaderboard() {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw);
    const signature = obj.sig;
    const payload = JSON.stringify(obj.payload);
    const check = await sha256hex(payload + COOKIE_SECRET);
    if (check !== signature) return [];
    return obj.payload;
  } catch {
    return [];
  }
}
async function saveLeaderboard(entries) {
  const payloadStr = JSON.stringify(entries);
  const sig = await sha256hex(payloadStr + COOKIE_SECRET);
  const obj = { sig, payload: entries };
  setCookie(COOKIE_NAME, JSON.stringify(obj));
}
function validUsername(name) { return /^[a-zA-Z0-9_-]{1,20}$/.test(name); }

// Smooth score tween (canvas HUD)
let displayedScore = 0;

// -------------------- DOM helpers --------------------
function $(id) { return document.getElementById(id); }

// -------------------- Mobile UI --------------------
function createMobileUI() {
  if ($('mobileControls')) return; // avoid duplicates

  const container = document.createElement('div');
  container.id = 'mobileControls';
  container.className = 'mobile-controls';

  const leftGroup = document.createElement('div');
  leftGroup.className = 'mobile-left';

  const btnL = document.createElement('button');
  btnL.className = 'mobileBtn round';
  btnL.textContent = '◀';
  btnL.onpointerdown = () => input.left = true;
  btnL.onpointerup = btnL.onpointercancel = () => input.left = false;

  const btnR = document.createElement('button');
  btnR.className = 'mobileBtn round';
  btnR.textContent = '▶';
  btnR.onpointerdown = () => input.right = true;
  btnR.onpointerup = btnR.onpointercancel = () => input.right = false;

  leftGroup.appendChild(btnL);
  leftGroup.appendChild(btnR);

  const rightGroup = document.createElement('div');
  rightGroup.className = 'mobile-right';

  const jumpBtn = document.createElement('button');
  jumpBtn.className = 'mobileBtn pill';
  jumpBtn.textContent = 'Jump';
  jumpBtn.onpointerdown = () => input.jump = true;
  jumpBtn.onpointerup = jumpBtn.onpointercancel = () => input.jump = false;

  const dashBtn = document.createElement('button');
  dashBtn.className = 'mobileBtn pill primary';
  dashBtn.textContent = 'Dash';
  dashBtn.onpointerdown = () => input.dash = true;
  dashBtn.onpointerup = dashBtn.onpointercancel = () => input.dash = false;

  rightGroup.appendChild(jumpBtn);
  rightGroup.appendChild(dashBtn);

  container.appendChild(leftGroup);
  container.appendChild(rightGroup);
  document.body.appendChild(container);
}

// -------------------- UI state toggles --------------------
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
  // reveal post-death buttons
  $('playAgainBtn')?.classList.remove('hidden');
  $('returnMenuBtn')?.classList.remove('hidden');
}

// -------------------- Level generation --------------------
function resetLevel() {
  platforms = [];
  worldOffset = 0;
  totalTravelled = 0;
  gameState.score = 0;
  gameState.blocksPassed = 0;
  displayedScore = 0;

  const firstW = CONFIG.initialPlatformBlocks * CONFIG.blockSize;
  const x0 = 48;
  const y0 = canvas.height / 1.8;
  platforms.push({ x: x0, y: y0, w: firstW, h: CONFIG.blockSize });

  let cursor = x0 + firstW + 120;
  for (let i = 0; i < 8; i++) {
    const wBlocks = randInt(CONFIG.subsequentPlatformMin, CONFIG.subsequentPlatformMax);
    const w = wBlocks * CONFIG.blockSize;
    const gap = rand(CONFIG.platformGapMin, CONFIG.platformGapMax) * CONFIG.blockSize;
    const y = clamp(y0 + randInt(-2, 4) * (CONFIG.blockSize / 2), canvas.height * 0.25, canvas.height * 0.9);
    platforms.push({ x: cursor, y, w, h: CONFIG.blockSize });
    cursor += w + gap;
  }

  // seed ambient bubbles
  bubbles.length = 0;
  for (let i = 0; i < 60; i++) {
    bubbles.push({
      x: Math.random() * CONFIG.canvasWidth,
      y: Math.random() * CONFIG.canvasHeight,
      r: 1 + Math.random() * 3,
      s: 12 + Math.random() * 28,   // speed
      parallax: 0.3 + Math.random() * 0.7
    });
  }
}
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function ensurePlatforms() {
  let rightmost = platforms.reduce((m, p) => Math.max(m, p.x + p.w), -Infinity);
  while (rightmost - worldOffset < canvas.width + 400) {
    const last = platforms[platforms.length - 1];
    const wBlocks = randInt(CONFIG.subsequentPlatformMin, CONFIG.subsequentPlatformMax);
    const w = wBlocks * CONFIG.blockSize;
    const gap = rand(CONFIG.platformGapMin, CONFIG.platformGapMax) * CONFIG.blockSize;
    const y = clamp(last.y + randInt(-2, 2) * (CONFIG.blockSize / 2), canvas.height * 0.15, canvas.height * 0.95);
    const x = last.x + last.w + gap;
    platforms.push({ x, y, w, h: CONFIG.blockSize });
    rightmost = x + w;
  }
}

// -------------------- Physics & collision --------------------
function resolveCollisions(dt) {
  player.onGround = false;

  for (const p of platforms) {
    const px = p.x - worldOffset;
    const py = p.y;
    if (player.x + player.width > px && player.x < px + p.w) {
      const playerBottom = player.y + player.height;
      const platTop = py;
      const overlapY = playerBottom - platTop;
      // simple top landing
      if (overlapY > 0 && player.vy >= 0 && playerBottom - player.vy * dt <= platTop + 10) {
        player.y = platTop - player.height;
        player.vy = 0;
        player.onGround = true;
        player.canDash = true;
      }
    }
  }

  // death if touching bottom of canvas
  if (player.y + player.height >= canvas.height) {
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
  showGameOver();

  if (!getCookie('squiddash_user')) {
    promptForUsernameAndSave();
  } else {
    saveScoreForUser(getCookie('squiddash_user'), Math.floor(gameState.score));
  }
}

async function promptForUsernameAndSave() {
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
  entries.sort((a,b) => b.score - a.score);
  entries.splice(10);
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

// -------------------- Game loop (60 FPS fixed physics) --------------------
function startGameLoop() {
  lastTime = performance.now();
  accumulator = 0;
  requestAnimationFrame(loop);
}

function loop(timestamp) {
  const frameTime = Math.min(0.06, (timestamp - lastTime) / 1000); // clamp 60ms
  lastTime = timestamp;
  accumulator += frameTime;

  // fixed-step physics at 60 fps
  let safety = 0;
  while (accumulator >= FIXED_DT && safety++ < 5) { // small cap to avoid spiral
    step(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  render();
  if (gameState.running) requestAnimationFrame(loop);
}

function step(dt) {
  // movement
  let moveDir = 0;
  if (input.left) moveDir -= 1;
  if (input.right) moveDir += 1;
  player.vx = moveDir * CONFIG.moveSpeed;

  // horizontal integration
  player.x += player.vx * dt;
  if (player.vx > 0) totalTravelled += player.vx * dt;

  // jump
  if (input.jump && player.onGround) {
    player.vy = CONFIG.jumpImpulse;
    player.onGround = false;
  }

  // gravity
  player.vy += CONFIG.gravity * dt;
  player.y += player.vy * dt;

  // dash
  if (input.dash && player.canDash && player.dashCooldownTimer <= 0) triggerDash();

  if (player.dashTimer > 0) {
    const dir = (input.right ? 1 : input.left ? -1 : player.facing);
    const dashSpeed = (CONFIG.dashDistance / CONFIG.dashDuration);
    player.x += dir * dashSpeed * dt;
    player.dashTimer -= dt;

    // emit tiny trail
    dashTrail.push({
      x: player.x - worldOffset + player.width * (dir > 0 ? 0.8 : 0.2),
      y: player.y + player.height * 0.5,
      life: 0.18
    });

    if (player.dashTimer <= 0) {
      player.dashCooldownTimer = CONFIG.dashCooldown;
      player.canDash = false;
    }
  } else {
    if (player.dashCooldownTimer > 0) player.dashCooldownTimer -= dt;
  }

  // camera easing
  const camLead = canvas.width * 0.35;
  const playerScreenX = player.x - worldOffset;
  if (playerScreenX > camLead) {
    worldOffset += (playerScreenX - camLead) * 0.16;
  }
  if (playerScreenX < canvas.width * 0.15) {
    worldOffset -= (canvas.width * 0.15 - playerScreenX) * 0.1;
    worldOffset = Math.max(0, worldOffset);
  }

  // platforms lifecycle
  platforms = platforms.filter(p => (p.x + p.w) > worldOffset - 120);
  ensurePlatforms();

  // collisions
  resolveCollisions(dt);

  // score
  const blocks = Math.floor(pxToBlocks(totalTravelled));
  gameState.blocksPassed = blocks;
  gameState.score = blocks * 2;

  // face direction
  if (moveDir !== 0) player.facing = moveDir;

  // fx updates
  updateFX(dt);
}

function triggerDash() {
  player.dashTimer = CONFIG.dashDuration;
  player.vy *= 0.6; // minor vertical damp for mid-air feel
}

// -------------------- FX --------------------
function updateFX(dt) {
  // Ambient bubbles
  for (const b of bubbles) {
    b.y -= (b.s * dt);
    b.x -= worldOffset * 0.000001; // tiny parallax stabilization
    if (b.y < -8) {
      b.y = CONFIG.canvasHeight + 8;
      b.x = (worldOffset % CONFIG.canvasWidth) + Math.random() * CONFIG.canvasWidth;
    }
  }

  // Dash trail
  for (let i = dashTrail.length - 1; i >= 0; i--) {
    dashTrail[i].life -= dt;
    if (dashTrail[i].life <= 0) dashTrail.splice(i, 1);
  }
}

// -------------------- Rendering --------------------
function render() {
  // clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // animated background gradient (subtle)
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#072d40');
  g.addColorStop(1, '#0a6e8a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // light shafts
  ctx.save();
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 6; i++) {
    const w = 60 + (i % 2) * 20;
    const x = i * 160 - (worldOffset % 160);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w, 0);
    ctx.lineTo(x + w - 40, canvas.height);
    ctx.lineTo(x - 40, canvas.height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // ambient bubbles
  ctx.save();
  for (const b of bubbles) {
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc((b.x - (worldOffset * (1 - b.parallax))) % canvas.width, b.y, b.r, 0, Math.PI*2);
    ctx.fillStyle = '#bff7ff';
    ctx.fill();
  }
  ctx.restore();

  // platforms
  ctx.fillStyle = '#4b3f40';
  for (const p of platforms) {
    const sx = Math.round(p.x - worldOffset);
    const sy = Math.round(p.y);
    ctx.fillRect(sx, sy, p.w, p.h);

    // bevels
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(sx, sy - 6, p.w, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(sx, sy + p.h - 6, p.w, 6);
    ctx.fillStyle = '#4b3f40';
  }

  // dash trail
  ctx.save();
  for (const t of dashTrail) {
    ctx.globalAlpha = Math.max(0, t.life / 0.18) * 0.8;
    ctx.fillStyle = '#8cf3ff';
    ctx.fillRect(t.x, t.y, 6, 3);
  }
  ctx.restore();

  // player (rounded rect placeholder)
  const px = Math.round(player.x - worldOffset);
  const py = Math.round(player.y);
  const skinColors = { pink: '#ff7fbf', ninja: '#222', astronaut: '#bfe6ff' };
  ctx.fillStyle = skinColors[player.skin] || '#ff7fbf';
  roundRect(ctx, px, py, player.width, player.height, 12, true, false);

  // simple face
  ctx.fillStyle = '#000';
  const eyeX = px + (player.facing > 0 ? player.width * 0.62 : player.width * 0.28);
  ctx.fillRect(eyeX, py + player.height * 0.34, 5, 7);

  // HUD (neon glass look)
  displayedScore += (gameState.score - displayedScore) * 0.18;

  // shadow panel
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#0e1a2b80';
  roundRect(ctx, 14, 14, 210, 68, 10, true, false);
  ctx.restore();

  // text
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '600 18px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.fillText(`Blocks: ${gameState.blocksPassed}`, 28, 42);
  ctx.fillText(`Score: ${Math.floor(displayedScore)}`, 28, 68);

  // Dash cooldown ring (glow)
  const cdX = canvas.width - 80;
  const cdY = 54;
  const radius = 24;
  ctx.beginPath();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff18';
  ctx.arc(cdX, cdY, radius, 0, Math.PI * 2);
  ctx.stroke();

  const pct = 1 - (player.dashCooldownTimer / CONFIG.dashCooldown);
  ctx.save();
  ctx.shadowColor = '#68f6ff';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#68f6ff';
  ctx.arc(cdX, cdY, radius, -Math.PI/2, -Math.PI/2 + Math.max(0, Math.min(1, pct)) * Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // first-run UI hint
  if (!gameState.firstRunCompleted) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    ctx.font = '500 16px system-ui, Arial';
    ctx.fillText('Leaderboard locked until first run', canvas.width - 340, 24);
    ctx.globalAlpha = 1;
  }
}

// rounded rect helper
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// -------------------- Start / UI bindings --------------------
function prepareUI() {
  $('selectPC').addEventListener('click', () => {
    device = 'PC';
    onDeviceChosen();
  });
  $('selectMobile').addEventListener('click', () => {
    device = 'Mobile';
    onDeviceChosen();
  });

  $('playBtn').addEventListener('click', startRun);
  $('playAgainBtn').addEventListener('click', startRun);
  $('returnMenuBtn').addEventListener('click', showMainMenu);

  // hide Play Again & Main Menu until after first death
  $('playAgainBtn').classList.add('hidden');
  $('returnMenuBtn').classList.add('hidden');
}

function onDeviceChosen() {
  if (device === 'Mobile') createMobileUI();
  showMainMenu();
}

function initCanvas() {
  canvas = $('gameCanvas');
  ctx = canvas.getContext('2d', { alpha: false });

  // High-DPI + responsive CSS size
  handleResize();
  window.addEventListener('resize', handleResize);
}

function handleResize() {
  // keep internal rendering resolution consistent; scale via CSS
  const ratio = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(CONFIG.canvasWidth * ratio);
  canvas.height = Math.floor(CONFIG.canvasHeight * ratio);
  canvas.style.width = 'min(96vw, 960px)';
  canvas.style.height = `calc(${CONFIG.canvasHeight / CONFIG.canvasWidth} * min(96vw, 960px))`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
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
  const p0 = platforms[0];
  player.x = p0.x + 40;
  player.y = p0.y - player.height - 2;

  gameState.running = true;
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
  console.log('Controls: A/D move, W or Space jump, Shift or J dash. Mobile: on-screen buttons.');
}
boot();

// Expose helpers for console
window.SquidDash = { startRun, resetLevel, loadLeaderboard, saveLeaderboard };
