/* ============================================================
 * entities.js - 玩家 / 眼泪 / 敌人 / 拾取物 / 粒子
 * 美术：以撒式 —— 圆润身体 + 粗黑描边 + 简洁配色，全部用 Canvas 绘制
 * ============================================================ */

// ---- 通用绘制：粗描边圆 ----
function blob(ctx, x, y, r, fill, outline = '#1a0f08', lw = 3){
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

/* ============================ 粒子 ============================ */
class Particle {
  constructor(x, y, vx, vy, life, color, size){
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color; this.size = size;
  }
  update(dt){
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 0.92; this.vy *= 0.92;
    this.life -= dt;
  }
  draw(ctx){
    const a = clamp(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * a + 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ============================ 眼泪 ============================ */
class Tear {
  constructor(x, y, vx, vy, opts){
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.speed = opts.speed;               // 标量速度（px/s）
    this.range = opts.range;               // 剩余射程（px）
    this.damage = opts.damage;
    this.radius = 5 * (opts.scale || 1);
    this.piercing = !!opts.piercing;
    this.homing = !!opts.homing;
    this.color = opts.color || '#4a90d0';
    this.dead = false;
    this.hitSet = new Set();               // 穿透时已命中的敌人
  }
  update(dt, game){
    if (this.dead) return;
    // 追踪：微调速度方向
    if (this.homing){
      const t = game.nearestEnemy(this.x, this.y);
      if (t){
        const want = norm(t.x - this.x, t.y - this.y);
        this.vx = lerp(this.vx, want.x, 8 * dt);
        this.vy = lerp(this.vy, want.y, 8 * dt);
        const n = norm(this.vx, this.vy);
        this.vx = n.x; this.vy = n.y;
      }
    }
    const step = this.speed * dt;
    this.x += this.vx * step;
    this.y += this.vy * step;
    this.range -= step;

    if (this.range <= 0){ this.splash(game); this.dead = true; return; }

    // 撞墙
    if (this.x < PLAY.x + this.radius || this.x > PLAY.x + PLAY.w - this.radius ||
        this.y < PLAY.y + this.radius || this.y > PLAY.y + PLAY.h - this.radius){
      this.splash(game); this.dead = true; return;
    }
    // 撞障碍物（便便/岩石挡住眼泪）
    const ob = game.obstacleAtPoint(this.x, this.y);
    if (ob){
      if (ob.type === OB.POOP) ob.hp -= 1;
      this.splash(game); this.dead = true; return;
    }
  }
  splash(game){
    for (let i = 0; i < 5; i++){
      const a = rand() * Math.PI * 2, s = randRange(30, 90);
      game.particles.push(new Particle(this.x, this.y, Math.cos(a)*s, Math.sin(a)*s, 0.25, this.color, 3));
    }
  }
  draw(ctx){
    // 水蓝色眼泪 + 高光 + 描边
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#0e2438'; ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.x - this.radius*0.3, this.y - this.radius*0.3, this.radius*0.35, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  }
}

// 敌方子弹（红色）
class EnemyShot {
  constructor(x, y, vx, vy, speed, damage){
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.speed = speed; this.damage = damage;
    this.radius = 6; this.dead = false; this.life = 6;
  }
  update(dt, game){
    this.x += this.vx * this.speed * dt;
    this.y += this.vy * this.speed * dt;
    this.life -= dt;
    if (this.life <= 0){ this.dead = true; return; }
    if (this.x < PLAY.x || this.x > PLAY.x + PLAY.w ||
        this.y < PLAY.y || this.y > PLAY.y + PLAY.h){ this.dead = true; return; }
  }
  draw(ctx){
    blob(ctx, this.x, this.y, this.radius, '#d03030', '#4a0a0a', 2);
  }
}

/* ============================ 玩家 ============================ */
class Player {
  constructor(x, y){
    this.x = x; this.y = y;
    this.radius = 16;
    this.items = [];                       // 持有的道具 id
    this.itemSet = new Set();
    this.recomputeStats();
    // 生命：3 颗红心 + 0 魂心
    this.maxHearts = 6;                    // 每颗=2半心 -> 6 半心 = 3 心
    this.hearts = 6;
    this.soulHearts = 0;
    this.coins = 0; this.keys = 0; this.bombs = 0;
    this.fireCooldown = 0;
    this.iframes = 0;                      // 无敌时间
    this.faceDir = { x: 0, y: 1 };         // 朝向
    this.shootDir = { x: 0, y: 0 };
    this.walkCycle = 0;
    this.moving = false;
    this.cryT = 0;                         // 流泪动画
  }

  recomputeStats(){
    // 基础属性（还原以撒基准值并映射到像素单位）
    const s = {
      speed: 2.6,             // -> px/s
      damage: 3.5,
      flatDamage: 0,
      fireDelay: 0.42,        // 秒/发（越小射速越快）
      range: 320,             // 眼泪射程 px
      shotSpeed: 3.2,         // 眼泪弹速 -> px/s
      tearScale: 1.0,
      multiShot: 1,
      piercing: false,
      homing: false,
      spectral: false,
      tearColor: '#4a90d0',
      luck: 0,
    };
    for (const id of this.items){
      const it = ITEM_BY_ID[id];
      if (it) it.apply(s);
    }
    // 钳制到合理区间
    s.speed = clamp(s.speed, 0.5, 5.5);
    s.fireDelay = clamp(s.fireDelay, 0.12, 1.2);
    s.shotSpeed = clamp(s.shotSpeed, 1, 10);
    s.range = clamp(s.range, 120, 900);
    s.multiShot = clamp(s.multiShot, 1, 5);
    s.damage = Math.max(0.5, s.damage);
    this.stats = s;
  }

  addItem(id){
    if (this.itemSet.has(id)) return null;
    this.items.push(id);
    this.itemSet.add(id);
    this.recomputeStats();
    return ITEM_BY_ID[id];
  }

  get speedPx(){ return this.stats.speed * 95; }
  get shotPx(){ return this.stats.shotSpeed * 130; }

  heal(half){ this.hearts = clamp(this.hearts + half, 0, this.maxHearts); }

  takeDamage(game){
    if (this.iframes > 0) return;
    if (this.soulHearts > 0) this.soulHearts--;
    else this.hearts -= 2;                 // 一次受击扣一整颗心（2 半心）
    this.iframes = 1.0;
    // 受伤溅血
    for (let i = 0; i < 10; i++){
      const a = rand() * Math.PI * 2, sp = randRange(60, 200);
      game.particles.push(new Particle(this.x, this.y, Math.cos(a)*sp, Math.sin(a)*sp, 0.5, '#c02020', 4));
    }
    if (this.hearts <= 0 && this.soulHearts <= 0){ game.onPlayerDeath(); }
  }

  update(dt, game){
    const mv = Input.moveVec();
    this.moving = (mv.x !== 0 || mv.y !== 0);
    if (this.moving){
      this.walkCycle += dt * 10;
      this.faceDir = { x: mv.x, y: mv.y };
      this.tryMove(mv.x * this.speedPx * dt, mv.y * this.speedPx * dt, game);
    }

    // 射击
    const sv = Input.shootVec();
    if (sv){
      this.shootDir = sv;
      this.cryT = 0.1;
      if (this.fireCooldown <= 0){
        this.fire(game, sv);
        this.fireCooldown = this.stats.fireDelay;
      }
    }
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.iframes > 0) this.iframes -= dt;
    if (this.cryT > 0) this.cryT -= dt;
  }

  tryMove(dx, dy, game){
    // 分轴移动 + 墙体与障碍碰撞
    let nx = this.x + dx;
    nx = clamp(nx, PLAY.x + this.radius, PLAY.x + PLAY.w - this.radius);
    if (!game.circleBlocked(nx, this.y, this.radius, false)) this.x = nx;
    let ny = this.y + dy;
    ny = clamp(ny, PLAY.y + this.radius, PLAY.y + PLAY.h - this.radius);
    if (!game.circleBlocked(this.x, ny, this.radius, false)) this.y = ny;
  }

  fire(game, dir){
    const s = this.stats;
    const n = s.multiShot;
    const spread = 0.16;                   // 多发散射角
    const baseA = Math.atan2(dir.y, dir.x);
    for (let i = 0; i < n; i++){
      const off = (n === 1) ? 0 : (i - (n - 1) / 2) * spread;
      const a = baseA + off;
      game.tears.push(new Tear(
        this.x + Math.cos(a) * 18, this.y + Math.sin(a) * 18 - 6,
        Math.cos(a), Math.sin(a),
        {
          speed: this.shotPx, range: s.range, damage: s.damage,
          scale: s.tearScale, piercing: s.piercing, homing: s.homing, color: s.tearColor,
        }
      ));
    }
    // 发射后坐微粒
    game.particles.push(new Particle(this.x + dir.x*20, this.y + dir.y*20, dir.x*40, dir.y*40, 0.15, '#bfe3ff', 3));
  }

  draw(ctx){
    const s = this.stats;
    // 无敌闪烁
    if (this.iframes > 0 && Math.floor(this.iframes * 20) % 2 === 0){
      ctx.globalAlpha = 0.4;
    }
    const bob = this.moving ? Math.sin(this.walkCycle) * 2 : 0;

    // 身体（裸露小孩，肤色）
    blob(ctx, this.x, this.y + 8 + bob, 12, '#f3c89a', '#1a0f08', 3);
    // 头
    blob(ctx, this.x, this.y - 6 + bob, 15, '#f7d7ab', '#1a0f08', 3);

    // 眼睛（朝射击方向看）
    const ex = this.x + this.shootDir.x * 3, ey = this.y - 8 + bob + this.shootDir.y * 2;
    ctx.fillStyle = '#1a0f08';
    ctx.beginPath(); ctx.arc(ex - 5, ey, 2.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 5, ey, 2.2, 0, Math.PI*2); ctx.fill();

    // 哭泣的眼泪（发射时）
    if (this.cryT > 0){
      ctx.fillStyle = '#7ab8e8';
      ctx.beginPath(); ctx.ellipse(ex - 6, ey + 6, 2, 4, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ex + 6, ey + 6, 2, 4, 0, 0, Math.PI*2); ctx.fill();
    }
    // 圣心天使光环
    if (this.itemSet.has('sacred_heart')){
      ctx.beginPath(); ctx.ellipse(this.x, this.y - 26 + bob, 10, 3.5, 0, 0, Math.PI*2);
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#f1c40f'; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/* ============================ 敌人 ============================ */
const ENEMY_DEFS = {
  gaper:    { hp: 8,  speed: 55,  r: 15, dmg: 1, color: '#d9b48a', name: '裂嘴怪' },
  fly:      { hp: 4,  speed: 120, r: 9,  dmg: 1, color: '#2a2a2a', name: '苍蝇' },
  charger:  { hp: 10, speed: 50,  r: 13, dmg: 1, color: '#b06a3a', name: '冲锋蛆' },
  spider:   { hp: 6,  speed: 95,  r: 11, dmg: 1, color: '#6a4a7a', name: '蜘蛛' },
  shooter:  { hp: 9,  speed: 30,  r: 14, dmg: 1, color: '#8a3a3a', name: '喷吐者' },
  knight:   { hp: 16, speed: 45,  r: 15, dmg: 1, color: '#7a7a8a', name: '骑士' },
  spitter:  { hp: 12, speed: 25,  r: 15, dmg: 1, color: '#3a7a5a', name: '毒痰怪' },
  // Boss
  monstro:  { hp: 90,  speed: 30, r: 40, dmg: 1, color: '#c04040', name: '蒙斯特罗', boss: true },
  duke:     { hp: 120, speed: 40, r: 36, dmg: 1, color: '#4a7a3a', name: '苍蝇公爵', boss: true },
  larry:    { hp: 150, speed: 70, r: 30, dmg: 1, color: '#b04a6a', name: '拉里', boss: true },
};

class Enemy {
  constructor(type, x, y){
    const d = ENEMY_DEFS[type];
    this.type = type; this.def = d;
    this.x = x; this.y = y;
    this.hp = d.hp; this.maxHp = d.hp;
    this.radius = d.r;
    this.speed = d.speed;
    this.boss = !!d.boss;
    this.dead = false;
    this.vx = 0; this.vy = 0;
    this.state = 'idle';
    this.t = 0; this.atkT = randRange(1, 3);
    this.flash = 0;                        // 受击闪白
    this.contactCd = 0;
    this.chargeDir = null;
  }

  hurt(dmg, game){
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 0.12;
    // 溅血
    for (let i = 0; i < 4; i++){
      const a = rand() * Math.PI * 2, sp = randRange(40, 130);
      game.particles.push(new Particle(this.x, this.y, Math.cos(a)*sp, Math.sin(a)*sp, 0.4, '#a01818', 3.5));
    }
    if (this.hp <= 0){
      this.dead = true;
      game.onEnemyKilled(this);
    }
  }

  update(dt, game){
    if (this.dead) return;
    const p = game.player;
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.contactCd > 0) this.contactCd -= dt;
    this.atkT -= dt;

    switch (this.type){
      case 'gaper': this.aiChase(dt, game, 1); break;
      case 'fly':   this.aiFly(dt, game); break;
      case 'charger': this.aiCharger(dt, game); break;
      case 'spider': this.aiSpider(dt, game); break;
      case 'shooter': this.aiShooter(dt, game, 1); break;
      case 'knight': this.aiCharger(dt, game, 1.4); break;
      case 'spitter': this.aiShooter(dt, game, 3); break;
      case 'monstro': this.aiMonstro(dt, game); break;
      case 'duke': this.aiDuke(dt, game); break;
      case 'larry': this.aiLarry(dt, game); break;
    }

    // 位置积分 + 碰撞（墙/障碍/其他敌人分离）
    this.integrate(dt, game);

    // 接触玩家
    if (this.contactCd <= 0 && circleHit(this.x, this.y, this.radius, p.x, p.y, p.radius)){
      p.takeDamage(game);
      this.contactCd = 0.6;
    }
  }

  integrate(dt, game){
    let nx = this.x + this.vx * dt;
    let ny = this.y + this.vy * dt;
    nx = clamp(nx, PLAY.x + this.radius, PLAY.x + PLAY.w - this.radius);
    ny = clamp(ny, PLAY.y + this.radius, PLAY.y + PLAY.h - this.radius);
    // 障碍碰撞（地面敌人被岩石阻挡；苍蝇类可越过）
    const flying = (this.type === 'fly' || this.type === 'duke');
    if (!flying){
      if (!game.circleBlocked(nx, this.y, this.radius, false)) this.x = nx;
      if (!game.circleBlocked(this.x, ny, this.radius, false)) this.y = ny;
    } else { this.x = nx; this.y = ny; }

    // 与其他敌人简单分离
    for (const o of game.enemies){
      if (o === this || o.dead) continue;
      const dd = dist(this.x, this.y, o.x, o.y);
      const min = this.radius + o.radius;
      if (dd < min && dd > 0.01){
        const push = (min - dd) / 2;
        const ux = (this.x - o.x) / dd, uy = (this.y - o.y) / dd;
        this.x += ux * push; this.y += uy * push;
      }
    }
  }

  moveToward(dt, tx, ty, mul = 1){
    const n = norm(tx - this.x, ty - this.y);
    this.vx = n.x * this.speed * mul;
    this.vy = n.y * this.speed * mul;
  }

  // ---- AI 实现 ----
  aiChase(dt, game, mul){ this.moveToward(dt, game.player.x, game.player.y, mul); }

  aiFly(dt, game){
    // 苍蝇快速但带抖动
    const p = game.player;
    const jx = Math.sin(this.t * 9) * 30, jy = Math.cos(this.t * 7) * 30;
    const n = norm(p.x + jx - this.x, p.y + jy - this.y);
    this.vx = n.x * this.speed; this.vy = n.y * this.speed;
  }

  aiCharger(dt, game, mul = 1){
    // 平时慢速徘徊，靠近玩家视线后冲锋
    const p = game.player;
    if (this.state === 'idle'){
      this.vx *= 0.9; this.vy *= 0.9;
      if (this.atkT <= 0){
        const d = dist(this.x, this.y, p.x, p.y);
        if (d < 260){ this.state = 'windup'; this.t = 0; }
        else this.atkT = 0.5;
      }
    } else if (this.state === 'windup'){
      this.vx = 0; this.vy = 0;
      if (this.t > 0.45){
        this.chargeDir = norm(p.x - this.x, p.y - this.y);
        this.state = 'charge'; this.t = 0;
      }
    } else if (this.state === 'charge'){
      this.vx = this.chargeDir.x * this.speed * 4 * mul;
      this.vy = this.chargeDir.y * this.speed * 4 * mul;
      if (this.t > 0.6){ this.state = 'idle'; this.atkT = randRange(1.2, 2.2); }
    }
  }

  aiSpider(dt, game){
    // 蜘蛛：间歇性猛扑
    const p = game.player;
    if (this.state === 'idle'){
      this.vx *= 0.85; this.vy *= 0.85;
      if (this.atkT <= 0){
        const d = dist(this.x, this.y, p.x, p.y);
        if (d < 220){ this.state = 'hop'; this.t = 0;
          const n = norm(p.x - this.x, p.y - this.y);
          this.vx = n.x * this.speed * 3; this.vy = n.y * this.speed * 3;
        } else this.atkT = 0.4;
      }
    } else if (this.state === 'hop'){
      if (this.t > 0.4){ this.state = 'idle'; this.atkT = randRange(0.6, 1.4); }
    }
  }

  aiShooter(dt, game, bullets){
    // 远程怪：保持距离并射红色子弹
    const p = game.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (d < 140) this.moveToward(dt, this.x * 2 - p.x, this.y * 2 - p.y, 0.8);
    else if (d > 220) this.moveToward(dt, p.x, p.y, 0.6);
    else { this.vx *= 0.9; this.vy *= 0.9; }

    if (this.atkT <= 0){
      const base = angleTo(this.x, this.y, p.x, p.y);
      for (let i = 0; i < bullets; i++){
        const a = base + (bullets > 1 ? (i - (bullets-1)/2) * 0.3 : 0);
        game.enemyShots.push(new EnemyShot(this.x, this.y, Math.cos(a), Math.sin(a), 200, 1));
      }
      this.atkT = randRange(1.4, 2.4);
    }
  }

  // ---- Boss ----
  aiMonstro(dt, game){
    // 蒙斯特罗：缓慢逼近，蓄力跳到玩家位置，落地放弹幕 + 偶尔三连散射
    const p = game.player;
    if (this.state === 'idle'){
      this.moveToward(dt, p.x, p.y, 0.7);
      if (this.atkT <= 0){
        if (chance(0.5)){ this.state = 'jump'; this.t = 0; this.jumpFrom = {x:this.x,y:this.y}; this.jumpTo = {x:p.x,y:p.y}; }
        else {
          const base = angleTo(this.x, this.y, p.x, p.y);
          for (let i = 0; i < 8; i++){
            const a = base + (i - 3.5) * 0.22;
            game.enemyShots.push(new EnemyShot(this.x, this.y, Math.cos(a), Math.sin(a), 190, 1));
          }
          this.atkT = randRange(1.6, 2.4);
        }
      }
    } else if (this.state === 'jump'){
      this.vx = 0; this.vy = 0;
      const k = this.t / 0.8;
      this.x = lerp(this.jumpFrom.x, this.jumpTo.x, k);
      this.y = lerp(this.jumpFrom.y, this.jumpTo.y, k) - Math.sin(k * Math.PI) * 90;
      if (k >= 1){
        this.state = 'idle'; this.atkT = randRange(1.4, 2.2);
        for (let i = 0; i < 12; i++){
          const a = (i / 12) * Math.PI * 2;
          game.enemyShots.push(new EnemyShot(this.x, this.y, Math.cos(a), Math.sin(a), 170, 1));
        }
        game.shake(8);
      }
    }
  }

  aiDuke(dt, game){
    // 苍蝇公爵：漂浮，环形弹幕 + 召唤苍蝇
    const p = game.player;
    this.moveToward(dt, p.x, p.y, 0.4);
    if (this.atkT <= 0){
      if (game.enemies.filter(e => !e.dead && e.type === 'fly').length < 4 && chance(0.6)){
        game.spawnEnemy('fly', this.x + randRange(-30,30), this.y + randRange(-30,30));
      } else {
        for (let i = 0; i < 10; i++){
          const a = (i / 10) * Math.PI * 2 + this.t;
          game.enemyShots.push(new EnemyShot(this.x, this.y, Math.cos(a), Math.sin(a), 160, 1));
        }
      }
      this.atkT = randRange(1.6, 2.4);
    }
  }

  aiLarry(dt, game){
    // 拉里：快速冲撞 + 散射
    const p = game.player;
    if (this.state === 'idle'){
      this.moveToward(dt, p.x, p.y, 1);
      if (this.atkT <= 0){ this.state = 'charge'; this.t = 0; this.chargeDir = norm(p.x-this.x, p.y-this.y); }
    } else if (this.state === 'charge'){
      this.vx = this.chargeDir.x * this.speed * 3.2;
      this.vy = this.chargeDir.y * this.speed * 3.2;
      if (this.t > 0.7){
        this.state = 'idle'; this.atkT = randRange(1.2, 2);
        const base = angleTo(this.x, this.y, p.x, p.y);
        for (let i = 0; i < 6; i++){
          const a = base + (i - 2.5) * 0.3;
          game.enemyShots.push(new EnemyShot(this.x, this.y, Math.cos(a), Math.sin(a), 200, 1));
        }
      }
    }
  }

  draw(ctx){
    const d = this.def;
    // 受击闪白
    let fill = d.color;
    if (this.flash > 0) fill = '#ffffff';

    if (this.type === 'fly'){
      // 苍蝇：黑身体 + 翅膀
      blob(ctx, this.x, this.y, this.radius, fill);
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#cfe8ff';
      const w = Math.sin(this.t * 30) * 3;
      ctx.beginPath(); ctx.ellipse(this.x - 7, this.y - 5 - w, 6, 3, -0.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(this.x + 7, this.y - 5 + w, 6, 3, 0.5, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (this.type === 'spider'){
      blob(ctx, this.x, this.y, this.radius, fill);
      ctx.strokeStyle = '#1a0f08'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++){
        const a = (i/4) * Math.PI * 2 + 0.4;
        ctx.beginPath(); ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(a) * (this.radius + 7), this.y + Math.sin(a) * (this.radius + 7)); ctx.stroke();
      }
    } else if (this.type === 'charger'){
      // 蛆：椭圆分节
      ctx.save(); ctx.translate(this.x, this.y);
      const ang = Math.atan2(this.vy, this.vx);
      ctx.rotate(isNaN(ang) ? 0 : ang);
      for (let i = 0; i < 3; i++) blob(ctx, -i * 8, 0, this.radius - i * 2, i === 0 ? '#c07a4a' : fill);
      ctx.restore();
    } else {
      // 默认圆头怪 + 眼睛 + 嘴
      blob(ctx, this.x, this.y, this.radius, fill);
      const lookX = clamp(this.vx * 0.05, -3, 3);
      ctx.fillStyle = '#1a0f08';
      const er = this.radius * 0.16;
      ctx.beginPath(); ctx.arc(this.x - this.radius*0.35 + lookX, this.y - this.radius*0.2, er, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(this.x + this.radius*0.35 + lookX, this.y - this.radius*0.2, er, 0, Math.PI*2); ctx.fill();
      // 裂嘴
      ctx.strokeStyle = '#1a0f08'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(this.x - this.radius*0.3, this.y + this.radius*0.35);
      ctx.lineTo(this.x + this.radius*0.3, this.y + this.radius*0.35); ctx.stroke();
    }

    // Boss 血条
    if (this.boss){
      const w = 200, h = 10;
      const x = VIEW_W/2 - w/2, y = VIEW_H - 30;
      ctx.fillStyle = '#200a0a'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#c02020'; ctx.fillRect(x, y, w * clamp(this.hp / this.maxHp, 0, 1), h);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(d.name, VIEW_W/2, y - 6);
    }
  }
}

/* ============================ 拾取物 ============================ */
class Pickup {
  constructor(kind, x, y, data){
    this.kind = kind;         // 'heart' | 'soul' | 'coin' | 'item'
    this.x = x; this.y = y;
    this.data = data;         // item 时为道具对象
    this.radius = kind === 'item' ? 18 : 11;
    this.t = rand() * 10;
    this.dead = false;
  }
  update(dt, game){
    this.t += dt;
    if (circleHit(this.x, this.y, this.radius + 4, game.player.x, game.player.y, game.player.radius)){
      this.collect(game);
    }
  }
  collect(game){
    const p = game.player;
    if (this.kind === 'heart'){ if (p.hearts >= p.maxHearts) return; p.heal(2); }
    else if (this.kind === 'soul'){ p.soulHearts = Math.min(p.soulHearts + 2, 8); }
    else if (this.kind === 'coin'){ p.coins++; }
    else if (this.kind === 'item'){
      const it = p.addItem(this.data.id);
      game.onItemPicked(this.data);
    }
    this.dead = true;
    game.onPickup(this.kind);
  }
  draw(ctx){
    const bob = Math.sin(this.t * 3) * 2;
    if (this.kind === 'heart'){
      drawHeart(ctx, this.x, this.y + bob, 10, '#d02020');
    } else if (this.kind === 'soul'){
      drawHeart(ctx, this.x, this.y + bob, 10, '#7ab8e8');
    } else if (this.kind === 'coin'){
      blob(ctx, this.x, this.y + bob, 8, '#f1c40f', '#7a5a06', 2);
      ctx.fillStyle = '#7a5a06'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('¢', this.x, this.y + bob + 3);
    } else if (this.kind === 'item'){
      // 道具底座 + 道具图标
      ctx.fillStyle = '#8a8a8a';
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 16, 18, 6, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2; ctx.stroke();
      blob(ctx, this.x, this.y + bob - 4, 14, this.data.color, '#1a0f08', 3);
      // 道具名悬浮
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
      const name = this.data.name;
      const tw = ctx.measureText(name).width + 10;
      ctx.fillRect(this.x - tw/2, this.y - 40 + bob, tw, 16);
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(name, this.x, this.y - 28 + bob);
    }
  }
}

function drawHeart(ctx, x, y, s, color){
  ctx.save(); ctx.translate(x, y); ctx.scale(s/10, s/10);
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-6, -3, -10, 2, 0, 9);
  ctx.bezierCurveTo(10, 2, 6, -3, 0, 3);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#1a0f08'; ctx.stroke();
  ctx.restore();
}
