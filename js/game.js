/* ============================================================
 * game.js - 游戏状态、房间管理、碰撞、流程控制
 * ============================================================ */

const FINAL_DEPTH = 3;        // 总层数，击败第 3 层 Boss 通关

class Game {
  constructor(){
    this.state = 'title';
    this.tears = []; this.enemyShots = []; this.enemies = [];
    this.pickups = []; this.particles = [];
    this.shakeT = 0; this.shakeMag = 0;
    this.message = ''; this.messageT = 0;
    this.frame = 0;
  }

  newGame(seed){
    setSeed(seed);
    this.player = new Player(VIEW_W/2, ROOM_TOP + (VIEW_H - ROOM_TOP)/2);
    this.depth = 0;
    this.kills = 0; this.roomsCleared = 0; this.itemsTaken = 0;
    this.timeStart = performance.now();
    this.loadFloor(1);
    this.state = 'playing';
    this.message = '第 1 层'; this.messageT = 2;
  }

  loadFloor(depth){
    this.depth = depth;
    this.floor = new Floor(depth);
    this.enterRoom(this.floor.startRoom, -1);
  }

  // 进入房间；fromDir = 玩家来的方向（即从哪个门进来），-1 表示直接刷新到中央
  enterRoom(room, fromDir){
    this.room = room;
    room.visited = true;
    this.tears.length = 0; this.enemyShots.length = 0; this.particles.length = 0;

    // 摆放玩家
    const cx = VIEW_W/2, cy = ROOM_TOP + (VIEW_H - ROOM_TOP)/2;
    if (fromDir === -1){ this.player.x = cx; this.player.y = cy; }
    else {
      const enter = oppositeDir(fromDir);      // 从对面门进来
      const inset = 70;
      if (enter === DIR.N){ this.player.x = cx; this.player.y = PLAY.y + inset; }
      if (enter === DIR.S){ this.player.x = cx; this.player.y = PLAY.y + PLAY.h - inset; }
      if (enter === DIR.W){ this.player.x = PLAY.x + inset; this.player.y = cy; }
      if (enter === DIR.E){ this.player.x = PLAY.x + PLAY.w - inset; this.player.y = cy; }
    }

    // 生成房间内容
    this.enemies.length = 0; this.pickups.length = 0;
    this.buildObstacles(room);

    if (!room.cleared){
      for (const e of room.enemies){
        const c = tileCenter(e.x, e.y);
        this.spawnEnemy(e.type, c.x, c.y);
      }
    }
    // 宝藏/商店房道具
    if ((room.type === RT.TREASURE || room.type === RT.SHOP) && room.item === true && !room.itemTaken){
      const it = rollItem(this.player.itemSet);
      if (it){
        const c = tileCenter(Math.floor(ROOM_TILE_W/2), Math.floor(ROOM_TILE_H/2));
        this.pickups.push(new Pickup('item', c.x, c.y, it));
      }
    }
    // 商店补给
    if (room.type === RT.SHOP && !room.shopStocked){
      room.shopStocked = true;
      this.pickups.push(new Pickup('heart', cx - 120, cy, null));
      this.pickups.push(new Pickup('soul', cx + 120, cy, null));
      this.pickups.push(new Pickup('coin', cx - 120, cy + 50, null));
      this.pickups.push(new Pickup('coin', cx + 120, cy + 50, null));
    }
    // 已清房保留掉落拾取物？简化：清过的房间不重生
  }

  buildObstacles(room){
    this.obstacles = room.obstacles.map(o => ({
      x: PLAY.x + o.x * TILE, y: PLAY.y + o.y * TILE, w: TILE, h: TILE,
      type: o.type, hp: o.hp, ref: o,
    }));
  }

  spawnEnemy(type, x, y){
    const e = new Enemy(type, x, y);
    this.enemies.push(e);
    return e;
  }

  // ---- 碰撞查询 ----
  // 移动阻挡（isFlying 时忽略岩石与坑）
  circleBlocked(x, y, r, isFlying){
    for (const o of this.obstacles){
      if (o.hp <= 0) continue;
      if (isFlying && (o.type === OB.ROCK || o.type === OB.PIT)) continue;
      if (circleRectResolve(x, y, r, o.x, o.y, o.w, o.h)) return true;
    }
    return false;
  }
  // 眼泪命中障碍（岩石/便便/方块挡眼泪，坑不挡）
  obstacleAtPoint(x, y){
    for (const o of this.obstacles){
      if (o.hp <= 0) continue;
      if (o.type === OB.PIT) continue;
      if (pointInRect(x, y, o.x, o.y, o.w, o.h)) return o;
    }
    return null;
  }

  nearestEnemy(x, y){
    let best = null, bd = 1e9;
    for (const e of this.enemies){
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < bd){ bd = d; best = e; }
    }
    return best;
  }

  shake(m){ this.shakeMag = m; this.shakeT = 0.3; }

  get doorsOpen(){
    return !this.enemies.some(e => !e.dead);
  }

  // ---- 主更新 ----
  update(dt){
    if (this.state !== 'playing') return;
    this.frame++;
    if (this.messageT > 0) this.messageT -= dt;
    if (this.shakeT > 0) this.shakeT -= dt;

    this.player.update(dt, this);

    // 敌人
    for (const e of this.enemies) e.update(dt, this);
    this.enemies = this.enemies.filter(e => !e._remove);

    // 眼泪
    for (const t of this.tears){
      t.update(dt, this);
      if (t.dead) continue;
      for (const e of this.enemies){
        if (e.dead) continue;
        if (t.hitSet.has(e)) continue;
        if (circleHit(t.x, t.y, t.radius, e.x, e.y, e.radius)){
          e.hurt(t.damage, this);
          t.hitSet.add(e);
          if (!t.piercing){ t.dead = true; t.splash(this); }
          break;
        }
      }
    }
    this.tears = this.tears.filter(t => !t.dead);

    // 敌方子弹
    for (const s of this.enemyShots){
      s.update(dt, this);
      if (s.dead) continue;
      if (circleHit(s.x, s.y, s.radius, this.player.x, this.player.y, this.player.radius)){
        this.player.takeDamage(this); s.dead = true;
      }
    }
    this.enemyShots = this.enemyShots.filter(s => !s.dead);

    // 拾取物
    for (const pk of this.pickups) pk.update(dt, this);
    this.pickups = this.pickups.filter(p => !p.dead);

    // 便便销毁
    for (const o of this.obstacles){
      if (o.type === OB.POOP && o.hp <= 0 && !o._gone){
        o._gone = true; o.ref.hp = 0;
        for (let i = 0; i < 6; i++){
          const a = rand()*Math.PI*2, sp = randRange(30,100);
          this.particles.push(new Particle(o.x+TILE/2, o.y+TILE/2, Math.cos(a)*sp, Math.sin(a)*sp, 0.4, '#8a5a2a', 4));
        }
      }
    }

    // 粒子
    for (const pt of this.particles) pt.update(dt);
    this.particles = this.particles.filter(p => p.life > 0);

    // 清房判定
    if (!this.room.cleared && this.doorsOpen){
      this.room.cleared = true;
      this.roomsCleared++;
      this.onRoomCleared();
    }

    // 门过渡
    this.checkDoorTransition();
  }

  onRoomCleared(){
    this.shake(4);
    // 清房奖励（概率掉落）
    if (this.room.type === RT.NORMAL){
      const cx = VIEW_W/2, cy = ROOM_TOP + (VIEW_H - ROOM_TOP)/2;
      const roll = rand();
      if (roll < 0.18) this.pickups.push(new Pickup('heart', cx, cy, null));
      else if (roll < 0.34) this.pickups.push(new Pickup('coin', cx, cy, null));
      else if (roll < 0.40) this.pickups.push(new Pickup('soul', cx, cy, null));
    }
    // Boss 房：掉道具 + 通往下层的活板门
    if (this.room.type === RT.BOSS){
      const cx = VIEW_W/2, cy = ROOM_TOP + (VIEW_H - ROOM_TOP)/2;
      const it = rollItem(this.player.itemSet);
      if (it) this.pickups.push(new Pickup('item', cx - 60, cy, it));
      this.pickups.push(new Pickup('heart', cx + 60, cy + 40, null));
      // 活板门
      if (this.depth < FINAL_DEPTH){
        this.pickups.push(new Pickup('trapdoor', cx + 70, cy, null));
        this.showMessage('Boss 已击败！跳入活板门前往下一层');
      } else {
        this.showMessage('最终 Boss 已击败！');
        this.win();
      }
    } else {
      this.showMessage('房间已清理');
    }
  }

  checkDoorTransition(){
    if (!this.doorsOpen) return;
    const p = this.player, r = this.room;
    const cx = VIEW_W/2, cy = ROOM_TOP + (VIEW_H - ROOM_TOP)/2;
    const gap = 46;
    const mv = Input.moveVec();
    let go = -1;
    if (r.hasDoor(DIR.N) && p.y - p.radius <= PLAY.y + 1 && Math.abs(p.x - cx) < gap && mv.y < 0) go = DIR.N;
    else if (r.hasDoor(DIR.S) && p.y + p.radius >= PLAY.y + PLAY.h - 1 && Math.abs(p.x - cx) < gap && mv.y > 0) go = DIR.S;
    else if (r.hasDoor(DIR.W) && p.x - p.radius <= PLAY.x + 1 && Math.abs(p.y - cy) < gap && mv.x < 0) go = DIR.W;
    else if (r.hasDoor(DIR.E) && p.x + p.radius >= PLAY.x + PLAY.w - 1 && Math.abs(p.y - cy) < gap && mv.x > 0) go = DIR.E;

    if (go >= 0){
      const nr = this.floor.roomAt(r.gx + DIRV[go].x, r.gy + DIRV[go].y);
      if (nr){
        this.enterRoom(nr, go);
        if (nr.type === RT.BOSS && !nr.cleared){ this.showMessage('BOSS 战！'); this.shake(6); }
      }
    }
  }

  onEnemyKilled(e){
    this.kills++;
    this.shake(e.boss ? 10 : 2);
    // 大爆血
    const n = e.boss ? 30 : 12;
    for (let i = 0; i < n; i++){
      const a = rand()*Math.PI*2, sp = randRange(50, 260);
      this.particles.push(new Particle(e.x, e.y, Math.cos(a)*sp, Math.sin(a)*sp, 0.6, '#a01818', 4.5));
    }
    // 普通怪小概率掉落
    if (!e.boss && chance(0.12)){
      this.pickups.push(new Pickup(chance(0.7) ? 'coin' : 'heart', e.x, e.y, null));
    }
    // 标记尸体移除
    e._remove = true;
  }

  onPickup(kind){
    if (kind === 'coin') this.player.coins++;
  }

  onItemPicked(item){
    this.itemsTaken++;
    this.showMessage(`获得道具：${item.name} — ${item.desc}`);
    // 宝藏/商店房标记已取
    if (this.room.type === RT.TREASURE || this.room.type === RT.SHOP) this.room.itemTaken = true;
  }

  showMessage(txt){ this.message = txt; this.messageT = 2.2; }

  onPlayerDeath(){
    this.state = 'gameover';
    const t = Math.floor((performance.now() - this.timeStart)/1000);
    document.getElementById('death-cause').textContent =
      `坚持到第 ${this.depth} 层 · 击杀 ${this.kills} · 道具 ${this.itemsTaken} · ${t}s`;
    setTimeout(() => document.getElementById('gameover-screen').classList.remove('hidden'), 600);
  }

  win(){
    this.state = 'win';
    const t = Math.floor((performance.now() - this.timeStart)/1000);
    document.getElementById('win-stats').textContent =
      `击杀 ${this.kills} · 清理房间 ${this.roomsCleared} · 道具 ${this.itemsTaken} · 用时 ${t}s`;
    setTimeout(() => document.getElementById('win-screen').classList.remove('hidden'), 600);
  }

  // 活板门下层（由拾取触发）
  descend(){
    if (this.depth < FINAL_DEPTH){
      this.loadFloor(this.depth + 1);
      this.showMessage(`第 ${this.depth} 层`);
    }
  }
}

// trapdoor 作为特殊拾取处理：扩展 Pickup.collect
const _origCollect = Pickup.prototype.collect;
Pickup.prototype.collect = function(game){
  if (this.kind === 'trapdoor'){ this.dead = true; game.descend(); return; }
  _origCollect.call(this, game);
};
// trapdoor 绘制
const _origDraw = Pickup.prototype.draw;
Pickup.prototype.draw = function(ctx){
  if (this.kind === 'trapdoor'){
    const bob = Math.sin(this.t * 3) * 1.5;
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(this.x - 22, this.y - 16 + bob, 44, 32);
    ctx.strokeStyle = '#1a0f08'; ctx.lineWidth = 3;
    ctx.strokeRect(this.x - 22, this.y - 16 + bob, 44, 32);
    ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(this.x - 22, this.y + bob); ctx.lineTo(this.x + 22, this.y + bob); ctx.stroke();
    ctx.fillStyle = '#d8c9a3'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('下层', this.x, this.y - 24 + bob);
    return;
  }
  _origDraw.call(this, ctx);
};
