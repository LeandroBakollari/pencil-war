// ------------------ setup ------------------
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    PLAY_AREA_BOTTOM = canvas.height;
  }
  window.addEventListener('resize', resize);
  resize();

  // Zones
  const PENCIL_HEIGHT = 160;
  let PLAY_AREA_TOP = PENCIL_HEIGHT;
  let PLAY_AREA_BOTTOM = canvas.height;

  // Player position (dot)
  let mouseX = canvas.width/2;
  let mouseY = (PLAY_AREA_TOP + PLAY_AREA_BOTTOM)/2;
  let running = false;

  canvas.addEventListener('mousemove', (e)=>{
    const rect = canvas.getBoundingClientRect();
    mouseX = Math.max(0, Math.min(e.clientX-rect.left, canvas.width));
    mouseY = Math.max(PLAY_AREA_TOP + 8, Math.min(e.clientY-rect.top, canvas.height-8));
  });

  document.getElementById('startBtn').addEventListener('click', ()=>{
    if(!running){
      running = true;
      startTime = performance.now();
      lastTime = performance.now();
      score = 0;
      pencil.reset();
      activeGuns.length = 0;
      activeBullets.length = 0;
      requestAnimationFrame(loop);
    }
  });

  // Difficulty parameters (can tweak)
  const DIFFICULTY_RAMP = 0.0005; // how fast things speed up

  // ---------- utilities ----------
  function clamp(v,a,b){return Math.max(a, Math.min(b, v));}

  function getRandomX(){
    const options = [canvas.width*0.2, canvas.width*0.5, canvas.width*0.8];
    return options[Math.floor(Math.random()*options.length)];
  }

  // ---------- Game entities ----------
  class EvilPencil{
    constructor(){
      this.x = canvas.width/2;
      this.y = 0;
      this.state = 'idle'; // idle, moving, drawing

      this.targetX = this.x;
      this.moveSpeed = 2; // px per frame (will increase)

      // drawing timings
      this.drawDuration = 1000; // ms it takes to draw the gun
      this.idleCooldown = 700; // ms

      this._timer = 0;
    }

    reset(){
      this.x = canvas.width/2;
      this.state = 'idle';
      this.targetX = this.x;
      this.moveSpeed = 2;
      this.drawDuration = 1000;
      this._timer = 500; // small delay before first move
    }

    update(dt,gameDifficulty){
      // apply difficulty ramp
      this.moveSpeed = 2 + gameDifficulty*4; // from 2 to ~6
      this.drawDuration = 1000 - gameDifficulty*600; // from 1000ms down to ~400ms
      this.drawDuration = Math.max(350, this.drawDuration);
      this._timer += dt;

      if(this.state === 'idle'){
        if(this._timer >= this.idleCooldown){
          this._timer = 0;
          this.targetX = getRandomX();
          this.state = 'moving';
        }
      } else if(this.state === 'moving'){
        // move towards target
        const dx = this.targetX - this.x;
        if(Math.abs(dx) < this.moveSpeed){
          this.x = this.targetX;
          this.state = 'drawing';
          this._timer = 0;
        } else {
          this.x += Math.sign(dx)*this.moveSpeed;
        }
      } else if(this.state === 'drawing'){
        // when drawing finishes -> spawn a gun
        if(this._timer === 0){ /* just started drawing */ }
        this._timer += dt;
        if(this._timer >= this.drawDuration){
          spawnGun(this.x);
          this._timer = 0;
          this.state = 'idle';
        }
      }
    }

    draw(ctx){
      // simple pencil drawing (no sprites) - rotate a little towards target when moving
      ctx.save();
      ctx.translate(this.x, this.y+40);
      // wobble when drawing
      const angle = this.state === 'moving' ? Math.atan2(0, this.targetX - this.x)*0.05 : Math.sin(performance.now()/120)*0.06;
      ctx.rotate(angle);

      // body
      ctx.fillStyle = '#f5d06f';
      ctx.fillRect(-8, -40, 16, 80);
      // tip
      ctx.beginPath();
      ctx.moveTo(8,40);
      ctx.lineTo(0,52);
      ctx.lineTo(-8,40);
      ctx.closePath();
      ctx.fillStyle = '#b5651d';
      ctx.fill();

      // eraser
      ctx.fillStyle = '#e06';
      ctx.fillRect(-8,-40,16,8);
      ctx.restore();

      // zone highlight
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x-60, 0, 120, PENCIL_HEIGHT);
      ctx.restore();
    }
  }

  class GunAttack{
    constructor(x){
      this.x = x;
      this.y = 100;
      this.time = 0;
      this.animDuration = 600; // how long the gun 'winds up' (ms)
      this.shootCount = 3;
      this.shotsFired = 0;
      this.shootInterval = 300; // ms between shots
      this._sinceLastShot = 0;
      this.active = true;
      this.visible = true;
    }

    update(dt){
      if(!this.active) return;
      this.time += dt;

      // during first animDuration it just animates
      if(this.time >= this.animDuration){
        // start firing bullets at intervals
        this._sinceLastShot += dt;
        if(this._sinceLastShot >= this.shootInterval && this.shotsFired < this.shootCount){
          this._sinceLastShot = 0;
          this.shotsFired++;
          // capture player's position at shooting moment
          const target = {x: mouseX, y: mouseY};
          spawnBullet(this.x, this.y+20, target.x, target.y);
        }
        // when all shots fired and bullets are out, deactivate the gun
        if(this.shotsFired >= this.shootCount){
          // give bullets time to travel off-screen
          this.active = false; // gun animation done
        }
      }
    }

    draw(ctx){
      if(!this.visible) return;
      // draw a simple gun: base + barrel and a little charging effect
      ctx.save();
      ctx.translate(this.x, this.y);

      // base
      ctx.fillStyle = '#333';
      ctx.fillRect(-24, -16, 48, 32);

      // barrel extends more as time approaches animDuration
      const t = Math.min(1, this.time / this.animDuration);
      const barrelLen = 30 + t*30;
      ctx.fillStyle = '#555';
      ctx.fillRect(8, -6, barrelLen, 12);

      // muzzle glow when ready
      if(this.time >= this.animDuration){
        const flash = Math.sin(performance.now()/80)*0.5+0.5;
        ctx.globalAlpha = 0.4 + 0.6*flash;
        ctx.fillStyle = '#ffd54a';
        ctx.fillRect(8+barrelLen-6, -10, 12, 20);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }
  }

  class Bullet{
    constructor(x,y,targetX,targetY){
      this.x = x; this.y = y;
      const dx = targetX - x; const dy = targetY - y;
      const dist = Math.hypot(dx,dy) || 1;
      this.vx = (dx/dist) * 4; // speed 4 px/ms -> scaled by dt
      this.vy = (dy/dist) * 4;
      this.radius = 6;
      this.alive = true;
    }
    update(dt){
      this.x += this.vx * dt/16.666; // normalize to approx 60fps baseline
      this.y += this.vy * dt/16.666;
      // kill if out of play area
      if(this.x < -50 || this.x > canvas.width+50 || this.y < -50 || this.y > canvas.height+50) this.alive = false;
    }
    draw(ctx){
      ctx.beginPath();
      ctx.fillStyle = '#ffd54a';
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // ---------- spawners ----------
  const activeGuns = [];
  const activeBullets = [];
  function spawnGun(x){ activeGuns.push(new GunAttack(x)); }
  function spawnBullet(x,y,tx,ty){ activeBullets.push(new Bullet(x,y,tx,ty)); }

  // ---------- game state ----------
  const pencil = new EvilPencil();
  let startTime = 0;
  let lastTime = 0;
  let score = 0;

  // ---------- main loop ----------
  function loop(now){
    if(!running) return;
    const dt = now - lastTime; // ms
    lastTime = now;
    const elapsed = now - startTime;
    const difficulty = elapsed * DIFFICULTY_RAMP; // increases slowly

    // update
    pencil.update(dt, difficulty);
    for(let g of activeGuns) g.update(dt);
    for(let b of activeBullets) b.update(dt);

    // cleanup guns that finished (we keep them briefly to show last frame)
    for(let i=activeGuns.length-1;i>=0;i--){
      if(!activeGuns[i].active) activeGuns.splice(i,1);
    }
    for(let i=activeBullets.length-1;i>=0;i--){
      if(!activeBullets[i].alive) activeBullets.splice(i,1);
    }

    // score as time survived
    score = Math.floor(elapsed/1000);
    document.getElementById('score').textContent = 'Score: ' + score;

    // draw
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawZones();

    // draw player
    drawPlayer();

    // draw pencil and guns
    pencil.draw(ctx);
    for(let g of activeGuns) g.draw(ctx);
    for(let b of activeBullets) b.draw(ctx);

    requestAnimationFrame(loop);
  }

  function drawZones(){
    // pencil zone
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(0,0,canvas.width,PENCIL_HEIGHT);
    // separator
    ctx.strokeStyle = '#8b8b8b'; ctx.beginPath(); ctx.moveTo(0,PENCIL_HEIGHT); ctx.lineTo(canvas.width,PENCIL_HEIGHT); ctx.stroke();
  }

  function drawPlayer(){  
    const r = 10;
    ctx.beginPath(); ctx.fillStyle = '#da0303'; ctx.arc(mouseX, mouseY, r, 0, Math.PI*2); ctx.fill();
    // small shadow
    ctx.beginPath(); ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.ellipse(mouseX+6, mouseY+8, r*0.8, r*0.4, 0, 0, Math.PI*2); ctx.fill();
  }

  // expose reset for start
  pencil.reset();
  
  // initial hint: start when ready