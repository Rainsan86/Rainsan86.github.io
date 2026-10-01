/* ============================================================
   晴空の小屋 - 主脚本
   模块顺序：加载动画 / 主题切换 / 文章筛选 / 导航 / 滚动动画 / 点击烟花
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 猫咪加载动画 ---------------- */
  function initLoading() {
    const loading = document.getElementById('loading');
    if (!loading) return;

    let done = false;
    function hide() {
      if (done) return;
      done = true;
      loading.classList.add('gone');
      document.body.classList.add('loaded');
    }

    loading.addEventListener('click', hide);
    window.addEventListener('load', () => setTimeout(hide, 600));
    setTimeout(hide, 3000); // 兜底：资源慢时也不会一直卡在加载页
  }

  /* ---------------- 日/夜模式切换 ---------------- */
  function initTheme() {
    const toggle = document.getElementById('themeToggle');
    const STORE_KEY = 'blog-theme';

    // 读取上次的选择
    let saved = null;
    try {
      saved = localStorage.getItem(STORE_KEY);
    } catch (e) {
      /* 隐私模式下 localStorage 可能不可用，忽略即可 */
    }
    if (saved === 'dark') document.body.classList.add('dark');

    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark');
      try {
        localStorage.setItem(STORE_KEY, isDark ? 'dark' : 'light');
      } catch (e) { /* 同上 */ }

      // 重启光晕动画
      toggle.classList.remove('pulse');
      void toggle.offsetWidth; // 强制重排，让动画可以再次播放
      toggle.classList.add('pulse');
    });
  }

  /* ---------------- 文章分类筛选 ---------------- */
  function initFilter() {
    const btns = document.querySelectorAll('.cat-btn');
    const posts = document.querySelectorAll('.post-card');
    if (!btns.length || !posts.length) return;

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.dataset.filter;
        posts.forEach(post => {
          const show = filter === 'all' || post.dataset.cat === filter;
          post.classList.toggle('hidden', !show);
        });
      });
    });
  }

  /* ---------------- 导航（滚动阴影 + 移动端菜单） ---------------- */
  function initNav() {
    const nav = document.getElementById('nav');
    const menuBtn = document.getElementById('menuBtn');
    const navLinks = document.getElementById('navLinks');

    if (nav) {
      window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 60);
      }, { passive: true });
    }

    if (menuBtn && navLinks) {
      let closeTimer = null;
      function closeMenu() {
        if (!navLinks.classList.contains('open')) return;
        navLinks.classList.add('closing');
        menuBtn.classList.remove('active');
        menuBtn.setAttribute('aria-expanded', 'false');
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
          navLinks.classList.remove('open', 'closing');
        }, 220);
      }

      menuBtn.addEventListener('click', () => {
        if (navLinks.classList.contains('open')) {
          closeMenu();
          return;
        }
        clearTimeout(closeTimer);
        navLinks.classList.remove('closing');
        navLinks.classList.add('open');
        menuBtn.classList.add('active');
        menuBtn.setAttribute('aria-expanded', 'true');
      });
      // 点击菜单项后先播完收起动画再跳转
      navLinks.addEventListener('click', e => {
        if (e.target.tagName === 'A') closeMenu();
      });

      // 点击导航以外的空白处收起；点菜单和菜单内容本身不触发
      document.addEventListener('click', e => {
        if (!navLinks.classList.contains('open')) return;
        if (!nav.contains(e.target)) closeMenu();
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeMenu();
      });
    }
  }

  /* ---------------- 滚动淡入 ---------------- */
  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    // 不支持 IntersectionObserver 时直接全部显示，避免内容不可见
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('show'));
      return;
    }

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('show');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    items.forEach(el => io.observe(el));
  }

  /* ---------------- 友链申请弹窗 ---------------- */
  function initModal() {
    const modal = document.getElementById('applyModal');
    const openBtn = document.getElementById('openApplyBtn');
    const closeBtn = document.getElementById('closeApplyBtn');
    if (!modal || !openBtn || !closeBtn) return;

    function open() {
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden'; // 防止背景滚动
    }

    function close() {
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    // 点击遮罩关闭（点在内容区不关）
    modal.addEventListener('click', e => {
      if (e.target === modal) close();
    });
    // ESC 键关闭
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
        close();
      }
    });
  }

  /* ---------------- 项目详情弹窗（仅项目展示栏使用事件委托） ---------------- */
  function initProjectModal() {
    const modal = document.getElementById('projectModal');
    const closeBtn = document.getElementById('closeProjectBtn');
    const title = document.getElementById('projectModalTitle');
    const desc = document.getElementById('projectModalDesc');
    const avatar = document.getElementById('projectModalAvatar');
    const site = document.getElementById('projectSiteLink');
    const repo = document.getElementById('projectRepoLink');
    if (!modal || !closeBtn || !title || !desc || !avatar || !site || !repo) return;

    function setLink(link, url) {
      const hasUrl = Boolean(url);
      link.classList.toggle('is-empty', !hasUrl);
      if (hasUrl) link.href = url;
      else link.removeAttribute('href');
    }

    function open(item) {
      title.textContent = item.dataset.name || '项目名称';
      desc.textContent = item.dataset.desc || '暂无项目介绍。';
      avatar.replaceChildren();
      if (item.dataset.avatar) {
        const img = document.createElement('img');
        img.src = item.dataset.avatar;
        img.alt = item.dataset.name || '项目头像';
        avatar.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.textContent = item.querySelector('.scroll-placeholder')?.textContent || '✦';
        avatar.appendChild(placeholder);
      }
      setLink(site, item.dataset.site);
      setLink(repo, item.dataset.repo);
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    // 用 document 委托：自动克隆出来的无缝滚动头像也能打开详情
    document.addEventListener('click', e => {
      const item = e.target.closest('.project-item');
      if (item) open(item);
    });
    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') close();
    });
  }

  /* ---------------- 全部项目面板 ----------------
     数据不另外维护：直接从跑马灯里的 .project-item 读 data-*，
     按 data-name 去重（两排轨道各有一份，JS 还会再克隆）。
     卡片沿用 .project-item 类名，所以点击详情走已有的事件委托，无需另写。 */
  function initAllProjects() {
    const btn = document.getElementById('btnAllProjects');
    const panel = document.getElementById('allProjects');
    const grid = document.getElementById('allProjectsGrid');
    const countEl = document.getElementById('projectCount');
    if (!btn || !panel || !grid) return;

    // 必须在 initAvatarMarquees 之前调用，否则会把克隆出来的副本也读进来。
    // 即便顺序变了，下面的 name 去重也能兜住。
    const seen = new Set();
    const items = [];
    document.querySelectorAll('.marquee-track .project-item').forEach(el => {
      const name = el.dataset.name || '';
      if (!name || seen.has(name)) return;
      seen.add(name);
      items.push({
        name: name,
        desc: el.dataset.desc || '',
        avatar: el.dataset.avatar || '',
        site: el.dataset.site || '',
        repo: el.dataset.repo || ''
      });
    });

    if (!items.length) { btn.hidden = true; return; }
    if (countEl) countEl.textContent = items.length;

    items.forEach(p => {
      const card = document.createElement('button');
      card.type = 'button';
      // 复用 project-item：详情弹窗的 document 委托会自动接管点击
      card.className = 'ap-card project-item';
      card.dataset.name = p.name;
      card.dataset.desc = p.desc;
      if (p.avatar) card.dataset.avatar = p.avatar;
      if (p.site) card.dataset.site = p.site;
      if (p.repo) card.dataset.repo = p.repo;
      card.setAttribute('aria-label', '查看 ' + p.name + ' 详情');

      const thumb = document.createElement('span');
      thumb.className = 'ap-thumb';
      if (p.avatar) {
        const img = document.createElement('img');
        img.src = p.avatar;
        img.alt = '';
        img.loading = 'lazy';
        thumb.appendChild(img);
      } else {
        thumb.textContent = '✦';
      }

      const body = document.createElement('span');
      body.className = 'ap-body';
      const h = document.createElement('strong');
      h.className = 'ap-name';
      h.textContent = p.name;
      const d = document.createElement('span');
      d.className = 'ap-desc';
      d.textContent = p.desc || '暂无介绍';
      body.append(h, d);

      // 有哪些链接：只做标记展示，真正的跳转在详情弹窗里
      const tags = document.createElement('span');
      tags.className = 'ap-tags';
      if (p.site) {
        const t = document.createElement('span');
        t.className = 'ap-tag site';
        t.textContent = '主页';
        tags.appendChild(t);
      }
      if (p.repo) {
        const t = document.createElement('span');
        t.className = 'ap-tag repo';
        t.textContent = '仓库';
        tags.appendChild(t);
      }
      if (tags.childNodes.length) body.appendChild(tags);

      card.append(thumb, body);
      grid.appendChild(card);
    });

    function setOpen(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('open', open);
      btn.querySelector('.sm-text').textContent = open ? '收起' : '查看全部';
      if (open) {
        panel.hidden = false;
        // 先让元素参与布局再量高度，否则 scrollHeight 为 0，动画不会播
        panel.style.maxHeight = panel.scrollHeight + 'px';
        panel.classList.add('open');
        // 动画结束后解除高度限制，内容换行/图片加载后不会被裁掉
        const done = () => {
          panel.style.maxHeight = 'none';
          panel.removeEventListener('transitionend', done);
        };
        panel.addEventListener('transitionend', done);
      } else {
        // 从当前实际高度收起：直接从 none 过渡到 0 不会有动画
        panel.style.maxHeight = panel.scrollHeight + 'px';
        void panel.offsetHeight;               // 强制重排，让浏览器记住起点
        panel.classList.remove('open');
        panel.style.maxHeight = '0px';
        const done = () => {
          panel.hidden = true;
          panel.removeEventListener('transitionend', done);
        };
        panel.addEventListener('transitionend', done);
      }
    }

    btn.addEventListener('click', () => {
      setOpen(btn.getAttribute('aria-expanded') !== 'true');
    });
  }

  /* ---------------- 双排头像滚动：像素级双轨循环 ---------------- */
  function initAvatarMarquees() {
    const tracks = [];

    document.querySelectorAll('.marquee-track').forEach(track => {
      if (track.dataset.loopReady === 'true') return;

      // 第一组为可编辑源；第二组是完整镜像。移动一个第一组宽度后回绕，画面连续。
      const group = document.createElement('div');
      group.className = 'marquee-group';
      while (track.firstChild) group.appendChild(track.firstChild);
      track.appendChild(group);

      const viewport = track.closest('.avatar-scroll-container');
      const seedItems = Array.from(group.children);
      let repeatIndex = 0;
      const minWidth = viewport ? viewport.clientWidth + 96 : 480;
      while (group.scrollWidth < minWidth && seedItems.length) {
        const copy = seedItems[repeatIndex % seedItems.length].cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        copy.setAttribute('tabindex', '-1');
        group.appendChild(copy);
        repeatIndex++;
      }

      const mirror = group.cloneNode(true);
      mirror.setAttribute('aria-hidden', 'true');
      mirror.querySelectorAll('a, button').forEach(item => item.setAttribute('tabindex', '-1'));
      track.appendChild(mirror);

      const state = {
        track,
        viewport,
        direction: track.classList.contains('marquee-right') ? 1 : -1,
        // 每秒移动像素数；右排略慢，避免两排机械同步
        speed: track.classList.contains('marquee-right') ? 13 : 16,
        offset: 0,
        width: 1,
        paused: false,
        visible: true,
        hinted: false      // 当前是否已给 will-change 提示，避免每帧重复写样式
      };

      const measure = () => {
        state.width = Math.max(group.getBoundingClientRect().width, 1);
        state.offset = state.direction > 0 ? -state.width : 0;
        state.track.style.transform = `translate3d(${state.offset}px,0,0)`;
      };
      measure();

      // hover、键盘焦点或手指按住时暂停，方便看名称和点击
      const pause = () => { state.paused = true; };
      const resume = () => { state.paused = false; };
      viewport.addEventListener('mouseenter', pause);
      viewport.addEventListener('mouseleave', resume);
      viewport.addEventListener('focusin', pause);
      viewport.addEventListener('focusout', resume);
      viewport.addEventListener('touchstart', pause, { passive: true });
      /* 结束事件必须挂在 window 上，不能挂 viewport。
         手指从跑马灯上按下后往外滑再抬起时，touchend 派发给的是抬手位置的元素，
         viewport 根本收不到 —— resume 永远不执行，state.paused 永久卡在 true。

         后果不只是跑马灯不动：轨道的 will-change:transform 会一直挂着，
         那两个合成层永不释放，整页的点击命中测试被拖慢，
         表现就是「分类按钮、评分星星忽然点不动」，
         往下滚一下让 IntersectionObserver 重新触发才恢复。

         touchcancel 也要收：系统手势、来电、多指切换都会派发它而不是 touchend。 */
      window.addEventListener('touchend', resume, { passive: true });
      window.addEventListener('touchcancel', resume, { passive: true });
      // 鼠标同理：在 viewport 内按下后拖到外面松开，mouseleave 可能不派发
      window.addEventListener('blur', resume);
      document.addEventListener('visibilitychange', () => { if (document.hidden) resume(); });

      // 滚出视口后停止逐帧写 transform，避免两条轨道常驻消耗每一帧。
      // will-change 由 tick 统一按「是否真的在动」管理，这里只维护可见性标记。
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
          state.visible = entries[0].isIntersecting;
        }, { rootMargin: '120px' }).observe(viewport);
      }

      tracks.push({ state, measure });
      track.dataset.loopReady = 'true';
    });

    if (!tracks.length) return;
    let previous = performance.now();
    function tick(now) {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      tracks.forEach(({ state }) => {
        const running = !state.paused && state.visible;
        /* will-change 跟随「是否真的在动」，而不只是「是否可见」。
           元素静止时留着 will-change:transform 会让合成层白占内存，
           在中低端机上拖慢整页的点击命中测试。 */
        if (running !== state.hinted) {
          state.track.style.willChange = running ? 'transform' : 'auto';
          state.hinted = running;
        }
        if (!running) return;
        state.offset += state.direction * state.speed * dt;
        if (state.direction < 0 && state.offset <= -state.width) state.offset += state.width;
        if (state.direction > 0 && state.offset >= 0) state.offset -= state.width;
        state.track.style.transform = `translate3d(${state.offset}px,0,0)`;
      });
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // 旋转屏幕、窗口宽度变化时重新测量一组的像素宽度，防止回绕位置漂移
    window.addEventListener('resize', () => tracks.forEach(({ measure }) => measure()), { passive: true });
  }

/* ---------------- 侧边工具栏：音乐播放器 + 回到顶部 ----------------
      交互与视觉照 Shoka 主题的 mediaPlayer / backToTop 复刻：
      右下角竖排图标条、面板从图标左侧滑出、唱盘配唱针、
      当前曲目的播放进度直接画在列表行内。

      早年参考项目把网易云页面链接交给 https://api.i-meto.com/meting/api
      解析成可播地址，那个公共实例一度失效，所以初版只用 li 上的 data-src 直链。
      现在该实例已恢复且 CORS 全开，于是补一层「云端曲库」：
      曲名 / 艺术家 / 封面 / 可播直链由 Meting API 一次拉全，
      静态曲目退居离线兜底，入口按钮永远不等网络。 */
  function initTool() {
    const tool = document.getElementById('tool');
    if (!tool) return;

    // 控制按钮图标用内联 SVG：emoji 在部分设备上字体缺失会渲染成空白或豆腐块
    const S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    const F = '<svg viewBox="0 0 24 24" fill="currentColor">';
    const ICONS = {
      play: F + '<path d="M8 5v14l11-7z"/></svg>',
      pause: F + '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
      prev: F + '<path d="M6 5h2.2v14H6zM20 5v14L9.2 12z"/></svg>',
      next: F + '<path d="M15.8 5H18v14h-2.2zM4 5l10.8 7L4 19z"/></svg>',
      order: S + '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
      loop: S + '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M11.5 10.5L13 9.5V15"/></svg>',
      random: S + '<path d="M16 3h5v5"/><path d="M21 3L4 20"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>',
      volOn: S + '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 6.5a7 7 0 0 1 0 11"/></svg>',
      volOff: S + '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>'
    };

    /* ----- 回到顶部 + 滚动百分比 ----- */
    const btnTop = tool.querySelector('.back-to-top');
    const elPercent = tool.querySelector('.percent');

    function onScroll() {
      const y = window.pageYOffset;
      // 滚过半屏才显示回到顶部（顶部没有可回的位置）
      tool.classList.toggle('affix', y > window.innerHeight * 0.5);
      if (!elPercent) return;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const pct = total > 0 ? Math.round(Math.min(100 * y / total, 100)) : 0;
      elPercent.textContent = pct + '%';
    }

    let ticking = false;
    window.addEventListener('scroll', () => {
      // rAF 节流：滚动事件很密，每帧最多计算一次
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { onScroll(); ticking = false; });
    }, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();

    if (btnTop) {
      btnTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    /* ----- 音乐播放器 ----- */
    const panel = document.getElementById('playerInfo');
    const audio = tool.querySelector('.player-audio');
    const listEl = panel && panel.querySelector('.player-list');
    const btnMusic = tool.querySelector('.tool-music');
    if (!panel || !audio || !listEl || !btnMusic) return;

    const btnPlay = panel.querySelector('.pc-play');
    const btnPrev = panel.querySelector('.pc-prev');
    const btnNext = panel.querySelector('.pc-next');
    const btnMode = panel.querySelector('.pc-mode');
    const btnVol = panel.querySelector('.pc-volume');
    const elTitle = panel.querySelector('.pi-title');
    const elArtist = panel.querySelector('.pi-artist');
    const elCover = panel.querySelector('.pi-cover');

    btnPrev.innerHTML = ICONS.prev;
    btnNext.innerHTML = ICONS.next;
    btnPlay.innerHTML = ICONS.play;

    // 面板开合先绑定：即使没有可播曲目，入口也必须可用
    btnMusic.addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.toggle('show');
      // 第一次点开才同步云端曲库：不打开就不花这份流量
      if (panel.classList.contains('show')) syncRemoteOnce();
    });
    document.addEventListener('click', e => {
      if (panel.classList.contains('show') && !panel.contains(e.target) && !tool.contains(e.target)) {
        panel.classList.remove('show');
      }
    });
    panel.addEventListener('click', e => e.stopPropagation());

    /* ============ 云端曲库（Meting API） ============
       静态站不便自建歌单接口，GCross's Blog 的做法是丢给 Meting API
       解析歌单：一次请求拿回
         title 曲名 / author 艺术家 / pic 封面 / url 可播直链 / lrc 歌词
       照抄这个思路，换歌单只改下面 sources 里的 id。 */
    /* 音源就用 GCross's Blog 同款那一个实例。实测它元数据、封面、音频都正常：
       音频是 302 跳到 https 的网易云 CDN，真实返回 audio/mpeg，浏览器能直接播。
       ⚠ api.i-meto.com 元数据也正常、CORS 也开着，但它的 type=url 一律 404。
       把它放进候选会怎样：抢答时它先返回，于是整个列表的音频地址都放不出声，
       每首歌都触发「加载失败→跳下一首」，看起来就是疯狂切歌。所以绝不能放进来。 */
    const METING = {
      enable: true,
      api: 'https://meting.mysqil.com/api?server=:server&type=:type&id=:id&r=:r',
      timeout: 15000,          // 歌单 JSON 可能几百 KB，弱网下 8 秒不够
      max: 60,                 // 合并后最多留 60 首
      preload: true,           // 进页面后预热一次；不想费这份流量就改 false
      /* 可以配多个歌单，网易云和 QQ 混着来，结果自动合并去重。
         想加 QQ 音乐：server 改 'tencent'，id 填 QQ 歌单链接里的 disstid。
         数组第一位放最想要的，合并时它排在前面。 */
      sources: [
        { server: 'netease', type: 'playlist', id: '18436437707' }   // 「博客 小米486」
        // { server: 'tencent', type: 'playlist', id: '你的QQ歌单disstid' }
      ]
    };

    let remoteSynced = false;

    /* 云端状态条：加载中 / 失败可重试。
       由 JS 注入而不是写在各页 HTML 里 —— 带播放器的页面有 6 个，
       在这里生成一处，所有页面同时生效。 */
    const statusEl = document.createElement('p');
    statusEl.className = 'player-status';
    statusEl.hidden = true;
    if (listEl.parentNode) listEl.parentNode.insertBefore(statusEl, listEl);

    let statusKind = '';

    function setStatus(text, retry) {
      statusEl.textContent = text || '';
      statusEl.hidden = !text;
      statusEl.classList.toggle('retry', !!retry);
      statusEl.onclick = retry ? () => { syncRemoteOnce(true); } : null;
      statusKind = !text ? '' : (retry ? 'error' : 'busy');
    }

    /* ============ 播放进度条 ============
       由 JS 注入到列表上方（带播放器的页面有 6 个，写一处全都生效）。
       以前进度是画在列表行里的背景条：既和「滑动列表找歌」抢手势，
       又让当前行看起来只是「颜色有点怪」。独立成条后可点可拖可键盘。 */
    const progEl = document.createElement('div');
    progEl.className = 'player-progress';
    progEl.innerHTML =
      '<span class="pp-cur">0:00</span>' +
      '<div class="pp-track" role="slider" tabindex="0" aria-label="播放进度" ' +
        'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
        '<span class="pp-fill"></span><span class="pp-dot"></span>' +
      '</div>' +
      '<span class="pp-dur">0:00</span>';
    if (statusEl.parentNode) statusEl.parentNode.insertBefore(progEl, statusEl);

    const ppTrack = progEl.querySelector('.pp-track');
    const ppFill = progEl.querySelector('.pp-fill');
    const ppDot = progEl.querySelector('.pp-dot');
    const ppCur = progEl.querySelector('.pp-cur');
    const ppDur = progEl.querySelector('.pp-dur');

    let dragging = false;

    function renderProgress() {
      const dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const cur = dur ? Math.min(audio.currentTime || 0, dur) : 0;
      const pct = dur ? (cur / dur * 100) : 0;
      ppFill.style.width = pct + '%';
      ppDot.style.left = pct + '%';
      ppCur.textContent = fmt(cur);
      ppDur.textContent = dur ? fmt(dur) : '0:00';
      ppTrack.setAttribute('aria-valuenow', String(Math.round(pct)));
    }

    function seekTo(clientX) {
      const r = ppTrack.getBoundingClientRect();
      if (!r.width || !isFinite(audio.duration) || audio.duration <= 0) return;
      const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
      audio.currentTime = ratio * audio.duration;
      renderProgress();
    }

    ppTrack.addEventListener('pointerdown', e => {
      if (!isFinite(audio.duration) || audio.duration <= 0) return;
      dragging = true;
      ppTrack.classList.add('dragging');
      if (ppTrack.setPointerCapture) ppTrack.setPointerCapture(e.pointerId);
      seekTo(e.clientX);
      e.preventDefault();
    });
    ppTrack.addEventListener('pointermove', e => { if (dragging) seekTo(e.clientX); });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      ppTrack.classList.remove('dragging');
      if (e && ppTrack.hasPointerCapture && ppTrack.hasPointerCapture(e.pointerId)) {
        ppTrack.releasePointerCapture(e.pointerId);
      }
    }
    ppTrack.addEventListener('pointerup', endDrag);
    ppTrack.addEventListener('pointercancel', endDrag);
    // 键盘左右键 ±5 秒，进度条也当成正经控件
    ppTrack.addEventListener('keydown', e => {
      if (!isFinite(audio.duration) || audio.duration <= 0) return;
      const d = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
      if (!d) return;
      e.preventDefault();
      audio.currentTime = Math.min(Math.max(audio.currentTime + d, 0), audio.duration);
      renderProgress();
    });

    function metingUrl(source, nonce) {
      return METING.api
        .replace(':server', encodeURIComponent(source.server))
        .replace(':type', encodeURIComponent(source.type))
        .replace(':id', encodeURIComponent(source.id))
        .replace(':r', String(Date.now()) + (nonce || ''));   // 禁缓存；多源之间也要错开
    }

    function fetchJson(url, ms, signal) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), ms);
        const done = fn => v => { clearTimeout(timer); fn(v); };
        fetch(url, { headers: { Accept: 'application/json' }, signal })
          .then(done(r => {
            if (!r.ok) { reject(new Error('HTTP ' + r.status)); return; }
            r.json().then(resolve, reject);
          }), done(reject));
      });
    }

    // 用远端曲目重建列表。行内结构照静态列表原样造：.progress 包 .bar、
    // .info 里两个 span（曲名 / 艺术家），播放器其余逻辑只认 data-* 与这两个类。
    function renderRemotePlaylist(rows) {
      const frag = document.createDocumentFragment();
      rows.forEach(t => {
        const li = document.createElement('li');
        li.dataset.src = t.src;
        li.dataset.name = t.name;
        li.dataset.artist = t.artist;
        if (t.cover) li.dataset.cover = t.cover;

        const pg = document.createElement('span');
        pg.className = 'progress';
        pg.appendChild(document.createElement('span')).className = 'bar';

        const info = document.createElement('span');
        info.className = 'info';
        const s1 = document.createElement('span');
        s1.textContent = t.name;
        const s2 = document.createElement('span');
        s2.textContent = t.artist;
        info.append(s1, s2);

        li.append(pg, info);
        frag.appendChild(li);
      });
      listEl.textContent = '';
      listEl.appendChild(frag);
    }

    // 把接口返回的原始列表裁成播放器要的形状
    function normalizeRows(list) {
      const rows = [], seen = Object.create(null);
      for (let i = 0; i < list.length && rows.length < METING.max; i++) {
        const t = list[i];
        if (!t || !t.url || !t.title || seen[t.url]) continue;
        seen[t.url] = true;                 // 同一直链不重复占行
        rows.push({
          src: String(t.url),
          name: String(t.title),
          artist: String(t.author || ''),
          cover: String(t.pic || '')
        });
      }
      return rows;
    }

    /* 所有歌单并发拉取，各自失败互不影响；合并后按音频地址去重。
       单个歌单挂掉只是少几首，不会让整个播放器不能用。 */
    async function loadMetingPlaylist() {
      if (!METING.enable || !window.fetch) return false;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
      if (!METING.sources.length) return false;

      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const jobs = METING.sources.map((s, i) =>
        fetchJson(metingUrl(s, i), METING.timeout, ctrl && ctrl.signal)
          .then(list => Array.isArray(list) ? normalizeRows(list) : [])
          .catch(() => []));                       // 这一路失败就当它没有

      const lists = await Promise.all(jobs);
      if (ctrl) ctrl.abort();

      const rows = [], seen = Object.create(null);
      lists.forEach(list => {
        list.forEach(r => {
          if (rows.length >= METING.max || seen[r.src]) return;
          seen[r.src] = true;
          rows.push(r);
        });
      });
      if (!rows.length) return false;

      renderRemotePlaylist(rows);
      return true;
    }

    /* 只同步一次，点开面板或页面预热谁先到算谁；force=true 用于失败后手动重试。 */
    function syncRemoteOnce(force) {
      if (remoteSynced && !force) return;
      remoteSynced = true;
      setStatus('正在获取云端歌单…', false);
      loadMetingPlaylist().then(ok => {
        if (ok) {
          setStatus('', false);
          rebuildTracks();
        } else {
          // 失败要在界面上说出来，否则用户只看到「没反应」
          setStatus(tracks.length ? '云端歌单连接失败，先用本地曲目' : '云端歌单连接失败 · 点这里重试', true);
        }
      });
    }

    // 曲目从 DOM 读取：新增歌曲只需在 HTML 里加一行 li。
    // 云端曲库会重建列表，所以抽成函数、可重复调用。
    let tracks = [];
    function collectTracks() {
      tracks = [];
      Array.prototype.forEach.call(listEl.querySelectorAll('li'), li => {
        if (!li.dataset.src) {
          // 未填直链的占位行：标灰且不可点，但保留在列表里做示例
          li.classList.add('disabled');
          return;
        }
        tracks.push({
          el: li,
          bar: li.querySelector('.bar'),
          progress: li.querySelector('.progress'),
          src: li.dataset.src,
          name: li.dataset.name || '未命名',
          artist: li.dataset.artist || '',
          cover: li.dataset.cover || ''
        });
      });
    }
    collectTracks();

    const MODES = ['order', 'loop', 'random'];
    const MODE_LABEL = { order: '顺序播放', loop: '单曲循环', random: '随机播放' };
    const KEY_MODE = 'player-mode';
    const KEY_VOL = 'player-volume';
    const KEY_MUTED = 'player-muted';

    let index = -1;
    let mode = 'order';

    try {
      const m = localStorage.getItem(KEY_MODE);
      if (MODES.indexOf(m) > -1) mode = m;
      const v = parseFloat(localStorage.getItem(KEY_VOL));
      audio.volume = isNaN(v) ? 0.7 : Math.min(Math.max(v, 0), 1);
      audio.muted = localStorage.getItem(KEY_MUTED) === '1';
    } catch (e) { audio.volume = 0.7; }

    function save(k, v) {
      try { localStorage.setItem(k, v); } catch (e) { /* 隐私模式下忽略 */ }
    }

    function fmt(sec) {
      if (!isFinite(sec) || sec < 0) return '0:00';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' + s : s);
    }

    function syncMode() {
      btnMode.innerHTML = ICONS[mode];
      btnMode.title = MODE_LABEL[mode];
      btnMode.setAttribute('aria-label', MODE_LABEL[mode]);
    }

    function syncVolume() {
      const off = audio.muted || audio.volume === 0;
      btnVol.innerHTML = off ? ICONS.volOff : ICONS.volOn;
      btnVol.title = off ? '取消静音' : '静音';
    }

    function syncPlay() {
      const playing = !audio.paused && !audio.ended;
      btnPlay.innerHTML = playing ? ICONS.pause : ICONS.play;
      btnPlay.setAttribute('aria-label', playing ? '暂停' : '播放');
      // .playing 同时驱动唱盘旋转、唱针落下与工具条图标自转
      tool.classList.toggle('playing', playing);
    }

    syncMode();
    syncVolume();

    /* 曲目为空时保留入口与面板，只给提示，不隐藏按钮。
       这里绝不能再 return —— 云端曲库稍后可能把列表填上，
       提前退场会把按钮启用态和后面所有事件绑定一起留在错误状态。 */
    function setListEmpty(empty) {
      if (!empty) {
        [btnPlay, btnPrev, btnNext].forEach(b => { b.disabled = false; });
        return;
      }
      elTitle.textContent = '暂无曲目';
      elArtist.textContent = '';
      elCover.style.visibility = 'hidden';
      [btnPlay, btnPrev, btnNext].forEach(b => { b.disabled = true; });
    }
    setListEmpty(!tracks.length);

    // 预热：页面加载完再等一小会儿，避免和首屏图片抢带宽。
    // 点开面板时通常已经就绪，用户看不到等待。
    if (METING.preload) setTimeout(() => syncRemoteOnce(), 1200);

    function load(i, autoplay) {
      if (i < 0 || i >= tracks.length) return;
      index = i;
      const t = tracks[i];
      audio.src = t.src;
      elTitle.textContent = t.name;
      elArtist.textContent = t.artist;
      if (t.cover) {
        elCover.src = t.cover;
        elCover.style.visibility = 'visible';
      } else {
        // 没给封面时留出唱盘中心的空位，不显示碎图
        elCover.removeAttribute('src');
        elCover.style.visibility = 'hidden';
      }
      // 选中态只靠 .current 一个类，样式在 CSS 里统一管（左侧色条 + 浅粉底）
      tracks.forEach((x, n) => x.el.classList.toggle('current', n === i));
      renderProgress();          // 换歌先把进度条归零，等 loadedmetadata 再填真实时长
      if (autoplay) play();
    }

    function play() {
      // 自动播放被拦截时 play() 会 reject，必须接住否则抛未处理异常
      const p = audio.play();
      if (p && p.catch) p.catch(() => syncPlay());
    }

    function step(dir) {
      if (mode === 'random' && tracks.length > 1) {
        let n = index;
        while (n === index) n = Math.floor(Math.random() * tracks.length);
        load(n, true);
        return;
      }
      let n = index + dir;
      if (n >= tracks.length) n = 0;
      if (n < 0) n = tracks.length - 1;
      load(n, true);
    }

    btnPlay.addEventListener('click', () => {
      if (index === -1) { load(0, true); return; }
      if (audio.paused) play(); else audio.pause();
    });
    btnPrev.addEventListener('click', () => { index === -1 ? load(0, true) : step(-1); });
    btnNext.addEventListener('click', () => { index === -1 ? load(0, true) : step(1); });

    btnMode.addEventListener('click', () => {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      save(KEY_MODE, mode);
      syncMode();
    });

    btnVol.addEventListener('click', () => {
      audio.muted = !audio.muted;
      save(KEY_MUTED, audio.muted ? '1' : '0');
      syncVolume();
    });

    /* 点行选歌 —— 必须和「滑动找歌」区分开。
       原来在 pointerdown 就切歌：手指一碰到列表就播放，想滑着找歌根本不可能。
       现在改成抬手时判定：位移在阈值内、时间够短，才算一次点击。
       手指滑动超过阈值、或浏览器判定为滚动而发 pointercancel，就完全不碰播放。 */
    const TAP_MOVE = 8;            // px，超过就算滑动
    const TAP_MS = 700;            // ms，超过算长按，也别误触发
    let tapStart = null;

    listEl.addEventListener('pointerdown', e => {
      const li = e.target.closest('li');
      tapStart = (!li || li.classList.contains('disabled'))
        ? null
        : { li: li, x: e.clientX, y: e.clientY, t: Date.now() };
    });

    listEl.addEventListener('pointerup', e => {
      const s = tapStart;
      tapStart = null;
      if (!s) return;
      if (e.target.closest('li') !== s.li) return;          // 手指滑到别的行上了
      if (Math.abs(e.clientX - s.x) > TAP_MOVE) return;     // 横向在划 = 滚列表
      if (Math.abs(e.clientY - s.y) > TAP_MOVE) return;     // 纵向在划 = 滚列表
      if (Date.now() - s.t > TAP_MS) return;
      const i = tracks.findIndex(t => t.el === s.li);
      if (i === -1 || i === index) return;
      failStreak = 0;
      autoSkipOff = false;
      load(i, true);
    });

    // 浏览器开始滚动列表时会发 pointercancel，这时绝不能当成点击
    listEl.addEventListener('pointercancel', () => { tapStart = null; });

    audio.addEventListener('timeupdate', () => {
      if (!dragging) renderProgress();
    });
    /* 自动跳曲的两道刹车：
         failStreak —— 连续失败计数；
         autoSkipOff —— 一旦置位就彻底不再自动跳（否则整库失效时会一直刷列表）。
       能读出元数据 = 这个地址是好的，两者都复位。 */
    let failStreak = 0;
    let autoSkipOff = false;
    const MAX_AUTO_SKIP = 3;

    audio.addEventListener('loadedmetadata', () => {
      renderProgress();          // 这时才有真实时长可填
      failStreak = 0;
      autoSkipOff = false;
      // 有地址能播了，之前那条「都放不出来」的提示就该撤掉
      if (statusKind === 'error') setStatus('', false);
    });
    audio.addEventListener('play', syncPlay);
    audio.addEventListener('pause', syncPlay);
    audio.addEventListener('volumechange', () => { save(KEY_VOL, audio.volume); syncVolume(); });
    audio.addEventListener('ended', () => {
      if (mode === 'loop') { audio.currentTime = 0; play(); return; }
      step(1);
    });
    /* 直链失效或格式不支持时标记该行并跳下一首 —— 但必须设闸。
       整份曲库都放不出时（例如音源换了签名），「失败就跳」会变成疯狂切歌，
       一路把列表刷过去，用户只看到标题乱闪。三道保险：
         ① 只有 audio.error 真的存在才算失败（切 src 产生的残留事件没有错误码）；
         ② 连续失败超过 MAX_AUTO_SKIP 就停下并提示，不再自动跳；
         ③ 任何一个地址成功读出元数据就清零（见上面的 loadedmetadata）。 */
    audio.addEventListener('error', () => {
      if (index < 0) return;
      if (!audio.error) return;                  // 无错误码 = 切换 src 的残留事件，忽略
      const el = tracks[index] && tracks[index].el;
      if (el) el.classList.add('error');
      syncPlay();
      if (autoSkipOff) return;                   // 已判定放不出，等用户手选或重试

      failStreak++;
      if (!tracks.some(t => !t.el.classList.contains('error'))) {
        autoSkipOff = true;
        setStatus('这些曲目都放不出来 · 点这里重试', true);
        return;
      }
      if (failStreak > MAX_AUTO_SKIP) {
        autoSkipOff = true;
        setStatus('连续 ' + MAX_AUTO_SKIP + ' 首加载失败，已停止自动跳过 · 点这里重试', true);
        return;
      }
      let n = index;
      do { n = (n + 1) % tracks.length; } while (tracks[n].el.classList.contains('error'));
      load(n, true);
    });

    syncPlay();
    load(0, false); // 预填首曲信息，不自动播放

    /* 云端曲库就绪后重建：
       按当前曲目直链找回位置，正在听的歌不因换列表而中断；
       新曲目不在旧列表里就回到第 1 首。 */
    function rebuildTracks() {
      const prevSrc = audio.getAttribute('src') || '';
      collectTracks();
      setListEmpty(!tracks.length);
      tracks.forEach(x => x.el.classList.remove('current', 'error'));
      // 换了一批新曲目，之前「放不出」的判定作废
      failStreak = 0;
      autoSkipOff = false;
      const keep = prevSrc ? tracks.findIndex(t => t.src === prevSrc) : -1;
      index = -1;
      load(keep >= 0 ? keep : 0, false);
      syncPlay();
    }

    // 云端封面是带 auth 的临时地址，过期或取不到时别留碎图
    elCover.addEventListener('error', () => { elCover.style.visibility = 'hidden'; });
  }

  /* ---------------- 拖动防选中 ----------------
     覆盖层特效在 PC 上拖动时，鼠标事件穿透到文字导致框选。
     按住鼠标期间给 body 加 .drag-off（user-select:none），松开移除；
     平时不干扰正常阅读与复制。 */
  function initDragGuard() {
    let dragging = false;

    function on() {
      if (dragging) return;
      dragging = true;
      document.body.classList.add('drag-off');
    }
    function off() {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('drag-off');
    }

    document.addEventListener('mousedown', on);
    // 用 window 捕获 mouseup：按住后移出窗口再松开也能收到
    window.addEventListener('mouseup', off);
    // 鼠标带着按下状态离开窗口时兜底清除，避免 class 卡死
    document.addEventListener('mouseleave', () => { if (dragging) off(); });
    // 标签页失焦同样兜底
    window.addEventListener('blur', off);
  }

  /* ---------------- 建站运行时长 ----------------
     从 SITE_START 起算，每秒刷新。用 setInterval 而非 rAF：
     显示精度只到秒，每帧计算纯属浪费。 */
  function initRuntime() {
    const el = document.getElementById('runtime');
    if (!el) return;

    // 建站时间 = 2026-09-04 00:00:00
    // 注意 Date 的月份从 0 开始计数，所以 9 月要写 8
    const SITE_START = new Date(2026, 8, 4, 15, 0, 0);

    function tick() {
      let diff = Math.floor((Date.now() - SITE_START.getTime()) / 1000);
      if (diff < 0) diff = 0; // 建站时间填成未来时也不显示负数

      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      const pad = n => (n < 10 ? '0' + n : '' + n);

      el.textContent = d + ' 天 ' + pad(h) + ' 小时 ' + pad(m) + ' 分 ' + pad(s) + ' 秒';
    }

    tick();
    setInterval(tick, 1000);
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    initLoading();
    initTheme();
    initFilter();
    initNav();
    initReveal();
    initModal();
    initProjectModal();
    // 必须早于 initAvatarMarquees：后者会克隆项目按钮，
    // 先读原始那一份能拿到干净的项目列表
    initAllProjects();
    initAvatarMarquees();
    initTool();
    initDragGuard();
    initRuntime();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();