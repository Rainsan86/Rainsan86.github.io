# ❄️ xm486 の小屋

> 用热爱与代码构筑的小小世界 · 二次元 × 技术 × 日常

个人二次元博客，纯静态站点（HTML + CSS + 原生 JS），零依赖、无需构建，直接上传即可跑。

线上地址：<https://xm486.zh.kg/>

## ✨ 功能

- 🎵 **侧边音乐播放器**：云端曲库（Meting API 解析网易云歌单）、唱盘封面、可拖动进度条、自动跳过失效音源
- ✍️ **可视化文章编辑器**（`editor.html`）：Markdown / 可视化双模式、实时字数与阅读时长、草稿自动保存、目录预览、图片一键上传
- 📂 **个人项目展示**：跑马灯 + 「查看全部」展开面板，数据统一从页面 `data-*` 读取，加项目只改 HTML
- 🗂 **文章分类筛选**：技术 / 生活 / 二次元 / 个人汉化
- 🎨 **日/夜双主题**、点击特效、访问量统计、评论区

## 📁 目录结构

```
├── index.html          # 首页
├── editor.html         # 文章编辑器（后台工具，勿被搜索引擎收录）
├── css/                # 样式（style.css / comments.css / whale.css）
├── js/                 # 逻辑（main.js / editor.js）
├── posts/              # 文章页（每篇底部自带授权声明）
├── image/              # 图片资源
├── sound/              # UI 音效
└── LICENSE             # MIT 协议（仅代码部分）
```

## 🚀 本地预览

任选其一：

```bash
# 方式一：Python 自带服务器
python3 -m http.server 8093

# 方式二：Npx
npx serve
```

然后浏览器打开 `http://localhost:8093`。

> 纯静态站点，**不需要任何构建步骤**，改完刷新即生效。

## ☁️ 部署

静态托管平台均可，如 GitHub Pages、Cloudflare Pages、Vercel 等。把整个目录（或只传站点文件）推上去即可。

## 🛠 自定义

**加文章**：用 `editor.html` 写完后导出 `.html` 放到 `posts/`，首页卡片自动生成（记得同步分类筛选按钮）。

**加文章分类**：在 `editor.html` 的分类下拉框里加一行 `<option>`，其余自动联动。

**换歌单**：改 `js/main.js` 里 `METING.sources` 的歌单 id：

```js
sources: [{ server: 'netease', type: 'playlist', id: '你的歌单id' }]
```

**加项目展示**：在首页跑马灯第一组里加一个 `.project-item` 按钮，填好 `data-name` / `data-desc` / `data-avatar` / `data-site` / `data-repo`，展开面板自动同步。

## 📄 协议

代码部分采用 [MIT](./LICENSE)。文章、图片及汉化资源以各页面底部声明为准。

主题设计参考 [Shoka](https://github.com/amehime/hexo-theme-shoka)，点击特效来自 [ba-click-fx](https://github.com/CialloKing/ba-click-fx)。