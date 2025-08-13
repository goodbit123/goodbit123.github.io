class SquidDashGame {
  constructor() {
      this.CONFIG = {
          canvasWidth: 960,
          canvasHeight: 540,
          blockSize: 48,
          gravity: 1400,      
          jumpImpulse: -650,  
          moveSpeed: 260,     
          dashDistance: 260,  
          dashDuration: 0.12, 
          dashCooldown: 3.0,  
          physicsFPS: 60,     
          platformGapMin: 1.0,
          platformGapMax: 3.5,
          initialPlatformBlocks: 6,
          subsequentPlatformMin: 2,
          subsequentPlatformMax: 5,
          maxPlatformsAhead: 8
      };

      this.device = null; 
      this.lastTime = 0;
      this.accumulator = 0;
      this.FIXED_DT = 1 / this.CONFIG.physicsFPS;

      this.gameState = {
          running: false,
          firstRunCompleted: false,
          diedOnce: false,
          score: 0,
          blocksPassed: 0
      };

      this.player = {
          x: 120, y: 0, vx: 0, vy: 0,
          width: this.CONFIG.blockSize * 0.9,
          height: this.CONFIG.blockSize * 0.9,
          onGround: false,
          canDash: true,
          dashTimer: 0,
          dashCooldownTimer: 0,
          facing: 1,
          skin: 'pink'
      };

      this.platforms = [];
      this.worldOffset = 0;
      this.totalTravelled = 0;

      this.bubbles = [];
      this.dashTrail = [];

      this.input = { left: false, right: false, jump: false, dash: false };

      this.displayedScore = 0;

      document.addEventListener('DOMContentLoaded', () => this.boot());
  }

  $(id) { return document.getElementById(id); }

  boot() {
      this.initDOM();
      this.prepareUI();
      this.initCanvas();
      this.setupInput();
      this.showDeviceSelect();
      console.log('Game booted. Controls: A/D move, W/Space jump, Shift/J dash.');
  }

  initDOM() {
      this.dom = {
          deviceSelect: this.$('deviceSelect'),
          mainMenu: this.$('mainMenu'),
          gameContainer: this.$('gameContainer'),
          gameOverMenu: this.$('gameOver'),
          finalScoreValue: this.$('finalScoreValue'),
          finalBlocksValue: this.$('finalBlocksValue'),
          playAgainBtn: this.$('playAgainBtn'),
          returnMenuBtn: this.$('returnMenuBtn'),
          scoreValue: this.$('scoreValue'),
          blocksValue: this.$('blocksValue'),
          keybindsHint: this.$('keybinds-hint')
      };
  }

  prepareUI() {
      this.$('selectPC').addEventListener('click', () => this.onDeviceChosen('PC'));
      this.$('selectMobile').addEventListener('click', () => this.onDeviceChosen('Mobile'));
      this.$('playBtn').addEventListener('click', () => this.startRun());
      this.$('playAgainBtn').addEventListener('click', () => this.startRun());
      this.$('returnMenuBtn').addEventListener('click', () => this.showMainMenu());
  }

  onDeviceChosen(device) {
      this.device = device;
      console.log(`${this.device} mode selected`);
      if (this.device === 'Mobile') this.createMobileUI();
      this.showMainMenu();
  }

  showDeviceSelect() {
      this.dom.deviceSelect.classList.remove('hidden');
      this.dom.mainMenu.classList.add('hidden');
      this.dom.gameContainer.classList.add('hidden');
      this.dom.gameOverMenu.classList.add('hidden');
  }

  showMainMenu() {
      this.dom.deviceSelect.classList.add('hidden');
      this.dom.mainMenu.classList.remove('hidden');
      this.dom.gameContainer.classList.add('hidden');
      this.dom.gameOverMenu.classList.add('hidden');
      if (this.dom.keybindsHint) this.dom.keybindsHint.classList.add('hidden');
  }

  showGame() {
      this.dom.deviceSelect.classList.add('hidden');
      this.dom.mainMenu.classList.add('hidden');
      this.dom.gameContainer.classList.remove('hidden');
      this.dom.gameOverMenu.classList.add('hidden');
      if (this.dom.keybindsHint) {
          if (this.device === 'PC') {
              this.dom.keybindsHint.classList.remove('hidden');
          } else {
              this.dom.keybindsHint.classList.add('hidden');
          }
      }
  }

  showGameOver() {
      this.dom.gameOverMenu.classList.remove('hidden');
      this.dom.gameContainer.classList.add('hidden');
      if (this.dom.keybindsHint) this.dom.keybindsHint.classList.add('hidden');
      this.dom.finalScoreValue.textContent = this.gameState.score;
      this.dom.finalBlocksValue.textContent = this.gameState.blocksPassed;
      this.dom.scoreValue.textContent = this.gameState.score;
      this.dom.blocksValue.textContent = this.gameState.blocksPassed;
  }

  initCanvas() {
      this.canvas = this.$('gameCanvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.handleResize();
      window.addEventListener('resize', () => this.handleResize());
  }

  handleResize() {
      const ratio = window.devicePixelRatio || 1;
      this.canvas.width = Math.floor(this.CONFIG.canvasWidth * ratio);
      this.canvas.height = Math.floor(this.CONFIG.canvasHeight * ratio);
      this.canvas.style.width = 'min(96vw, 960px)';
      this.canvas.style.height = `calc(${this.CONFIG.canvasHeight / this.CONFIG.canvasWidth} * min(96vw, 960px))`;
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  setupInput() {
      window.addEventListener('keydown', e => {
          const key = e.key.toLowerCase();
          if (key === 'a' || key === 'arrowleft') this.input.left = true;
          if (key === 'd' || key === 'arrowright') this.input.right = true;
          if (key === 'w' || key === ' ' || key === 'arrowup') this.input.jump = true;
          if (key === 'shift' || key === 'j') this.input.dash = true;
      });
      window.addEventListener('keyup', e => {
          const key = e.key.toLowerCase();
          if (key === 'a' || key === 'arrowleft') this.input.left = false;
          if (key === 'd' || key === 'arrowright') this.input.right = false;
          if (key === 'w' || key === ' ' || key === 'arrowup') this.input.jump = false;
          if (key === 'shift' || key === 'j') this.input.dash = false;
      });
  }

  startRun() {
      Object.assign(this.player, {
          x: 120, y: 0, vx: 0, vy: 0,
          onGround: false, canDash: true, dashTimer: 0,
          dashCooldownTimer: 0, skin: 'pink'
      });

      this.resetLevel();
      const p0 = this.platforms[0];
      this.player.x = p0.x + 40;
      this.player.y = p0.y - this.player.height - 2;

      this.gameState.running = true;
      this.displayedScore = 0;

      this.showGame();
      this.startGameLoop();
  }

  resetLevel() {
      this.platforms = [];
      this.worldOffset = 0;
      this.totalTravelled = 0;
      this.gameState.score = 0;
      this.gameState.blocksPassed = 0;

      this.platforms.push({
          x: 0,
          y: this.CONFIG.canvasHeight - this.CONFIG.blockSize * 2,
          w: this.CONFIG.blockSize * this.CONFIG.initialPlatformBlocks,
          h: this.CONFIG.blockSize * 2
      });

      let lastX = this.platforms[0].x + this.platforms[0].w;
      let lastY = this.platforms[0].y;

      for (let i = 0; i < this.CONFIG.maxPlatformsAhead; i++) {
          const gap = this.rand(this.CONFIG.platformGapMin, this.CONFIG.platformGapMax) * this.CONFIG.blockSize;
          const width = this.randInt(this.CONFIG.subsequentPlatformMin, this.CONFIG.subsequentPlatformMax) * this.CONFIG.blockSize;
          const y = this.clamp(
              lastY + this.rand(-1.8, 1.8) * this.CONFIG.blockSize,
              this.CONFIG.blockSize * 4,
              this.CONFIG.canvasHeight - this.CONFIG.blockSize * 2
          );
          this.platforms.push({ x: lastX + gap, y, w: width, h: this.CONFIG.blockSize * 2 });
          lastX += gap + width;
          lastY = y;
      }
  }

  startGameLoop() {
      this.lastTime = performance.now();
      this.accumulator = 0;
      if (this.gameState.running) {
          requestAnimationFrame((t) => this.loop(t));
      }
  }

  loop(timestamp) {
      if (!this.gameState.running) return;

      const delta = (timestamp - this.lastTime) / 1000;
      this.lastTime = timestamp;
      this.accumulator += delta;

      while (this.accumulator >= this.FIXED_DT) {
          this.step(this.FIXED_DT);
          this.accumulator -= this.FIXED_DT;
      }

      this.updateFX(delta);
      this.render();
      requestAnimationFrame((t) => this.loop(t));
  }

  step(dt) {
      if (this.input.left) this.player.vx = -this.CONFIG.moveSpeed;
      else if (this.input.right) this.player.vx = this.CONFIG.moveSpeed;
      else this.player.vx = 0;

      if (this.player.vx !== 0) this.player.facing = Math.sign(this.player.vx);

      if (this.input.jump && this.player.onGround) {
          this.player.vy = this.CONFIG.jumpImpulse;
          this.player.onGround = false;
      }
      this.input.jump = false;

      if (this.input.dash && this.player.canDash && this.player.dashCooldownTimer <= 0) {
          this.triggerDash();
      }
      this.input.dash = false;

      if (this.player.dashTimer > 0) {
          this.player.dashTimer -= dt;
          this.player.vx = (this.CONFIG.dashDistance / this.CONFIG.dashDuration) * this.player.facing;
          this.player.vy = 0;
          if (this.player.dashTimer <= 0) this.player.vx = 0;
      } else {
          this.player.vy += this.CONFIG.gravity * dt;
      }

      if (this.player.dashCooldownTimer > 0) {
          this.player.dashCooldownTimer -= dt;
      }

      this.player.x += this.player.vx * dt;
      this.player.y += this.player.vy * dt;

      const scrollMargin = this.CONFIG.canvasWidth / 3;
      if (this.player.x - this.worldOffset > scrollMargin) {
          this.worldOffset = this.player.x - scrollMargin;
      }

      this.resolveCollisions(dt);

      const blocksNow = Math.floor(this.player.x / this.CONFIG.blockSize);
      if (blocksNow > this.gameState.blocksPassed) {
          this.gameState.score += (blocksNow - this.gameState.blocksPassed) * 5;
          this.gameState.blocksPassed = blocksNow;
      }

      if (this.player.y > this.CONFIG.canvasHeight) this.handleDeath();
      this.ensurePlatforms();
  }

  resolveCollisions(dt) {
      this.player.onGround = false;
      for (const p of this.platforms) {
          const isOverlappingX = this.player.x + this.player.width > p.x && this.player.x < p.x + p.w;
          if (isOverlappingX) {
              const prevBottom = (this.player.y - this.player.vy * dt) + this.player.height;
              const currentBottom = this.player.y + this.player.height;

              if (this.player.vy >= 0 && prevBottom <= p.y && currentBottom >= p.y) {
                  this.player.y = p.y - this.player.height;
                  this.player.vy = 0;
                  this.player.onGround = true;
                  // Stop checking after finding a valid ground collision
                  break; 
              }
          }
      }
  }

  triggerDash() {
      this.player.dashTimer = this.CONFIG.dashDuration;
      this.player.dashCooldownTimer = this.CONFIG.dashCooldown;
  }

  handleDeath() {
      this.gameState.running = false;
      this.gameState.diedOnce = true;
      this.gameState.firstRunCompleted = true;
      setTimeout(() => {
          this.showGameOver();
          // this.promptForUsernameAndSave(); // Leaderboard logic can be added back here
      }, 500);
  }

  ensurePlatforms() {
      this.platforms = this.platforms.filter(p => p.x + p.w > this.worldOffset - this.CONFIG.blockSize);
      while (this.platforms.length < this.CONFIG.maxPlatformsAhead) {
          const last = this.platforms[this.platforms.length - 1];
          const gap = this.rand(this.CONFIG.platformGapMin, this.CONFIG.platformGapMax) * this.CONFIG.blockSize;
          const width = this.randInt(this.CONFIG.subsequentPlatformMin, this.CONFIG.subsequentPlatformMax) * this.CONFIG.blockSize;
          const y = this.clamp(last.y + this.rand(-1.8, 1.8) * this.CONFIG.blockSize, this.CONFIG.blockSize * 4, this.CONFIG.canvasHeight - this.CONFIG.blockSize * 2);
          this.platforms.push({ x: last.x + last.w + gap, y, w: width, h: this.CONFIG.blockSize * 2 });
      }
  }

  updateFX(dt) {
      if (Math.random() < 0.1) {
          this.bubbles.push({ x: this.rand(0, this.CONFIG.canvasWidth), y: this.CONFIG.canvasHeight, r: this.rand(1, 4), s: this.rand(20, 60) });
      }
      this.bubbles = this.bubbles.filter(b => (b.y -= b.s * dt) > -10);

      if (this.player.dashTimer > 0) {
          this.dashTrail.push({ x: this.player.x + this.player.width / 2, y: this.player.y + this.player.height / 2, life: 0.2 });
      }
      this.dashTrail = this.dashTrail.filter(p => (p.life -= dt) > 0);
  }

  render() {
      this.ctx.fillStyle = '#004488';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
      this.bubbles.forEach(b => {
          this.ctx.beginPath();
          this.ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          this.ctx.fill();
      });

      this.ctx.save();
      this.ctx.translate(-this.worldOffset, 0);

      this.ctx.fillStyle = '#009933';
      this.platforms.forEach(p => this.ctx.fillRect(p.x, p.y, p.w, p.h));

      this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
      this.dashTrail.forEach(p => this.ctx.fillRect(p.x - 2, p.y - 2, 4, 4));

      const px = Math.round(this.player.x);
      const py = Math.round(this.player.y);
      this.ctx.fillStyle = this.player.skin;
      this.ctx.fillRect(px, py, this.player.width, this.player.height);

      this.ctx.restore();

      this.dom.scoreValue.textContent = this.gameState.score;
      this.dom.blocksValue.textContent = this.gameState.blocksPassed;

      if (this.player.dashCooldownTimer > 0) {
          const pct = this.player.dashCooldownTimer / this.CONFIG.dashCooldown;
          this.ctx.fillStyle = '#ff0000';
          this.ctx.fillRect(this.canvas.width - 120, 10, 100 * pct, 20);
      }
  }

  createMobileUI() {
      if (this.$('mobileControls')) return;
      const container = document.createElement('div');
      container.id = 'mobileControls';
      container.className = 'mobile-controls';
      const left = document.createElement('div');
      left.className = 'mobile-left';
      const right = document.createElement('div');
      right.className = 'mobile-right';

      const addBtn = (parent, text, primary, action) => {
          const btn = document.createElement('button');
          btn.className = `mobileBtn ${primary ? 'primary' : ''}`;
          btn.textContent = text;
          btn.onpointerdown = (e) => { e.preventDefault(); this.input[action] = true; };
          btn.onpointerup = (e) => { e.preventDefault(); this.input[action] = false; };
          btn.onpointerleave = (e) => { e.preventDefault(); this.input[action] = false; };
          parent.appendChild(btn);
      };

      addBtn(left, '◀', false, 'left');
      addBtn(left, '▶', false, 'right');
      addBtn(right, 'B', false, 'dash');
      addBtn(right, 'A', true, 'jump');

      container.append(left, right);
      document.body.appendChild(container);
  }

  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  rand(min, max) { return Math.random() * (max - min) + min; }
  randInt(min, max) { return Math.floor(this.rand(min, max + 1)); }
}

// Expose for console and start the game
window.SquidDash = new SquidDashGame();