/* ============================================================
 * input.js - 键盘输入（WASD 移动 + 方向键射击）
 * ============================================================ */

const Input = {
  keys: Object.create(null),
  // 最近一次按下的射击方向（用于松开多键时的回退）
  shootStack: [],

  init(){
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      // 阻止方向键/空格滚动页面
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
      if (!this.keys[k]){
        this.keys[k] = true;
        if (this._isShoot(k)) this.shootStack.push(k);
      }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = false;
      const i = this.shootStack.indexOf(k);
      if (i >= 0) this.shootStack.splice(i, 1);
    });
    // 失焦清空，防止按键卡住
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.shootStack.length = 0; });
  },

  _isShoot(k){
    return k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright';
  },

  // 移动向量（-1..1）
  moveVec(){
    let x = 0, y = 0;
    if (this.keys['a']) x -= 1;
    if (this.keys['d']) x += 1;
    if (this.keys['w']) y -= 1;
    if (this.keys['s']) y += 1;
    if (x !== 0 && y !== 0){ const inv = 1 / Math.SQRT2; x *= inv; y *= inv; }
    return { x, y };
  },

  // 射击方向（单位向量），无则 null。支持斜向。
  shootVec(){
    if (this.shootStack.length === 0) return null;
    // 取最近按下的键，再叠加仍按住的对立/垂直键形成斜向
    const held = this.shootStack.filter(k => this.keys[k]);
    if (held.length === 0) return null;
    let x = 0, y = 0;
    for (const k of held){
      if (k === 'arrowup') y -= 1;
      if (k === 'arrowdown') y += 1;
      if (k === 'arrowleft') x -= 1;
      if (k === 'arrowright') x += 1;
    }
    if (x === 0 && y === 0) return null;
    return norm(x, y);
  },
};
