const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// UI: Add level counter under the title
const levelCounter = document.createElement("h3");
levelCounter.style.color = "white";
levelCounter.innerText = "Level: 1";
document.body.insertBefore(levelCounter, canvas.nextSibling);

// Load player image
const playerImg = new Image();
playerImg.src = "player.png"; // Replace with your custom image if needed

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

let currentLevel = 0;
const totalLevels = 15;
let platforms = [];

document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

// Generate platforms for each level
function generateLevel(levelNum) {
  const generatedPlatforms = [];

  // Base floor
  generatedPlatforms.push({ x: 0, y: 350, width: 800, height: 50 });

  // Add 4-6 random platforms per level
  const count = 4 + Math.floor(Math.random() * 3);

  for (let i = 0; i < count; i++) {
    const plat = {
      x: Math.random() * 700 + 20,
      y: Math.random() * 250 + 50,
      width: 60 + Math.random() * 100,
      height: 10
    };
    generatedPlatforms.push(plat);
  }

  return generatedPlatforms;
}

// Initialize first level
platforms = generateLevel(currentLevel);
levelCounter.innerText = `Level: ${currentLevel + 1}`;

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

  // Stay within bounds horizontally
  if (player.x < 0) player.x = 0;

  // Detect level complete (reach right edge)
  if (player.x + player.width >= canvas.width) {
    if (currentLevel < totalLevels - 1) {
      currentLevel++;
      platforms = generateLevel(currentLevel);
      levelCounter.innerText = `Level: ${currentLevel + 1}`;
      player.x = 0;
      player.y = 300;
      player.vx = 0;
      player.vy = 0;
    } else {
      levelCounter.innerText = `🎉 You finished all levels! 🎉`;
    }
  }

  // Fall reset
  if (player.y > canvas.height) {
    player.x = 0;
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

