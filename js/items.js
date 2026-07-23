/* ============================================================
 * items.js - 道具系统
 * 每个道具：id / 名称 / 描述 / 颜色 / apply(stats) 修改属性
 * stats 结构见 Player.recomputeStats()
 * ============================================================ */

// 道具定义（被动道具，拾取即生效）
const ITEM_POOL = [
  {
    id: 'sad_onion', name: '悲伤洋葱', desc: '射速提升', color: '#8a5a2a',
    apply(s){ s.fireDelay *= 0.72; }
  },
  {
    id: 'steven', name: '史蒂文', desc: '伤害提升', color: '#c0392b',
    apply(s){ s.damage += 1.5; s.flatDamage += 1.5; }
  },
  {
    id: 'wooden_spoon', name: '木勺', desc: '移速提升', color: '#a0652a',
    apply(s){ s.speed += 0.3; }
  },
  {
    id: 'cat_tails', name: '九尾猫', desc: '弹速+伤害', color: '#7a4a6a',
    apply(s){ s.shotSpeed += 0.4; s.damage += 1; }
  },
  {
    id: 'cupid_arrow', name: '丘比特之箭', desc: '眼泪穿透敌人', color: '#e08aa0',
    apply(s){ s.piercing = true; }
  },
  {
    id: 'mom_lipstick', name: '妈妈的口红', desc: '射程提升', color: '#d05070',
    apply(s){ s.range += 120; }
  },
  {
    id: 'inner_eye', name: '内眼', desc: '三连发，射速变慢', color: '#4a7a9a',
    apply(s){ s.multiShot += 2; s.fireDelay *= 1.55; }
  },
  {
    id: 'twenty_twenty', name: '20/20', desc: '双发眼泪', color: '#3a5a8a',
    apply(s){ s.multiShot += 1; s.fireDelay *= 1.12; }
  },
  {
    id: 'polyphemus', name: '独眼巨人', desc: '巨额伤害，射速大减', color: '#6a3a8a',
    apply(s){ s.damage += 4; s.fireDelay *= 1.6; s.tearScale *= 1.6; }
  },
  {
    id: 'brimstone', name: '硫磺火', desc: '血红贯穿眼泪，伤害提升', color: '#a01010',
    apply(s){ s.damage += 2; s.piercing = true; s.tearColor = '#d02010'; s.tearScale *= 1.25; }
  },
  {
    id: 'small_rock', name: '小石头', desc: '伤害提升，移速下降', color: '#7a7a7a',
    apply(s){ s.damage += 1; s.speed -= 0.15; }
  },
  {
    id: 'sacred_heart', name: '圣心', desc: '眼泪追踪敌人，伤害提升', color: '#f1c40f',
    apply(s){ s.homing = true; s.damage += 2; s.range += 60; }
  },
  {
    id: 'pentagram', name: '五芒星', desc: '伤害提升', color: '#8a2a4a',
    apply(s){ s.damage += 1; }
  },
  {
    id: 'coffee', name: '咖啡', desc: '移速+弹速提升', color: '#5a3a1a',
    apply(s){ s.speed += 0.2; s.shotSpeed += 0.3; }
  },
  {
    id: 'cricket_head', name: '蟋蟀头', desc: '伤害提升', color: '#6a5a2a',
    apply(s){ s.damage += 1.5; }
  },
  {
    id: 'wire_coat_hanger', name: '铁丝衣架', desc: '射速提升', color: '#9a9a9a',
    apply(s){ s.fireDelay *= 0.85; }
  },
];

// 按 id 查找
const ITEM_BY_ID = {};
for (const it of ITEM_POOL) ITEM_BY_ID[it.id] = it;

// 从池子里取一个未被持有的随机道具
function rollItem(ownedIds){
  const avail = ITEM_POOL.filter(it => !ownedIds.has(it.id));
  if (avail.length === 0) return null;
  return choice(avail);
}
