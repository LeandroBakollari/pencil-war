const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const PencilState = {
    IDLE: "idle",
    MOVING: "moving",
    DRAWING: "drawing",
};
  
// Resize canvas to full screen
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Game zones
const PENCIL_HEIGHT = 200; // top area for pencil attacks
const PLAY_AREA_TOP = PENCIL_HEIGHT;
const PLAY_AREA_BOTTOM = canvas.height;

// Player position
let mouseX = canvas.width / 2;
let mouseY = (PLAY_AREA_TOP + PLAY_AREA_BOTTOM) / 2;

// Track mouse movement
canvas.addEventListener("mousemove", (e) => {
    mouseX = Math.max(0, Math.min(e.clientX, canvas.width));
    mouseY = Math.max(PLAY_AREA_TOP, Math.min(e.clientY, canvas.height));       
});

function getRandomX() {
    const options = [
      canvas.width * 0.25,
      canvas.width * 0.5,
      canvas.width * 0.75,
    ];
    return options[Math.floor(Math.random() * options.length)];
  }
  
// Game loop
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    drawZones();
    drawPlayer();
  
    pencil.update();
    pencil.draw();
  
    for (let gun of activeGuns) {
      gun.update();
      gun.draw();
    }
  
    requestAnimationFrame(gameLoop);
  }
  
// Draw player (simple circle)
function drawPlayer() {
  const radius = 10;
  ctx.fillStyle = "#da0303";
  ctx.beginPath();
  ctx.arc(mouseX, mouseY, radius, 0, Math.PI * 2);
  ctx.fill();
}

// Draw zones (pencil + play area)
function drawZones() {
  // Pencil zone
  ctx.fillStyle = "#b4b4b4";
  ctx.fillRect(0, 0, canvas.width, PENCIL_HEIGHT);

  // Optional: visual line separating zones
  ctx.strokeStyle = "#b4b4b4";
  ctx.beginPath();
  ctx.moveTo(0, PENCIL_HEIGHT);
  ctx.lineTo(canvas.width, PENCIL_HEIGHT);
  ctx.stroke();
}
class EvilPencil {
    constructor() {
      this.x = canvas.width / 2;
      this.y = 0;
      this.state = PencilState.IDLE;
      this.frameIndex = 0;
      this.frameDelay = 10;
      this.frameTimer = 0;
      this.currentAnimation = idleFrames; // Start with idle
      this.targetX = this.x;
    }
  
    update() {
      this.frameTimer++;
      if (this.frameTimer >= this.frameDelay) {
        this.frameTimer = 0;
        this.frameIndex = (this.frameIndex + 1) % this.currentAnimation.length;
      }
  
      // If moving, go to targetX smoothly
      if (this.state === PencilState.MOVING) {
        const speed = 5;
        if (Math.abs(this.x - this.targetX) > speed) {
          this.x += (this.targetX > this.x ? speed : -speed);
        } else {
          this.x = this.targetX;
          this.changeState(PencilState.DRAWING);
        }
      }
    }
  
    draw() {
      ctx.drawImage(this.currentAnimation[this.frameIndex], this.x - 50, this.y, 100, 100);
    }
  
    changeState(newState) {
      this.state = newState;
      this.frameIndex = 0;
      this.frameTimer = 0;
  
      if (newState === PencilState.IDLE) {
        this.currentAnimation = idleFrames;
      } else if (newState === PencilState.DRAWING) {
        this.currentAnimation = drawGunFrames;
        // Trigger attack creation here
        setTimeout(() => {
          spawnGun(this.x);
          this.changeState(PencilState.IDLE);
        }, drawGunFrames.length * this.frameDelay * (1000 / 60)); // Approx duration
      }
    }
  
    startDrawingAtRandomPosition() {
      this.targetX = getRandomX(); // left, center, right
      this.changeState(PencilState.MOVING);
    }
  }

  const activeGuns = [];

function spawnGun(x) {
  activeGuns.push(new GunAttack(x));
}

  class GunAttack {
    constructor(x) {
      this.x = x;
      this.y = 100;
      this.frames = gunAnimationFrames;
      this.frameIndex = 0;
      this.frameDelay = 5;
      this.frameTimer = 0;
      this.active = true;
    }
  
    update() {
      if (!this.active) return;
  
      this.frameTimer++;
      if (this.frameTimer >= this.frameDelay) {
        this.frameTimer = 0;
        this.frameIndex++;
        if (this.frameIndex >= this.frames.length) {
          this.active = false;
          spawnBullets(this.x); // Create actual attack here
        }
      }
    }
  
    draw() {
      if (!this.active) return;
      ctx.drawImage(this.frames[this.frameIndex], this.x - 50, this.y, 100, 100);
    }
  }
  
gameLoop();
