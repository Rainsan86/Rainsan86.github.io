/* ============================================================
   文章编辑器
   两个面板双向同步：
     · 可视化面板 —— contenteditable，直接改文字看效果
     · Markdown 面板 —— 源码，改完切回去也能看到
   任一侧编辑都会实时同步到另一侧，不需要手动转换。

   Markdown 解析与 HTML 反解析都是自己实现的，不引外部库。
   ============================================================ */
(function () {
  'use strict';

  /* ============ 通用工具 ============ */

  // 所有用户输入进入 HTML 前必须过这层，防止标签注入
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&#34;')
      .replace(/'/g, '&#39;');
  }
  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&#34;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 颜色值归一化：execCommand('foreColor') 在不同浏览器分别返回
     rgb(255, 0, 0) 或 #ff0000，统一成小写 hex，源码面板才不会因浏览器而异。
     只放行 hex / rgb / rgba 三种形式，防止把任意字符串塞进 style 属性。 */
  function normColor(c) {
    const s = String(c).trim().toLowerCase();
    let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (m) {
      const h = m[1];
      return '#' + (h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h);
    }
    m = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,[^)]*)?\)$/);
    if (m) {
      const hex = [1, 2, 3].map(i => {
        const v = Math.max(0, Math.min(255, parseInt(m[i], 10)));
        return (v < 16 ? '0' : '') + v.toString(16);
      }).join('');
      return '#' + hex;
    }
    return '';   // 非法值直接丢弃，调用方会跳过整个 span
  }

  function slug(text, used) {
    let base = String(text).trim().toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
    if (!base) base = 'section';
    let id = base, i = 2;
    while (used[id]) { id = base + '-' + i; i++; }
    used[id] = true;
    return id;
  }

  /* 标题的纯文本形态：生成锚点与目录文字时必须用它。
     标题里允许带颜色 span、**粗体**、链接等行内标记，但这些标记一旦
     直接参与 id 生成，锚点就会变成 `span-style-color-f782c2-…-span`
     这种垃圾；目录项也会把 <span> 当普通文字原样显示出来。 */
  function plainText(s) {
    return String(s)
      .replace(/<[^>]+>/g, '')                              // 行内 HTML（颜色 span 等）
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')             // 图片 → alt
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')              // 链接 → 文字
      .replace(/`([^`]+)`/g, '$1')                          // 行内代码
      .replace(/\*\*([^*]+)\*\*/g, '$1')                    // 粗体
      .replace(/__([^_]+)__/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')                        // 删除线
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')              // 斜体
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .trim();
  }

  /* ============ 本地图片仓库 ============
     静态站没有服务器接收上传，所以本地选的图片只做预览：
     读成 dataURL 存在内存里，Markdown 中写成 local:文件名 引用。
     导出时会自动换成 ../image/文件名，你把图片放进 image/ 目录即可。 */
  const LOCAL_PREFIX = 'local:';
  const imageStore = Object.create(null);   // { 'local:a.png': dataURL }

  function placeholderSVG() {
    return 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="110">' +
      '<rect width="320" height="110" fill="#ededf4"/>' +
      '<text x="160" y="60" font-size="13" fill="#9a9ab0" text-anchor="middle">' +
      '本地图片需重新选择</text></svg>');
  }

  function resolveSrc(url) {
    if (url.indexOf(LOCAL_PREFIX) === 0) return imageStore[url] || placeholderSVG();
    return url;
  }

  // 导出时把本地引用换成站内相对路径
  function exportSrc(url) {
    if (url.indexOf(LOCAL_PREFIX) === 0) return '../image/' + url.slice(LOCAL_PREFIX.length);
    return url;
  }

  function localList(text) {
    const found = [];
    const re = /(?:!\[[^\]]*\]\()?(local:[^)\s"']+)/g;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1].slice(LOCAL_PREFIX.length);
      if (found.indexOf(name) === -1) found.push(name);
    }
    return found;
  }

  /* ============ Markdown → HTML ============ */

  function inline(src) {
    const codes = [];
    let s = String(src);

    // 行内代码先抽出占位，否则里面的 * _ [ ] 会被当成格式标记
    s = s.replace(/`([^`]+)`/g, (m, code) => {
      codes.push('<code>' + esc(code) + '</code>');
      return '\u0000C' + (codes.length - 1) + '\u0000';
    });

    // 字体颜色：Markdown 没有原生语法，用行内 span 承载
    // （这也正是 execCommand('foreColor') 的产物，两个面板能无损往返）。
    // 只把开合标签抽成占位，中间文字继续走正常行内解析，
    // 所以颜色里还能嵌粗体、链接。
    // 颜色值非法时原样留字符串，会在下面的 esc() 里被转义成可见文本，
    // 不会产出半个标签。
    s = s.replace(/<span\s+style="(?:[^"]*[;\s])?color:\s*([^;"]+)[^"]*"\s*>([\s\S]*?)<\/span>/gi,
      (m, c, inner) => {
        const col = normColor(c);
        if (!col) return inner;
        codes.push('<span style="color:' + escAttr(col) + '">');
        const open = '\u0000C' + (codes.length - 1) + '\u0000';
        codes.push('</span>');
        return open + inner + '\u0000C' + (codes.length - 1) + '\u0000';
      });

    s = esc(s);

    // 图片要先于链接处理：语法相似，图片只多一个 ! 前缀
    // 注意：url/alt 出自上面已 esc() 过的字符串，本身就是 HTML 转义态，
    // 这里不能再 escAttr 一次 —— 否则带 & 的地址（如 ?a=1&b=2）
    // 会被转成 &amp;amp;，导出一轮链接就坏了。
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) =>
      '<img src="' + resolveSrc(url) + '" data-src="' + url +
      '" alt="' + alt + '" loading="lazy">');

    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
      const ext = /^https?:\/\//i.test(url);
      return '<a href="' + url + '"' +
        (ext ? ' target="_blank" rel="noopener"' : '') + '>' + text + '</a>';
    });

    // 粗体在斜体之前，否则 *** 会被拆错
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    return s.replace(/\u0000C(\d+)\u0000/g, (m, i) => codes[+i]);
  }

  // 逐行状态机：代码块与列表需要跨行状态，纯正则替换做不到
  function render(md) {
    const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
    const out = [], toc = [], used = {};
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      const fence = line.match(/^```\s*(\S*)\s*$/);
      if (fence) {
        const body = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
        i++;
        const cls = fence[1] ? ' class="language-' + escAttr(fence[1]) + '"' : '';
        out.push('<pre><code' + cls + '>' + esc(body.join('\n')) + '</code></pre>');
        continue;
      }

      if (/^\s*(?:-\s*-\s*-|\*\s*\*\s*\*|_\s*_\s*_)[-*_\s]*$/.test(line)) {
        out.push('<hr>'); i++; continue;
      }

      const head = line.match(/^(#{1,6})\s+(.*)$/);
      if (head) {
        const level = head[1].length;
        const text = head[2].trim();
        // h2 与 h3 都生成锚点进目录（h3 在目录里缩进显示）：
        // h1 是文章大标题不重复列出，h4 以下层级太深不入目录
        if (level === 2 || level === 3) {
          // 锚点与目录文字取纯文本：标题里的颜色 span / 粗体标记
          // 不能进 id，否则锚点会变成 span-style-color-… 这种垃圾
          const label = plainText(text);
          const id = slug(label, used);
          toc.push({ id: id, text: label, level: level });
          out.push('<h' + level + ' id="' + escAttr(id) + '">' + inline(text) + '</h' + level + '>');
        } else {
          out.push('<h' + level + '>' + inline(text) + '</h' + level + '>');
        }
        i++; continue;
      }

      if (/^>\s?/.test(line)) {
        const body = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          body.push(lines[i].replace(/^>\s?/, '')); i++;
        }
        out.push('<blockquote>' + body.map(inline).join('<br>') + '</blockquote>');
        continue;
      }

      const li = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
      if (li) {
        const ordered = /\d/.test(li[1]);
        out.push(ordered ? '<ol>' : '<ul>');
        while (i < lines.length) {
          const m = lines[i].match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
          if (!m || /\d/.test(m[1]) !== ordered) break;
          out.push('<li>' + inline(m[2]) + '</li>');
          i++;
        }
        out.push(ordered ? '</ol>' : '</ul>');
        continue;
      }

      if (!line.trim()) { i++; continue; }

      const para = [];
      while (i < lines.length && lines[i].trim() &&
             !/^(#{1,6}\s|>|```)/.test(lines[i]) &&
             !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      if (para.length) out.push('<p>' + para.map(inline).join('<br>') + '</p>');
    }

    return { html: out.join('\n'), toc: toc };
  }

  /* ============ HTML → Markdown ============
     可视化面板编辑后要转回源码。
     contenteditable 与 execCommand 会产出 b/i/div/span 等各种标签，
     这里统一归并，只保留语义。 */

  function inlineMd(node) {
    let s = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) {
        // 富文本里的换行没有语义，压成空格；&nbsp; 还原成普通空格
        s += n.nodeValue.replace(/\u00a0/g, ' ').replace(/\n+/g, ' ');
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      const inner = inlineMd(n);

      switch (tag) {
        case 'br': s += '\n'; break;
        case 'strong': case 'b':
          s += inner.trim() ? '**' + inner + '**' : inner; break;
        case 'em': case 'i':
          s += inner.trim() ? '*' + inner + '*' : inner; break;
        case 'del': case 's': case 'strike':
          s += inner.trim() ? '~~' + inner + '~~' : inner; break;
        case 'code':
          s += '`' + n.textContent.replace(/\u00a0/g, ' ') + '`'; break;
        case 'a': {
          const href = n.getAttribute('href') || '';
          s += href ? '[' + (inner || href) + '](' + href + ')' : inner;
          break;
        }
        case 'img': {
          // data-src 保存原始引用（本地图片的 src 是 dataURL，不能直接写回源码）
          const src = n.getAttribute('data-src') || n.getAttribute('src') || '';
          s += '![' + (n.getAttribute('alt') || '') + '](' + src + ')';
          break;
        }
        // 有颜色的 span 写回行内 span 语法，与 inline() 的解析对称。
        // execCommand('foreColor') 老浏览器可能产出 <font color>，一并归并。
        case 'span': case 'font': {
          const col = normColor(
            (n.style && n.style.color) || n.getAttribute('color') || ''
          );
          s += (col && inner.trim())
            ? '<span style="color:' + col + '">' + inner + '</span>'
            : inner;
          break;
        }
        default: s += inner;
      }
    });
    return s;
  }

  function html2md(root) {
    const blocks = [];

    function walk(parent) {
      parent.childNodes.forEach(node => {
        if (node.nodeType === 3) {
          const t = node.nodeValue.replace(/\u00a0/g, ' ').trim();
          if (t) blocks.push(t);
          return;
        }
        if (node.nodeType !== 1) return;
        const tag = node.tagName.toLowerCase();

        switch (tag) {
          case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
            const txt = inlineMd(node).trim();
            if (txt) blocks.push('#'.repeat(+tag[1]) + ' ' + txt);
            break;
          }
          case 'p': case 'div': {
            // div 常是 execCommand 造出的段落容器；
            // 内部还有块级元素时继续下钻，避免嵌套内容被压平
            if (node.querySelector('h1,h2,h3,h4,h5,h6,ul,ol,blockquote,pre,hr,p,div')) {
              walk(node);
            } else {
              const txt = inlineMd(node).trim();
              if (txt) blocks.push(txt);
            }
            break;
          }
          case 'ul': case 'ol': {
            const ordered = tag === 'ol';
            const items = [];
            let n = 1;
            Array.prototype.forEach.call(node.children, li => {
              if (li.tagName.toLowerCase() !== 'li') return;
              const txt = inlineMd(li).replace(/\n+/g, ' ').trim();
              if (txt) items.push((ordered ? (n++) + '. ' : '- ') + txt);
            });
            if (items.length) blocks.push(items.join('\n'));
            break;
          }
          case 'blockquote': {
            const txt = inlineMd(node).trim();
            if (txt) blocks.push(txt.split('\n').map(l => '> ' + l.trim()).join('\n'));
            break;
          }
          case 'pre': {
            const codeEl = node.querySelector('code');
            const lang = (codeEl && (codeEl.className.match(/language-(\S+)/) || [])[1]) || '';
            const body = (codeEl || node).textContent.replace(/\u00a0/g, ' ').replace(/\n$/, '');
            blocks.push('```' + lang + '\n' + body + '\n```');
            break;
          }
          case 'hr': blocks.push('---'); break;
          case 'br': break;
          default: {
            const txt = inlineMd(node).trim();
            if (txt) blocks.push(txt);
          }
        }
      });
    }

    walk(root);
    return blocks.join('\n\n');
  }

  /* ============ DOM ============ */
  const $ = id => document.getElementById(id);
  const fTitle = $('fTitle'), fCategory = $('fCategory'), fDate = $('fDate');
  const fRead = $('fRead'), fTags = $('fTags'), fCover = $('fCover');
  const fSummary = $('fSummary'), fSlug = $('fSlug');
  const mdInput = $('mdInput');
  const visualBody = $('visualBody');
  const previewHero = $('previewHero');
  const coverPick = $('coverPick'), imagePick = $('imagePick');
  const exportBox = $('exportBox'), exportCode = $('exportCode'), cardCode = $('cardCode');
  const imgNotice = $('imgNotice');
  const toastEl = $('toast');
  if (!mdInput || !visualBody) return;

  const DRAFT_KEY = 'editor-draft';
  let syncing = false;          // 防止两侧互相触发形成回路
  let activePane = 'visual';

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* ============ 文章头（两个面板共用） ============ */
  function updateHero() {
    const cover = fCover.value.trim();
    const coverEl = previewHero.querySelector('.preview-cover');
    const src = cover ? resolveSrc(cover) : '';
    if (src) {
      coverEl.style.backgroundImage = "url('" + src.replace(/'/g, "\\'") + "')";
      coverEl.classList.remove('empty');
      coverEl.textContent = '';
    } else {
      coverEl.style.backgroundImage = '';
      coverEl.classList.add('empty');
      coverEl.textContent = '未设置封面图';
    }
    previewHero.querySelector('.article-category').textContent = fCategory.value || '未分类';
    previewHero.querySelector('h1').textContent = fTitle.value.trim() || '未命名文章';
    previewHero.querySelector('.article-summary').textContent =
      fSummary.value.trim() || '（这里显示文章摘要）';
    previewHero.querySelector('.article-details').innerHTML =
      '<span>📅 发布于 ' + esc(fDate.value || '未设置') + '</span>' +
      '<span>🕒 阅读约 ' + esc(fRead.value || '?') + ' 分钟</span>' +
      (fTags.value.trim() ? '<span>🏷️ ' + esc(fTags.value.trim()) + '</span>' : '');
  }

  /* ============ 字数 / 阅读时长 ============
     阅读时长按中文 400 字/分钟粗算，只用来给个参考值。
     用户一旦自己改过这个输入框就不再自动覆盖，避免抢输入。 */
  const statWords = $('statWords'), statRead = $('statRead'), statSave = $('statSave');
  const tocPreview = $('tocPreview'), tocList = $('tocList'), tocCount = $('tocCount');
  let readTouched = false;

  function countChars(md) {
    return String(md)
      .replace(/```[\s\S]*?```/g, '')                     // 代码块不计入正文
      .replace(/<[^>]+>/g, '')                            // 行内 HTML
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')               // 图片说明不计入
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')            // 链接只留文字
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // 行首标记
      .replace(/[*_~`]/g, '')                             // 行内标记
      .replace(/\s+/g, '')                                // 空白不算字
      .length;
  }

  function updateStats() {
    const chars = countChars(mdInput.value);
    const minutes = Math.max(1, Math.round(chars / 400));
    if (statWords) statWords.textContent = chars;
    if (statRead) statRead.textContent = minutes;
    if (!readTouched && fRead) {
      const v = String(minutes);
      if (fRead.value !== v) { fRead.value = v; updateHero(); }
    }
  }

  // 目录预览：把 render() 算出的目录项照原样列出来
  function renderTocPreview(toc) {
    if (!tocPreview || !tocList) return;
    if (!toc || !toc.length) { tocPreview.hidden = true; return; }
    tocPreview.hidden = false;
    if (tocCount) tocCount.textContent = toc.length + ' 条';
    tocList.innerHTML = toc.map(t =>
      '<span class="lv' + t.level + '">' + esc(t.text) + '</span>').join('');
  }

  /* ============ 双向同步 ============ */

  function mdToVisual() {
    const r = render(mdInput.value);
    // 空内容也要留一个可落光标的段落，否则无法开始输入
    visualBody.innerHTML = r.html || '<p><br></p>';
    renderTocPreview(r.toc);
    updateStats();
  }

  function visualToMd() {
    mdInput.value = html2md(visualBody);
    // 可视化面板里改标题时也要刷新目录预览：
    // 只有走一趟 render() 才知道新的标题层级
    renderTocPreview(render(mdInput.value).toc);
    updateStats();
  }

  mdInput.addEventListener('input', () => {
    if (syncing) return;
    syncing = true;
    mdToVisual();
    syncing = false;
    saveDraftSoon();
  });

  visualBody.addEventListener('input', () => {
    if (syncing) return;
    syncing = true;
    // 只更新源码，不回写可视化面板：重建 DOM 会让光标跳到开头
    visualToMd();
    syncing = false;
    saveDraftSoon();
  });

  // 粘贴只取纯文本：富文本粘贴会带进大量脏标签，导出的 HTML 会很难看
  visualBody.addEventListener('paste', e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  /* ============ 面板切换 ============ */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.pane;
      if (target === activePane) return;

      syncing = true;
      // 离开可视化时写回源码；离开源码时重建可视化
      if (activePane === 'visual') visualToMd();
      else mdToVisual();
      syncing = false;

      activePane = target;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.pane').forEach(p =>
        p.classList.toggle('active', p.dataset.pane === target));
      document.querySelectorAll('.toolbar').forEach(b =>
        b.classList.toggle('active', b.dataset.bar === target));
      saveDraft();
    });
  });

  /* ============ 可视化工具栏 ============
     用 execCommand：虽已标记废弃，但它仍是浏览器里唯一可用的
     contenteditable 富文本命令接口，主流浏览器都还支持。 */
  function afterVisualEdit() {
    syncing = true;
    visualToMd();
    syncing = false;
    saveDraftSoon();
  }

  function cmd(name, val) {
    visualBody.focus();
    document.execCommand(name, false, val || null);
    afterVisualEdit();
  }

  function insertHTML(html) {
    visualBody.focus();
    document.execCommand('insertHTML', false, html);
    afterVisualEdit();
  }

  // 光标所在的块级元素，用于判断格式是否已应用（实现开关式切换）
  function currentBlock() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let n = sel.getRangeAt(0).startContainer;
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n !== visualBody) {
      if (/^(H1|H2|H3|H4|H5|H6|P|BLOCKQUOTE|PRE|DIV)$/.test(n.tagName || '')) return n;
      n = n.parentNode;
    }
    return null;
  }

  function toggleBlock(tag) {
    const cur = currentBlock();
    const same = cur && cur.tagName.toLowerCase() === tag.toLowerCase();
    cmd('formatBlock', same ? '<p>' : '<' + tag + '>');
  }

  const VISUAL_ACTIONS = {
    bold: () => cmd('bold'),
    italic: () => cmd('italic'),
    strike: () => cmd('strikeThrough'),
    h2: () => toggleBlock('h2'),
    h3: () => toggleBlock('h3'),
    quote: () => toggleBlock('blockquote'),
    ul: () => cmd('insertUnorderedList'),
    ol: () => cmd('insertOrderedList'),
    clean: () => cmd('removeFormat'),
    code: () => {
      const t = String(window.getSelection() || '');
      insertHTML('<code>' + esc(t || 'code') + '</code>&nbsp;');
    },
    codeblock: () => {
      const t = String(window.getSelection() || '');
      insertHTML('<pre><code>' + esc(t || '在这里写代码') + '</code></pre><p><br></p>');
    },
    hr: () => insertHTML('<hr><p><br></p>'),
    link: () => {
      const has = String(window.getSelection() || '').trim();
      const url = prompt('链接地址', 'https://');
      if (!url) return;
      if (has) cmd('createLink', url);
      else insertHTML('<a href="' + escAttr(url) + '" target="_blank" rel="noopener">' +
                      esc(url) + '</a>&nbsp;');
    },
    imageLink: () => {
      const url = prompt('图片地址（图床链接，或站内 ../image/xxx.webp）', 'https://');
      if (!url) return;
      insertHTML('<p><img src="' + escAttr(url) + '" data-src="' + escAttr(url) +
                 '" alt="" loading="lazy"></p>');
    },
    imageLocal: () => imagePick.click(),
    // 颜色由调色板弹层触发，这里留空占位避免误触
    color: () => {}
  };

  document.querySelectorAll('.toolbar[data-bar="visual"] .tb-btn').forEach(btn => {
    // 用 mousedown + preventDefault：click 会先让 contenteditable 失焦、丢掉选区
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const fn = VISUAL_ACTIONS[btn.dataset.act];
      if (fn) fn();
    });
  });

  /* ============ Markdown 工具栏 ============ */
  function syncFromMd() {
    syncing = true;
    mdToVisual();
    syncing = false;
    saveDraftSoon();
  }

  function wrap(before, after, placeholder) {
    const ta = mdInput;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || placeholder || '';
    ta.setRangeText(before + sel + (after === undefined ? before : after), s, e, 'end');
    if (s === e && sel) {
      ta.selectionStart = s + before.length;
      ta.selectionEnd = s + before.length + sel.length;
    }
    ta.focus();
    syncFromMd();
  }

  function linePrefix(prefix) {
    const ta = mdInput;
    const val = ta.value;
    const lineStart = val.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let lineEnd = val.indexOf('\n', ta.selectionEnd);
    if (lineEnd === -1) lineEnd = val.length;
    const lines = val.slice(lineStart, lineEnd).split('\n');
    // 已有相同前缀则移除，做成开关
    const allHave = lines.every(l => l.startsWith(prefix));
    ta.setRangeText(lines.map(l => allHave ? l.slice(prefix.length) : prefix + l).join('\n'),
                    lineStart, lineEnd, 'end');
    ta.focus();
    syncFromMd();
  }

  const MD_ACTIONS = {
    bold: () => wrap('**', '**', '粗体'),
    italic: () => wrap('*', '*', '斜体'),
    strike: () => wrap('~~', '~~', '删除线'),
    code: () => wrap('`', '`', 'code'),
    codeblock: () => wrap('```\n', '\n```', '代码'),
    h2: () => linePrefix('## '),
    h3: () => linePrefix('### '),
    quote: () => linePrefix('> '),
    ul: () => linePrefix('- '),
    ol: () => linePrefix('1. '),
    hr: () => wrap('\n---\n', '', ''),
    link: () => {
      const url = prompt('链接地址', 'https://');
      if (url) wrap('[', '](' + url + ')', '链接文字');
    },
    imageLink: () => {
      const url = prompt('图片地址（图床链接，或站内 ../image/xxx.webp）', 'https://');
      if (url) wrap('![', '](' + url + ')', '图片说明');
    },
    imageLocal: () => imagePick.click(),
    // 颜色由调色板弹层触发
    color: () => {}
  };

  document.querySelectorAll('.toolbar[data-bar="markdown"] .tb-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fn = MD_ACTIONS[btn.dataset.act];
      if (fn) fn();
    });
  });

  /* ============ 字体颜色 ============
     两个面板共用一个调色板弹层：
       · 可视化面板 —— execCommand('foreColor')，用 mousedown 触发以保住选区
       · Markdown 面板 —— 包一层 <span style="color:…">
     Markdown 本身没有颜色语法，行内 span 是通用做法，
     导出的成品页面直接带 style 生效，不依赖额外 CSS。 */
  const COLOR_PRESETS = [
    { c: '#f782c2', n: '主题粉' },
    { c: '#ff6b8a', n: '樱桃红' },
    { c: '#e05353', n: '警示红' },
    { c: '#ff9f43', n: '暖橙' },
    { c: '#f5c542', n: '柠檬黄' },
    { c: '#43b581', n: '薄荷绿' },
    { c: '#2fa4d9', n: '天空蓝' },
    { c: '#7c6bd8', n: '薰衣草' },
    { c: '#9aa0b4', n: '灰蓝' },
    { c: '#2f3245', n: '墨黑' }
  ];

  function colorPanel() {
    const box = document.createElement('div');
    box.className = 'color-pop';
    box.innerHTML =
      '<div class="cp-grid">' +
        COLOR_PRESETS.map(p =>
          '<button type="button" class="cp-dot" data-color="' + escAttr(p.c) + '" ' +
          'title="' + escAttr(p.n) + '" aria-label="' + escAttr(p.n) + '" ' +
          'style="background:' + escAttr(p.c) + '"></button>').join('') +
      '</div>' +
      '<div class="cp-custom">' +
        '<input type="color" class="cp-input" value="#f782c2" aria-label="自定义颜色">' +
        '<button type="button" class="cp-apply">用这个颜色</button>' +
      '</div>' +
      '<button type="button" class="cp-clear">清除颜色</button>';
    // 挂 body：工具栏窄屏有 overflow-x:auto，放在里面会被裁切
    document.body.appendChild(box);
    return box;
  }

  // 弹层是 fixed，按按钮位置摆放；右侧或下方空间不足时自动翻边
  function placePop(pop, btn) {
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth || 216;
    const h = pop.offsetHeight || 180;
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function applyColor(pane, color) {
    const col = normColor(color);
    if (!col) return;
    if (pane === 'visual') {
      cmd('foreColor', col);
    } else {
      const ta = mdInput;
      const s = ta.selectionStart, e = ta.selectionEnd;
      const sel = ta.value.slice(s, e) || '彩色文字';
      // 已经被同样的 span 包住时替换掉旧颜色，避免层层嵌套
      const inner = sel.replace(/^<span style="color:[^"]*">([\s\S]*)<\/span>$/, '$1');
      ta.setRangeText('<span style="color:' + col + '">' + inner + '</span>', s, e, 'end');
      ta.focus();
      syncFromMd();
    }
  }

  function clearColor(pane) {
    if (pane === 'visual') {
      // removeFormat 会连粗斜体一起清掉，所以只解除 span 的 color
      visualBody.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const frag = sel.getRangeAt(0).cloneContents();
        const tmp = document.createElement('div');
        tmp.appendChild(frag);
        tmp.querySelectorAll('span[style*="color"],font[color]').forEach(el => {
          if (el.style) el.style.color = '';
          el.removeAttribute('color');
        });
        insertHTML(tmp.innerHTML);
      }
    } else {
      const ta = mdInput;
      const s = ta.selectionStart, e = ta.selectionEnd;
      const sel = ta.value.slice(s, e);
      if (!sel) { toast('先选中要清除颜色的文字'); return; }
      ta.setRangeText(
        sel.replace(/<span style="color:[^"]*">([\s\S]*?)<\/span>/g, '$1'), s, e, 'end');
      ta.focus();
      syncFromMd();
    }
  }

  document.querySelectorAll('.tb-color').forEach(btn => {
    const bar = btn.closest('.toolbar');
    const pane = bar.dataset.bar;
    const pop = colorPanel();
    let open = false;

    function setOpen(v) {
      open = v;
      pop.classList.toggle('show', v);
      btn.classList.toggle('on', v);
      if (v) placePop(pop, btn);
    }

    // 可视化面板必须用 mousedown + preventDefault，否则选区会在按下时消失
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!open);
    });

    pop.addEventListener('mousedown', e => {
      const dot = e.target.closest('.cp-dot');
      const apply = e.target.closest('.cp-apply');
      const clear = e.target.closest('.cp-clear');
      // 原生 color 选择器需要真实点击，不能阻止它的默认行为
      if (e.target.closest('.cp-input')) return;
      e.preventDefault();
      if (dot) { applyColor(pane, dot.dataset.color); setOpen(false); }
      else if (apply) { applyColor(pane, pop.querySelector('.cp-input').value); setOpen(false); }
      else if (clear) { clearColor(pane); setOpen(false); }
    });

    document.addEventListener('mousedown', e => {
      if (open && !pop.contains(e.target) && e.target !== btn) setOpen(false);
    });
    document.addEventListener('keydown', e => {
      if (open && e.key === 'Escape') setOpen(false);
    });
  });

  mdInput.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); MD_ACTIONS.bold(); }
    else if (k === 'i') { e.preventDefault(); MD_ACTIONS.italic(); }
    else if (k === 'k') { e.preventDefault(); MD_ACTIONS.link(); }
  });

  /* ============ 本地图片 ============ */
  function readImage(file, cb) {
    const rd = new FileReader();
    rd.onload = () => cb(rd.result);
    rd.onerror = () => toast('图片读取失败');
    rd.readAsDataURL(file);
  }

  imagePick.addEventListener('change', () => {
    const file = imagePick.files && imagePick.files[0];
    imagePick.value = '';        // 清空，让同一文件能重复选择
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }

    readImage(file, dataURL => {
      const key = LOCAL_PREFIX + file.name;
      imageStore[key] = dataURL;
      const alt = file.name.replace(/\.[^.]+$/, '');

      if (activePane === 'visual') {
        insertHTML('<p><img src="' + escAttr(dataURL) + '" data-src="' + escAttr(key) +
                   '" alt="' + escAttr(alt) + '" loading="lazy"></p>');
      } else {
        wrap('![' + alt + '](' + key + ')', '', '');
      }
      refreshImgNotice();
      toast('已插入 ' + file.name);
    });
  });

  coverPick.addEventListener('change', () => {
    const file = coverPick.files && coverPick.files[0];
    coverPick.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    readImage(file, dataURL => {
      const key = LOCAL_PREFIX + file.name;
      imageStore[key] = dataURL;
      fCover.value = key;
      updateHero();
      refreshImgNotice();
      saveDraft();
      toast('封面已设为 ' + file.name);
    });
  });

  // 列出需要手动放进 image/ 的本地图片
  function refreshImgNotice() {
    const names = localList(mdInput.value + ' ' + fCover.value);
    if (!names.length) { imgNotice.classList.remove('show'); return; }
    imgNotice.innerHTML = '<b>本地图片</b> · 导出前把这些文件放进 <code>image/</code> 目录：' +
      names.map(n => '<code>' + esc(n) + '</code>').join('、');
    imgNotice.classList.add('show');
  }

  /* ============ 草稿 ============ */
  // 保存成功时闪一下状态栏，让人知道内容没丢
  function flashSaved() {
    if (!statSave) return;
    statSave.textContent = '已保存';
    statSave.classList.add('on');
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(() => {
      statSave.classList.remove('on');
      statSave.textContent = '自动保存';
    }, 1200);
  }

  function saveDraft() {
    refreshImgNotice();
    try {
      // 图片 dataURL 不入草稿：单张就可能几 MB，会直接撑爆 localStorage 配额
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        title: fTitle.value, category: fCategory.value, date: fDate.value,
        read: fRead.value, tags: fTags.value, cover: fCover.value,
        summary: fSummary.value, slug: fSlug.value, md: mdInput.value
      }));
      flashSaved();
    } catch (e) { /* 隐私模式或超配额，忽略 */ }
  }

  /* 打字时不要每个键都写一次 localStorage：
     长文里一次序列化 + 落盘会明显拖慢输入手感，攒 400ms 再写。 */
  let saveTimer = null;
  function saveDraftSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 400);
  }

  function loadDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return false; }
    if (!d) return false;
    fTitle.value = d.title || '';
    fCategory.value = d.category || '技术';
    fDate.value = d.date || '';
    fRead.value = d.read || '';
    fTags.value = d.tags || '';
    fCover.value = d.cover || '';
    fSummary.value = d.summary || '';
    fSlug.value = d.slug || '';
    mdInput.value = d.md || '';
    // 草稿里已有阅读时长就当作用户定过的，不再自动覆盖
    readTouched = !!d.read;
    return true;
  }

  /* ============ 导出 ============ */
  function buildHTML() {
    const r = render(mdInput.value);
    const title = fTitle.value.trim() || '未命名文章';
    const summary = fSummary.value.trim();
    const cover = exportSrc(fCover.value.trim());
    const cat = fCategory.value || '未分类';
    const date = fDate.value || '';
    const read = fRead.value || '';
    const tags = fTags.value.trim();

    // 预览用的 dataURL 不能进成品：换回 image/ 相对路径并去掉辅助属性
    let body = r.html.replace(/<img\b[^>]*>/g, tag => {
      const ds = (tag.match(/data-src="([^"]*)"/) || [])[1];
      const alt = (tag.match(/alt="([^"]*)"/) || [])[1] || '';
      const src = ds ? exportSrc(ds) : ((tag.match(/src="([^"]*)"/) || [])[1] || '');
      return '<img src="' + escAttr(src) + '" alt="' + escAttr(alt) + '" loading="lazy">';
    });
    body = body.split('\n').map(l => l ? '      ' + l : l).join('\n');

    const toc = r.toc.length
      ? '\n    <aside class="article-toc" aria-label="文章目录">\n      <h2>目录</h2>\n' +
        r.toc.map(t => '      <a class="lv' + (t.level || 2) + '" href="#' + escAttr(t.id) + '">' + esc(t.text) + '</a>').join('\n') +
        '\n    </aside>'
      : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | xm486 の小屋</title>
<meta name="description" content="${escAttr(summary || title)}">
<link rel="icon" type="image/png" sizes="32x32" href="../image/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="../image/favicon-16.png">
<link rel="apple-touch-icon" sizes="128x128" href="../image/favicon-128.png">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/whale.css">
<link rel="stylesheet" href="../css/comments.css">
</head>
<body>

<nav id="nav">
  <a href="../index.html" class="logo">😽 <span>xm486</span>の小屋</a>
  <div class="right">
    <ul class="links" id="navLinks">
      <li><a href="../index.html#about">关于我</a></li>
      <li><a href="../index.html#articles">文章</a></li>
      <li><a href="../index.html#friends">友链</a></li>
    </ul>
    <button id="themeToggle" title="切换日/夜模式" aria-label="切换主题">
      <span class="ic sun">☀️</span><span class="ic moon">🌙</span>
    </button>
    <button class="menu-btn" id="menuBtn" aria-label="展开菜单">☰</button>
  </div>
</nav>

<main class="article-page">
  <div class="article-shell">
    <a class="article-back" href="../index.html#articles">← 返回文章列表</a>

    <header class="article-hero">
      <div class="article-cover" style="background-image:url('${escAttr(cover)}')"></div>
      <div class="article-heading">
        <span class="article-category">${esc(cat)}</span>
        <h1>${esc(title)}</h1>
        <p class="article-summary">${esc(summary)}</p>
        <div class="article-details">
          <span>📅 发布于 ${esc(date)}</span>
          <span>🕒 阅读约 ${esc(read)} 分钟</span>${tags ? '\n          <span>🏷️ ' + esc(tags) + '</span>' : ''}
        </div>
      </div>
    </header>

    <div class="article-layout">
      <article class="article-content">
${body}
        <div class="article-footer">
          <span>发布于 ${esc(date)}</span>
          <a href="../index.html#articles">回到文章列表 →</a>
        </div>
      </article>

      <!-- 评分与评论（自绘版，基于 comment-sdk.js 核心逻辑）：
           只需核心 SDK，界面由 js/comments.js 按本站风格渲染 -->
      <div class="article-comments">
        <div id="flm-comment-widget" data-site="" data-page-key="" data-title=""></div>
      </div>${toc}
    </div>
  </div>
</main>

<!-- 评分评论：自绘组件基于 comment-sdk.js（无 UI 核心 SDK），页面参数自动填充 -->
<script>
  (function () {
    var el = document.getElementById('flm-comment-widget');
    if (!el) return;
    el.setAttribute('data-site', location.hostname || 'localhost');
    el.setAttribute('data-page-key', location.pathname.replace(/\\.html?$/, '').replace(/\\/+$/, '') || '/');
    el.setAttribute('data-title', document.title || '');
  })();
</script>
<script src="https://fakeicp.top/comment-sdk.js"></script>
<script src="../js/comments.js"></script>

<footer>
  <div class="ft-logo">❄️ <span>xm486</span>の小屋</div>
  <p class="runtime">本站已稳定运行 <span id="runtime">--</span></p>
  <p>© 2026 Snow Flakes · 用热爱与代码构筑的小小世界</p>
</footer>

<div id="tool">
  <audio class="player-audio" preload="none"></audio>
  <button type="button" class="item tool-music" aria-label="音乐播放器" title="音乐播放器">
    <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
      <path d="M12 12l7 6"/>
    </svg>
  </button>
  <button type="button" class="item tool-whale" aria-label="隐藏网站精灵" title="隐藏网站精灵">
    <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 14c2.2 0 3-1.4 5-1.4s2.8 1.4 5 1.4 3-1.4 5-1.4"/>
      <path d="M6.5 12.2C6.5 8.6 9 6 12.5 6c3.2 0 5.5 2.1 5.5 5 0 .5-.1 1-.2 1.4"/>
      <circle cx="10" cy="9.4" r="1" fill="currentColor" stroke="none"/>
      <path d="M15.5 4.4c.9.3 1.6 1 2 1.9"/>
    </svg>
  </button>
  <button type="button" class="item tool-whale-set" aria-label="精灵设置" title="精灵设置">
    <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>
    </svg>
  </button>
  <button type="button" class="item back-to-top" aria-label="回到顶部" title="回到顶部">
    <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7"/>
    </svg>
    <span class="percent">0%</span>
  </button>
</div>

<div id="playerInfo" class="player-info" role="region" aria-label="音乐播放器">
  <div class="player-preview">
    <div class="player-cover">
      <div class="player-disc"><img class="pi-cover" alt="" aria-hidden="true"></div>
    </div>
    <div class="player-meta">
      <h4 class="pi-title">未选择曲目</h4>
      <span class="pi-artist"></span>
    </div>
  </div>
  <div class="player-controls">
    <button type="button" class="btn pc-mode" aria-label="播放模式"></button>
    <button type="button" class="btn pc-prev" aria-label="上一首"></button>
    <button type="button" class="btn pc-play" aria-label="播放"></button>
    <button type="button" class="btn pc-next" aria-label="下一首"></button>
    <button type="button" class="btn pc-volume" aria-label="静音"></button>
  </div>
  <ul class="player-list">
    <li data-src="" data-name="待填曲目 1" data-artist="艺术家" data-cover="">
      <span class="progress"><span class="bar"></span></span>
      <span class="info"><span>待填曲目 1</span><span>艺术家</span></span>
    </li>
  </ul>
</div>

<script src="../js/main.js"></script>
<script src="../js/whale.js"></script>
<!-- 点击 / 拖尾特效：ba-click-fx (MIT, CialloKing)，ESM 模块需独立 script -->
<script type="module">
  import { BAClickFX } from 'https://cdn.jsdelivr.net/npm/ba-click-fx@1.3.1/dist/ba-click-fx.js';

  // 不传 target：让库自行创建并管理覆盖层 canvas 的挂载与尺寸
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    new BAClickFX({
      touchAction: 'pan-y'
    });
  }
</script>
</body>
</html>
`;
  }

  function buildCard() {
    const title = fTitle.value.trim() || '未命名文章';
    // 首页在根目录，路径少一层 ../
    const cover = exportSrc(fCover.value.trim()).replace(/^\.\.\//, '');
    const cat = fCategory.value || '未分类';
    const file = (fSlug.value.trim() || 'my-post') + '.html';
    const catMap = { '技术': 'tech', '生活': 'life', '二次元': 'acg', '个人汉化': 'hanhua' };
    // 认不出的分类归到 other：它不会匹配任何一个筛选按钮，
    // 只在「全部」里出现。比默认塞成 tech 更诚实 ——
    // 后者会让未分类的文章混进「技术」里
    const catKey = catMap[cat] || 'other';

    return `<article class="post-card reveal" data-cat="${escAttr(catKey)}">
  <div class="post-thumb" style="background-image:url('${escAttr(cover)}')">
    <span class="cat-badge">${esc(cat)}</span>
  </div>
  <div class="post-body">
    <h3 class="post-title">${esc(title)}</h3>
    <p class="post-excerpt">${esc(fSummary.value.trim())}</p>
    <div class="post-meta">
      <span>📅 ${esc(fDate.value || '')}</span>
      <a class="read-more" href="posts/${escAttr(file)}">阅读全文 →</a>
    </div>
  </div>
</article>`;
  }

  /* ============ 按钮 ============ */
  function ensureSynced() {
    // 在可视化面板编辑时源码可能落后一步，导出前强制同步
    if (activePane === 'visual') {
      syncing = true;
      visualToMd();
      syncing = false;
    }
  }

  /* ============ 导入（把已导出的 HTML / 已有 Markdown 载入编辑器） ============
     支持两种：
     1. 本站导出的完整文章页 .html —— 解析头部元信息 + 正文 HTML 转回 Markdown
     2. 纯 .md/.txt —— 直接读入源码区
     导入后不自动覆盖草稿，需要你点一次生成或下载才落盘。 */
  $('btnImport').addEventListener('click', () => $('importPick').click());

  $('importPick').addEventListener('change', () => {
    const file = $('importPick').files && $('importPick').files[0];
    $('importPick').value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const isHtml = /\.html?$/i.test(file.name);
        if (!isHtml) {
          mdInput.value = text.replace(/\r\n?/g, '\n');
          syncing = true; mdToVisual(); syncing = false;
          updateHero(); saveDraft();
          toast('已导入 ' + file.name + '（Markdown）');
          return;
        }
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const titleEl = doc.querySelector('.article-heading h1') || doc.querySelector('title');
        const summaryEl = doc.querySelector('.article-summary');
        const catEl = doc.querySelector('.article-category');
        const details = doc.querySelector('.article-details');
        const coverEl = doc.querySelector('.article-cover');
        const contentEl = doc.querySelector('.article-content');

        if (titleEl && titleEl.textContent.trim()) fTitle.value = titleEl.textContent.trim();
        if (summaryEl && summaryEl.textContent.trim()) fSummary.value = summaryEl.textContent.trim();
        if (catEl && catEl.textContent.trim()) {
          const c = catEl.textContent.trim();
          // 以 select 里的选项为准，不再硬编码一份分类清单：
          // 以后加分类只要改 editor.html 的 <option>，这里自动跟上
          const known = Array.prototype.map.call(fCategory.options, o => o.value);
          if (known.indexOf(c) !== -1) {
            fCategory.value = c;
          } else {
            // 文章用了编辑器里还没有的分类：临时补一个选项，
            // 否则 select 会保持原值，导入后分类被悄悄改掉
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            fCategory.appendChild(opt);
            fCategory.value = c;
          }
        }
        if (details) {
          const dt = details.textContent || '';
          const dm = dt.match(/发布于\s*(\d{4}-\d{2}-\d{2})/);
          if (dm) fDate.value = dm[1];
          const rm = dt.match(/阅读约\s*(\d+)/);
          if (rm) fRead.value = rm[1];
          const tm = dt.match(/🏷️\s*(.+)/);
          if (tm) fTags.value = tm[1].trim();
        }
        if (coverEl) {
          const bg = (coverEl.getAttribute('style') || '').match(/url\(['"]?([^'")]+)['"]?\)/);
          if (bg) fCover.value = bg[1];
        }

        if (contentEl) {
          // 去掉 .article-footer（上一篇/下一篇导航），正文才是可编辑内容
          const foot = contentEl.querySelector('.article-footer');
          if (foot) foot.remove();
          mdInput.value = html2md(contentEl);
        } else {
          mdInput.value = ''; // 没有正文容器的 HTML 不硬猜
        }
        syncing = true; mdToVisual(); syncing = false;
        updateHero(); saveDraft();
        toast('已导入 ' + file.name + '，检查后记得保存');
      } catch (err) {
        toast('导入失败：' + (err && err.message ? err.message : err));
      }
    };
    reader.onerror = () => toast('读取文件失败');
    reader.readAsText(file, 'utf-8');
  });

  $('btnExport').addEventListener('click', () => {
    ensureSynced();
    exportCode.value = buildHTML();
    cardCode.value = buildCard();
    exportBox.classList.add('show');
    exportBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const names = localList(mdInput.value + ' ' + fCover.value);
    toast(names.length ? '已生成，记得放好 ' + names.length + ' 张本地图片' : '已生成');
  });

  $('btnDownload').addEventListener('click', () => {
    ensureSynced();
    const name = (fSlug.value.trim() || 'my-post') + '.html';
    const url = URL.createObjectURL(new Blob([buildHTML()], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已下载 ' + name + '，放进 posts/ 即可');
  });

  function copy(text, okMsg) {
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(okMsg); }
      catch (e) { toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
    // Clipboard API 只在 https 或 localhost 可用，file:// 下需要退路
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => toast(okMsg)).catch(fallback);
    } else fallback();
  }

  $('btnCopyHTML').addEventListener('click', () => copy(exportCode.value, '完整 HTML 已复制'));
  $('btnCopyCard').addEventListener('click', () => copy(cardCode.value, '卡片片段已复制'));

  $('btnClear').addEventListener('click', () => {
    if (!confirm('清空全部内容？草稿一并删除。')) return;
    [fTitle, fSummary, fCover, fTags, fSlug].forEach(el => { el.value = ''; });
    fCategory.value = '技术';
    fRead.value = '5';
    fDate.value = today();
    mdInput.value = '';
    readTouched = false;   // 清空后阅读时长重新跟着字数走
    syncing = true; mdToVisual(); syncing = false;
    updateHero();
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 忽略 */ }
    exportBox.classList.remove('show');
    saveDraft();
    toast('已清空');
  });

  /* ============ 初始化 ============ */
  function today() {
    const d = new Date();
    const p = n => (n < 10 ? '0' + n : n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  ['input', 'change'].forEach(ev => {
    [fTitle, fCategory, fDate, fRead, fTags, fCover, fSummary].forEach(el => {
      if (el) el.addEventListener(ev, () => { updateHero(); saveDraft(); });
    });
    if (fSlug) fSlug.addEventListener(ev, saveDraft);
  });

  // 手动改过阅读时长后就不再自动覆盖（否则每次打字都被改回去）
  fRead.addEventListener('input', () => { readTouched = true; });

  // Ctrl/Cmd+S 存草稿：避免浏览器弹出"保存网页"的对话框，
  // 顺便给一个明确的反馈，免得以为按了没反应
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    saveDraft();
    toast('草稿已保存到本地（不会下载文件）');
  });

  const SAMPLE = `## 写在前面

这一段可以直接在**可视化**面板里改，上面的工具栏点一下就能加粗、变标题、插图片。
改完切到 **Markdown** 面板就能看到对应源码；反过来改源码，可视化那边也会跟着变。

> 引用块适合放提示，或者别人的原话。

## 常用写法

- 列表项一
- 列表项二，可以带 [链接](https://github.com/xm486)
- 也可以写 \`行内代码\`

## 代码块

\`\`\`js
const post = {
  title: '我的第一篇文章',
  date: '2026-09-04'
};
\`\`\`

## 写完之后

点右上角「生成 HTML」，下载文件放进 \`posts/\` 目录就能访问。
同时会给出首页卡片代码，粘到 \`index.html\` 的文章列表里即可。
`;

  if (!loadDraft()) {
    fDate.value = today();
    fRead.value = '5';
    fCategory.value = '技术';
    mdInput.value = SAMPLE;
  }
  if (!fDate.value) fDate.value = today();

  syncing = true;
  mdToVisual();
  syncing = false;
  updateHero();
  refreshImgNotice();
})();