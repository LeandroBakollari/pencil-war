/* ======================
   Full game script (replace current)
   ====================== */

/* ========== Canvas & Resize ========== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

/* ========== Game area constants ========== */
const PENCIL_ZONE_HEIGHT = 200; // top area where pencil wanders
const PLAY_TOP = PENCIL_ZONE_HEIGHT;

/* ========== Input (mouse) ========== */
let mouseX = canvas.width/2;
let mouseY = (PLAY_TOP + canvas.height)/2;
let playerRadius = 10;

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = Math.max(0, Math.min(e.clientX - rect.left, canvas.width));
  mouseY = Math.max(PLAY_TOP, Math.min(e.clientY - rect.top, canvas.height));
});
// clicks used for start & restart
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  if (gameState === 'menu' && pointInRect(cx, cy, startBtnRect())) startGame();
  else if (gameState === 'dead' && pointInRect(cx, cy, restartBtnRect())) restartGame();
});

/* ========== Helpers ========== */
function lerp(a,b,t){ return a + (b-a)*t; }
function distance(ax,ay,bx,by){ return Math.hypot(bx-ax, by-ay); }
function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function pointInRect(px,py, rect){ return px >= rect.x && px <= rect.x+rect.w && py >= rect.y && py <= rect.y+rect.h; }
function fmtTime(ms){
  const s = Math.floor(ms/1000);
  const mm = Math.floor(s/60).toString().padStart(2,'0');
  const ss = (s%60).toString().padStart(2,'0');
  const cs = Math.floor((ms%1000)/10).toString().padStart(2,'0'); // centiseconds
  return `${mm}:${ss}.${cs}`;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

/* ========== Assets ========== */
const assets = {
  pencil: new Image(),
  gun: new Image(),
  bullet: new Image()
};
let assetsReady = false;
let assetsToLoad = 3;
function markLoaded(){ if(--assetsToLoad <= 0) assetsReady = true; }

// <-- update these paths if your assets are elsewhere -->
assets.pencil.src = 'assets/pencil.png';
assets.gun.src    = 'assets/gun.png';
assets.bullet.src = 'assets/bullet.png';

assets.pencil.onload = markLoaded; assets.pencil.onerror = markLoaded;
assets.gun.onload    = markLoaded; assets.gun.onerror    = markLoaded;
assets.bullet.onload = markLoaded; assets.bullet.onerror = markLoaded;

/* ========== Game state & config ========== */
let gameState = 'menu'; // 'menu' | 'playing' | 'dead'
const MAX_HEALTH = 100;
const BULLET_DAMAGE = 3;

/* Timer */
let runStartTime = 0;    // performance.now() when started
let lastElapsed = 0;     // ms for display while playing
let finalElapsed = 0;    // final time shown on death

/* Player health */
let playerHealth = MAX_HEALTH;

/* button geometry helpers */
function startBtnRect(){
  const w = 260, h = 70;
  return { x: (canvas.width-w)/2, y: (canvas.height-h)/2, w, h };
}
function restartBtnRect(){
  const w = 260, h = 70;
  return { x: (canvas.width-w)/2, y: (canvas.height-h)/2, w, h };
}

/* ========== Bullet class ========== */
class Bullet {
  constructor(x,y, vx,vy) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.radius = 6;
    this.alive = true;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -50 || this.x > canvas.width+50 || this.y < -50 || this.y > canvas.height+50) this.alive = false;
  }
  draw() {
    if (assetsReady && assets.bullet.complete) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);
      const size = Math.max(12, this.radius * 3);
      ctx.drawImage(assets.bullet, -size/2, -size/2, size, size);
      ctx.restore();
      return;
    }
    // fallback: circle
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.beginPath();
    ctx.fillStyle = "#ffd166";
    ctx.arc(0,0,this.radius,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath(); ctx.arc(-2,-2,2,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

/* ========== GunAttack ========== */
class GunAttack {
  constructor(x, y = Math.max(30, PENCIL_ZONE_HEIGHT - 60)) {
    this.x = x;
    this.y = Math.min(PENCIL_ZONE_HEIGHT - 20, Math.max(20, y));
    this.scale = 0;
    this.alive = true;

    this.drawDuration = 600;
    this.elapsed = 0;

    this.shootCount = 3;
    this.shotsFired = 0;
    this.shootInterval = 380;
    this.shootTimer = 0;

    this.postLife = 900;
    this.afterTimer = 0;
    this.bulletSpeed = 0.65;

    this.localBullets = [];
  }

  update(dt) {
    if (!this.alive) return;
    this.elapsed += dt;
    if (this.elapsed < this.drawDuration) {
      const t = this.elapsed / this.drawDuration;
      this.scale = Math.min(1.12, (1 - Math.pow(1-t,3)));
    } else {
      this.shootTimer += dt;
      if (this.shotsFired < this.shootCount && this.shootTimer >= this.shootInterval) {
        this.shootTimer = 0;
        this.fireOneBullet();
        this.shotsFired++;
      }
      if (this.shotsFired >= this.shootCount) {
        this.localBullets = this.localBullets.filter(b => b.alive);
        if (this.localBullets.length === 0) {
          this.afterTimer += dt;
          if (this.afterTimer >= this.postLife) this.alive = false;
        }
      }
    }
    for (let b of this.localBullets) b.update(dt);
  }

  fireOneBullet() {
    const targetX = mouseX;
    const targetY = mouseY;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const mag = Math.hypot(dx,dy) || 1;
    const vx = dx / mag * this.bulletSpeed;
    const vy = dy / mag * this.bulletSpeed;
    const bullet = new Bullet(this.x, this.y, vx, vy);
    this.localBullets.push(bullet);
    bullets.push(bullet);
    this.scale = 1.25;
    setTimeout(()=> { this.scale = 1; }, 80);
  }

  draw() {
    if (!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    if (assetsReady && assets.gun.complete) {
      const w = 120; const h = 56;
      ctx.drawImage(assets.gun, -w/2, -h/2, w, h);
    } else {
      ctx.translate(-40, -20);
      ctx.fillStyle = "#525252";
      roundRect(ctx, 0, 0, 100, 40, 8); ctx.fill();
      ctx.fillStyle = "#2b2b2b";
      ctx.fillRect(90, 12, 40, 16);
      ctx.fillStyle = "#6b6b6b";
      ctx.fillRect(8,8,30,24);
      ctx.fillStyle = "#111";
      ctx.fillRect(30, -8, 16, 8);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath(); ctx.ellipse(40,56,48,8,0,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
}

/* ========== Pencil controller ========== */
const PencilState = { IDLE: 'idle', MOVING: 'moving', DRAWING: 'drawing' };

class EvilPencil {
  constructor() {
    this.x = canvas.width/2;
    this.y = 30;
    this.state = PencilState.IDLE;

    this.targetX = this.x;
    this.moveSpeed = 0.22;  // px per ms
    this.drawTime = 900;
    this.frameTimer = 0;
    this.wobble = 0;

    this.idleTimer = 0;
    this.idleDelay = 380;

    this.actionsTaken = 0;
  }

  update(dt) {
    this.wobble += dt * 0.005;

    if (this.state === PencilState.MOVING) {
      const dist = this.targetX - this.x;
      const dir = Math.sign(dist);
      const step = this.moveSpeed * dt;
      if (Math.abs(dist) <= step) {
        this.x = this.targetX;
        this.startDrawing();
      } else {
        this.x += dir * step;
      }
    } else if (this.state === PencilState.IDLE) {
      this.idleTimer += dt;
      // only auto-choose moves when playing
      if (gameState === 'playing' && this.idleTimer >= this.idleDelay) {
        this.idleTimer = 0;
        this.chooseNewTargetAndMove();
      }
    }
  }

  chooseNewTargetAndMove() {
    const margin = Math.max(80, canvas.width * 0.05);
    this.targetX = Math.random() * (canvas.width - margin*2) + margin;
    this.state = PencilState.MOVING;
  }

  startDrawing() {
    this.state = PencilState.DRAWING;
    const finalDrawDuration = Math.max(220, this.drawTime);
    setTimeout(() => {
      // spawn gun only if playing (so pencil won't spawn after death/menu)
      if (gameState === 'playing') {
        const gunY = Math.random() * (PENCIL_ZONE_HEIGHT - 60) + 30;
        const gun = new GunAttack(this.x, gunY);
        guns.push(gun);
        this.actionsTaken++;
        this.speedUp();
      }
      this.state = PencilState.IDLE;
    }, finalDrawDuration);
  }

  speedUp() {
    this.moveSpeed *= 1.012;
    this.drawTime *= 0.997;
    this.idleDelay = Math.max(110, this.idleDelay * 0.997);
  }

  // instruct pencil to move to center & stop spawning (used on death)
  goToCenterAndStop() {
    this.targetX = canvas.width/2;
    this.state = PencilState.MOVING;
    // disable auto-choosing by leaving gameState != 'playing'
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    const wob = Math.sin(this.wobble) * 6;
    ctx.rotate((wob * Math.PI/180) * 0.4);

    if (assetsReady && assets.pencil.complete) {
      const w = 160, h = 48;
      ctx.drawImage(assets.pencil, -w/2, -h/2, w, h);
    } else {
      ctx.fillStyle = "#ffb703";
      roundRect(ctx, -8, -8, 120, 24, 6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(110,4); ctx.lineTo(130,0); ctx.lineTo(110,-4); ctx.closePath();
      ctx.fillStyle = "#8b5e34";
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(130,0); ctx.lineTo(138, -3); ctx.lineTo(138,3); ctx.closePath();
      ctx.fillStyle = "#1d1d1b"; ctx.fill();
      ctx.fillStyle = "#d62828"; ctx.fillRect(-16, -6, 10, 12);
    }
    ctx.restore();

    if (this.state === PencilState.DRAWING) {
      ctx.save();
      ctx.strokeStyle = "#ffffff22";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sx = this.x - 60;
      for (let i=0;i<6;i++){
        const px = sx + i*20;
        const py = PENCIL_ZONE_HEIGHT + 18 + Math.sin((i + Date.now()*0.003))*8;
        ctx.lineTo(px,py);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

/* ========== Globals & init ========== */
const guns = [];
const bullets = [];
const pencil = new EvilPencil();

setTimeout(()=> pencil.chooseNewTargetAndMove(), 600);

/* ========== Game control functions ========== */
function startGame(){
  // starting from menu -> playing
  playerHealth = MAX_HEALTH;
  bullets.length = 0;
  guns.length = 0;
  runStartTime = performance.now();
  lastElapsed = 0;
  finalElapsed = 0;
  gameState = 'playing';
  // ensure pencil is active
  pencil.idleDelay = 380;
  pencil.moveSpeed = 0.22;
  // center player's initial position to mid play area
  mouseX = canvas.width/2;
  mouseY = (PLAY_TOP + canvas.height)/2;
  pencil.chooseNewTargetAndMove();
}

function restartGame(){
  // Called from dead overlay -> immediately start
  playerHealth = MAX_HEALTH;
  bullets.length = 0;
  guns.length = 0;
  runStartTime = performance.now();
  lastElapsed = 0;
  finalElapsed = 0;
  gameState = 'playing';
  // wake pencil back up
  pencil.chooseNewTargetAndMove();
}

/* ========== Main loop ========== */
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(60, now - lastTime); // ms, clamp
  lastTime = now;

  update(dt);
  render();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function update(dt) {
  // state-based updates
  if (gameState === 'playing') {
    pencil.update(dt);
    for (let g of guns) g.update(dt);
    for (let b of bullets) b.update(dt);

    // collision detection: bullets -> player
    for (let i = bullets.length-1; i >= 0; i--) {
      const b = bullets[i];
      if (!b.alive) { bullets.splice(i,1); continue; }
      const d = distance(b.x,b.y, mouseX, mouseY);
      if (d <= b.radius + playerRadius) {
        // hit
        b.alive = false;
        playerHealth = clamp(playerHealth - BULLET_DAMAGE, 0, MAX_HEALTH);
        // remove bullet immediately
        bullets.splice(i,1);
        // check death
        if (playerHealth <= 0) {
          onPlayerDeath();
          break;
        }
      }
    }

    // cleanup dead guns
    for (let i = guns.length-1; i>=0; i--) if (!guns[i].alive) guns.splice(i,1);

    // update lastElapsed (timer for UI)
    lastElapsed = performance.now() - runStartTime;
  } else {
    // if not playing, still update pencil movement if it is moving (we want pencil to move to center on death)
    pencil.update(dt);
    // update remaining bullets/guns visually (we keep them or cleared on death)
    for (let g of guns) g.update(dt);
    for (let b of bullets) b.update(dt);
    for (let i = bullets.length-1; i>=0; i--) if (!bullets[i].alive) bullets.splice(i,1);
    for (let i = guns.length-1; i>=0; i--) if (!guns[i].alive) guns.splice(i,1);
  }
}

/* Called when player health reaches 0 */
function onPlayerDeath(){
  gameState = 'dead';
  finalElapsed = lastElapsed;
  // clear all future spawning: ensure pencil doesn't spawn
  // move pencil to center and stop spawning
  pencil.goToCenterAndStop();
  // clear guns and bullets so it looks tidy (optional)
  guns.length = 0;
  bullets.length = 0;
}

/* ========== Rendering ========== */
function render() {
  ctx.clearRect(0,0,canvas.width, canvas.height);

  // background gradient
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0, '#0b1020'); g.addColorStop(1, '#071022');
  ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);

  // zones
  drawZones();

  // pencil always drawn
  pencil.draw();

  // draw guns & bullets
  for (let g of guns) g.draw();
  for (let b of bullets) b.draw();

  // UI based on state
  if (gameState === 'menu') {
    drawPlayerPreview(); // maybe not visible? user said dot appears only after pressing start; so we won't draw main player dot now
    drawStartButton();
  } else if (gameState === 'playing') {
    drawPlayer(); // show player dot
    drawHealthBar();
    drawTimer(lastElapsed);
  } else if (gameState === 'dead') {
    // Do not draw player dot (they're dead) — show overlay + restart
    drawDeathOverlay(finalElapsed);
  }
}

/* helper draws */
function drawZones(){
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(0,0,PENCIL_ZONE_HEIGHT ? canvas.width : 0, PENCIL_ZONE_HEIGHT);

  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0,PENCIL_ZONE_HEIGHT); ctx.lineTo(canvas.width,PENCIL_ZONE_HEIGHT); ctx.stroke();
}

function drawPlayer(){
  ctx.beginPath();
  ctx.fillStyle = "#da0303";
  ctx.arc(mouseX, mouseY, playerRadius, 0, Math.PI*2); ctx.fill();
  // halo
  ctx.beginPath();
  ctx.strokeStyle = "rgba(218,3,3,0.14)"; ctx.lineWidth = 6;
  ctx.arc(mouseX, mouseY, 16, 0, Math.PI*2); ctx.stroke();
}

function drawPlayerPreview(){
  // center faint dot for the menu preview (optional)
  const px = canvas.width/2, py = (PLAY_TOP + canvas.height)/2;
  ctx.beginPath();
  ctx.fillStyle = "rgba(218,3,3,0.6)";
  ctx.arc(px, py, playerRadius, 0, Math.PI*2); ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = "rgba(218,3,3,0.08)"; ctx.lineWidth = 6;
  ctx.arc(px, py, 16, 0, Math.PI*2); ctx.stroke();
}

function drawHealthBar(){
  const pad = 16;
  const w = 220, h = 18;
  const x = pad, y = pad;
  // background
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, x-4, y-4, w+8, h+8, 6); ctx.fill();

  // outer
  ctx.fillStyle = "#222";
  roundRect(ctx, x, y, w, h, 6); ctx.fill();

  // inner fill
  const pct = playerHealth / MAX_HEALTH;
  ctx.fillStyle = (pct > .5) ? "#3ad76e" : (pct > .2 ? "#ffd166" : "#ff3b3b");
  roundRect(ctx, x+2, y+2, Math.max(0, (w-4) * pct), h-4, 5); ctx.fill();

  // text
  ctx.fillStyle = "#fff";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`HP: ${playerHealth}/${MAX_HEALTH}`, x, y + h + 18);
}

function drawTimer(elapsedMs){
  const pad = 16;
  const text = fmtTime(Math.floor(elapsedMs));
  ctx.font = "18px monospace";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(text, canvas.width - pad, pad + 16);
}

function drawStartButton(){
  const r = startBtnRect();
  // dim stage behind
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.restore();

  // button
  ctx.fillStyle = "#111";
  roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.fill();
  ctx.strokeStyle = "#6b6b6b";
  ctx.lineWidth = 2;
  roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("START", r.x + r.w/2, r.y + r.h/2 + 10);

  // hint
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "14px sans-serif";
  ctx.fillText("Dodge the bullets — move with your mouse", canvas.width/2, r.y + r.h + 36);
}

function drawDeathOverlay(finalMs){
  // dark overlay
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0,0,canvas.width, canvas.height);
  ctx.restore();

  // centered panel
  const w = 420, h = 220;
  const x = (canvas.width - w)/2, y = (canvas.height - h)/2;
  ctx.fillStyle = "#0f1720";
  roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = "#394b59";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 12); ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("You Died", x + w/2, y + 48);

  ctx.font = "18px sans-serif";
  ctx.fillText(`Your time alive: ${fmtTime(Math.floor(finalMs))}`, x + w/2, y + 90);

  // restart button inside panel
  const btn = restartBtnRect();
  const brx = btn.x, bry = btn.y, brw = btn.w, brh = btn.h;
  // draw smaller inside panel (center)
  const innerX = x + (w-brw)/2;
  const innerY = y + h - brh - 22;
  ctx.fillStyle = "#111";
  roundRect(ctx, innerX, innerY, brw, brh, 10); ctx.fill();
  ctx.strokeStyle = "#6b6b6b"; ctx.lineWidth = 1.5;
  roundRect(ctx, innerX, innerY, brw, brh, 10); ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText("RESTART", innerX + brw/2, innerY + brh/2 + 8);
}

/* ========== Utility: keep UI rects synced to canvas center when drawn as panel buttons ========== */
/* we used startBtnRect() and restartBtnRect() which derive from canvas dims */

/* ========== End script ========== */

