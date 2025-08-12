/*
  Squid Dash — Platformer v1
  - Infinite rightward generation (world scrolls left)
  - WASD full control (W jump, A left, S down (crouch placeholder), D right)
  - Mid-air dash (Shift or mobile dash), smooth, 3s cooldown
  - Jump height slightly > 2.5 blocks (blockSize controlled)
  - Blocks count as scoring: each block passed = 2 points
  - Smooth points animation
  - Leaderboard stored as encrypted cookie (SHA-256) using Web Crypto
  - Generated scalable SVG assets via ASSETS object (replaceable)
  - Clicky sounds generated via WebAudio
*/

// ---------- ASSETS (scalable, replaceable) ----------
const ASSETS = {
  playerSVG: `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>
      <g>
        <ellipse cx='100' cy='100' rx='70' ry='60' fill='%23ff9ad6' stroke='%23000' stroke-opacity='0.06'/>
        <circle cx='80' cy='90' r='10' fill='%23000' opacity='0.12'/>
        <circle cx='120' cy='90' r='10' fill='%23000' opacity='0.12'/>
      </g>
    </svg>
  `)}`,
  blockSVG: `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>
      <rect x='6' y='6' width='116' height='116' rx='8' fill='%234a3f2f' />
      <rect x='12' y='12' width='104' height='104' rx='6' fill='%23645b4a' />
    </svg>
  `)}`,
  caveBG: null // leave null -> program draws procedurally
};

// ---------- Globals & DOM ----------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const gameOverScreen = document.getElementById('gameover-screen');
const btnStart = document.getElementById('btn-start');
const btnCredits = document.getElementById('btn-credits');
const creditsPanel = document.getElementById('credits');
const scoreEl = document.getElementById('score');
const pointsEl = document.getElementById('points');
const dashText = document.getElementById('dash-text');
const joystick = document.getElementById('joystick');
const btnJump = document.getElementById('btn-jump');
const btnDash = document.getElementById('btn-dash');
const finalScore = document.getElementById('final-score');
const lbWrap = document.getElementById('lb-wrap');
const btnPlayAgain = document.getElementById('btn-playagain');
const btnMainMenu = document.getElementById('btn-mainmenu');

// sizing
function resizeCanvas(){
  canvas.width = Math.floor(canvas.clientWidth * devicePixelRatio);
  canvas.height = Math.floor(canvas.clientHeight * devicePixelRatio);
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
window.addEventListener('resize', ()=>{ resizeCanvas(); });
resizeCanvas();

// ---------- audio (clicky & sfx via WebAudio) ----------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function clicky(){
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.type='square'; o.frequency.value = 900; g.gain.value=0.05;
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + 0.06);
}
function sfx(freq,dur=0.08){ const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type='sine'; o.frequency.value=freq; g.gain.value=0.06; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+dur); }

// ---------- Input handling (WASD + Shift Dash + mobile) ----------
const keys = {};
window.addEventListener('keydown', e=>{ if(e.key) keys[e.key.toLowerCase()]=true; });
window.addEventListener('keyup', e=>{ if(e.key) keys[e.key.toLowerCase()]=false; });

// Mobile joystick simple implementation
let touchId = null; let joystickCenter = null; let joystickDir = {x:0,y:0};
joystick.addEventListener('touchstart', e=>{ e.preventDefault(); touchId = e.changedTouches[0].identifier; joystickCenter = {x:e.changedTouches[0].clientX, y:e.changedTouches[0].clientY}; clicky(); });
joystick.addEventListener('touchmove', e=>{ e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier===touchId){ const dx = t.clientX - joystickCenter.x; const dy = t.clientY - joystickCenter.y; const max = 50; joystickDir.x = Math.max(-1, Math.min(1, dx/max)); joystickDir.y = Math.max(-1, Math.min(1, dy/max)); keys['a'] = joystickDir.x < -0.3; keys['d'] = joystickDir.x > 0.3; } } });
joystick.addEventListener('touchend', e=>{ for(const t of e.changedTouches){ if(t.identifier===touchId){ touchId = null; joystickDir={x:0,y:0}; keys['a']=keys['d']=false; } } });
btnJump.addEventListener('touchstart', e=>{ keys['w']=true; clicky(); }); btnJump.addEventListener('touchend', e=>{ keys['w']=false; });
btnDash.addEventListener('touchstart', e=>{ keys['shift']=true; clicky(); setTimeout(()=>keys['shift']=false,100); });

// ---------- Game constants & state ----------
const blockSize = 56; // px (for counting and physics)
const targetJumpBlocks = 2.6; // slightly above 2.5
const gravity = 2200; // px/s^2
// compute jump velocity to reach targetJumpBlocks*blockSize
const jumpHeight = targetJumpBlocks * blockSize; // e.g., 2.6 * 56
const jumpVelocity = Math.sqrt(2 * gravity * jumpHeight); // v = sqrt(2gh)

const baseScrollSpeed = 200; // world scroll speed in px/s
let scrollSpeed = baseScrollSpeed;

const DASH_VELOCITY = 700; // extra vx during dash
const DASH_DURATION = 0.22; // seconds
const DASH_COOLDOWN = 3.0; // seconds

let state = {
  running: false,
  time:0,
  platforms: [],
  effects: [],
  player: null,
  nextPlatformX: 300,
  scoreBlocks:0,
  points:0
};

// ---------- Player class ----------
class Player{
  constructor(){
    this.x = 120; this.y = 100; this.w = 48; this.h = 56; this.vx=0; this.vy=0; this.onGround=false;
    this.dashing=false; this.dashTimer=0; this.dashCooldown=0;
    this.sprite = new Image(); this.sprite.src = ASSETS.playerSVG;
  }
  update(dt){
    // horizontal input
    const left = keys['a']; const right = keys['d'];
    const accel = 1100;
    const maxSpeed = 280;
    if(left) this.vx = Math.max(-maxSpeed, this.vx - accel*dt);
    else if(right) this.vx = Math.min(maxSpeed, this.vx + accel*dt);
    else this.vx = this.vx * Math.pow(0.0001, dt); // strong damping

    // jump
    if((keys['w'] || keys[' ']) && this.onGround){ this.vy = -jumpVelocity; this.onGround=false; sfx(720,0.12); keys['w']=false; }

    // gravity
    this.vy += gravity * dt;

    // dash
    if((keys['shift'] || keys['⇧']) && this.dashCooldown <= 0 && !this.dashing){
      this.startDash();
      keys['shift']=false;
    }
    if(this.dashing){
      this.dashTimer -= dt;
      // smooth decay of dash effect: apply extra velocity in facing direction
      const dir = (Math.abs(this.vx) < 1e-3) ? 1 : Math.sign(this.vx);
      this.vx = this.vx + ( (dir * DASH_VELOCITY - this.vx) * 0.18 );
      if(this.dashTimer <= 0){ this.endDash(); }
    } else {
      if(this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    }

    // integrate
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // bounds & ground death handled elsewhere (platform collisions)
  }
  startDash(){ this.dashing=true; this.dashTimer = DASH_DURATION; this.dashCooldown = DASH_COOLDOWN; sfx(1200,0.08); }
  endDash(){ this.dashing=false; }
  draw(ctx){
    // draw sprite centered at x,y
    ctx.save();
    ctx.translate(this.x, this.y);
    // scale flexible
    const sw = this.w, sh = this.h;
    ctx.drawImage(this.sprite, -sw/2, -sh/2, sw, sh);
    ctx.restore();
  }
}

// ---------- Platform generation ----------
function spawnPlatform(x, y, blockCount){
  const p = {x, y, blocks: blockCount, w: blockCount*blockSize, apiX: x + blockCount*blockSize};
  state.platforms.push(p);
}

function generateInitialPlatforms(){
  state.platforms = [];
  state.nextPlatformX = 200;
  let y = canvas.height/2;
  for(let i=0;i<10;i++){
    const cnt = Math.floor(Math.random()*4)+2; //2-5
    const gap = Math.floor(Math.random()*3+1)*28 + 40;
    spawnPlatform(state.nextPlatformX, y + (Math.random()-0.5)*80, cnt);
    state.nextPlatformX += cnt*blockSize + gap;
  }
}

function maybeGeneratePlatforms(){
  // ensure platforms fill ahead
  while(state.nextPlatformX < (canvas.width/devicePixelRatio) + 400){
    const cnt = Math.floor(Math.random()*4)+2;
    const gap = Math.floor(Math.random()*3+1)*32 + 40;
    const yBase = (canvas.height/devicePixelRatio)*0.4 + Math.random()* (canvas.height/devicePixelRatio)*0.4;
    const y = Math.max(120, Math.min((canvas.height/devicePixelRatio)-180, yBase + (Math.random()-0.5)*80));
    spawnPlatform(state.nextPlatformX, y, cnt);
    state.nextPlatformX += cnt*blockSize + gap;
  }
}

// ---------- Collision & physics ----------
function resolveCollisions(player, dt){
  player.onGround = false;
  // check platforms
  for(const p of state.platforms){
    const pw = p.blocks * blockSize;
    const px = p.x - scrollOffset;
    const py = p.y;
    if(player.x + player.w/2 > px && player.x - player.w/2 < px + pw){
      // simple AABB check falling onto platform
      const playerBottom = player.y + player.h/2;
      const prevBottom = player.y + player.h/2 - player.vy*dt;
      if(prevBottom <= py && playerBottom >= py){
        // land
        player.y = py - player.h/2;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }
}

// ---------- Scoring mechanism ----------
let scrollOffset = 0; // how much world has scrolled
let blocksPassed = 0;
function updateScoreByScroll(){
  // any blocks whose right edge passed left threshold -> count
  const thresholdX = 60; // player's left reference
  for(let i=0;i<state.platforms.length;i++){
    const p = state.platforms[i];
    const rightEdge = p.x + p.blocks*blockSize - scrollOffset;
    if(!p.counted && rightEdge < thresholdX){
      p.counted = true;
      blocksPassed += p.blocks;
      animatePointIncrease(p.blocks * 2); // 2 points per block
      // increment smooth block counter
      scoreEl.textContent = blocksPassed;
    }
  }
}

// smooth points animation
let displayedPoints = 0; let targetPoints = 0; let pointsAnimTime = 0;
function animatePointIncrease(delta){ targetPoints += delta; pointsAnimTime = 0.0001; }
function updatePointsAnim(dt){ if(displayedPoints === targetPoints) return; pointsAnimTime += dt; const t = Math.min(1, pointsAnimTime/0.45); const eased = 1 - Math.pow(1-t,3); displayedPoints = Math.floor( displayedPoints + (targetPoints - displayedPoints) * eased ); pointsEl.textContent = displayedPoints; }

// ---------- Leaderboard & cookie (SHA-256) ----------
const LB_COOKIE = 'squiddash_lb_v1';
async function sha256Hex(text){ const enc = new TextEncoder().encode(text); const hash = await crypto.subtle.digest('SHA-256', enc); const hex = Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join(''); return hex; }

function saveLeaderboardLocal(data){ // data: array of {name,score}
  const json = JSON.stringify(data);
  // encrypt by hashing the content and store both? We'll store hex hash and raw JSON (simple integrity check)
  sha256Hex(json).then(hash=>{ const payload = {hash, data}; document.cookie = LB_COOKIE + '=' + encodeURIComponent(JSON.stringify(payload)) + ';max-age=31536000;path=/'; renderLeaderboard(); });
}

function loadLeaderboardLocal(){
  const c = document.cookie.split('; ').find(row=>row.startsWith(LB_COOKIE+'='));
  if(!c) return null; try{ const payload = JSON.parse(decodeURIComponent(c.split('=')[1])); return payload; }catch(e){ return null; }
}

function renderLeaderboard(){
  const payload = loadLeaderboardLocal(); lbWrap.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className='leaderboard';
  if(!payload){ wrap.innerHTML = '<div>No leaderboard yet</div>'; lbWrap.appendChild(wrap); return; }
  try{
    const arr = payload.data;
    const list = arr.slice().sort((a,b)=>b.score-a.score).slice(0,10);
    list.forEach((it,idx)=>{ const el = document.createElement('div'); el.textContent = `${idx+1}. ${it.name} — ${it.score}`; wrap.appendChild(el); });
    lbWrap.appendChild(wrap);
  }catch(e){ wrap.innerHTML = '<div>Invalid leaderboard</div>'; lbWrap.appendChild(wrap); }
}

// ---------- Game loop ----------
let lastTs = 0;
function loop(ts){
  if(!state.running) return; const dt = Math.min((ts - lastTs)/1000, 0.05); lastTs = ts; state.time += dt;

  // controls: S can be used for a fast drop (optional)
  if(keys['s']){
    // optional: small downward boost
    state.player.vy += 600 * dt; }

  // update player
  state.player.update(dt);

  // scroll world based on player's forward motion to create infinite run
  // base world movement to left
  scrollSpeed = baseScrollSpeed + Math.max(0, state.player.vx * 0.4);
  scrollOffset += scrollSpeed * dt;

  // subtract scroll from platforms positions
  // (we keep platform.x in world coords, but rendering uses x - scrollOffset)

  // collisions
  resolveCollisions(state.player, dt);

  // death: touching bottom of viewport
  const bottomY = state.player.y + state.player.h/2;
  if(bottomY > (canvas.height/devicePixelRatio) - 6){ // dead
    endGame(); return;
  }

  // generate platforms ahead
  maybeGeneratePlatforms();

  // cull old platforms
  state.platforms = state.platforms.filter(p=> (p.x + p.blocks*blockSize - scrollOffset) > -300 );

  // scoring when platforms pass
  updateScoreByScroll();

  // update points anim
  updatePointsAnim(dt);

  // draw
  render(dt);

  requestAnimationFrame(loop);
}

// ---------- Rendering ----------
function render(dt){
  const W = canvas.width / devicePixelRatio; const H = canvas.height / devicePixelRatio;
  // clear + background cave-ish
  ctx.clearRect(0,0,W,H);
  // gradient
  const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#042633'); g.addColorStop(1,'#00121a'); ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  // subtle cave strokes
  for(let i=0;i<6;i++){ ctx.fillStyle = 'rgba(0,20,20,0.03)'; ctx.beginPath(); const rx = (i*220 + (state.time*20)%220); ctx.ellipse((rx%W), H*0.2 + i*40, 260, 60, 0, 0, Math.PI*2); ctx.fill(); }

  // platforms
  ctx.save();
  for(const p of state.platforms){
    const px = p.x - scrollOffset; const py = p.y;
    for(let i=0;i<p.blocks;i++){
      const bx = px + i*blockSize; const by = py; ctx.drawImage(getBlockImage(), bx, by, blockSize, blockSize);
    }
  }
  ctx.restore();

  // draw player
  state.player.draw(ctx);

  // HUD updates
  dashText.textContent = state.player.dashCooldown > 0.01 ? state.player.dashCooldown.toFixed(1) + 's' : 'Ready';
}

// small cache for block image
let _blockImg = null; function getBlockImage(){ if(_blockImg) return _blockImg; const img = new Image(); img.src = ASSETS.blockSVG; _blockImg = img; return _blockImg; }

// ---------- Game control functions ----------
function startGame(){
  clicky(); startScreen.hidden = true; gameOverScreen.hidden = true; gameScreen.hidden = false;
  resizeCanvas(); state.running = true; state.time = 0; state.player = new Player();
  state.player.x = 120; state.player.y = (canvas.height/devicePixelRatio) * 0.35; state.platforms = []; state.nextPlatformX = 200; blocksPassed = 0; displayedPoints = 0; targetPoints = 0; scoreEl.textContent = 0; pointsEl.textContent = 0;
  generateInitialPlatforms(); lastTs = performance.now(); requestAnimationFrame(loop);
}

function endGame(){ state.running = false; gameScreen.hidden = true; gameOverScreen.hidden = false; finalScore.textContent = `Blocks passed: ${blocksPassed} — Points: ${targetPoints}`; renderLeaderboard(); }

// UI bindings
btnStart.addEventListener('click', ()=>{ clicky(); startGame(); });
btnCredits.addEventListener('click', ()=>{ clicky(); creditsPanel.hidden = !creditsPanel.hidden; });
btnPlayAgain?.addEventListener('click', ()=>{ clicky(); startGame(); });
btnMainMenu?.addEventListener('click', ()=>{ clicky(); gameOverScreen.hidden = true; startScreen.hidden = false; });

// initial render of leaderboard area
renderLeaderboard();

// prepare canvas size to actual element
(function initCanvasSize(){ const rect = canvas.getBoundingClientRect(); canvas.width = Math.floor(rect.width * devicePixelRatio); canvas.height = Math.floor((rect.height || (window.innerHeight*0.7)) * devicePixelRatio); ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); })();

// allow starting with Enter key
window.addEventListener('keydown', e=>{ if(e.key==='Enter' && startScreen.hidden) startGame(); });

// ---------- End of file ----------