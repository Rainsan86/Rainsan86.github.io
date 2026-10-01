/* ============================================================
   网站精灵（小鲸鱼挂件）
   交互与几何完全照抄 DeepSeek-Balance-Whale-Widget 的客户端部分：
   拖拽 + 四边四分之一吸附、左侧镜像翻转、按压 Q 弹、SVG 气泡分级
   弹出、图片 alpha 命中测试、汉堡菜单。

   与原版的本质差别：原版靠 DSH 后端路由（/dsh-whale/balance.json 等）
   取余额与用量，静态站没有后端，所以数据源整体换成本地内容——问候语、
   建站运行时长、随机台词，配置存 localStorage 而非服务端文件。
   ============================================================ */
(function () {
  'use strict';

  if (window.__blogWhale) return;
  window.__blogWhale = true;

  /* ---------------- 常量 ---------------- */
  var MIN_SCALE = 0.6;
  var MAX_SCALE = 2.5;
  var CLICK_SQ = 9;            // 位移平方阈值：小于此值算点击而非拖拽
  var BUBBLE_MS = 5000;        // 气泡自动收起
  var STORE_KEY = 'whale-config';
  var POS_KEY = 'whale-pos';

  /* 资源根目录：从本脚本自身的 src 反推，首页与 posts/ 子页通用 */
  var BASE = './';
  try {
    var me = document.currentScript && document.currentScript.src;
    if (me) BASE = me.replace(/js\/whale\.js(\?.*)?$/, '');
  } catch (err) {}
  var IMG_URL = BASE + 'image/whale.png';
  var GIF_URL = BASE + 'image/whale-rua.gif';
  var SOUND_SETS = {
    duck: { press: BASE + 'sound/press.mp3', release: BASE + 'sound/release.mp3' },
    fx1: { press: BASE + 'sound/press2.mp3', release: BASE + 'sound/release2.mp3' }
  };

  /* ---------------- 配置（localStorage） ---------------- */
  var cfg = {
    scale: 1.5,
    vol: 0.9,
    soundSet: 'duck',
    bubbleOn: true,
    greetOn: true,
    greetSec: 180,
    scrollGapOn: false,
    scrollGapPx: 17,
    hidden: false
  };

  function loadConfig() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return;
      if (typeof raw.scale === 'number' && raw.scale >= MIN_SCALE && raw.scale <= MAX_SCALE) cfg.scale = raw.scale;
      if (typeof raw.vol === 'number' && raw.vol >= 0 && raw.vol <= 1) cfg.vol = raw.vol;
      if (raw.soundSet === 'duck' || raw.soundSet === 'fx1' || raw.soundSet === 'off') cfg.soundSet = raw.soundSet;
      if (typeof raw.bubbleOn === 'boolean') cfg.bubbleOn = raw.bubbleOn;
      if (typeof raw.greetOn === 'boolean') cfg.greetOn = raw.greetOn;
      if (typeof raw.greetSec === 'number' && raw.greetSec >= 0) cfg.greetSec = Math.round(raw.greetSec);
      if (typeof raw.scrollGapOn === 'boolean') cfg.scrollGapOn = raw.scrollGapOn;
      if (typeof raw.scrollGapPx === 'number' && raw.scrollGapPx >= 0) cfg.scrollGapPx = Math.round(raw.scrollGapPx);
      if (typeof raw.hidden === 'boolean') cfg.hidden = raw.hidden;
    } catch (err) {}
  }

  function saveConfig() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (err) {}
  }

  loadConfig();

  /* ---------------- 台词内容 ----------------
     原版这里是余额 / 今日已用 / 峰谷时段，静态站换成时段问候与运行时长。 */
  var SITE_START = typeof window.SITE_START_TS === 'number'
    ? window.SITE_START_TS
    : new Date(2026, 8, 4, 15, 0, 0).getTime();

  function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* 时段：返回 { name, color, greet } */
  function timeSlot() {
    var h = new Date().getHours();
    if (h < 5) return { name: '深夜', color: '#6b7db8', greet: pickOne(['还没睡吗…', '夜猫子出现了！', '这个点还在逛…']) };
    if (h < 9) return { name: '清晨', color: '#f0a35e', greet: pickOne(['早上好呀~', '早安！', '新的一天开始咯']) };
    if (h < 12) return { name: '上午', color: '#2fa24c', greet: pickOne(['上午好~', '在忙什么呢？', '今天也要加油哦']) };
    if (h < 14) return { name: '午间', color: '#e0a33f', greet: pickOne(['吃饭了吗？', '午休一下吧~', '中午好呀']) };
    if (h < 18) return { name: '下午', color: '#3d97d3', greet: pickOne(['下午好~', '来杯咖啡？', '摸鱼时间到']) };
    if (h < 23) return { name: '晚上', color: '#8b6fd0', greet: pickOne(['晚上好呀~', '今天过得怎么样？', '欢迎回来']) };
    return { name: '夜里', color: '#6b7db8', greet: pickOne(['该睡了哦…', '别熬太晚呀', '晚安前再逛一会？']) };
  }

  function runDays() {
    var d = Math.floor((Date.now() - SITE_START) / 86400000);
    return d < 0 ? 0 : d;
  }

  var STYLE_CLASS = { A: 'wsp-label', B: 'wsp-amount', P: 'wsp-period', C: 'wsp-hint' };

  function singleCenter(style, text, color, wrap) {
    return [null, { t: text, s: style, c: color || '', w: !!wrap }, null];
  }

  /* 默认组：问候 + 时段 + 运行天数，对应原版的「余额 + 峰谷 + 今日已用」三行 */
  function buildGreet() {
    var s = timeSlot();
    return [
      { t: s.greet, s: 'A', c: '' },
      { t: s.name, s: 'P', c: s.color },
      { t: '小屋已运行 ' + runDays() + ' 天', s: 'C', c: '' }
    ];
  }

  /* 随机台词组。权重照抄原版的分配思路：默认组占大头，其余按趣味程度递减。
     原版那几个梗（token 自由、蓝色大肥鱼、DeepSleep、大烧货等）原样保留，
     另外补了一批贴合本站的。 */
  var RANDOM_GROUPS = [
    /* 默认组：问候 + 时段 + 运行天数 */
    { w: 20, lines: buildGreet },

    /* 原版梗：居中大字两句 */
    { w: 7, lines: function () {
      return singleCenter('B', pickOne(['好模型... ↓', '好女孩...↓', '好鲸鲸...↓']));
    } },

    /* 原版梗：吐槽六句，自动换行 */
    { w: 9, lines: function () {
      return singleCenter('A', pickOne([
        '不知道用户有什么用，先赶走吧~',
        '我...我...我也要挣钱吗？',
        '我去吃饭啦，测完叫我',
        '压力一只蓝色大肥鱼？！',
        'DeepSleep...',
        '坏了...用户彻底怒了！'
      ]), '', true);
    } },

    /* gif 动图 */
    { w: 9, lines: function () { return { gif: true }; } },

    /* 原版梗：低权重三句 */
    { w: 4, lines: function () {
      return singleCenter('A', pickOne([
        '你目录里的dsh是什么...大烧货吗...?',
        '恭喜你实现token自由！token全跑了！',
        '真当我是便宜货啊...'
      ]), '', true);
    } },

    /* 本站导览 */
    { w: 10, lines: function () {
      return singleCenter('A', pickOne([
        '这里是 xm486 的小屋，随便逛~',
        '文章都是站主亲手写的哦',
        '记得看看友链那栏呀',
        '右下角有音乐播放器，试试？',
        '主题能切日间夜间，右上角那个按钮',
        '滑到底部能看到本站运行了多久',
        '文章页左侧有目录，方便跳转',
        '点击页面会有小特效，发现了吗',
        '想交换友链的话，页面里有申请入口'
      ]), '', true);
    } },

    /* 关于精灵自己 */
    { w: 9, lines: function () {
      return singleCenter('A', pickOne([
        '我可以拖到屏幕任意一边贴着',
        '据说按住我会变扁',
        '你把我拖到左边我会翻过来哦',
        '侧栏菜单里能把我调大调小',
        '别把我拖出屏幕外呀',
        '嫌我吵？菜单里能静音的',
        '不想看到我的话...侧栏能把我关掉（呜）',
        '我的位置会记住的，刷新也还在这'
      ]), '', true);
    } },

    /* 时间感知：按当前时段说不同的话 */
    { w: 9, lines: function () {
      var h = new Date().getHours();
      var pool;
      if (h < 5) pool = ['三点了...你是不是不用睡觉', '这个点还醒着的只有我和你', '熬夜写代码，bug 会变多的哦'];
      else if (h < 9) pool = ['早起的人有好运~', '今天的第一杯水喝了吗', '天亮了，新的 bug 也醒了'];
      else if (h < 12) pool = ['上午效率最高，冲！', '别刷网页了，去干活吧（我也是网页）', '摸鱼被我发现了'];
      else if (h < 14) pool = ['午饭吃什么？我吃浮游生物', '困了就趴一会儿', '饭后别马上写代码'];
      else if (h < 18) pool = ['下午三点，血糖告急', '来杯咖啡吧', '还有几个小时就下班啦'];
      else if (h < 23) pool = ['晚上是效率最高的时候（错觉）', '今天辛苦了~', '记得备份代码呀'];
      else pool = ['该睡了哦...', '再逛五分钟就睡，真的', '晚安，我先眯一会儿'];
      return singleCenter('A', pickOne(pool), '', true);
    } },

    /* 运行天数三行版 */
    { w: 6, lines: function () {
      return [
        { t: '这间小屋已经', s: 'A', c: '' },
        { t: runDays() + ' 天', s: 'B', c: '' },
        { t: '一直在这里啦', s: 'C', c: '' }
      ];
    } },

    /* 程序员碎话 */
    { w: 7, lines: function () {
      return singleCenter('A', pickOne([
        '「在我机器上是好的」',
        '这个 bug 昨天还不在的',
        '注释：这里不要动，我也不知道为什么能跑',
        '改一行，崩三处',
        'Ctrl+S 是美德',
        '写完再重构（永远不会来的那天）',
        '能跑就别动它'
      ]), '', true);
    } },

    /* 短叹词 */
    { w: 4, lines: function () {
      return singleCenter('B', pickOne(['哦鲸鲸...', '咕...', '唔...', '鲸！', '嗯？']));
    } },

    /* 稀有 */
    { w: 2, lines: function () {
      return singleCenter('A', pickOne([
        '你戳我这么多次...是不是很闲',
        '恭喜，你抽到了稀有台词（并没有奖）',
        '再戳我就要涨价了'
      ]), '', true);
    } }
  ];

  function pickRandomLines() {
    var total = 0, i;
    for (i = 0; i < RANDOM_GROUPS.length; i++) total += RANDOM_GROUPS[i].w;
    var r = Math.random() * total;
    for (i = 0; i < RANDOM_GROUPS.length; i++) {
      r -= RANDOM_GROUPS[i].w;
      if (r < 0) return RANDOM_GROUPS[i].lines();
    }
    return RANDOM_GROUPS[0].lines();
  }

  /* ---------------- DOM 构建 ---------------- */
  var root = document.createElement('div');
  root.className = 'wsp-root';
  if (cfg.hidden) root.classList.add('wsp-hidden');
  root.style.setProperty('--wsp-scale', String(cfg.scale));

  var img = document.createElement('img');
  img.className = 'wsp-img';
  img.src = IMG_URL;
  img.alt = '网站精灵';
  img.draggable = false;

  var menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'wsp-menu-btn';
  menuBtn.title = '精灵设置';
  menuBtn.setAttribute('aria-label', '精灵设置');
  menuBtn.innerHTML = '<span></span><span></span><span></span>';

  /* 气泡：路径与椭圆坐标照抄原版（viewBox 1026×700），颜色交给 CSS 变量 */
  var bubbleBox = document.createElement('div');
  bubbleBox.className = 'wsp-bubble';
  bubbleBox.innerHTML = '<svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path class="wsp-bshape" stroke-width="18" stroke-linejoin="round" stroke-linecap="round" d="M 827 248 A 373 232 0 1 0 81 246 A 373 232 0 0 0 301 465 A 57 32 10 0 0 413 484 A 373 232 0 0 0 827 248 Z"/>' +
    '<ellipse class="wsp-b1" cx="352" cy="561" rx="37.5" ry="26" stroke-width="18"/>' +
    '<ellipse class="wsp-b2" cx="442" cy="646" rx="24.5" ry="18" stroke-width="18"/>' +
    '</svg>';

  var gifEl = document.createElement('img');
  gifEl.className = 'wsp-gif';
  gifEl.src = GIF_URL;
  gifEl.alt = '';
  gifEl.draggable = false;
  var gifFailed = false;
  gifEl.onerror = function () { gifFailed = true; };

  var textBox = document.createElement('div');
  textBox.className = 'wsp-text';
  var labelEl = document.createElement('div');
  labelEl.className = 'wsp-label';
  var amountEl = document.createElement('div');
  amountEl.className = 'wsp-amount';
  var hintEl = document.createElement('div');
  hintEl.className = 'wsp-hint';
  textBox.appendChild(labelEl);
  textBox.appendChild(amountEl);
  textBox.appendChild(hintEl);

  bubbleBox.appendChild(gifEl);
  bubbleBox.appendChild(textBox);

  var body = document.createElement('div');
  body.className = 'wsp-body';
  body.appendChild(img);
  body.appendChild(bubbleBox);
  root.appendChild(body);
  root.appendChild(menuBtn);

  /* ---------------- 菜单 ---------------- */
  var menuBox = document.createElement('div');
  menuBox.className = 'wsp-menu';

  function menuLabel(t) {
    var s = document.createElement('span');
    s.textContent = t;
    return s;
  }
  function menuRow() {
    var r = document.createElement('div');
    r.className = 'wsp-menu-row';
    return r;
  }
  function opt(v, label) {
    var o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    return o;
  }

  /* 大小：滑块（真实倍率）+ 数字框（1–20 档，便于精确输入） */
  var scaleInput = document.createElement('input');
  scaleInput.type = 'range';
  scaleInput.min = String(MIN_SCALE);
  scaleInput.max = String(MAX_SCALE);
  scaleInput.step = '0.1';
  scaleInput.className = 'wsp-range';
  var scaleNumber = document.createElement('input');
  scaleNumber.type = 'number';
  scaleNumber.min = '1';
  scaleNumber.max = '20';
  scaleNumber.step = '1';
  scaleNumber.className = 'wsp-number';

  var soundSelect = document.createElement('select');
  soundSelect.className = 'wsp-select';
  soundSelect.appendChild(opt('duck', '小黄鸭'));
  soundSelect.appendChild(opt('fx1', '音效2'));
  soundSelect.appendChild(opt('off', '静音'));

  var volInput = document.createElement('input');
  volInput.type = 'range';
  volInput.min = '0';
  volInput.max = '1';
  volInput.step = '0.05';
  volInput.className = 'wsp-range';
  var volPct = document.createElement('span');
  volPct.className = 'wsp-pct';

  var bubbleToggle = document.createElement('input');
  bubbleToggle.type = 'checkbox';
  bubbleToggle.className = 'wsp-check';
  bubbleToggle.title = '开启/关闭气泡';

  var greetToggle = document.createElement('input');
  greetToggle.type = 'checkbox';
  greetToggle.className = 'wsp-check';
  greetToggle.title = '精灵每隔一段时间主动说话';
  var greetInput = document.createElement('input');
  greetInput.type = 'number';
  greetInput.min = '10';
  greetInput.step = '10';
  greetInput.className = 'wsp-number';
  greetInput.title = '主动说话的间隔秒数';

  var gapToggle = document.createElement('input');
  gapToggle.type = 'checkbox';
  gapToggle.className = 'wsp-check';
  gapToggle.title = '贴右侧时避开滚动条';
  var gapInput = document.createElement('input');
  gapInput.type = 'number';
  gapInput.min = '0';
  gapInput.step = '1';
  gapInput.className = 'wsp-number';

  var hideBtn = document.createElement('button');
  hideBtn.type = 'button';
  hideBtn.className = 'wsp-close';
  hideBtn.textContent = '隐藏精灵';
  hideBtn.title = '隐藏后点侧栏的鲸鱼图标可恢复';

  var r1 = menuRow(); r1.appendChild(menuLabel('大小')); r1.appendChild(scaleInput); r1.appendChild(scaleNumber);
  var r2 = menuRow(); r2.appendChild(menuLabel('音效')); r2.appendChild(soundSelect);
  var r3 = menuRow(); r3.appendChild(menuLabel('音量')); r3.appendChild(volInput); r3.appendChild(volPct);
  var r4 = menuRow(); r4.appendChild(menuLabel('气泡')); r4.appendChild(bubbleToggle);
  var r5 = menuRow(); r5.appendChild(menuLabel('主动搭话')); r5.appendChild(greetToggle);
  r5.appendChild(menuLabel('间隔')); r5.appendChild(greetInput); r5.appendChild(menuLabel('秒'));
  var r6 = menuRow(); r6.appendChild(menuLabel('避让滚动条')); r6.appendChild(gapToggle);
  r6.appendChild(menuLabel('宽')); r6.appendChild(gapInput); r6.appendChild(menuLabel('px'));
  var sep = document.createElement('div'); sep.className = 'wsp-sep';

  menuBox.appendChild(r1);
  menuBox.appendChild(r2);
  menuBox.appendChild(r3);
  menuBox.appendChild(r4);
  menuBox.appendChild(r5);
  menuBox.appendChild(r6);
  menuBox.appendChild(sep);
  menuBox.appendChild(hideBtn);

  document.body.appendChild(root);
  document.body.appendChild(menuBox);

  /* ---------------- 位置模型 ----------------
     照抄原版：位置始终以 left/top 像素表达（切成 right/auto 无法做 CSS
     过渡，吸附时会闪）。锚点信息存在 state 里，窗口 resize 或改大小后由
     settle() 重算坐标，保证挂件一直贴着它吸附的那条边。 */
  var state = { h: 'left', hOff: 0, v: 'bottom', vOff: 0, left: 0, top: 0 };
  var drag = null;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function viewport() {
    return {
      w: window.innerWidth || document.documentElement.clientWidth || 1280,
      h: window.innerHeight || document.documentElement.clientHeight || 800
    };
  }
  function rightGap() {
    if (!cfg.scrollGapOn) return 0;
    return cfg.scrollGapPx > 0 ? cfg.scrollGapPx : 0;
  }

  function express() {
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    root.style.left = state.left + 'px';
    root.style.top = state.top + 'px';
    root.classList.toggle('wsp-left', state.h === 'left');
  }

  function settle() {
    var vp = viewport();
    var w = root.offsetWidth || root.getBoundingClientRect().width || 0;
    var h = root.offsetHeight || root.getBoundingClientRect().height || 0;
    if (drag && drag.active) {
      // 拖拽中窗口尺寸变化：保持跟手位置，只夹进可视区
      state.left = clamp(state.left, 0, Math.max(0, vp.w - w - rightGap()));
      state.top = clamp(state.top, 0, Math.max(0, vp.h - h));
      express();
      return;
    }
    if (state.h === 'right') state.left = Math.max(0, vp.w - w - state.hOff - rightGap());
    else if (state.h === 'left') state.left = state.hOff;
    else state.left = clamp(state.left, 0, Math.max(0, vp.w - w - rightGap()));

    if (state.v === 'bottom') state.top = Math.max(0, vp.h - h - state.vOff);
    else if (state.v === 'top') state.top = state.vOff;
    else state.top = clamp(state.top, 0, Math.max(0, vp.h - h));
    express();
  }

  function savePos() {
    try {
      var vp = viewport();
      var w = root.offsetWidth || root.getBoundingClientRect().width || 0;
      var h = root.offsetHeight || root.getBoundingClientRect().height || 0;
      var leftDist = state.left;
      var rightDist = vp.w - state.left - w;
      var topDist = state.top;
      var bottomDist = vp.h - state.top - h;
      var hAnchor = leftDist <= rightDist ? 'left' : 'right';
      var hRaw = Math.round(Math.min(leftDist, rightDist));
      // 存净距离：右锚点要剥掉当前的避让宽度，否则改设置后位置会漂
      var hDist = hAnchor === 'right' && cfg.scrollGapOn ? Math.max(0, hRaw - rightGap()) : hRaw;
      localStorage.setItem(POS_KEY, JSON.stringify({
        v: 1,
        hAnchor: hAnchor,
        hDist: hDist,
        vAnchor: topDist <= bottomDist ? 'top' : 'bottom',
        vDist: Math.round(Math.min(topDist, bottomDist))
      }));
    } catch (err) {}
  }

  function applySavedPos() {
    try {
      var a = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (!a || a.v !== 1) return false;
      if (a.hAnchor !== 'left' && a.hAnchor !== 'right') return false;
      if (a.vAnchor !== 'top' && a.vAnchor !== 'bottom') return false;
      if (typeof a.hDist !== 'number' || typeof a.vDist !== 'number') return false;
      var vp = viewport();
      var w = root.offsetWidth || root.getBoundingClientRect().width || 0;
      var h = root.offsetHeight || root.getBoundingClientRect().height || 0;
      var rDist = a.hAnchor === 'right' ? a.hDist + rightGap() : a.hDist;
      var l = a.hAnchor === 'left' ? a.hDist : vp.w - rDist - w;
      var t = a.vAnchor === 'top' ? a.vDist : vp.h - a.vDist - h;
      state.h = a.hAnchor; state.hOff = a.hDist;
      state.v = a.vAnchor; state.vOff = a.vDist;
      state.left = clamp(l, 0, Math.max(0, vp.w - w));
      state.top = clamp(t, 0, Math.max(0, vp.h - h));
      express();
      return true;
    } catch (err) { return false; }
  }

  /* ---------------- 气泡显示 ---------------- */
  var bubbleShown = false;
  var bubbleTimer = null;
  var randomActive = false;
  var swapTimer = null;
  var gifFadeTimer = null;

  function applyLines(lines) {
    if (lines && lines.gif) {
      if (gifFailed) {
        // gif 缺失时降级为文字，避免弹出一个空白气泡
        lines = singleCenter('A', pickOne(['动图丢了…', '今天没有动图给你看~']), '', true);
      } else {
        if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null; }
        gifEl.style.display = 'block';
        gifEl.style.opacity = '';
        labelEl.style.display = 'none';
        amountEl.style.display = 'none';
        hintEl.style.display = 'none';
        return;
      }
    }
    if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null; }
    gifEl.style.display = 'none';
    gifEl.style.opacity = '';
    var els = [labelEl, amountEl, hintEl];
    for (var i = 0; i < 3; i++) {
      var el = els[i];
      var ln = lines && lines[i];
      if (ln) {
        el.style.display = '';
        el.className = (STYLE_CLASS[ln.s] || 'wsp-label') + (ln.w ? ' wsp-wrap' : '');
        el.textContent = ln.t;
        el.style.color = ln.c || '';
      } else {
        el.style.display = 'none';
        el.textContent = '';
        el.style.color = '';
      }
    }
  }

  /* 换内容时先淡出再淡入，避免文字硬切 */
  function swapContent(applyFn) {
    if (swapTimer) { clearTimeout(swapTimer); swapTimer = null; }
    textBox.style.transition = 'opacity .18s ease';
    textBox.style.opacity = '0';
    swapTimer = setTimeout(function () {
      swapTimer = null;
      applyFn();
      textBox.style.opacity = '1';
      setTimeout(function () {
        textBox.style.transition = '';
        textBox.style.opacity = '';
      }, 220);
    }, 190);
  }

  function showBubble(lines) {
    if (!cfg.bubbleOn) return;
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
    if (swapTimer) { clearTimeout(swapTimer); swapTimer = null; }
    if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null; }
    textBox.style.transition = '';
    textBox.style.opacity = '';
    bubbleShown = true;
    randomActive = false;
    bubbleTapCount = 0;   // 每次重新弹出都重置点击计数
    applyLines(lines || buildGreet());
    bubbleBox.classList.add('wsp-open');
    bubbleTimer = setTimeout(hideBubble, BUBBLE_MS);
  }

  function hideBubble() {
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
    if (swapTimer) { clearTimeout(swapTimer); swapTimer = null; }
    textBox.style.transition = '';
    textBox.style.opacity = '';
    bubbleShown = false;
    randomActive = false;
    // 文字不在此处复原：关闭瞬间改内容会让台词闪回问候语。
    // 复原交给下一次 showBubble()（那时气泡已隐藏，过程不可见）。
    bubbleBox.classList.remove('wsp-open');
    // gif 靠 CSS opacity 淡出，直接 display:none 会跳过过渡
    gifFadeTimer = setTimeout(function () {
      gifFadeTimer = null;
      gifEl.style.display = 'none';
    }, 240);
  }

  /* 点击气泡：连续换台词，第四次起关闭。
     原版是「第一次切随机、第二次关」，但那时第一次点鲸鱼给的是固定余额，
     现在点鲸鱼已经直接给随机台词了，所以点气泡改成继续翻下一句更顺手。 */
  var bubbleTapCount = 0;
  bubbleBox.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!bubbleShown) return;
    bubbleTapCount++;
    if (bubbleTapCount >= 3) {
      hideBubble();
      return;
    }
    randomActive = true;
    var lines = pickRandomLines();
    swapContent(function () { applyLines(lines); });
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideBubble, BUBBLE_MS);
  });

  /* ---------------- 音效 ---------------- */
  var pressAudio = null;
  var releaseAudio = null;
  var pressing = false;
  var pressEnded = false;
  var releasePlayed = false;
  var releaseTimer = null;

  function applySoundSet() {
    pressAudio = null;
    releaseAudio = null;
    if (cfg.soundSet === 'off') return;
    var set = SOUND_SETS[cfg.soundSet] || SOUND_SETS.duck;
    try {
      pressAudio = new Audio(set.press);
      pressAudio.preload = 'auto';
      pressAudio.volume = cfg.vol;
      releaseAudio = new Audio(set.release);
      releaseAudio.preload = 'auto';
      releaseAudio.volume = cfg.vol;
    } catch (err) {}
  }

  function playPress() {
    if (!pressAudio || cfg.vol <= 0) return;
    try {
      if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null; }
      if (releaseAudio) { releaseAudio.pause(); releaseAudio.currentTime = 0; }
      pressEnded = false;
      releasePlayed = false;
      pressAudio.onended = function () {
        pressEnded = true;
        // 时长未知时的兜底：按一下就松开 → 按压音播完立刻接松手音
        if (!pressing && !releasePlayed) playRelease();
      };
      pressAudio.currentTime = 0;
      var p = pressAudio.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (err) {}
  }

  function playRelease() {
    if (releasePlayed || !releaseAudio || cfg.vol <= 0) return;
    releasePlayed = true;
    try {
      releaseAudio.currentTime = 0;
      var p = releaseAudio.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (err) {}
  }

  var SQUISH = 'scaleY(0.88) scaleX(1.05)';
  function pressDown() {
    body.style.transform = SQUISH;
    pressing = true;
    playPress();
  }
  function pressUp() {
    body.style.transform = 'scaleY(1) scaleX(1)';
    pressing = false;
    if (pressEnded) { playRelease(); return; }
    // 短按：在按压音最后 100ms 接上松手音，听起来是连贯的一下
    var known = false, remain = 0;
    try {
      var dur = pressAudio ? pressAudio.duration : 0;
      if (isFinite(dur) && dur > 0) {
        known = true;
        remain = (dur - pressAudio.currentTime) * 1000;
      }
    } catch (err) {}
    if (known) {
      releaseTimer = setTimeout(function () {
        releaseTimer = null;
        playRelease();
      }, Math.max(0, remain - 100));
    }
  }

  /* ---------------- 命中测试 ----------------
     把鲸鱼图画进离屏 canvas 读 alpha，透明区域的点击穿透到页面。
     file:// 直接打开时 canvas 会被跨源污染，getImageData 抛错，
     此时降级为「只判断是否落在图片矩形内」——比整个方形盒子都拦住要好。 */
  var hitCanvas = null;
  var hitMode = 'rect';   // 'alpha' | 'rect'

  function setupHitTest() {
    try {
      hitCanvas = document.createElement('canvas');
      hitCanvas.width = 610;
      hitCanvas.height = 610;
      var probe = new Image();
      probe.onload = function () {
        try {
          var ctx = hitCanvas.getContext('2d');
          // 必须指定 610×610：不指定会按原图尺寸绘制，换素材后命中区会错位
          ctx.drawImage(probe, 0, 0, 610, 610);
          ctx.getImageData(0, 0, 1, 1);   // 探测是否可读，file:// 下会抛
          hitMode = 'alpha';
        } catch (err) {
          hitMode = 'rect';
        }
      };
      probe.onerror = function () { hitMode = 'rect'; };
      probe.src = IMG_URL;
    } catch (err) {}
  }

  function isWhaleHit(e) {
    if (cfg.hidden) return false;
    var r = img.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return false;
    var lx = (e.clientX - r.left) / r.width * 610;
    var ly = (e.clientY - r.top) / r.height * 610;
    if (lx < 0 || ly < 0 || lx >= 610 || ly >= 610) return false;
    if (hitMode !== 'alpha') {
      /* 降级路径（图片还没加载完，或 file:// 下 canvas 被跨源污染）。
         这里不能直接 return true —— 那会让整个方形区域都算命中，
         onClickStopper 会 preventDefault 掉落在鲸鱼透明角落的点击，
         表现就是「页面上有些地方莫名点不到」。
         改用图片范围的内切椭圆近似轮廓：四个角让出去，误吞大幅减少。 */
      var nx = (lx - 305) / 305;
      var ny = (ly - 305) / 305;
      return nx * nx + ny * ny <= 1;
    }
    try {
      // 镜像状态下图片被翻转，采样坐标要跟着翻
      if (state.h === 'left') lx = 610 - lx;
      var data = hitCanvas.getContext('2d').getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data;
      return data[3] > 10;
    } catch (err) {
      // 读取失败：永久降级，本次也按椭圆近似判定（不要 return true 吞掉整块方形）
      hitMode = 'rect';
      var ex = (lx - 305) / 305;
      var ey = (ly - 305) / 305;
      return ex * ex + ey * ey <= 1;
    }
  }

  /* ---------------- 菜单交互 ---------------- */
  var menuOpen = false;

  /* 菜单定位到任意锚点元素上方，按锚点所在半屏贴同侧对齐。
     两个入口共用：鲸鱼上的汉堡键、侧栏的设置键。 */
  function positionMenuNear(anchorEl) {
    try {
      var b = anchorEl.getBoundingClientRect();
      var vp = viewport();
      var onLeft = b.left + b.width / 2 < vp.w / 2;
      if (onLeft) {
        menuBox.style.left = Math.max(8, b.left) + 'px';
        menuBox.style.right = 'auto';
        menuBox.style.transformOrigin = 'bottom left';
      } else {
        menuBox.style.right = Math.max(8, vp.w - b.right) + 'px';
        menuBox.style.left = 'auto';
        menuBox.style.transformOrigin = 'bottom right';
      }
      // 菜单出现在锚点上方；顶部空间不足时改挂到下方，避免被裁掉
      var menuH = menuBox.offsetHeight || 250;
      if (b.top - menuH < 8) {
        menuBox.style.top = Math.min(b.bottom + 8, vp.h - menuH - 8) + 'px';
        menuBox.style.bottom = 'auto';
        menuBox.style.transformOrigin = onLeft ? 'top left' : 'top right';
      } else {
        menuBox.style.bottom = (vp.h - b.top + 6) + 'px';
        menuBox.style.top = 'auto';
      }
    } catch (err) {}
  }

  function positionMenu() { positionMenuNear(menuBtn); }

  function toggleMenu() {
    menuOpen = !menuOpen;
    if (menuOpen) positionMenu();
    menuBox.classList.toggle('wsp-menu-open', menuOpen);
    if (menuOpen) menuBtn.classList.add('wsp-btn-show');
  }

  function closeMenu() {
    menuOpen = false;
    menuBox.classList.remove('wsp-menu-open');
    root.style.transition = '';
    // 改过大小可能让精灵离开原来贴的边，关菜单时重新吸附一次
    snapCheck();
  }

  /* 关菜单后重新吸附：改大小可能让挂件离开原来贴的那条边 */
  function snapCheck() {
    if (cfg.hidden) return;   // 隐藏时 rect 全为 0，算出来会把状态写坏
    var rect = root.getBoundingClientRect();
    var vp = viewport();
    var w = rect.width, h = rect.height;
    var left = rect.left, top = rect.top;
    var cx = left + w / 2, cy = top + h / 2;
    var moved = false;
    if (cx < vp.w / 4) { state.h = 'left'; state.hOff = 0; left = 0; moved = true; }
    else if (cx > vp.w * 3 / 4) { state.h = 'right'; state.hOff = 0; left = vp.w - w - rightGap(); moved = true; }
    else { state.h = null; state.hOff = left; }
    if (cy < vp.h / 4) { state.v = 'top'; state.vOff = 0; top = 0; moved = true; }
    else { state.v = 'bottom'; state.vOff = Math.max(0, vp.h - top - h); }
    if (moved) {
      state.left = left;
      state.top = top;
      settle();
    }
  }

  function setScale(v) {
    var next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(v))) * 10) / 10;
    // 缩放要即时测量，先关掉过渡；否则测到的是过渡起点，锚点会算错
    var prevTrans = root.style.transition;
    root.style.transition = 'none';
    var rect = root.getBoundingClientRect();
    // 固定点取鲸鱼所在的那个下角：未翻转时右下，翻转时左下。
    // 这样放大缩小时鲸鱼一直贴着自己的角，不会跑。
    var fx = state.h === 'left' ? rect.left : rect.right;
    var fy = rect.bottom;
    cfg.scale = next;
    root.style.setProperty('--wsp-scale', String(next));
    scaleInput.value = String(next);
    scaleNumber.value = String(scaleToDisplay(next));
    saveConfig();
    var r2 = root.getBoundingClientRect();
    var vp = viewport();
    if (state.h === 'left') state.left = Math.min(Math.max(fx, 0), Math.max(0, vp.w - r2.width));
    else state.left = Math.min(Math.max(fx - r2.width, 0), Math.max(0, vp.w - r2.width));
    state.top = Math.min(Math.max(fy - r2.height, 0), Math.max(0, vp.h - r2.height));
    express();
    // 恢复过渡必须延到下一帧：本帧刚在 none 下改过 left/top，
    // 立刻恢复会让浏览器对这次改动补一段动画，看起来像抽搐
    requestAnimationFrame(function () { root.style.transition = prevTrans; });
  }

  function scaleToDisplay(s) {
    return Math.round((s - MIN_SCALE) / ((MAX_SCALE - MIN_SCALE) / 19)) + 1;
  }
  function displayToScale(v) {
    var n = Math.max(1, Math.min(20, Math.round(Number(v) || 1)));
    return MIN_SCALE + (n - 1) * (MAX_SCALE - MIN_SCALE) / 19;
  }

  function setVol(v) {
    cfg.vol = Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 100) / 100;
    volInput.value = String(cfg.vol);
    volPct.textContent = Math.round(cfg.vol * 100) + '%';
    try {
      if (pressAudio) pressAudio.volume = cfg.vol;
      if (releaseAudio) releaseAudio.volume = cfg.vol;
    } catch (err) {}
    saveConfig();
  }

  scaleInput.addEventListener('pointerdown', function () { root.style.transition = 'none'; });
  scaleInput.addEventListener('input', function () { setScale(scaleInput.value); });
  scaleInput.addEventListener('change', function () { root.style.transition = ''; });
  scaleNumber.addEventListener('focus', function () { root.style.transition = 'none'; });
  scaleNumber.addEventListener('blur', function () { root.style.transition = ''; });
  scaleNumber.addEventListener('input', function () { setScale(displayToScale(scaleNumber.value)); });
  scaleNumber.addEventListener('change', function () {
    setScale(displayToScale(scaleNumber.value));
    root.style.transition = '';
  });

  soundSelect.addEventListener('change', function () {
    cfg.soundSet = soundSelect.value === 'fx1' ? 'fx1' : (soundSelect.value === 'off' ? 'off' : 'duck');
    applySoundSet();
    saveConfig();
  });
  volInput.addEventListener('input', function () { setVol(volInput.value); });

  bubbleToggle.addEventListener('change', function () {
    cfg.bubbleOn = bubbleToggle.checked;
    saveConfig();
    if (!cfg.bubbleOn) hideBubble();
  });

  greetToggle.addEventListener('change', function () {
    cfg.greetOn = greetToggle.checked;
    greetInput.disabled = !cfg.greetOn;
    saveConfig();
    restartGreetTimer();
  });
  function onGreetSec() {
    var n = Math.max(10, Math.round(Number(greetInput.value) || 10));
    cfg.greetSec = n;
    greetInput.value = String(n);
    saveConfig();
    restartGreetTimer();
  }
  greetInput.addEventListener('change', onGreetSec);

  gapToggle.addEventListener('change', function () {
    cfg.scrollGapOn = gapToggle.checked;
    gapInput.disabled = !cfg.scrollGapOn;
    saveConfig();
    settle();
  });
  gapInput.addEventListener('change', function () {
    if (!cfg.scrollGapOn) return;
    cfg.scrollGapPx = Math.max(0, Math.round(Number(gapInput.value) || 0));
    gapInput.value = String(cfg.scrollGapPx);
    saveConfig();
    settle();
  });

  hideBtn.addEventListener('click', function () {
    cfg.hidden = true;
    saveConfig();
    hideBubble();
    closeMenu();
    root.classList.add('wsp-hidden');
    syncToolBtn();
  });

  menuBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleMenu();
  });

  /* ---------------- 指针交互（拖拽 / 点击 / 光标） ---------------- */
  function inWidgetUI(target) {
    return !!(target && target.closest &&
      (target.closest('.wsp-bubble') || target.closest('.wsp-menu') || target.closest('.wsp-menu-btn')));
  }

  function onPointerDown(e) {
    if (inWidgetUI(e.target)) return;
    if (menuOpen) { closeMenu(); return; }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!isWhaleHit(e)) return;
    try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
    var vp = viewport();
    var rect = root.getBoundingClientRect();
    drag = {
      active: true, startX: e.clientX, startY: e.clientY,
      origLeft: rect.left, origTop: rect.top,
      w: rect.width, h: rect.height, moved: false, vp: vp,
      // 记录拖拽过程中最后一次有效位置。endDrag 只用这两个值，
      // 不再读事件坐标——pointercancel 的 clientX/Y 可能是 0 或失效值。
      lastLeft: rect.left, lastTop: rect.top
    };
    root.classList.add('wsp-dragging');
    document.body.classList.add('wsp-drag-lock');
    // 捕获指针：后续 move/up 都定向到本元素，手机上不会被浏览器手势抢走
    try {
      if (e.pointerId !== undefined && root.setPointerCapture) root.setPointerCapture(e.pointerId);
      drag.pointerId = e.pointerId;
    } catch (err) {}
    pressDown();
    setCursor('grabbing');
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
  }

  function onPointerMove(e) {
    if (!drag || !drag.active) return;
    // 多指触摸时只认按下的那根手指，否则第二指会把精灵拽走
    if (drag.pointerId !== undefined && e.pointerId !== undefined && e.pointerId !== drag.pointerId) return;
    try { e.preventDefault(); } catch (err) {}
    var dx = e.clientX - drag.startX;
    var dy = e.clientY - drag.startY;
    if (dx * dx + dy * dy >= CLICK_SQ) drag.moved = true;
    // 拖拽期间保持原有翻转方向；松手后 endDrag 重算锚点，由 settle 平滑翻面
    drag.lastLeft = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w));
    drag.lastTop = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h));
    state.left = drag.lastLeft;
    state.top = drag.lastTop;
    express();
  }

  function onPointerUp(e) {
    if (drag && drag.pointerId !== undefined && e.pointerId !== undefined && e.pointerId !== drag.pointerId) return;
    // 拦掉鲸鱼区域内的 pointerup，防止下方元素的监听被穿透触发
    try { if (isWhaleHit(e)) { e.preventDefault(); e.stopPropagation(); } } catch (err) {}
    endDrag(true);
  }
  function onPointerCancel(e) {
    if (drag && drag.pointerId !== undefined && e.pointerId !== undefined && e.pointerId !== drag.pointerId) return;
    // 手势被浏览器接管：不算点击，就地落定（绝不重算坐标）
    endDrag(false);
  }

  function endDrag(clickAllowed) {
    if (!drag || !drag.active) return;
    drag.active = false;
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('pointercancel', onPointerCancel, true);
    document.body.classList.remove('wsp-drag-lock');
    try {
      if (drag.pointerId !== undefined && root.releasePointerCapture) root.releasePointerCapture(drag.pointerId);
    } catch (err) {}
    pressUp();
    root.classList.remove('wsp-dragging');
    setCursor('');
    if (clickAllowed && !drag.moved) {
      // 没位移 → 算点击：弹气泡，直接给一句随机台词
      if (bubbleShown) hideBubble();
      else showBubble(pickRandomLines());
      return;
    }
    // 落点用拖拽过程中记录的最后位置，不读事件坐标——
    // pointercancel 时事件坐标可能为 0，会把精灵瞬移到屏幕上方
    var left = drag.lastLeft;
    var top = drag.lastTop;
    var cx = left + drag.w / 2;
    var cy = top + drag.h / 2;
    // 四分之一吸附：中心落在哪个四分之一区就贴对应边，角落可组合
    if (cx < drag.vp.w / 4) { state.h = 'left'; state.hOff = 0; }
    else if (cx > drag.vp.w * 3 / 4) { state.h = 'right'; state.hOff = 0; }
    else { state.h = null; state.hOff = left; }
    if (cy < drag.vp.h / 4) { state.v = 'top'; state.vOff = 0; }
    else if (cy > drag.vp.h * 3 / 4) { state.v = 'bottom'; state.vOff = 0; }
    else { state.v = null; state.vOff = top; }
    state.left = left;
    state.top = top;
    settle();
    savePos();
  }

  /* click 拦截要常驻注册：click 在 pointerup 之后派发，
     在 endDrag 里移除会让 click 穿透到下方元素（比如误触链接）。 */
  function onClickStopper(e) {
    if (!isWhaleHit(e)) return;
    try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
  }

  var curCursor = '';
  function setCursor(v) {
    if (v === curCursor) return;
    curCursor = v;
    try { document.body.style.cursor = v; } catch (err) {}
  }

  function onMoveCursor(e) {
    if (cfg.hidden) return;
    if (drag && drag.active) { setCursor('grabbing'); return; }
    var el = null;
    try { el = document.elementFromPoint(e.clientX, e.clientY); } catch (err) {}
    if (inWidgetUI(el)) {
      setCursor('');
      menuBtn.classList.add('wsp-btn-show');
      return;
    }
    var over = isWhaleHit(e);
    setCursor(over ? 'grab' : '');
    menuBtn.classList.toggle('wsp-btn-show', over || menuOpen);
  }

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('click', onClickStopper, true);
  document.addEventListener('pointermove', onMoveCursor, true);

  /* 拖拽状态兜底：pointerup/cancel 万一没派发（切后台、系统手势打断），
     .wsp-drag-lock 会卡住让整页滚不动。三重兜底强制收尾。 */
  window.addEventListener('blur', function () { if (drag && drag.active) endDrag(false); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && drag && drag.active) endDrag(false);
  });
  window.addEventListener('touchend', function () {
    if (drag && drag.active) endDrag(false);
  }, true);

  window.addEventListener('resize', function () {
    if (state.h === null && state.v === null && applySavedPos()) return;
    settle();
    if (menuOpen) positionMenu();
  });

  /* ---------------- 主动搭话 ---------------- */
  var greetTimer = null;
  function restartGreetTimer() {
    if (greetTimer) { clearInterval(greetTimer); greetTimer = null; }
    if (!cfg.greetOn || cfg.hidden) return;
    greetTimer = setInterval(function () {
      if (cfg.hidden || bubbleShown) return;
      showBubble(pickRandomLines());
    }, Math.max(10, cfg.greetSec) * 1000);
  }

  /* ---------------- 侧栏按钮 ----------------
     手机没有 hover，鲸鱼上的汉堡键点不出来，所以设置入口也放侧栏。
     PC 端两个入口都保留。 */
  var toolBtn = document.querySelector('.tool-whale');
  var toolSetBtn = document.querySelector('.tool-whale-set');

  function syncToolBtn() {
    if (toolBtn) {
      toolBtn.classList.toggle('off', cfg.hidden);
      toolBtn.title = cfg.hidden ? '显示网站精灵' : '隐藏网站精灵';
      toolBtn.setAttribute('aria-label', toolBtn.title);
    }
    // 精灵隐藏时设置按钮也灰掉：调大小、音效对看不见的精灵没意义
    if (toolSetBtn) {
      toolSetBtn.classList.toggle('off', cfg.hidden);
    }
  }

  if (toolBtn) {
    toolBtn.addEventListener('click', function () {
      cfg.hidden = !cfg.hidden;
      saveConfig();
      root.classList.toggle('wsp-hidden', cfg.hidden);
      if (cfg.hidden) {
        hideBubble();
        closeMenu();
      } else {
        settle();
        showBubble(pickRandomLines());
      }
      syncToolBtn();
      restartGreetTimer();
    });
  }

  if (toolSetBtn) {
    toolSetBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (cfg.hidden) {
        // 隐藏状态下点设置：先把精灵放回来，不然调什么都看不见
        cfg.hidden = false;
        saveConfig();
        root.classList.remove('wsp-hidden');
        settle();
        syncToolBtn();
        restartGreetTimer();
      }
      menuOpen = !menuOpen;
      if (menuOpen) positionMenuNear(toolSetBtn);
      menuBox.classList.toggle('wsp-menu-open', menuOpen);
    });
  }

  /* 点菜单外部关闭菜单。从侧栏打开时菜单不挨着鲸鱼，
     原来那套「pointerdown 命中鲸鱼才关」的逻辑够不着，得单独兜一层。 */
  document.addEventListener('pointerdown', function (e) {
    if (!menuOpen) return;
    if (inWidgetUI(e.target)) return;
    if (toolSetBtn && e.target.closest && e.target.closest('.tool-whale-set')) return;
    closeMenu();
  }, false);

  /* ---------------- 初始化 ---------------- */
  scaleInput.value = String(cfg.scale);
  scaleNumber.value = String(scaleToDisplay(cfg.scale));
  soundSelect.value = cfg.soundSet;
  volInput.value = String(cfg.vol);
  volPct.textContent = Math.round(cfg.vol * 100) + '%';
  bubbleToggle.checked = cfg.bubbleOn;
  greetToggle.checked = cfg.greetOn;
  greetInput.value = String(cfg.greetSec);
  greetInput.disabled = !cfg.greetOn;
  gapToggle.checked = cfg.scrollGapOn;
  gapInput.value = String(cfg.scrollGapPx);
  gapInput.disabled = !cfg.scrollGapOn;

  applySoundSet();
  setupHitTest();
  syncToolBtn();

  var rect0 = root.getBoundingClientRect();
  state.left = rect0.left;
  state.top = rect0.top;
  if (!applySavedPos()) settle();
  applyLines(buildGreet());
  restartGreetTimer();

  // 进站打个招呼，等页面加载动画过去再弹
  if (!cfg.hidden) setTimeout(function () { showBubble(); }, 2200);
})();