/* ============================================================
   评论与评价组件（自绘版）
   基于假ICP备 comment-sdk.js（无 UI 核心 SDK），界面按本站风格自绘。

   布局参照 CyanTea's blog 的评论区：竖排字段、标签在上输入框在下、
   打分做成独立区块、按钮右对齐、顶部「最新 / 最热」切换。
   不要全量 widget 的印章表态、标签选择器、榜单入口。

   siteKey / pageKey 自动取当前域名与路径，所以每个页面的评论天然隔离。
   SDK 未加载或接口不可用时静默降级，不影响页面其他功能。
   ============================================================ */
(function () {
  'use strict';

  var el = document.getElementById('flm-comment-widget');
  if (!el) return;

  /* SDK 是外链，可能被墙/超时。没加载到就显示提示而不是留白 */
  if (typeof FlmCommentSDK === 'undefined') {
    el.innerHTML = '<div class="wc-box"><div class="wc-tip">评论服务暂时连不上，稍后刷新试试</div></div>';
    return;
  }

  /* ---------------- 配置 ---------------- */
  var siteKey = el.getAttribute('data-site') || location.hostname || 'localhost';
  var pageKey = el.getAttribute('data-page-key') ||
    (location.pathname.replace(/\.html?$/, '').replace(/\/+$/, '') || '/');
  var pageTitle = el.getAttribute('data-title') || document.title || '';

  var sdk = new FlmCommentSDK({ siteKey: siteKey, pageKey: pageKey, pageTitle: pageTitle });

  var LIMIT = 30;
  var curSort = 'newest';

  /* ---------------- 小工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&#34;').replace(/'/g, '&#39;');
  }
  function stars(rating) {
    var n = Math.round(Number(rating) || 0), s = '';
    for (var i = 1; i <= 5; i++) {
      s += '<span class="wc-star' + (i <= n ? ' on' : '') + '">' + (i <= n ? '★' : '☆') + '</span>';
    }
    return s;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  // 头像：SDK 用昵称首字母 + 昵称哈希取色生成 SVG，
  // 它的签名收 email 但函数体没用到，所以这里不传也一样
  function avatarUrl(nick) {
    try { return FlmCommentSDK.getAvatarUrl('', nick || ''); }
    catch (e) { return ''; }
  }
  function ago(t) {
    try { return FlmCommentSDK.formatTimeAgo(t); }
    catch (e) { return ''; }
  }

  /* ---------------- 骨架 ----------------
     字段竖排：标签 + 说明在上，输入框在下。打分单独一块灰底区域。 */
  el.innerHTML =
    '<section class="wc-box">' +
      '<header class="wc-head">' +
        '<span class="wc-ico" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>' +
          '</svg>' +
        '</span>' +
        '<h2 class="wc-h2">评论与评价</h2>' +
        '<span class="wc-count-badge" id="wcCount">0 条</span>' +
      '</header>' +

      '<div class="wc-sorts" id="wcSorts">' +
        '<button type="button" class="wc-sort active" data-sort="newest">最新</button>' +
        '<button type="button" class="wc-sort" data-sort="hottest">最热</button>' +
      '</div>' +

      '<div class="wc-card-panel">' +
        '<div class="wc-field">' +
          '<label class="wc-label" for="wcNick">昵称 <b>*</b></label>' +
          '<input type="text" class="wc-input" id="wcNick" maxlength="50" placeholder="你的称呼">' +
        '</div>' +
        '<div class="wc-field">' +
          '<label class="wc-label" for="wcEmail">电子邮箱 <b>*</b> <span class="wc-note">（用于接收通知）</span></label>' +
          '<input type="email" class="wc-input" id="wcEmail" placeholder="name@example.com">' +
        '</div>' +

        '<div class="wc-rate-block">' +
          '<div class="wc-rate-title" id="wcRateLabel">⭐ 文章打分 <span class="wc-note">（可选）</span></div>' +
          '<div class="wc-rate-row" id="wcStarPick" role="radiogroup" aria-labelledby="wcRateLabel">' +
            [1, 2, 3, 4, 5].map(function (n) {
              return '<span data-star="' + n + '" role="radio" aria-checked="false" tabindex="0" ' +
                'aria-label="' + n + ' 分">☆</span>';
            }).join('') +
          '</div>' +
          // 提示放在星星容器外：留在里面会参与同一行的 flex 布局，
          // 文案长度变化会挤动星星的位置
          '<span class="wc-rate-tip" id="wcStarTip">未选中打分，发表普通评论</span>' +
        '</div>' +

        '<div class="wc-field">' +
          '<label class="wc-label" for="wcContent">评论内容 <b>*</b></label>' +
          '<textarea class="wc-textarea" id="wcContent" rows="4" placeholder="表达你的想法与反馈…"></textarea>' +
        '</div>' +

        '<div class="wc-actions">' +
          '<span class="wc-msg" id="wcMsg"></span>' +
          '<button type="button" class="wc-btn" id="wcSubmit">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>' +
            '发表评论' +
          '</button>' +
        '</div>' +
      '</div>' +

      '<div class="wc-list" id="wcList"></div>' +
    '</section>';

  var listBox = el.querySelector('#wcList');
  var countBadge = el.querySelector('#wcCount');
  var msgBox = el.querySelector('#wcMsg');
  var starPick = el.querySelector('#wcStarPick');
  var starTip = el.querySelector('#wcStarTip');
  var nickInput = el.querySelector('#wcNick');
  var emailInput = el.querySelector('#wcEmail');
  var contentInput = el.querySelector('#wcContent');
  var submitBtn = el.querySelector('#wcSubmit');
  var chosenStar = 0;

  /* ---------------- 打分选择 ---------------- */
  function paintStars() {
    Array.prototype.forEach.call(starPick.querySelectorAll('span[data-star]'), function (sp) {
      var n = Number(sp.getAttribute('data-star'));
      var on = n <= chosenStar;
      sp.textContent = on ? '★' : '☆';
      sp.classList.toggle('on', on);
      sp.setAttribute('aria-checked', n === chosenStar ? 'true' : 'false');
    });
    starTip.textContent = chosenStar
      ? chosenStar + ' 分' + (chosenStar === 5 ? '，力荐！' : (chosenStar <= 2 ? '，有点失望…' : '，还不错'))
      : '未选中打分，发表普通评论';
  }

  function setStar(n) {
    // 再点同一颗星取消打分，回到普通评论
    chosenStar = (chosenStar === n) ? 0 : n;
    paintStars();
  }

  starPick.addEventListener('click', function (e) {
    // 用 closest 而不是直接读 e.target：星星撑大后内部可能命中文本节点包装，
    // 直接判断 e.target 会漏掉落在 padding 区域的点击
    var t = e.target && e.target.closest ? e.target.closest('span[data-star]') : null;
    if (!t) return;
    setStar(Number(t.getAttribute('data-star')));
  });

  // 键盘操作：空格/回车选中，左右方向键加减
  starPick.addEventListener('keydown', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('span[data-star]') : null;
    if (!t) return;
    var n = Number(t.getAttribute('data-star'));
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setStar(n);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      var next = Math.min(5, Math.max(1, n + (e.key === 'ArrowRight' ? 1 : -1)));
      var el2 = starPick.querySelector('span[data-star="' + next + '"]');
      if (el2) el2.focus();
    }
  });

  /* ---------------- 排序切换 ---------------- */
  el.querySelector('#wcSorts').addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.wc-sort') : null;
    if (!btn) return;
    var s = btn.getAttribute('data-sort');
    if (!s || s === curSort) return;
    curSort = s;
    Array.prototype.forEach.call(el.querySelectorAll('.wc-sort'), function (b) {
      b.classList.toggle('active', b === btn);
    });
    load();
  });

  /* ---------------- 渲染 ---------------- */
  function card(c, isReply) {
    var cid = String(c.id || '');
    var likes = Number(c.likes) || 0;
    var url = c.avatar || avatarUrl(c.nickname);
    return '<article class="' + (isReply ? 'wc-reply' : 'wc-item') + '" data-cid="' + esc(cid) + '">' +
      '<div class="wc-item-head">' +
        (url ? '<img class="wc-avatar" src="' + esc(url) + '" alt="" aria-hidden="true">' : '') +
        '<div class="wc-who">' +
          '<span class="wc-nick">' + esc(c.nickname || '匿名') + '</span>' +
          '<span class="wc-time">' + esc(ago(c.created_at || c.createdAt || '')) + '</span>' +
        '</div>' +
        (c.rating ? '<span class="wc-item-rate">' + stars(c.rating) + '</span>' : '') +
      '</div>' +
      '<div class="wc-text">' + esc(c.content || '').replace(/\n/g, '<br>') + '</div>' +
      '<div class="wc-item-foot">' +
        '<button type="button" class="wc-act" data-act="like" data-id="' + esc(cid) + '">👍 ' + likes + '</button>' +
        '<button type="button" class="wc-act" data-act="reply" data-id="' + esc(cid) + '">回复</button>' +
      '</div>' +
      (c.replies && c.replies.length
        ? '<div class="wc-replies">' + c.replies.map(function (r) { return card(r, true); }).join('') + '</div>'
        : '') +
    '</article>';
  }

  function render(data) {
    var list = (data && data.comments) || [];
    var stats = (data && data.stats) || {};
    var cnt = Number(stats.count);
    if (!isFinite(cnt)) cnt = list.length;
    countBadge.textContent = cnt + ' 条';

    // 有人打过分才显示均分，纯评论区不摆一个 0.0 占地方
    var avg = Number(stats.average);
    var old = el.querySelector('.wc-avg');
    if (old) old.remove();
    if (isFinite(avg) && avg > 0) {
      var box = document.createElement('div');
      box.className = 'wc-avg';
      box.innerHTML = '<span class="wc-avg-num">' + avg.toFixed(1) + '</span>' +
        '<span class="wc-avg-stars">' + stars(avg) + '</span>' +
        '<span class="wc-note">平均分</span>';
      el.querySelector('.wc-sorts').insertAdjacentElement('afterend', box);
    }

    listBox.innerHTML = list.length
      ? list.map(function (c) { return card(c, false); }).join('')
      : '<div class="wc-empty">还没有评论，来抢个沙发吧～</div>';
  }

  function load() {
    listBox.innerHTML = '<div class="wc-empty">加载中…</div>';
    sdk.fetchComments({ page: 1, limit: LIMIT, sort: curSort }, function (err, res) {
      if (err) {
        listBox.innerHTML = '<div class="wc-tip">评论加载失败：' + esc(err.message || '网络错误') + '</div>';
        return;
      }
      render((res && res.data) || {});
    });
  }

  /* ---------------- 提交 ---------------- */
  function setMsg(text, isErr) {
    msgBox.textContent = text || '';
    msgBox.className = 'wc-msg' + (isErr ? ' err' : '');
  }

  submitBtn.addEventListener('click', function () {
    var nick = nickInput.value.trim();
    var email = emailInput.value.trim();
    var content = contentInput.value.trim();
    if (!nick) { setMsg('请填昵称', true); nickInput.focus(); return; }
    if (!email) { setMsg('请填邮箱', true); emailInput.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setMsg('邮箱格式不对', true); emailInput.focus(); return; }
    if (!content) { setMsg('评论内容不能为空', true); contentInput.focus(); return; }

    submitBtn.disabled = true;
    setMsg('提交中…');
    sdk.submit({
      nickname: nick, email: email,
      rating: chosenStar || null, content: content
    }, function (err) {
      submitBtn.disabled = false;
      if (err) { setMsg('提交失败：' + (err.message || '网络错误'), true); return; }
      setMsg(pick([
        '提交成功，等审核通过就会显示',
        '已收到，感谢反馈～',
        '搞定，审核通过后公开显示'
      ]));
      contentInput.value = '';
      chosenStar = 0;
      paintStars();   // 同时会把 starTip 复位
    });
  });

  /* ---------------- 点赞 / 回复 ---------------- */
  listBox.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.wc-act') : null;
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    if (!id) return;
    if (btn.getAttribute('data-act') === 'like') {
      sdk.like(id, function (err) {
        if (err) { setMsg('点赞失败：' + (err.message || ''), true); return; }
        load();
      });
    } else {
      replyForm(id, btn);
    }
  });

  function replyForm(id, btn) {
    var item = btn.closest('[data-cid]');
    if (!item) return;
    var exist = item.querySelector('.wc-reply-form');
    if (exist) { exist.remove(); return; }
    var box = document.createElement('div');
    box.className = 'wc-reply-form';
    box.innerHTML =
      '<input type="text" class="wc-input" placeholder="昵称 *">' +
      '<input type="email" class="wc-input" placeholder="邮箱 *">' +
      '<textarea class="wc-textarea" rows="2" placeholder="回复内容…"></textarea>' +
      '<div class="wc-actions">' +
        '<button type="button" class="wc-btn ghost">取消</button>' +
        '<button type="button" class="wc-btn sm">回复</button>' +
      '</div>';
    item.appendChild(box);
    box.querySelector('.wc-btn.ghost').addEventListener('click', function () { box.remove(); });
    box.querySelector('.wc-btn.sm').addEventListener('click', function () {
      var n = box.querySelector('input[type=text]').value.trim();
      var m = box.querySelector('input[type=email]').value.trim();
      var t = box.querySelector('textarea').value.trim();
      if (!n || !m || !t) { setMsg('昵称、邮箱、内容都要填', true); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) { setMsg('邮箱格式不对', true); return; }
      sdk.reply(id, { nickname: n, email: m, content: t }, function (err) {
        if (err) { setMsg('回复失败：' + (err.message || ''), true); return; }
        box.remove();
        setMsg('回复已提交');
        load();
      });
    });
  }

  load();
})();