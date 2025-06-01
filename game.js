const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Load your character image
const playerImg = new Image();
playerImg.src = "player.png"; // Replace this with your own image if desired

// Game state
const player = {
  x: 50,
  y: 300,
  width: 40,
  height: 40,
  vx: 0,
  vy: 0,
  speed: 3,
  jumpPower: -8,
  onGround: false
};

const gravity = 0.4;
const keys = {};

// Simple platforms
const platforms = [
  { x: 0, y: 350, width: 800, height: 50 },
  { x: 200, y: 280, width: 100, height: 10 },
  { x: 400, y: 220, width: 100, height: 10 },
];

document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

function update() {
  // Horizontal movement
  player.vx = 0;
  if (keys["ArrowLeft"]) player.vx = -player.speed;
  if (keys["ArrowRight"]) player.vx = player.speed;

  // Jump
  if (keys["ArrowUp"] && player.onGround) {
    player.vy = player.jumpPower;
    player.onGround = false;
  }

  // Apply gravity
  player.vy += gravity;

  // Move player
  player.x += player.vx;
  player.y += player.vy;

  // Collision detection
  player.onGround = false;
  for (let plat of platforms) {
    if (
      player.x < plat.x + plat.width &&
      player.x + player.width > plat.x &&
      player.y + player.height < plat.y + 10 &&
      player.y + player.height + player.vy >= plat.y
    ) {
      player.vy = 0;
      player.y = plat.y - player.height;
      player.onGround = true;
    }
  }

  // Stay within bounds
  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
  if (player.y > canvas.height) {
    player.y = 300;
    player.vy = 0;
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw platforms
  ctx.fillStyle = "#888";
  for (let plat of platforms) {
    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
  }

  // Draw player image
  ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

playerImg.onload = gameLoop;

