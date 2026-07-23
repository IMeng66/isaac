/* Playwright 自动试玩与回归验证 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOTS = path.join(__dirname, '..', 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const GAME_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

let failures = 0;
function check(name, cond, extra = ''){
  if (cond) console.log(`  ✅ PASS  ${name}`);
  else { console.log(`  ❌ FAIL  ${name}  ${extra}`); failures++; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 980, height: 680 } });
  page.on('pageerror', e => { console.log('  💥 页面错误:', e.message); failures++; });
  page.on('console', m => { if (m.type() === 'error') console.log('  ⚠️ console:', m.text()); });

  await page.goto(GAME_URL);
  await sleep(400);

  console.log('\n[A] 标题界面');
  check('标题界面可见', await page.isVisible('#title-screen'));
  check('画布存在', await page.isVisible('#game'));
  await page.screenshot({ path: path.join(SHOTS, '01-title.png') });

  // 开始游戏（固定种子）
  await page.evaluate(() => window.__start(12345));
  await sleep(300);

  console.log('\n[B] 初始状态');
  let st = await page.evaluate(() => {
    const g = window.__game;
    return { state: g.state, px: g.player.x, py: g.player.y, hearts: g.player.hearts,
             enemies: g.enemies.length, doorsOpen: g.doorsOpen, roomType: g.room.type,
             damage: g.player.stats.damage, depth: g.depth };
  });
  check('进入 playing 状态', st.state === 'playing', st.state);
  check('起始房无敌人', st.enemies === 0, `enemies=${st.enemies}`);
  check('起始房门开放', st.doorsOpen === true);
  check('玩家满血(6半心)', st.hearts === 6, `hearts=${st.hearts}`);
  check('基础伤害3.5', Math.abs(st.damage - 3.5) < 0.01, `damage=${st.damage}`);
  await page.screenshot({ path: path.join(SHOTS, '02-start-room.png') });

  console.log('\n[C] 移动（WASD）');
  const x0 = st.px;
  await page.keyboard.down('d');
  await sleep(400);
  await page.keyboard.up('d');
  st = await page.evaluate(() => ({ px: window.__game.player.x }));
  check('按 D 向右移动', st.px > x0 + 30, `dx=${(st.px - x0).toFixed(1)}`);

  console.log('\n[D] 墙壁碰撞钳制');
  await page.keyboard.down('a'); await sleep(2000); await page.keyboard.up('a');
  st = await page.evaluate(() => ({ px: window.__game.player.x, r: window.__game.player.radius, PLAY: window.__game && undefined }));
  const PLAYX = await page.evaluate(() => 48); // WALL=48
  check('左移被墙挡住', st.px >= PLAYX + 16 - 1, `px=${st.px.toFixed(1)}`);

  console.log('\n[E] 射击（方向键）生成眼泪');
  await page.keyboard.down('ArrowRight');
  await sleep(150);
  const tearsFired = await page.evaluate(() => window.__game.tears.length);
  await page.keyboard.up('ArrowRight');
  check('产生眼泪弹道', tearsFired > 0, `tears=${tearsFired}`);

  console.log('\n[F] 战斗：进入有敌人的房间');
  // 直接切到一个普通房验证战斗与门闭合
  await page.evaluate(() => {
    const g = window.__game;
    const normal = g.floor.rooms.find(r => r.type === 'normal');
    g.enterRoom(normal, -1);
  });
  await sleep(200);
  st = await page.evaluate(() => {
    const g = window.__game;
    return { enemies: g.enemies.filter(e => !e.dead).length, doorsOpen: g.doorsOpen, cleared: g.room.cleared };
  });
  check('房间有敌人', st.enemies > 0, `enemies=${st.enemies}`);
  check('有敌人时门关闭', st.doorsOpen === false);
  await page.screenshot({ path: path.join(SHOTS, '03-combat-room.png') });

  // 真实射击击杀：提高伤害+血量(防测试期死亡)，逐帧与敌人对齐后真实射击
  console.log('\n[G] 真实射击消灭敌人');
  await page.evaluate(() => {
    const g = window.__game;
    g.player.stats.damage = 50;              // 一发击杀
    g.player.maxHearts = 999; g.player.hearts = 999;  // 测试期不死亡
  });
  for (let i = 0; i < 50; i++){
    const info = await page.evaluate(() => {
      const g = window.__game;
      const alive = g.enemies.filter(e => !e.dead);
      if (alive.length === 0) return { done: true };
      const p = g.player, e = alive[0];
      // 模拟高手走位：把玩家移到与敌人同一水平线、相距140px 的左侧
      p.x = Math.max(48 + p.radius, Math.min(48 + (960 - 96) - p.radius, e.x - 140));
      p.y = Math.max(112 + p.radius, Math.min(112 + (640 - 112 - 96) - p.radius, e.y));
      return { done: false, ex: e.x, px: p.x };
    });
    if (info.done) break;
    const dir = info.ex > info.px ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(dir); await sleep(110); await page.keyboard.up(dir);
  }
  await sleep(300);
  st = await page.evaluate(() => {
    const g = window.__game;
    return { alive: g.enemies.filter(e => !e.dead).length, cleared: g.room.cleared, doorsOpen: g.doorsOpen };
  });
  check('敌人被消灭', st.alive === 0, `alive=${st.alive}`);
  check('清房后门打开', st.doorsOpen === true);
  check('房间标记为已清理', st.cleared === true);
  await page.screenshot({ path: path.join(SHOTS, '04-room-cleared.png') });

  console.log('\n[H] 道具拾取改变属性');
  const before = await page.evaluate(() => {
    const g = window.__game;
    // 在玩家脚下放一个伤害道具
    const it = ITEM_BY_ID['steven'];
    g.pickups.push(new Pickup('item', g.player.x, g.player.y, it));
    return { dmg: g.player.stats.damage, items: g.player.items.length };
  });
  await sleep(300);
  const after = await page.evaluate(() => {
    const g = window.__game;
    return { dmg: g.player.stats.damage, items: g.player.items.length, base: 3.5 };
  });
  check('拾取后道具数+1', after.items === before.items + 1, `items=${after.items}`);
  check('伤害随道具提升(3.5→5)', Math.abs(after.dmg - 5) < 0.01 && after.dmg > after.base, `dmg=${after.dmg}`);

  console.log('\n[I] Boss 战与下层');
  await page.evaluate(() => {
    const g = window.__game;
    g.enterRoom(g.floor.bossRoom, -1);
  });
  await sleep(200);
  st = await page.evaluate(() => {
    const g = window.__game;
    return { boss: g.enemies.some(e => e.boss && !e.dead), doorsOpen: g.doorsOpen };
  });
  check('Boss 已生成', st.boss === true);
  check('Boss 房门关闭', st.doorsOpen === false);
  await page.screenshot({ path: path.join(SHOTS, '05-boss.png') });

  // 击杀 Boss
  await page.evaluate(() => {
    const g = window.__game;
    g.enemies.forEach(e => e.hurt(9999, g));
  });
  await sleep(300);
  st = await page.evaluate(() => {
    const g = window.__game;
    return { cleared: g.room.cleared, hasTrap: g.pickups.some(p => p.kind === 'trapdoor'),
             hasItem: g.pickups.some(p => p.kind === 'item'), depth: g.depth };
  });
  check('Boss 房清理', st.cleared === true);
  check('掉落道具', st.hasItem === true);
  check('出现活板门', st.hasTrap === true);
  await page.screenshot({ path: path.join(SHOTS, '06-boss-defeated.png') });

  // 踩活板门下层
  await page.evaluate(() => {
    const g = window.__game;
    const trap = g.pickups.find(p => p.kind === 'trapdoor');
    if (trap){ trap.x = g.player.x; trap.y = g.player.y; }
  });
  await sleep(300);
  st = await page.evaluate(() => ({ depth: window.__game.depth, state: window.__game.state }));
  check('进入下一层', st.depth === 2, `depth=${st.depth}`);
  await page.screenshot({ path: path.join(SHOTS, '07-floor2.png') });

  console.log('\n[J] 玩家受伤与死亡');
  await page.evaluate(() => {
    const g = window.__game;
    g.player.hearts = 2; g.player.soulHearts = 0; g.player.iframes = 0;
    const p = g.player;
    g.enemyShots.push(new EnemyShot(p.x, p.y, 0, 0, 0, 1)); // 原地子弹立即命中
  });
  await sleep(200);
  st = await page.evaluate(() => ({ state: window.__game.state, hearts: window.__game.player.hearts }));
  check('受击扣血', st.hearts <= 0, `hearts=${st.hearts}`);
  check('死亡进入 gameover', st.state === 'gameover', st.state);
  await sleep(700);
  check('死亡界面显示', await page.isVisible('#gameover-screen'));
  await page.screenshot({ path: path.join(SHOTS, '08-gameover.png') });

  console.log('\n[K] 通关判定');
  await page.evaluate(() => window.__start(777));
  await sleep(200);
  await page.evaluate(() => {
    const g = window.__game;
    g.depth = 3; // 直接到最终层
    g.enterRoom(g.floor.bossRoom, -1);
  });
  await sleep(200);
  await page.evaluate(() => { const g = window.__game; g.depth = 3; g.enemies.forEach(e => e.hurt(9999, g)); });
  await sleep(700);
  st = await page.evaluate(() => ({ state: window.__game.state }));
  check('击败最终Boss通关', st.state === 'win', st.state);
  check('通关界面显示', await page.isVisible('#win-screen'));
  await page.screenshot({ path: path.join(SHOTS, '09-win.png') });

  await browser.close();

  console.log('\n========================================');
  console.log(failures === 0 ? '🎉 全部通过！' : `⚠️  ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
