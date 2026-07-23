/* ============================================================
 * utils.js - 常量、种子随机数、数学工具
 * ============================================================ */

// ---- 画布与房间常量 ----
const VIEW_W = 960;
const VIEW_H = 640;
const HUD_H  = 64;                 // 顶部 HUD 高度
const ROOM_TOP = HUD_H;            // 房间绘制起始 y
const WALL = 48;                   // 墙体厚度
// 房间可玩区域（墙内侧）
const PLAY = {
  x: WALL,
  y: ROOM_TOP + WALL,
  w: VIEW_W - WALL * 2,
  h: (VIEW_H - ROOM_TOP) - WALL * 2,
};

const TILE = 40;                   // 逻辑 tile 尺寸（用于障碍物网格）

// ---- 方向枚举 ----
const DIR = { N: 0, E: 1, S: 2, W: 3 };
const DIRV = [ {x:0,y:-1}, {x:1,y:0}, {x:0,y:1}, {x:-1,y:0} ];
const DIR_NAME = ['N','E','S','W'];
function oppositeDir(d){ return (d + 2) % 4; }

// ---- 种子随机数（mulberry32）----
let _seed = 1337;
function setSeed(s){ _seed = s >>> 0; }
function rand(){
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randRange(a, b){ return a + rand() * (b - a); }
function randInt(a, b){ return Math.floor(randRange(a, b + 1)); } // 含两端
function chance(p){ return rand() < p; }
function choice(arr){ return arr[Math.floor(rand() * arr.length)]; }
function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- 数学工具 ----
function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t){ return a + (b - a) * t; }
function dist(x1, y1, x2, y2){ return Math.hypot(x2 - x1, y2 - y1); }
function len(x, y){ return Math.hypot(x, y); }
function norm(x, y){ const l = len(x, y) || 1; return { x: x / l, y: y / l }; }

// 圆-圆碰撞
function circleHit(ax, ay, ar, bx, by, br){
  const dx = ax - bx, dy = ay - by, r = ar + br;
  return dx * dx + dy * dy <= r * r;
}
// 点是否在矩形内
function pointInRect(px, py, rx, ry, rw, rh){
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}
// 圆与轴对齐矩形碰撞，返回推出向量或 null
function circleRectResolve(cx, cy, cr, rx, ry, rw, rh){
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= cr * cr) return null;
  const d = Math.sqrt(d2) || 0.0001;
  const push = cr - d;
  // 若圆心在矩形内（罕见），沿最近边推出
  if (d2 < 0.0001){
    const left = cx - rx, right = rx + rw - cx, top = cy - ry, bottom = ry + rh - cy;
    const m = Math.min(left, right, top, bottom);
    if (m === left)  return { x: -(left + cr), y: 0 };
    if (m === right) return { x:  (right + cr), y: 0 };
    if (m === top)   return { x: 0, y: -(top + cr) };
    return { x: 0, y: (bottom + cr) };
  }
  return { x: (dx / d) * push, y: (dy / d) * push };
}

// 角度
function angleTo(x1, y1, x2, y2){ return Math.atan2(y2 - y1, x2 - x1); }

// 颜色工具
function rgba(r, g, b, a){ return `rgba(${r|0},${g|0},${b|0},${a})`; }
