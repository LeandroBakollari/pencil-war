/* ======================
   Full game script (replace current) - FIXED
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

/* ========== Difficulty (simple) ========== */
const difficulty = {
  time: 0,
  level: 0,
  // timeToRamp controls how fast difficulty.level grows (ms). larger = slower ramp
  timeToRamp: 120000, // 2 minutes to reach '1' (you can tweak)
  tick(dt){
    this.time += dt;
    this.level = Math.min(10, this.time / this.timeToRamp);
  }
};

/* ========== Attacks system (registry + list) ========== */
const attackRegistry = []; // push classes here
const attacks = []; // ACTIVE attack instances

function registerAttack(cls){ attackRegistry.push(cls); }

// spawn random attack (equal weight)
function spawnRandomAttack(x){
  if (attackRegistry.length === 0) return;
  const idx = Math.floor(Math.random() * attackRegistry.length);
  const Cls = attackRegistry[idx];
  const instance = new Cls(x);
  attacks.push(instance);
  return instance;
}

class AttackBase {
  constructor() {
    this.alive = true;
    this.elapsed = 0;
    this.telegraphDuration = 600; // ms default
    this.active = false; // becomes true after telegraphDuration
  }
  update(dt){
    this.elapsed += dt;
    if (!this.active && this.elapsed >= this.telegraphDuration) this.active = true;
  }
  draw(ctx){}
}

/* ========== Bullet class (MUST be present) ========== */
class Bullet {
  constructor(x,y, vx,vy) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.radius = 6;
    this.alive = true;
    // optional per-bullet damage (default handled in collision)
    // this.damage = undefined;
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

/* ======================
   GunAttack as an AttackBase (telegraph -> shoot -> done)
   ====================== */
class GunAttack extends AttackBase {
  constructor(x, y = Math.max(30, PENCIL_ZONE_HEIGHT - 60)) {
    super();
    this.x = x;
    this.y = Math.min(PENCIL_ZONE_HEIGHT - 20, Math.max(20, y));
    this.scale = 0;

    // timings
    this.telegraphDuration = 600; // show 'draw' before shooting
    this.drawDuration = this.telegraphDuration; // alias for clarity
    this.elapsed = 0;

    // shooting
    this.shootCount = 3;
    this.shotsFired = 0;
    this.shootInterval = 380;
    this.shootTimer = 0;

    // afterlife
    this.postLife = 900;
    this.afterTimer = 0;

    // bullet behavior
    this.bulletSpeed = 0.65; // px/ms
    this.localBullets = [];  // local bullets for this gun (also pushed to global bullets)
  }

  update(dt) {
    if (!this.alive) return;
    super.update(dt); // updates elapsed and sets active

    // animate scale during telegraph/draw
    if (!this.active) {
      const t = clamp(this.elapsed / this.drawDuration, 0, 1);
      // ease out + slight overshoot
      this.scale = Math.min(1.12, (1 - Math.pow(1 - t, 3)));
      return;
    }

    // active (shooting) phase
    this.shootTimer += dt;
    if (this.shotsFired < this.shootCount && this.shootTimer >= this.shootInterval) {
      this.shootTimer = 0;
      this.fireOneBullet();
      this.shotsFired++;
    }

    // update local bullets
    for (let b of this.localBullets) b.update(dt);

    // after firing all, wait for bullets to clear then die after postLife
    if (this.shotsFired >= this.shootCount) {
      this.localBullets = this.localBullets.filter(b => b.alive);
      if (this.localBullets.length === 0) {
        this.afterTimer += dt;
        if (this.afterTimer >= this.postLife) this.alive = false;
      }
    }
  }

  fireOneBullet() {
    // snapshot player position at shot time
    const targetX = mouseX;
    const targetY = mouseY;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const mag = Math.hypot(dx, dy) || 1;
    const vx = dx / mag * this.bulletSpeed;
    const vy = dy / mag * this.bulletSpeed;
    const bullet = new Bullet(this.x, this.y, vx, vy);
    // attach damage per-bullet (defaults used in collision)
    bullet.damage = BULLET_DAMAGE;
    this.localBullets.push(bullet);
    bullets.push(bullet);

    // muzzle flash/pulse
    this.scale = 1.25;
    setTimeout(()=> { this.scale = 1; }, 80);
  }

  draw() {
    if (!this.alive) return;

    // If we're in telegraph (not active) show the pencil-drawing animation (telegraph)
    if (!this.active) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const t = clamp(this.elapsed / this.drawDuration, 0, 1);
      const s = Math.min(1.12, (1 - Math.pow(1 - t, 3)));
      ctx.scale(s, s);
      // draw faint gun preview
      ctx.fillStyle = "rgba(160,160,160,0.12)";
      roundRect(ctx, -60, -20, 120, 40, 8); ctx.fill();
      ctx.restore();
      return;
    }

    // active / shooting: draw gun image or fallback shape
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
registerAttack(GunAttack);

/* ========== Mortar, Sword, Staff attacks (unchanged, but rely on difficulty existing) ========== */

// small Explosion helper
class Explosion {
  constructor(x,y, radius, damage, life=400){
    this.x = x; this.y = y;
    this.radius = radius;
    this.damage = damage;
    this.elapsed = 0;
    this.life = life;
    this.alive = true;
    this.applied = false; // apply damage once
  }
  update(dt){
    this.elapsed += dt;
    if (this.elapsed >= this.life) this.alive = false;
  }
  draw(){
    const t = this.elapsed / this.life;
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 4 * (1 - t);
    ctx.strokeStyle = `rgba(255,120,40,${1 - t})`;
    ctx.arc(this.x, this.y, this.radius * (0.7 + 0.7 * t), 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }
  applyIfHitPlayer(){
    if (this.applied) return;
    const d = distance(this.x, this.y, mouseX, mouseY);
    if (d <= this.radius + playerRadius) {
      playerHealth = clamp(playerHealth - this.damage, 0, MAX_HEALTH);
    }
    this.applied = true;
  }
}

// MortarAttack
class MortarAttack extends AttackBase {
  constructor(x){
    super();
    this.x = x;
    this.targets = [];
    for (let i=0;i<3;i++){
      const rx = clamp(mouseX + (Math.random()*2 - 1) * 160, 40, canvas.width-40);
      const ry = clamp(mouseY + (Math.random()*2 - 1) * 120, PLAY_TOP+40, canvas.height-40);
      this.targets.push({x: rx, y: ry, arrived:false});
    }
    this.telegraphDuration = 900; // show circles longer so player can dodge
    this.rocketSpeed = 0.5 + (0.05 * (difficulty.level || 0)); // px/ms
    this.rockets = [];
    this.explosions = [];
    this.explosionRadius = 48;
    this.damage = 12;
    this.state = 'telegraph';
  }

  update(dt){
    super.update(dt);
    if (!this.active) return;
    if (this.state === 'telegraph'){
      for (let t of this.targets){
        const sx = clamp(this.x + (Math.random()*2 - 1) * 60, 20, canvas.width-20);
        const sy = 10;
        this.rockets.push({x:sx,y:sy, tx:t.x, ty:t.y, done:false});
      }
      this.state = 'launched';
    }

    if (this.state === 'launched'){
      for (let r of this.rockets){
        if (r.done) continue;
        const dx = r.tx - r.x;
        const dy = r.ty - r.y;
        const mag = Math.hypot(dx,dy) || 1;
        const vx = dx / mag * this.rocketSpeed;
        const vy = dy / mag * this.rocketSpeed;
        r.x += vx * dt;
        r.y += vy * dt;
        if (distance(r.x,r.y, r.tx, r.ty) <= 6){
          r.done = true;
          const ex = new Explosion(r.tx, r.ty, this.explosionRadius, this.damage, 500);
          this.explosions.push(ex);
        }
      }
      for (let e of this.explosions) {
        e.update(dt);
        if (!e.applied) e.applyIfHitPlayer();
      }
      this.rockets = this.rockets.filter(r => !r.done);
      this.explosions = this.explosions.filter(e => e.alive);
      if (this.rockets.length === 0 && this.explosions.length === 0) {
        this.alive = false;
      }
    }
  }

  draw(){
    if (!this.active){
      for (let t of this.targets){
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,60,60,0.12)";
        ctx.strokeStyle = "rgba(255,60,60,0.22)";
        ctx.lineWidth = 2;
        ctx.arc(t.x, t.y, this.explosionRadius, 0, Math.PI*2);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      return;
    }
    for (let r of this.rockets){
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.beginPath();
      ctx.fillStyle = "#ff8f3c";
      ctx.arc(0,0,7,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    for (let e of this.explosions) e.draw();
  }
}
registerAttack(MortarAttack);

class SlashHit {
  constructor(x,y, angle, length, width, life=180, damage=6){
    this.x = x; this.y = y; this.angle = angle; this.length = length; this.width = width;
    this.elapsed = 0; this.life = life; this.alive = true; this.damage = damage; this.applied = false;
  }
  update(dt){
    this.elapsed += dt; if (this.elapsed >= this.life) this.alive = false;
    if (!this.applied){
      const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
      const rx = mouseX - this.x, ry = mouseY - this.y;
      const proj = (rx*dx + ry*dy);
      if (proj >= -this.length/2 && proj <= this.length/2){
        const perp = Math.abs(-dy*rx + dx*ry);
        if (perp <= this.width/2 + playerRadius){
          playerHealth = clamp(playerHealth - this.damage, 0, MAX_HEALTH);
        }
      }
      this.applied = true;
    }
  }
  draw(){
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundRect(ctx, -this.length/2, -this.width/2, this.length, this.width, this.width/2);
    ctx.fill();
    ctx.restore();
  }
}

class SwordAttack extends AttackBase {
  constructor(x){
    super();
    this.x = x;
    this.telegraphDuration = 700;
    this.slashSpots = [];
    for (let i=0;i<3;i++){
      this.slashSpots.push({x: clamp(mouseX + (Math.random()*2-1)*40, 40, canvas.width-40),
                            y: clamp(mouseY + (Math.random()*2-1)*40, PLAY_TOP+40, canvas.height-40)});
    }
    this.phase = 0;
    this.slashTimers = [0,120,240];
    this.slashes = [];
    this.xSlashCreated = false;
  }

  update(dt){
    super.update(dt);
    if (!this.active) return;
    if (this.phase === 0) {
      this.phase = 1;
      this.phaseElapsed = 0;
    } else if (this.phase === 1) {
      this.phaseElapsed += dt;
      for (let i=0;i<this.slashSpots.length;i++){
        if (this.phaseElapsed >= this.slashTimers[i] && !this.slashes[i]){
          const angle = (Math.random()*0.6 - 0.3) + Math.atan2(0,1);
          const spot = this.slashSpots[i];
          const s = new SlashHit(spot.x, spot.y, angle, 180, 36, 180, 6);
          this.slashes[i] = s;
        }
      }
      for (let s of this.slashes) if (s) s.update(dt);
      if (this.phaseElapsed >= 420 && !this.xSlashCreated){
        const center = { x: mouseX, y: mouseY };
        const s1 = new SlashHit(center.x, center.y, Math.PI/4, 240, 32, 260, 10);
        const s2 = new SlashHit(center.x, center.y, -Math.PI/4, 240, 32, 260, 10);
        this.slashes.push(s1, s2);
        this.xSlashCreated = true;
      }
      const alive = this.slashes.some(s => s && s.alive);
      if (!alive && this.slashes.length > 0) this.alive = false;
    }
  }

  draw(){
    if (!this.active){
      for (let sp of this.slashSpots){
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.rotate(0.2);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(200,200,255,0.24)";
        ctx.lineWidth = 6;
        ctx.moveTo(-30,0); ctx.lineTo(30,0);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    for (let s of this.slashes) if (s) s.draw();
  }
}
registerAttack(SwordAttack);

class StaffAttack extends AttackBase {
  constructor(x){
    super();
    this.x = x;
    this.telegraphDuration = 650;
    this.waveCount = 0;
    this.waveDelay = 280;
    this.spawnedWaves = 0;
    this.bulletSpeed = 0.5; // px/ms
    this.numPerWave = 18;
    this.baseDamage = 2;
  }

  update(dt){
    super.update(dt);
    if (!this.active) return;

    if (this.spawnedWaves === 0){
      this.spawnWave(0);
      this.spawnedWaves++;
      this.waveTimer = 0;
    } else if (this.spawnedWaves === 1){
      this.waveTimer += dt;
      if (this.waveTimer >= this.waveDelay){
        this.spawnWave(5 * Math.PI/180);
        this.spawnedWaves++;
      }
    } else {
      this.elapsedSinceDone = (this.elapsedSinceDone || 0) + dt;
      if (this.elapsedSinceDone > 500) this.alive = false;
    }
  }

  spawnWave(offsetDeg){
    for (let i=0;i<this.numPerWave;i++){
      const angle = (i / (this.numPerWave - 1)) * Math.PI + offsetDeg;
      const sx = clamp(this.x + (Math.random()*2-1)*30, 20, canvas.width-20);
      const sy = PLAY_TOP - 10;
      const vx = Math.cos(angle) * this.bulletSpeed;
      const vy = Math.sin(angle) * this.bulletSpeed;
      const b = new Bullet(sx, sy, vx, vy);
      b.radius = 5;
      b.damage = this.baseDamage;
      bullets.push(b);
    }
  }

  draw(){
    if (!this.active){
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,140,40,0.18)";
      ctx.lineWidth = 22;
      ctx.arc(this.x, PLAY_TOP + 20, 160, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
      return;
    }
  }
}
registerAttack(StaffAttack);

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
      if (gameState === 'playing') {
        spawnRandomAttack(this.x);
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
const guns = []; // legacy (not actively used now)
const bullets = [];
const pencil = new EvilPencil();

setTimeout(()=> pencil.chooseNewTargetAndMove(), 600);

/* ========== Game control functions ========== */
function startGame(){
  playerHealth = MAX_HEALTH;
  bullets.length = 0;
  guns.length = 0;
  attacks.length = 0;
  difficulty.time = 0; difficulty.level = 0;
  runStartTime = performance.now();
  lastElapsed = 0;
  finalElapsed = 0;
  gameState = 'playing';
  pencil.idleDelay = 380;
  pencil.moveSpeed = 0.22;
  mouseX = canvas.width/2;
  mouseY = (PLAY_TOP + canvas.height)/2;
  pencil.chooseNewTargetAndMove();
}

function restartGame(){
  playerHealth = MAX_HEALTH;
  bullets.length = 0;
  guns.length = 0;
  attacks.length = 0;
  difficulty.time = 0; difficulty.level = 0;
  runStartTime = performance.now();
  lastElapsed = 0;
  finalElapsed = 0;
  gameState = 'playing';
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
  // tick difficulty always (it will only increase while playing because we reset on start)
  difficulty.tick(dt);

  if (gameState === 'playing') {
    pencil.update(dt);

    // update attacks (telegraph and active phases)
    for (let a of attacks) a.update(dt);
    for (let i = attacks.length-1; i>=0; i--) if (!attacks[i].alive) attacks.splice(i,1);

    // update bullets (global projectiles)
    for (let b of bullets) b.update(dt);

    // collision: bullets -> player (uses bullet.damage if present)
    for (let i = bullets.length-1; i >= 0; i--) {
      const b = bullets[i];
      if (!b.alive) { bullets.splice(i,1); continue; }
      const d = distance(b.x,b.y, mouseX, mouseY);
      if (d <= b.radius + playerRadius) {
        b.alive = false;
        const hitDamage = (b.damage !== undefined) ? b.damage : BULLET_DAMAGE;
        playerHealth = clamp(playerHealth - hitDamage, 0, MAX_HEALTH);
        bullets.splice(i,1);
        if (playerHealth <= 0) { onPlayerDeath(); break; }
      }
    }

    // cleanup dead guns (if you still use them anywhere) - optional
    for (let i = guns.length-1; i>=0; i--) if (!guns[i].alive) guns.splice(i,1);

    // timer update
    lastElapsed = performance.now() - runStartTime;
  } else {
    // non-playing: allow pencil to move to center, update visuals only
    pencil.update(dt);

    // update attacks visually so telegraphs or in-flight things still animate
    for (let a of attacks) a.update(dt);
    for (let i = attacks.length-1; i>=0; i--) if (!attacks[i].alive) attacks.splice(i,1);

    for (let b of bullets) b.update(dt);
    for (let i = bullets.length-1; i>=0; i--) if (!bullets[i].alive) bullets.splice(i,1);
    for (let i = guns.length-1; i>=0; i--) if (!guns[i].alive) guns.splice(i,1);
  }
}

/* Called when player health reaches 0 */
function onPlayerDeath(){
  gameState = 'dead';
  finalElapsed = lastElapsed;
  pencil.goToCenterAndStop();
  guns.length = 0;
  bullets.length = 0;
  attacks.length = 0;
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

  // attacks draw their telegraphs and active visuals
  for (let a of attacks) a.draw();

  // pencil always drawn
  pencil.draw();

  // draw guns & bullets (guns array optional — GunAttack now lives in attacks)
  for (let g of guns) g.draw();
  for (let b of bullets) b.draw();

  // UI based on state
  if (gameState === 'menu') {
    drawPlayerPreview();
    drawStartButton();
  } else if (gameState === 'playing') {
    drawPlayer();
    drawHealthBar();
    drawTimer(lastElapsed);
  } else if (gameState === 'dead') {
    drawDeathOverlay(finalElapsed);
  }
}

/* helper draws */
function drawZones(){
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(0,0,canvas.width, PENCIL_ZONE_HEIGHT);

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
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, x-4, y-4, w+8, h+8, 6); ctx.fill();

  ctx.fillStyle = "#222";
  roundRect(ctx, x, y, w, h, 6); ctx.fill();

  const pct = playerHealth / MAX_HEALTH;
  ctx.fillStyle = (pct > .5) ? "#3ad76e" : (pct > .2 ? "#ffd166" : "#ff3b3b");
  roundRect(ctx, x+2, y+2, Math.max(0, (w-4) * pct), h-4, 5); ctx.fill();

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
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.restore();

  ctx.fillStyle = "#111";
  roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.fill();
  ctx.strokeStyle = "#6b6b6b";
  ctx.lineWidth = 2;
  roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("START", r.x + r.w/2, r.y + r.h/2 + 10);

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "14px sans-serif";
  ctx.fillText("Dodge the bullets — move with your mouse", canvas.width/2, r.y + r.h + 36);
}

function drawDeathOverlay(finalMs){
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0,0,canvas.width, canvas.height);
  ctx.restore();

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

  const btn = restartBtnRect();
  const brw = btn.w, brh = btn.h;
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

/* ========== End script ========== */
