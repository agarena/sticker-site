# AI 表情库（Sticker Folio）

「不吃鲸B」出品的 AI 角色二创表情包站：收录 DeepSeek、豆包、ChatGPT、Claude、Gemini 等大模型角色的同人二创表情，支持按角色 / 标签检索、点赞、评论、一键下载与复制，并开放投稿（先审后显）。

- 线上地址：<https://stickers.agarena.xyz>（即将上线）
- 联系邮箱由后端 `/api/site` 运行时覆盖（「关于」页内置兜底）

> **⚠️ 2026-09-21 起本站已迁移：** 新家 <https://ai-stickers.app.workbuddy.host>（不吃鲸B的AI二创表情库）。本仓库页面仅保留为跳转公告页；旧后端读接口冻结为只读归档，投稿接口已封口（410）。本 README 以下内容为迁移前的历史记录。

## 架构

```
浏览器（本仓库，零构建：index.html + js/ + styles/ + assets/）
   │  GET  /api/stickers             拉取已发布表情（缓存 60s）
   │  GET  /api/stickers/comments    全量评论（缓存 30s）
   │  POST /api/stickers/like        点赞/取消（按访客 shufy_anon 去重）
   │  POST /api/stickers/comment     评论（留言即显）
   │  POST /api/stickers/submit      投稿（已于 2026-09-21 封口返回 410，见「开放投稿 API（已停用）」）
   │  POST /api/prompts/log          关键节点行为日志（批量，site='stickers'）
   │  POST /api/collect              页面访问与停留时长（复用主站统计）
   ▼
api.agarena.xyz（Cloudflare Worker，复用提示词站后端，仓库 agarena/analytics-worker）
   ▼
Cloudflare D1（表：stickers / sticker_likes / sticker_comments / pf_logs + 主站 visits/events/…）
```

- 前端零构建，直接部署到 Cloudflare Pages 项目 `sticker-site`，仓库 github.com/agarena/sticker-site。
- 接口不可达时自动降级为 `js/data.js` 内置的 12 条兜底数据与 localStorage 演示模式（点赞/评论仅本机可见）。兜底数据与 `analytics-worker/seed.sql` 保持同步，**改一处必须同步另一处**。

## 目录结构

```
表情包网站/
├─ index.html          页面骨架（顶栏 / 视图容器 / 详情弹窗），hash 路由 #home #library #submit #about
├─ assets/             12 张官方表情图（sticker-01 ~ sticker-12，D1 里以 assets/ 相对路径引用）
├─ js/
│  ├─ data.js          ★ CHARACTERS 角色表 / TAGS / PLATFORMS + 12 条兜底数据（与 seed.sql 同步）
│  ├─ app.js           ★ 全部逻辑：渲染 / 筛选 / 点赞 / 评论 / 投稿 / 日志上报与降级
│  └─ icons.js         内联 SVG 图标（Lucide 风格，icon("名称", 尺寸)）
└─ styles/
   ├─ base.css         布局骨架与组件样式
   └─ theme.css        ★ 主题皮肤（配色/字体/圆角，全部为顶部 CSS 变量）
```

## 功能与关键节点日志

所有关键行为都写入后端 `pf_logs` 表（与提示词站共用，`site='stickers'` 区分来源站，后台 `/admin` 可见）：

| 行为 | 日志 type | 备注 |
|---|---|---|
| 页面访问 | page_view | 另走 /api/collect（visits 表），后台图表可看流量/来源/地域 |
| 停留时长 | dwell | /api/collect 事件，进 visits 表（非 pf_logs） |
| 点赞 / 取消 | like / unlike | 服务端记录，按访客 vid 去重 |
| 评论 | comment | 服务端记录（留言即显） |
| 投稿 | submit | 服务端入库即记；前端另记一条（含标题） |
| 复制图片 | copy | 前端行为 |
| 下载原图 | download | 前端行为 |

服务端错误（error）与管理操作（admin_publish / admin_hide / admin_delete / admin_delete_comment）同样入 pf_logs。

## 开放投稿 API（已于 2026-09-21 停用）

本站投稿通道已整体迁移至新站 <https://ai-stickers.app.workbuddy.host>。新站开放投稿接口为**令牌制**（服务端校验、可随时吊销），令牌不对外公开，需要接入自动投稿请联系站长 agarena@agent.qq.com 获取；完整接口文档仅存于站长本地。

旧接口 `POST https://api.agarena.xyz/api/stickers/submit` 已封口，一律返回 `410 {"ok":false,"msg":"migrated…"}`；点赞、评论接口随旧站下线不再接受调用，读接口（`GET /api/stickers` 等）冻结为只读归档。

## 内容管理与审核

1. 打开 `https://api.agarena.xyz/admin?key=<ADMIN_TOKEN>`（密码在 analytics-worker 仓库的 `.env`）。
2. 「表情包投稿审核」区块：查看待审投稿（图片/标题/角色/标签/作者），点「通过上架」即公开；也可「隐藏」（下架但保留数据）或「删除」（连带清除该图的点赞与评论）。
3. 评论为留言即显，后台可删除单条评论。
4. 同页可看关键节点日志（按类型计数 + 最近 100 条，`site='stickers'` 为本站）。
5. 也可走管理 API（`X-Admin-Key` 认证）：
   - `GET /api/admin/stickers?status=pending|published|hidden`
   - `POST /api/admin/sticker`，body `{"id":"u…","action":"publish|hide|delete"}`
   - `DELETE /api/admin/sticker-comment?id=<评论id>`

## 发布

```bash
# 本目录（需 Cloudflare 授权：export CLOUDFLARE_API_TOKEN=… 或 npx wrangler login）
npx wrangler pages deploy . --project-name sticker-site --branch main
```

首次搭建（新环境）：
1. 后端按 `agarena/analytics-worker` 仓库 README 初始化（D1 建表 + seed + deploy；表情包相关表为 stickers / sticker_likes / sticker_comments，pf_logs 复用主站）。
2. 确认 Worker 的 `ALLOW_ORIGIN` 白名单含 `https://stickers.agarena.xyz`（已加）。
3. Cloudflare 控制台给 Pages 项目 `sticker-site` 绑定自定义域 `stickers.agarena.xyz`（CNAME：stickers → sticker-site.pages.dev）。
4. 前端仓库：github.com/agarena/sticker-site。
