const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playerImg = new Image();
playerImg.src = "player.jpg"; // <-- your JPG file here

let gameStarted = false;
let bullets = [];
let enemies = [];
let platforms = [];
let currentLevel = 0;

const gravity = 0.4;
const keys = {};

const player = {
  x: 50,
  y: 300,
  width: 40,
  height: 40,
  vx: 0,
  vy: 0,
  speed: 3,
  jumpPower: -8,
  onGround: false,
};

document.addEventListener("keydown", (e) => keys[e.key] = true);
document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
  if (e.key === " ") shoot();
});

function generateLevel() {
  const newPlatforms = [];

  newPlatforms.push({ x: 0, y: 350, width: 800, height: 50 });

  for (let i = 0; i < 5; i++) {
    const plat = {
      x: Math.random() * 700,
      y: Math.random() * 250 + 50,
      width: 80 + Math.random() * 60,
      height: 10
    };
    newPlatforms.push(plat);
  }

  platforms = newPlatforms;
  enemies = [];

  // Add 3 enemies on random platforms
  for (let i = 1; i < 4; i++) {
    const plat = platforms[i];
    enemies.push({
      x: plat.x + 10,
      y: plat.y - 30,
      width: 30,
      height: 30,
      vx: 1.5 * (Math.random() > 0.5 ? 1 : -1)
    });
  }
}

function shoot() {
  bullets.push({
    x: player.x + player.width / 2,
    y: player.y + player.height / 2,
    vx: 5
  });
}

function update() {
  if (!gameStarted) return;

  player.vx = 0;
  if (keys["ArrowLeft"]) player.vx = -player.speed;
  if (keys["ArrowRight"]) player.vx = player.speed;
  if (keys["ArrowUp"] && player.onGround) {
    player.vy = player.jumpPower;
    player.onGround = false;
  }

  player.vy += gravity;
  player.x += player.vx;
  player.y += player.vy;

  player.onGround = false;
  for (let plat of platforms) {
    if (
      player.x < plat.x + plat.width &&
      player.x + player.width > plat.x &&
      player.y + player.height <= plat.y + 10 &&
      player.y + player.height + player.vy >= plat.y
    ) {
      player.vy = 0;
      player.y = plat.y - player.height;
      player.onGround = true;
    }
  }

  if (player.x + player.width >= canvas.width) {
    player.x = 0;
    player.y = 300;
    currentLevel++;
    generateLevel();
  }

  if (player.y > canvas.height) {
    player.x = 0;
    player.y = 300;
    player.vy = 0;
  }

  // Update bullets
  bullets.forEach(bullet => bullet.x += bullet.vx);
  bullets = bullets.filter(b => b.x < canvas.width);

  // Update enemies
  for (let enemy of enemies) {
    enemy.x += enemy.vx;

    // Bounce off edges of platforms
    const plat = platforms.find(p => enemy.y + enemy.height === p.y);
    if (plat) {
      if (enemy.x <= plat.x || enemy.x + enemy.width >= plat.x + plat.width) {
        enemy.vx *= -1;
      }
    }
  }

  // Bullet-enemy collisions
  for (let i = enemies.length - 1; i >= 0; i--) {
    for (let j = 0; j < bullets.length; j++) {
      const b = bullets[j];
      const e = enemies[i];
      if (
        b.x > e.x &&
        b.x < e.x + e.width &&
        b.y > e.y &&
        b.y < e.y + e.height
      ) {
        enemies.splice(i, 1);
        bullets.splice(j, 1);
        break;
      }
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!gameStarted) {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "36px Arial";
    ctx.fillText("Jumpy Rocky", 270, 150);
    ctx.font = "24px Arial";
    ctx.fillText("Press ENTER to Start", 260, 200);
    return;
  }

  // Platforms
  ctx.fillStyle = "#888";
  for (let plat of platforms) {
    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
  }

  // Player
  ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);

  // Enemies
  ctx.fillStyle = "red";
  for (let e of enemies) {
    ctx.fillRect(e.x, e.y, e.width, e.height);
  }

  // Bullets
  ctx.fillStyle = "yellow";
  for (let b of bullets) {
    ctx.fillRect(b.x, b.y, 5, 3);
  }

  // Level counter
  ctx.fillStyle = "white";
  ctx.font = "18px Arial";
  ctx.fillText(`Level: ${currentLevel + 1}`, 10, 20);
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !gameStarted) {
    gameStarted = true;
    generateLevel();
  }
});

playerImg.onload = gameLoop;


