const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth * 0.8;
canvas.height = window.innerHeight * 0.8;

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('play-again-btn').addEventListener('click', startGame);
document.getElementById('main-menu-btn').addEventListener('click', showMenu);

function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    canvas.style.display = 'block';
    gameLoop();
}

function showMenu() {
    document.getElementById('start-screen').style.display = 'block';
    document.getElementById('game-over-screen').style.display = 'none';
    canvas.style.display = 'none';
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'pink';
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, 30, 0, Math.PI * 2);
    ctx.fill();
    requestAnimationFrame(gameLoop);
}
