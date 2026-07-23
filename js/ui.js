/* ============================================================
 * ui.js - 渲染：房间、墙、门、障碍、HUD、小地图、消息
 * ============================================================ */

const DOOR_GAP = 46;         // 门洞半宽

function renderGame(ctx, game){
  ctx.save();
  // 屏幕震动
  if (game.shakeT > 0){
    const m = game.shakeMag * (game.shakeT / 0.3);
    ctx.translate(randRange(-m, m), randRange(-m, m));
  }

  // 背景（房间外纯黑）
  ctx.fillStyle = '#050302';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  drawRoom(ctx, game);

  // 拾取物
  for (const pk of game.pickups) pk.draw(ctx);
  // 眼泪
  for (const t of game.tears) t.draw(ctx);
  // 敌弹
  for (const s of game.enemyShots) s.draw(ctx);
  // 敌人
  for (const e of game.enemies) if (!e.dead) e.draw(ctx);
  // 玩家
  game.player.draw(ctx);
  // 粒子
  for (const pt of game.particles) pt.draw(ctx);

  ctx.restore();

  drawHUD(ctx, game);
  drawMinimap(ctx, game);

  // 中央消息
  if (game.messageT > 0){
    ctx.globalAlpha = clamp(game.messageT, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
    const tw = ctx.measureText(game.message).width + 40;
    ctx.fillRect(VIEW_W/2 - tw/2, ROOM_TOP + 24, tw, 42);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(game.message, VIEW_W/2, ROOM_TOP + 54);
    ctx.globalAlpha = 1;
  }
}

// ---- 房间地板与墙 ----
function drawRoom(ctx, game){
  const room = game.room;
  const open = game.doorsOpen;

  // 地板（地下室米色 + 细纹）
  ctx.fillStyle = '#7a5c3a';
  ctx.fillRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
  // 地板斑点
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < 30; i++){
    const gx = PLAY.x + ((i * 173) % PLAY.w);
    const gy = PLAY.y + ((i * 211) % PLAY.h);
    ctx.fillRect(gx, gy, 14, 14);
  }
  // 地板边框阴影
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 4;
  ctx.strokeRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);

  // 障碍物
  for (const o of game.obstacles){
    if (o.hp <= 0) continue;
    drawObstacle(ctx, o);
  }

  // 四面墙（留门洞）
  drawWalls(ctx, room, open);
}

function drawObstacle(ctx, o){
  const cx = o.x + TILE/2, cy = o.y + TILE/2;
  if (o.type === OB.ROCK){
    blob(ctx, cx, cy, TILE/2 - 3, '#8a8578', '#3a352a', 3);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(cx - 4, cy - 5, 4, 0, Math.PI*2); ctx.fill();
  } else if (o.type === OB.POOP){
    // 便便：堆叠椭圆
    blob(ctx, cx, cy + 5, 12, '#8a5a2a', '#4a2c10', 2.5);
    blob(ctx, cx, cy - 2, 9, '#9a6a35', '#4a2c10', 2.5);
    blob(ctx, cx, cy - 8, 5.5, '#aa7a40', '#4a2c10', 2.5);
  } else if (o.type === OB.PIT){
    ctx.fillStyle = '#000';
    ctx.fillRect(o.x + 2, o.y + 2, TILE - 4, TILE - 4);
    ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 3;
    ctx.strokeRect(o.x + 2, o.y + 2, TILE - 4, TILE - 4);
  } else {
    ctx.fillStyle = '#5a5248'; ctx.fillRect(o.x, o.y, TILE, TILE);
    ctx.strokeStyle = '#2a241c'; ctx.lineWidth = 3; ctx.strokeRect(o.x, o.y, TILE, TILE);
  }
}

function drawWalls(ctx, room, open){
  const cx = VIEW_W/2, cy = ROOM_TOP + (VIEW_H - ROOM_TOP)/2;
  ctx.fillStyle = '#4a3520';         // 墙主体
  const t = WALL;

  // 每条边分两段画，中间留门洞
  // 上墙
  wallSeg(ctx, PLAY.x - t, PLAY.y - t, (cx - DOOR_GAP) - (PLAY.x - t), t);
  wallSeg(ctx, cx + DOOR_GAP, PLAY.y - t, (PLAY.x + PLAY.w + t) - (cx + DOOR_GAP), t);
  // 下墙
  wallSeg(ctx, PLAY.x - t, PLAY.y + PLAY.h, (cx - DOOR_GAP) - (PLAY.x - t), t);
  wallSeg(ctx, cx + DOOR_GAP, PLAY.y + PLAY.h, (PLAY.x + PLAY.w + t) - (cx + DOOR_GAP), t);
  // 左墙
  wallSeg(ctx, PLAY.x - t, PLAY.y - t, t, (cy - DOOR_GAP) - (PLAY.y - t));
  wallSeg(ctx, PLAY.x - t, cy + DOOR_GAP, t, (PLAY.y + PLAY.h + t) - (cy + DOOR_GAP));
  // 右墙
  wallSeg(ctx, PLAY.x + PLAY.w, PLAY.y - t, t, (cy - DOOR_GAP) - (PLAY.y - t));
  wallSeg(ctx, PLAY.x + PLAY.w, cy + DOOR_GAP, t, (PLAY.y + PLAY.h + t) - (cy + DOOR_GAP));

  // 门
  if (room.hasDoor(DIR.N)) drawDoor(ctx, cx, PLAY.y, 'h', open);
  if (room.hasDoor(DIR.S)) drawDoor(ctx, cx, PLAY.y + PLAY.h, 'h', open);
  if (room.hasDoor(DIR.W)) drawDoor(ctx, PLAY.x, cy, 'v', open);
  if (room.hasDoor(DIR.E)) drawDoor(ctx, PLAY.x + PLAY.w, cy, 'v', open);
}

function wallSeg(ctx, x, y, w, h){
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = '#4a3520'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, y, w, Math.min(5, h));
  ctx.strokeStyle = '#241608'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
}

function drawDoor(ctx, x, y, orient, open){
  const w = DOOR_GAP * 2, t = 26;
  ctx.save(); ctx.translate(x, y);
  if (open){
    // 开门：幽黑洞口
    ctx.fillStyle = '#000';
    if (orient === 'h') ctx.fillRect(-w/2, -t/2, w, t);
    else ctx.fillRect(-t/2, -w/2, t, w);
    ctx.strokeStyle = '#6a4a22'; ctx.lineWidth = 3;
    if (orient === 'h') ctx.strokeRect(-w/2, -t/2, w, t);
    else ctx.strokeRect(-t/2, -w/2, t, w);
  } else {
    // 关门：金属栅栏
    ctx.fillStyle = '#3a3f4a';
    if (orient === 'h') ctx.fillRect(-w/2, -t/2, w, t);
    else ctx.fillRect(-t/2, -w/2, t, w);
    ctx.strokeStyle = '#141821'; ctx.lineWidth = 3;
    if (orient === 'h'){ ctx.strokeRect(-w/2, -t/2, w, t);
      for (let i = -2; i <= 2; i++){ ctx.beginPath(); ctx.moveTo(i * w/6, -t/2); ctx.lineTo(i * w/6, t/2); ctx.stroke(); } }
    else { ctx.strokeRect(-t/2, -w/2, t, w);
      for (let i = -2; i <= 2; i++){ ctx.beginPath(); ctx.moveTo(-t/2, i * w/6); ctx.lineTo(t/2, i * w/6); ctx.stroke(); } }
  }
  ctx.restore();
}

// ---- HUD ----
function drawHUD(ctx, game){
  // 顶栏底
  ctx.fillStyle = '#1c120a';
  ctx.fillRect(0, 0, VIEW_W, HUD_H);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, HUD_H - 4, VIEW_W, 4);

  const p = game.player;
  // 红心
  for (let i = 0; i < p.maxHearts / 2; i++){
    const x = 26 + i * 26, y = 22;
    const halves = clamp(p.hearts - i * 2, 0, 2);
    if (halves >= 2) drawHeart(ctx, x, y, 11, '#d02020');
    else if (halves === 1){ drawHeart(ctx, x, y, 11, '#3a2410'); drawHalfHeart(ctx, x, y, '#d02020'); }
    else drawHeart(ctx, x, y, 11, '#3a2410');
  }
  // 魂心
  for (let i = 0; i < p.soulHearts / 2; i++){
    drawHeart(ctx, 26 + (p.maxHearts/2) * 26 + i * 24, 22, 10, '#7ab8e8');
  }

  // 资源：金币
  ctx.font = 'bold 18px monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = '#f1c40f';
  ctx.fillText('¢ ' + p.coins, 20, 54);

  // 属性面板（中右）
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#c8b48a';
  const s = p.stats;
  const statX = 220;
  ctx.fillText(`伤害 ${s.damage.toFixed(1)}`, statX, 22);
  ctx.fillText(`射速 ${(1/s.fireDelay).toFixed(1)}/s`, statX, 40);
  ctx.fillText(`移速 ${s.speed.toFixed(1)}`, statX + 130, 22);
  ctx.fillText(`射程 ${(s.range/40).toFixed(0)}`, statX + 130, 40);
  if (s.multiShot > 1){ ctx.fillStyle = '#7ab8e8'; ctx.fillText(`×${s.multiShot}发`, statX + 250, 22); }
  if (s.piercing){ ctx.fillStyle = '#e08aa0'; ctx.fillText('穿透', statX + 250, 40); }
  if (s.homing){ ctx.fillStyle = '#f1c40f'; ctx.fillText('追踪', statX + 320, 22); }

  // 道具栏（左下，图标点）
  ctx.textAlign = 'left';
  let ix = 20;
  for (const id of p.items){
    const it = ITEM_BY_ID[id];
    ctx.fillStyle = it.color;
    ctx.beginPath(); ctx.arc(ix, VIEW_H - 18, 8, 0, Math.PI*2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#1a0f08'; ctx.stroke();
    ix += 22;
  }
}

function drawHalfHeart(ctx, x, y, color){
  ctx.save(); ctx.beginPath(); ctx.rect(x - 11, y - 11, 11, 22); ctx.clip();
  drawHeart(ctx, x, y, 11, color); ctx.restore();
}

// ---- 小地图 ----
function drawMinimap(ctx, game){
  const cell = 16, pad = 2;
  const ox = VIEW_W - (GRID * (cell + pad)) - 14;
  const oy = 12;
  ctx.globalAlpha = 0.85;
  for (const r of game.floor.rooms){
    if (!r.visited && r.type === RT.NORMAL) continue;  // 未探索普通房不显示
    const x = ox + r.gx * (cell + pad);
    const y = oy + r.gy * (cell + pad);
    // 颜色
    if (r === game.room) ctx.fillStyle = '#ffe9b0';
    else if (r.type === RT.BOSS) ctx.fillStyle = '#c0392b';
    else if (r.type === RT.TREASURE) ctx.fillStyle = '#f1c40f';
    else if (r.type === RT.SHOP) ctx.fillStyle = '#7ab8e8';
    else if (r.cleared) ctx.fillStyle = '#6a5a3a';
    else ctx.fillStyle = '#9a8a68';
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x, y, cell, cell);
  }
  ctx.globalAlpha = 1;
}
