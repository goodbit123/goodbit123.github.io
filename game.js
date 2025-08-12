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
      <rect x='6' y='6' width='116' height='116' rx='10' fill='%234a3f2f' />
      <rect x='12' y='12' width='104' height='104' rx='6' fill='%23645b4a' />
    </svg>
  `)}`
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

// responsive helper
const isMobile = /Mobi|Android/i.test(navigator.userAgent);

function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * devicePixelRatio);
  canvas.height = Math.floor(rect.height * devicePixelRatio);
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---------- audio (clicky & sfx via WebAudio) ----------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function clicky(){
  try{
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type='square'; o.frequency.value = 900; g.gain.value=0.04; o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.06);
  }catch(e){/*silent*/}
}
function sfx(freq,dur=0.08){ try{ const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type='sine'; o.frequency.value=freq; g.gain.value=0.05; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+dur);}catch(e){} }

// ---------- Input handling ----------
const keys = {};
window.addEventListener('keydown', e=>{ if(e.key) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e=>{ if(e.key) keys[e.key.toLowerCase()] = false; });

// mobile joystick simplified
let touchId=null, joystickCenter=null;
joystick.addEventListener('touchstart', e=>{ e.preventDefault(); clicky(); const t = e.changedTouches[0]; touchId = t.identifier; joystickCenter = {x:t.clientX,y:t.clientY}; });
joystick.addEventListener('touchmove', e=>{ e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier===touchId){ const dx = t.clientX - joystickCenter.x; keys['a'] = dx < -20; keys['d'] = dx > 20; } } });
joystick.addEventListener('touchend', e=>{ for(const t of e.changedTouches){ if(t.identifier===touchId){ touchId=null; keys['a']=keys['d']=false; } } });
btnJump.addEventListener('touchstart', e=>{ keys['w']=true; clicky(); }); btnJump.addEventListener('touchend', e=>{ keys['w']=false; });
btnDash.addEventListener('touchstart', e=>{ keys['shift']=true; clicky(); setTimeout(()=>keys['shift']=false,120); });

// ---------- Game constants & state ----------
const blockSize = 64; // more square-ish tile
const targetJumpBlocks = 2.6; // slightly above 2.5
const gravity = 2200; // px/s^2
const jumpHeight = targetJumpBlocks * blockSize;
const jumpVelocity = Math.sqrt(2 * gravity * jumpHeight);
const baseScrollSpeed = 200;
let scrollSpeed = baseScrollSpeed;
const DASH_VELOCITY = 700;
const DASH_DURATION = 0.22;
const DASH_COOLDOWN = 3.0;

let state = { running:false, time:0, platforms:[], player:null, nextPlatformX:0, blocksPassed:0, points:0, gameStarted:false, gameOver:false };
let scrollOffset = 0;
let displayedPoints = 0, targetPoints = 0, pointsAnimTime = 0;

// fixed-step accumulator for 24 FPS
const FIXED_DT = 1/24;
let physicsAccumulator = 0;

// ---------- Player class ----------
class Player{
  constructor(){ this.x = 120; this.y = 200; this.w = 48; this.h = 56; this.vx=0; this.vy=0; this.onGround=false; this.dashing=false; this.dashTimer=0; this.dashCooldown=0; this.sprite=new Image(); this.sprite.src = ASSETS.playerSVG; }
  updateFixed(dt){
    // apply horizontal input
    const left = keys['a'], right = keys['d']; const accel = 1100, maxSpeed = 280;
    if(left) this.vx = Math.max(-maxSpeed, this.vx - accel*dt);
    else if(right) this.vx = Math.min(maxSpeed, this.vx + accel*dt);
    else this.vx = this.vx * Math.pow(0.0001, dt);

    // jump only processed in fixed step (consistent 24fps feel)
    if((keys['w'] || keys[' ']) && this.onGround){ this.vy = -jumpVelocity; this.onGround=false; sfx(720,0.12); keys['w']=false; }

    // gravity
    this.vy += gravity * dt;

    // dash input
    if((keys['shift']) && this.dashCooldown <= 0 && !this.dashing){ this.startDash(); keys['shift']=false; }
    if(this.dashing){ this.dashTimer -= dt; const dir = (Math.abs(this.vx) < 1e-3) ? 1 : Math.sign(this.vx); this.vx = this.vx + ( (dir * DASH_VELOCITY - this.vx) * 0.18 ); if(this.dashTimer <= 0) this.endDash(); }
    else { if(this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt); }

    // integrate
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
  update(dt){ /* nothing here: physics on fixed step */ }
  startDash(){ this.dashing=true; this.dashTimer=DASH_DURATION; this.dashCooldown=DASH_COOLDOWN; sfx(1200,0.08); }
  endDash(){ this.dashing=false; }
  draw(ctx){ ctx.save(); ctx.translate(this.x, this.y); ctx.drawImage(this.sprite, -this.w/2, -this.h/2, this.w, this.h); ctx.restore(); }
}

// ---------- Platform generation ----------
function spawnPlatform(x,y,blocks){ state.platforms.push({x,y,blocks,counted:false}); }
function generateInitialPlatforms(){ state.platforms=[]; state.nextPlatformX=200; // first platform ALWAYS 6 blocks
  spawnPlatform(state.nextPlatformX, (canvas.height/devicePixelRatio)*0.5, 6); state.nextPlatformX += 6*blockSize + 80;
  // generate a few more
  for(let i=0;i<8;i++){ const cnt = Math.floor(Math.random()*4)+2; const gap = Math.floor(Math.random()*3+1)*32 + 40; const y = (canvas.height/devicePixelRatio)*0.35 + Math.random()*(canvas.height/devicePixelRatio)*0.4; spawnPlatform(state.nextPlatformX, y, cnt); state.nextPlatformX += cnt*blockSize + gap; }
}
function maybeGeneratePlatforms(){ while(state.nextPlatformX < (canvas.width/devicePixelRatio) + 500){ const cnt = Math.floor(Math.random()*4)+2; const gap = Math.floor(Math.random()*3+1)*32 + 40; const yBase = (canvas.height/devicePixelRatio)*0.4 + Math.random()*(canvas.height/devicePixelRatio)*0.4; const y = Math.max(120, Math.min((canvas.height/devicePixelRatio)-180, yBase + (Math.random()-0.5)*80)); spawnPlatform(state.nextPlatformX, y, cnt); state.nextPlatformX += cnt*blockSize + gap; } }

// ---------- Collision & physics ----------
function resolveCollisions(player, dt){ player.onGround=false; for(const p of state.platforms){ const pw = p.blocks * blockSize; const px = p.x - scrollOffset; const py = p.y; if(player.x + player.w/2 > px && player.x - player.w/2 < px + pw){ const playerBottom = player.y + player.h/2; const prevBottom = playerBottom - player.vy*dt; if(prevBottom <= py && playerBottom >= py){ player.y = py - player.h/2; player.vy = 0; player.onGround = true; } } } }

// ---------- Scoring ----------
function updateScoreByScroll(){ const thresholdX = 60; for(const p of state.platforms){ if(!p.counted){ const rightEdge = p.x + p.blocks*blockSize - scrollOffset; if(rightEdge < thresholdX){ p.counted = true; state.blocksPassed += p.blocks; targetPoints += p.blocks * 2; scoreEl.textContent = state.blocksPassed; } } } }
function updatePointsAnim(dt){ if(displayedPoints === targetPoints) return; pointsAnimTime += dt; const t = Math.min(1, pointsAnimTime/0.45); const eased = 1 - Math.pow(1-t,3); displayedPoints = Math.floor( displayedPoints + (targetPoints - displayedPoints) * eased ); pointsEl.textContent = displayedPoints; }

// ---------- Leaderboard (robust) ----------
const LB_COOKIE = 'squiddash_lb_v1';
function saveLeaderboardLocal(data){ try{ const json = JSON.stringify(data); const payload = {ts:Date.now(), data}; document.cookie = LB_COOKIE + '=' + encodeURIComponent(JSON.stringify(payload)) + ';max-age=31536000;path=/'; renderLeaderboard(); }catch(e){ console.warn('Could not save LB',e); } }
function loadLeaderboardLocal(){ const c = document.cookie.split('; ').find(row=>row.startsWith(LB_COOKIE+'=')); if(!c) return null; try{ return JSON.parse(decodeURIComponent(c.split('=')[1])); }catch(e){ return null; } }
function renderLeaderboard(){ lbWrap.innerHTML=''; const payload = loadLeaderboardLocal(); const wrap = document.createElement('div'); wrap.className='leaderboard'; if(!payload || !payload.data || payload.data.length===0){ wrap.innerHTML = '<div>No leaderboard yet</div>'; lbWrap.appendChild(wrap); return; } try{ const arr = payload.data.slice().sort((a,b)=>b.score-a.score).slice(0,10); arr.forEach((it,idx)=>{ const el=document.createElement('div'); el.textContent = `${idx+1}. ${it.name} — ${it.score}`; wrap.appendChild(el); }); lbWrap.appendChild(wrap);}catch(e){ wrap.innerHTML='<div>Invalid leaderboard</div>'; lbWrap.appendChild(wrap);} }

// ---------- Rendering ----------
let _blockImg=null; function getBlockImage(){ if(_blockImg) return _blockImg; const img=new Image(); img.src=ASSETS.blockSVG; _blockImg=img; return _blockImg; }
function renderFrame(){ const W = canvas.width/devicePixelRatio, H = canvas.height/devicePixelRatio; ctx.clearRect(0,0,W,H); const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#042633'); g.addColorStop(1,'#00121a'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H); for(let i=0;i<5;i++){ ctx.fillStyle='rgba(0,20,20,0.03)'; ctx.beginPath(); const rx = (i*240 + (state.time*20)%240); ctx.ellipse((rx%W), H*0.15 + i*50, 300, 70, 0, 0, Math.PI*2); ctx.fill(); }
  // platforms
  ctx.save(); const blk = getBlockImage(); for(const p of state.platforms){ const px = p.x - scrollOffset; const py = p.y; for(let i=0;i<p.blocks;i++){ const bx = px + i*blockSize; ctx.drawImage(blk, bx, py, blockSize, blockSize); } }
  ctx.restore(); // player
  state.player.draw(ctx);
  // HUD
  dashText.textContent = state.player.dashCooldown > 0.01 ? state.player.dashCooldown.toFixed(1) + 's' : 'Ready'; }

// ---------- Camera behavior ----------
let cameraX = 0; function updateCamera(dt){ const rightEdgeScreen = canvas.width/devicePixelRatio - 140; const playerScreenX = state.player.x - scrollOffset; // since we scroll by scrollOffset
  // if player approaches right edge, nudge camera (increase scrollOffset slightly to follow)
  if(playerScreenX > rightEdgeScreen - 60){ const excess = playerScreenX - (rightEdgeScreen - 60); scrollOffset += excess * 0.18; }
}

// ---------- Game loop (fixed-step physics at 24fps) ----------
let lastTs = 0; function loop(ts){ if(!state.running) return; const rawDt = Math.min((ts - lastTs)/1000, 0.1); lastTs = ts; state.time += rawDt; physicsAccumulator += rawDt; // process fixed steps
  while(physicsAccumulator >= FIXED_DT){ // physics step
    state.player.updateFixed(FIXED_DT);
    // world scroll speed influenced by player vx
    scrollSpeed = baseScrollSpeed + Math.max(0, state.player.vx * 0.4);
    scrollOffset += scrollSpeed * FIXED_DT;
    // collisions
    resolveCollisions(state.player, FIXED_DT);
    // death by falling
    const bottomY = state.player.y + state.player.h/2; if(bottomY > (canvas.height/devicePixelRatio) - 6){ endGame(); return; }
    // generate platforms
    maybeGeneratePlatforms(); // cull
    state.platforms = state.platforms.filter(p => (p.x + p.blocks*blockSize - scrollOffset) > -400);
    // scoring
    updateScoreByScroll();
    // reduce accumulator
    physicsAccumulator -= FIXED_DT;
  }
  // camera update (gentle)
  updateCamera(rawDt);
  // animate points
  updatePointsAnim(rawDt);
  // render
  renderFrame();
  requestAnimationFrame(loop);
}

// ---------- Game control functions ----------
function startGame(){ clicky(); startScreen.hidden = true; gameOverScreen.hidden = true; gameScreen.hidden = false; resizeCanvas(); state.running=true; state.time=0; state.player=new Player(); state.player.x = 120; state.player.y = (canvas.height/devicePixelRatio) * 0.35; state.platforms=[]; state.nextPlatformX=200; state.blocksPassed=0; displayedPoints=0; targetPoints=0; scoreEl.textContent=0; pointsEl.textContent=0; state.gameStarted=true; state.gameOver=false; cameraX=0; scrollOffset=0; generateInitialPlatforms(); lastTs = performance.now(); requestAnimationFrame(loop); updateUIState(); }
function endGame(){ state.running=false; state.gameOver=true; gameScreen.hidden=true; gameOverScreen.hidden=false; finalScore.textContent = `Blocks passed: ${state.blocksPassed} — Points: ${targetPoints}`; renderLeaderboard(); updateUIState(); }

// ---------- UI states & behavior ----------
function updateUIState(){ // mobile: hide leaderboard until death
  if(isMobile){ if(!state.gameOver){ lbWrap.style.display='none'; } else { lbWrap.style.display='block'; } }
  // desktop: when not started, show 'Start a game!' and dim leaderboard
  if(!state.gameStarted && !isMobile){ // start screen
    // change game over text to Start a game!
    finalScore.textContent = 'Start a game!'; // small gray text
    finalScore.style.color = '#9aa3a3';
    // hide play again / main menu until game played
    btnPlayAgain.style.display = 'none'; btnMainMenu.style.display = 'none'; lbWrap.classList.add('dimmed'); scoreEl.parentElement.classList.add('dimmed'); pointsEl.parentElement.classList.add('dimmed');
  } else {
    // when playing
    if(state.running){ lbWrap.classList.remove('dimmed'); scoreEl.parentElement.classList.remove('dimmed'); pointsEl.parentElement.classList.remove('dimmed'); btnPlayAgain.style.display = 'none'; btnMainMenu.style.display = 'none'; }
    // when game over
    if(state.gameOver){ btnPlayAgain.style.display='inline-block'; btnMainMenu.style.display='inline-block'; lbWrap.classList.remove('dimmed'); scoreEl.parentElement.classList.add('dimmed'); pointsEl.parentElement.classList.add('dimmed'); }
  }
}

// hook UI buttons
btnStart.addEventListener('click', ()=>{ clicky(); startGame(); updateUIState(); });
btnCredits.addEventListener('click', ()=>{ clicky(); creditsPanel.hidden = !creditsPanel.hidden; });
if(btnPlayAgain){ btnPlayAgain.addEventListener('click', ()=>{ clicky(); startGame(); }); }
if(btnMainMenu){ btnMainMenu.addEventListener('click', ()=>{ clicky(); gameOverScreen.hidden = true; startScreen.hidden = false; updateUIState(); }); }

// initial setup
renderLeaderboard(); updateUIState();

// ensure canvas sized to element
(function initCanvasSize(){ const rect = canvas.getBoundingClientRect(); if(rect.width === 0){ // fallback
    canvas.style.width = '100%'; canvas.style.height = Math.round(window.innerHeight*0.7) + 'px'; }
  resizeCanvas(); })();

// allow start with Enter
window.addEventListener('keydown', e=>{ if(e.key === 'Enter' && startScreen.hidden) startGame(); });

// Expose some debug helpers
window.__squiddash = { state, startGame, endGame };
