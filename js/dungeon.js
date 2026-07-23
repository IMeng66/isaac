/* ============================================================
 * dungeon.js - 随机关卡生成
 * 网格拓扑：从起始房扩张出若干房间，再指定 Boss/宝藏/商店房。
 * ============================================================ */

const GRID = 9;                 // 地牢网格尺寸
const CENTER = Math.floor(GRID / 2);

// 房间类型
const RT = { START:'start', NORMAL:'normal', BOSS:'boss', TREASURE:'treasure', SHOP:'shop' };

// 障碍物类型
const OB = { ROCK:'rock', POOP:'poop', PIT:'pit', BLOCK:'block' };

class Room {
  constructor(gx, gy, type){
    this.gx = gx; this.gy = gy;
    this.type = type;
    this.doors = [false, false, false, false]; // N E S W
    this.obstacles = [];      // {x,y,type,hp} 网格坐标(房间tile系)
    this.enemies = [];        // 运行时生成 {type,x,y}
    this.pickups = [];        // {kind,...}
    this.item = null;         // 宝藏/商店房道具 id
    this.cleared = (type === RT.START);
    this.visited = false;
    this.bossSpawned = false;
  }
  // 门是否相邻（由地牢计算后写入）
  hasDoor(d){ return this.doors[d]; }
}

// 房间 tile 网格尺寸（可玩区域）
const ROOM_TILE_W = Math.floor(PLAY.w / TILE);   // 21
const ROOM_TILE_H = Math.floor(PLAY.h / TILE);   // 11

// tile 网格坐标 -> 世界像素中心
function tileCenter(tx, ty){
  return { x: PLAY.x + tx * TILE + TILE / 2, y: PLAY.y + ty * TILE + TILE / 2 };
}

class Floor {
  constructor(depth){
    this.depth = depth;               // 第几层（1 起）
    this.rooms = [];                  // Room[]
    this.map = Array.from({length: GRID}, () => Array(GRID).fill(null));
    this.startRoom = null;
    this.bossRoom = null;
    this.generate();
  }

  roomAt(gx, gy){
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return null;
    return this.map[gy][gx];
  }

  neighborCount(gx, gy){
    let n = 0;
    for (let d = 0; d < 4; d++){
      if (this.roomAt(gx + DIRV[d].x, gy + DIRV[d].y)) n++;
    }
    return n;
  }

  generate(){
    // 目标房间数（含特殊房），随层数增加
    const target = Math.min(14, 7 + Math.floor(this.depth * 1.5));

    const start = new Room(CENTER, CENTER, RT.START);
    this.addRoom(start);
    this.startRoom = start;

    // 扩张：随机在已有房间旁放新房间（避免制造过多环）
    let guard = 0;
    while (this.rooms.length < target && guard++ < 500){
      const base = choice(this.rooms);
      const d = randInt(0, 3);
      const nx = base.gx + DIRV[d].x, ny = base.gy + DIRV[d].y;
      if (this.roomAt(nx, ny)) continue;
      // 控制密度：新房间已有邻居数不应太多（减少大面积环）
      if (this.neighborCount(nx, ny) >= 2 && chance(0.6)) continue;
      this.addRoom(new Room(nx, ny, RT.NORMAL));
    }

    // 打通门（相邻房间互相开门）
    for (const r of this.rooms){
      for (let d = 0; d < 4; d++){
        if (this.roomAt(r.gx + DIRV[d].x, r.gy + DIRV[d].y)) r.doors[d] = true;
      }
    }

    // 找死胡同（只有 1 个邻居）用于特殊房
    const deadEnds = this.rooms.filter(r => r !== start && this.neighborCount(r.gx, r.gy) === 1);

    // Boss 房：离起始房最远的死胡同
    deadEnds.sort((a, b) =>
      (Math.abs(b.gx - CENTER) + Math.abs(b.gy - CENTER)) -
      (Math.abs(a.gx - CENTER) + Math.abs(a.gy - CENTER)));
    if (deadEnds.length){
      this.bossRoom = deadEnds.shift();
      this.bossRoom.type = RT.BOSS;
    } else {
      // 兜底：离最远的非起始房
      const far = this.rooms.filter(r => r !== start)
        .sort((a,b)=> (Math.abs(b.gx-CENTER)+Math.abs(b.gy-CENTER)) - (Math.abs(a.gx-CENTER)+Math.abs(a.gy-CENTER)))[0];
      far.type = RT.BOSS; this.bossRoom = far;
    }

    // 宝藏房 / 商店房：其余死胡同
    if (deadEnds.length){ deadEnds.shift().type = RT.TREASURE; }
    if (deadEnds.length){ deadEnds.shift().type = RT.SHOP; }
    // 若死胡同不足，随机补一个普通房当宝藏房
    if (!this.rooms.some(r => r.type === RT.TREASURE)){
      const normal = this.rooms.filter(r => r.type === RT.NORMAL);
      if (normal.length) choice(normal).type = RT.TREASURE;
    }

    // 填充每个房间内容
    for (const r of this.rooms) this.populate(r);
  }

  addRoom(r){
    this.rooms.push(r);
    this.map[r.gy][r.gx] = r;
  }

  // 填充障碍与敌人
  populate(room){
    if (room.type === RT.START){ room.cleared = true; return; }

    // 障碍物布局（保证中央与门口可达）
    const layouts = [
      // 空
      [],
      // 四角岩石
      [{x:3,y:2},{x:ROOM_TILE_W-4,y:2},{x:3,y:ROOM_TILE_H-3},{x:ROOM_TILE_W-4,y:ROOM_TILE_H-3}],
      // 中央十字
      [{x:10,y:5},{x:9,y:5},{x:11,y:5},{x:10,y:4},{x:10,y:6}],
      // 两列
      [{x:6,y:3},{x:6,y:4},{x:6,y:6},{x:6,y:7},{x:14,y:3},{x:14,y:4},{x:14,y:6},{x:14,y:7}],
      // 中间一坨便便
      [{x:9,y:4,t:OB.POOP},{x:11,y:4,t:OB.POOP},{x:10,y:5,t:OB.POOP},{x:9,y:6,t:OB.POOP},{x:11,y:6,t:OB.POOP}],
    ];

    if (room.type === RT.NORMAL){
      const layout = choice(layouts);
      for (const o of layout){
        room.obstacles.push({ x:o.x, y:o.y, type: o.t || OB.ROCK, hp: o.t === OB.POOP ? 3 : 999 });
      }
      // 敌人数量随层数
      const count = randInt(2, 3 + Math.min(3, this.depth));
      room.enemies = this.rollEnemies(count);
    }
    else if (room.type === RT.BOSS){
      room.enemies = [{ type: this.bossForDepth(), x: Math.floor(ROOM_TILE_W/2), y: Math.floor(ROOM_TILE_H/2) - 1, boss: true }];
    }
    else if (room.type === RT.TREASURE){
      room.item = true; // 运行时再 roll 具体道具
    }
    else if (room.type === RT.SHOP){
      // 商店：一个道具 + 一些补给（复刻版简化为免费）
      room.item = true;
      room.pickups = [{ kind:'heart' }, { kind:'heart' }];
    }
  }

  rollEnemies(count){
    const list = [];
    // 随层数解锁更强敌人
    const table = ['gaper', 'fly'];
    if (this.depth >= 1) table.push('charger');
    if (this.depth >= 2) table.push('spider', 'shooter');
    if (this.depth >= 3) table.push('knight', 'spitter');
    for (let i = 0; i < count; i++){
      const t = choice(table);
      // 随机位置，避开门口与中心
      const tx = randInt(3, ROOM_TILE_W - 4);
      const ty = randInt(2, ROOM_TILE_H - 3);
      list.push({ type: t, x: tx, y: ty });
    }
    return list;
  }

  bossForDepth(){
    const bosses = ['monstro', 'duke', 'larry'];
    return bosses[(this.depth - 1) % bosses.length];
  }
}
