/* ======================
   Full game script (updated: separate Gun/Cannon, X-slash preview, staff 3 layers)
   Replace your current script with this file.
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

/* centralized damage application - ensures death triggers immediately */
function applyDamage(dmg){
  playerHealth = clamp(playerHealth - dmg, 0, MAX_HEALTH);
  if (playerHealth <= 0 && gameState === 'playing') {
    onPlayerDeath();
  }
}

/* ========== Assets ========== */
const assets = {
  pencil: new Image(),
  gun: new Image(),      // original gun image kept
  cannon: new Image(),   // cannon alternative
  rocket: new Image(),   // rockets / cannon bullets
  bullet: new Image(),   // fallback bullets
  staff: new Image(),
  fireball: new Image(),
  sword: new Image(),
  slash: new Image()
};

let assetsReady = false;
let assetsToLoad = Object.keys(assets).length;
function markLoaded(){ if(--assetsToLoad <= 0) assetsReady = true; }

// Update these paths to your real asset files
assets.pencil.src  = 'assets/pencil.png';
assets.gun.src     = 'assets/gun.png';
assets.cannon.src  = 'assets/cannon.png';
assets.rocket.src  = 'assets/rocket.png';
assets.bullet.src  = 'assets/bullet.png';
assets.staff.src   = 'assets/staff.png';
assets.fireball.src= 'assets/fireball.png';
assets.sword.src   = 'assets/sword.png';
assets.slash.src   = 'assets/slash.png';

for (const k in assets){
  assets[k].onload = markLoaded;
  assets[k].onerror = markLoaded; // don't stall on load error
}

/* ========== Game state & config ========== */
let gameState = 'menu'; // 'menu' | 'playing' | 'dead'
const MAX_HEALTH = 100;
const BULLET_DAMAGE = 3;

/* Timer */
let runStartTime = 0;
let lastElapsed = 0;
let finalElapsed = 0;

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
  timeToRamp: 120000,
  tick(dt){
    this.time += dt;
    this.level = Math.min(10, this.time / this.timeToRamp);
  }
};

/* ========== Attacks registry & list ========== */
const attackRegistry = [];
const attacks = [];
function registerAttack(cls){ attackRegistry.push(cls); }
function spawnRandomAttack(x){
  if (attackRegistry.length === 0) return;
  const idx = Math.floor(Math.random() * attackRegistry.length);
  const Cls = attackRegistry[idx];
  const instance = new Cls(x);
  attacks.push(instance);
  return instance;
}

/* ======================
   AttackBase (base class)
   ====================== */
class AttackBase {
  constructor() {
    this.alive = true;
    this.elapsed = 0;
    this.telegraphDuration = 600; // ms default
    this.active = false; // becomes true after telegraphDuration
  }
  update(dt){
    if (!this.alive) return;
    this.elapsed += dt;
    if (!this.active && this.elapsed >= this.telegraphDuration) this.active = true;
  }
  draw(ctx){}
}

/* ========== Bullet class ========== */
class Bullet {
  constructor(x,y, vx,vy) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.radius = 6;
    this.alive = true;
    this.damage = undefined;
    this.sprite = undefined; // optional image
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -50 || this.x > canvas.width+50 || this.y < -50 || this.y > canvas.height+50) this.alive = false;
  }
  draw() {
    if (this.sprite && this.sprite.complete) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);
      const size = Math.max(14, this.radius * 3);
      ctx.drawImage(this.sprite, -size/2, -size/2, size, size);
      ctx.restore();
      return;
    }
    if (assetsReady && assets.bullet.complete) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.beginPath();
      ctx.fillStyle = "#ffd166";
      ctx.arc(0,0,this.radius,0,Math.PI*2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#ffd166";
    ctx.arc(this.x,this.y,this.radius,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

/* ======================
   GunAttack (uses assets.gun)
   ====================== */
class GunAttack extends AttackBase {
  constructor(x, y = Math.max(30, PENCIL_ZONE_HEIGHT - 60)) {
    super();
    this.x = x;
    this.y = Math.min(PENCIL_ZONE_HEIGHT - 20, Math.max(20, y));
    this.scale = 0;

    this.telegraphDuration = 600;
    this.drawDuration = this.telegraphDuration;
    this.elapsed = 0;

    this.shootCount = 3;
    this.shotsFired = 0;
    this.shootInterval = 380;
    this.shootTimer = 0;

    this.postLife = 900;
    this.afterTimer = 0;

    this.bulletSpeed = 0.7; // px/ms (gun bullets slightly faster)
    this.localBullets = [];
  }

  update(dt) {
    if (!this.alive) return;
    super.update(dt);

    if (!this.active) {
      const t = clamp(this.elapsed / this.drawDuration, 0, 1);
      this.scale = Math.min(1.12, (1 - Math.pow(1 - t, 3)));
      return;
    }

    this.shootTimer += dt;
    if (this.shotsFired < this.shootCount && this.shootTimer >= this.shootInterval) {
      this.shootTimer = 0;
      this.fireOneBullet();
      this.shotsFired++;
    }

    for (let b of this.localBullets) b.update(dt);

    if (this.shotsFired >= this.shootCount) {
      this.localBullets = this.localBullets.filter(b => b.alive);
      if (this.localBullets.length === 0) {
        this.afterTimer += dt;
        if (this.afterTimer >= this.postLife) this.alive = false;
      }
    }
  }

  fireOneBullet() {
    const targetX = mouseX;
    const targetY = mouseY;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const mag = Math.hypot(dx, dy) || 1;
    const vx = dx / mag * this.bulletSpeed;
    const vy = dy / mag * this.bulletSpeed;
    const bullet = new Bullet(this.x, this.y, vx, vy);
    bullet.damage = BULLET_DAMAGE;
    bullet.sprite = (assets.bullet && assets.bullet.complete) ? assets.bullet : undefined; // gun uses bullet sprite
    this.localBullets.push(bullet);
    bullets.push(bullet);

    this.scale = 1.25;
    setTimeout(()=> { this.scale = 1; }, 80);
  }

  draw() {
    if (!this.alive) return;

    if (!this.active) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const t = clamp(this.elapsed / this.drawDuration, 0, 1);
      const s = Math.min(1.12, (1 - Math.pow(1 - t, 3)));
      ctx.scale(s, s);
      ctx.fillStyle = "rgba(160,160,160,0.12)";
      roundRect(ctx, -60, -20, 120, 40, 8); ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    if (assetsReady && assets.gun.complete) {
      const w = 120; const h = 56;
      ctx.drawImage(assets.gun, -w/2, -h/2, w, h);
    } else {
      ctx.fillStyle = "#525252";
      roundRect(ctx, -60, -20, 120, 40, 8); ctx.fill();
    }
    ctx.restore();
  }
}
registerAttack(GunAttack);

/* ======================
   CannonAttack (uses assets.cannon + rocket sprite)
   different behavior and visuals from GunAttack
   ====================== */
class CannonAttack extends AttackBase {
  constructor(x, y = Math.max(30, PENCIL_ZONE_HEIGHT - 60)) {
    super();
    this.x = x;
    this.y = Math.min(PENCIL_ZONE_HEIGHT - 20, Math.max(20, y));
    this.scale = 0;

    this.telegraphDuration = 700; // slightly longer telegraph
    this.drawDuration = this.telegraphDuration;
    this.elapsed = 0;

    this.shootCount = 2; // fewer but harder shots
    this.shotsFired = 0;
    this.shootInterval = 650;
    this.shootTimer = 0;

    this.postLife = 900;
    this.afterTimer = 0;

    this.bulletSpeed = 0.55; // rockets slower but heavier
    this.localBullets = [];
  }

  update(dt) {
    if (!this.alive) return;
    super.update(dt);

    if (!this.active) {
      const t = clamp(this.elapsed / this.drawDuration, 0, 1);
      this.scale = Math.min(1.12, (1 - Math.pow(1 - t, 3)));
      return;
    }

    this.shootTimer += dt;
    if (this.shotsFired < this.shootCount && this.shootTimer >= this.shootInterval) {
      this.shootTimer = 0;
      this.fireOneRocket();
      this.shotsFired++;
    }

    for (let b of this.localBullets) b.update(dt);

    if (this.shotsFired >= this.shootCount) {
      this.localBullets = this.localBullets.filter(b => b.alive);
      if (this.localBullets.length === 0) {
        this.afterTimer += dt;
        if (this.afterTimer >= this.postLife) this.alive = false;
      }
    }
  }

  fireOneRocket() {
    const targetX = mouseX;
    const targetY = mouseY;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const mag = Math.hypot(dx, dy) || 1;
    const vx = dx / mag * this.bulletSpeed;
    const vy = dy / mag * this.bulletSpeed;
    const bullet = new Bullet(this.x, this.y, vx, vy);
    bullet.damage = 9; // heavier
    bullet.radius = 8;
    bullet.sprite = (assets.rocket && assets.rocket.complete) ? assets.rocket : (assets.bullet && assets.bullet.complete ? assets.bullet : undefined);
    this.localBullets.push(bullet);
    bullets.push(bullet);

    this.scale = 1.18;
    setTimeout(()=> { this.scale = 1; }, 100);
  }

  draw() {
    if (!this.alive) return;

    if (!this.active) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const t = clamp(this.elapsed / this.drawDuration, 0, 1);
      const s = Math.min(1.12, (1 - Math.pow(1 - t, 3)));
      ctx.scale(s, s);
      ctx.fillStyle = "rgba(180,120,120,0.12)";
      roundRect(ctx, -70, -24, 140, 48, 10); ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    if (assetsReady && assets.cannon.complete) {
      const w = 140; const h = 64;
      ctx.drawImage(assets.cannon, -w/2, -h/2, w, h);
    } else {
      ctx.fillStyle = "#3b3b3b";
      roundRect(ctx, -70, -24, 140, 48, 10); ctx.fill();
    }
    ctx.restore();
  }
}
registerAttack(CannonAttack);

/* ======================
   MortarAttack (kept for variety) - uses explosions
   ====================== */
class Explosion {
  constructor(x,y, radius, damage, life=400){
    this.x = x; this.y = y;
    this.radius = radius;
    this.damage = damage;
    this.elapsed = 0;
    this.life = life;
    this.alive = true;
    this.applied = false;
  }
  update(dt){
    this.elapsed += dt;
    if (this.elapsed >= this.life) this.alive = false;
  }
  draw(){
    const t = this.elapsed / this.life;
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 6 * (1 - t);
    ctx.strokeStyle = `rgba(255,120,40,${1 - t})`;
    ctx.arc(this.x, this.y, this.radius * (0.7 + 0.7 * t), 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }
  applyIfHitPlayer(){
    if (this.applied) return;
    const d = distance(this.x, this.y, mouseX, mouseY);
    if (d <= this.radius + playerRadius) {
      applyDamage(this.damage);
    }
    this.applied = true;
  }
}

class MortarAttack extends AttackBase {
  constructor(x){
    super();
    this.x = x;
    this.targets = [];
    for (let i=0;i<3;i++){
      const rx = clamp(mouseX + (Math.random()*2 - 1) * 180, 40, canvas.width-40);
      const ry = clamp(mouseY + (Math.random()*2 - 1) * 140, PLAY_TOP+40, canvas.height-40);
      this.targets.push({x: rx, y: ry, arrived:false});
    }
    this.telegraphDuration = 900;
    this.rocketSpeed = 0.7 + (0.08 * (difficulty.level || 0));
    this.rockets = [];
    this.explosions = [];
    this.explosionRadius = 64;
    this.damage = 14;
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
        if (distance(r.x,r.y, r.tx, r.ty) <= 8){
          r.done = true;
          const ex = new Explosion(r.tx, r.ty, this.explosionRadius, this.damage, 400);
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
      if (assetsReady && assets.rocket.complete) {
        ctx.translate(r.x, r.y);
        ctx.drawImage(assets.rocket, -8, -8, 16, 16);
      } else {
        ctx.beginPath();
        ctx.fillStyle = "#ff8f3c";
        ctx.arc(r.x, r.y, 7, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
    for (let e of this.explosions) e.draw();
  }
}
registerAttack(MortarAttack);

/* ========== Sword / Slash system (fixed X preview + mid-speed preview) ========== */
class SlashHit {
  constructor(x,y, angle, length, width, life=360, damage=6){
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
          applyDamage(this.damage);
        }
      }
      this.applied = true;
    }
  }
  draw(){
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (assetsReady && assets.slash.complete) {
      ctx.drawImage(assets.slash, -this.length/2, -this.width/2, this.length, this.width);
    } else {
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundRect(ctx, -this.length/2, -this.width/2, this.length, this.width, this.width/2);
      ctx.fill();
    }
    ctx.restore();
  }
}

class SwordAttack extends AttackBase {
  constructor(x){
    super();
    this.x = x;
    // mid-speed telegraph (not too long, not too short)
    this.telegraphDuration = 1000; // middle ground
    this.slashSpots = [];
    for (let i=0;i<3;i++){
      this.slashSpots.push({x: clamp(mouseX + (Math.random()*2-1)*40, 40, canvas.width-40),
                            y: clamp(mouseY + (Math.random()*2-1)*40, PLAY_TOP+40, canvas.height-40)});
    }
    this.phase = 0;
    // timers (a bit faster than previously very long, middle speed)
    this.slashTimers = [200, 360, 520];
    this.slashes = [];
    this.xSlashCreated = false;
    // preview center recorded so X preview exists during telegraph
    this.centerPreview = { x: mouseX, y: mouseY };
  }

  update(dt){
    super.update(dt);
    // update preview center so player sees where the X will be (tracks player a bit)
    if (!this.active){
      // smooth follow so preview isn't jittery
      this.centerPreview.x = lerp(this.centerPreview.x, mouseX, 0.12);
      this.centerPreview.y = lerp(this.centerPreview.y, mouseY, 0.12);
    }

    if (!this.active) return;

    if (this.phase === 0) {
      this.phase = 1;
      this.phaseElapsed = 0;
    } else if (this.phase === 1) {
      this.phaseElapsed += dt;
      for (let i=0;i<this.slashSpots.length;i++){
        if (this.phaseElapsed >= this.slashTimers[i] && !this.slashes[i]){
          const angle = (Math.random()*0.6 - 0.3) + 0; // small variation
          const spot = this.slashSpots[i];
          const s = new SlashHit(spot.x, spot.y, angle, 320, 48, 420, 8);
          this.slashes[i] = s;
        }
      }
      for (let s of this.slashes) if (s) s.update(dt);

      // schedule X-slash a little after the single slashes begin (gives a short preview while active)
      if (this.phaseElapsed >= 640 && !this.xSlashCreated){
        const center = { x: this.centerPreview.x, y: this.centerPreview.y };
        const s1 = new SlashHit(center.x, center.y, Math.PI/4, 380, 40, 520, 12);
        const s2 = new SlashHit(center.x, center.y, -Math.PI/4, 380, 40, 520, 12);
        this.slashes.push(s1, s2);
        this.xSlashCreated = true;
      }
      const alive = this.slashes.some(s => s && s.alive);
      if (!alive && this.slashes.length > 0) this.alive = false;
    }
  }

  draw(){
    if (!this.active){
      // preview for the 3 spots
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
      // preview for the X-slash at centerPreview
      ctx.save();
      ctx.translate(this.centerPreview.x, this.centerPreview.y);
      ctx.rotate(0);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,220,220,0.22)";
      ctx.beginPath(); ctx.moveTo(-40,-40); ctx.lineTo(40,40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-40,40); ctx.lineTo(40,-40); ctx.stroke();
      ctx.restore();
      return;
    }
    for (let s of this.slashes) if (s) s.draw();
  }
}
registerAttack(SwordAttack);

/* ========== Staff Attack (now 3 layers/waves) ========== */
class StaffAttack extends AttackBase {
  constructor(x){
    super();
    this.x = x;
    this.telegraphDuration = 650;
    this.waveDelay = 280;
    this.spawnedWaves = 0;
    this.bulletSpeed = 0.5; // px/ms
    this.numPerWave = 18;
    this.baseDamage = 2;
    this.waveTimer = 0;
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
        this.waveTimer = 0;
      }
    } else if (this.spawnedWaves === 2){
      this.waveTimer += dt;
      if (this.waveTimer >= this.waveDelay){
        this.spawnWave(-5 * Math.PI/180);
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
      b.radius = 6;
      b.damage = this.baseDamage;
      b.sprite = (assets.fireball && assets.fireball.complete) ? assets.fireball : undefined;
      bullets.push(b);
    }
  }

  draw(){
    if (!this.active){
      // intentionally minimal preview
      return;
    }
    ctx.save();
    if (assetsReady && assets.staff.complete) {
      ctx.translate(this.x, PLAY_TOP - 18);
      ctx.drawImage(assets.staff, -40, -20, 80, 40);
    }
    ctx.restore();
  }
}
registerAttack(StaffAttack);

/* ========== Pencil controller (no wavy draw line) ========== */
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

    // removed wavy draw line by design
  }
}

/* ========== Globals & init ========== */
const guns = [];
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
  difficulty.tick(dt);

  if (gameState === 'playing') {
    pencil.update(dt);

    for (let a of attacks) a.update(dt);
    for (let i = attacks.length-1; i>=0; i--) if (!attacks[i].alive) attacks.splice(i,1);

    for (let b of bullets) b.update(dt);

    // collision: bullets -> player (uses bullet.damage if present)
    for (let i = bullets.length-1; i >= 0; i--) {
      const b = bullets[i];
      if (!b.alive) { bullets.splice(i,1); continue; }
      const d = distance(b.x,b.y, mouseX, mouseY);
      if (d <= b.radius + playerRadius) {
        b.alive = false;
        const hitDamage = (b.damage !== undefined) ? b.damage : BULLET_DAMAGE;
        applyDamage(hitDamage);
        bullets.splice(i,1);
        if (gameState === 'dead') { break; }
      }
    }

    for (let i = guns.length-1; i>=0; i--) if (!guns[i].alive) guns.splice(i,1);

    lastElapsed = performance.now() - runStartTime;
  } else {
    pencil.update(dt);
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