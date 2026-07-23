/* ============================================================
 * main.js - 启动与主循环
 * ============================================================ */

(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  Input.init();

  const game = new Game();
  window.__game = game;                 // 供 Playwright 自动化访问

  // ---- 开始/重开 ----
  function start(){
    hideAll();
    game.newGame((Math.floor(performance.now()) ^ 0x9e3779b9) >>> 0);
  }
  function hideAll(){
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
  }
  document.getElementById('start-btn').addEventListener('click', start);
  document.getElementById('retry-btn').addEventListener('click', start);
  document.getElementById('win-retry-btn').addEventListener('click', start);

  // ---- 主循环（固定步长逻辑 + 渲染）----
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 120;                 // 120Hz 逻辑步长，保证碰撞稳定

  function frame(now){
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;           // 防大跳
    acc += dt;
    while (acc >= STEP){
      game.update(STEP);
      acc -= STEP;
    }
    if (game.state === 'playing' || game.state === 'gameover' || game.state === 'win'){
      renderGame(ctx, game);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 调试/测试钩子：直接开始游戏（可指定种子）
  window.__start = function(seed){ hideAll(); game.newGame(seed >>> 0); };
})();
