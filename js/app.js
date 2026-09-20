/* ==========================================================
 * 应用逻辑：视图渲染 / 筛选 / 详情弹窗 / 评论 / 点赞 / 投稿
 * 接口可用时数据来自后端（点赞/评论/投稿入库），不可用降级为
 * localStorage 演示模式（data.js 的 SEED_* 兜底）。
 * ========================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const LS = {
  get(key, fb) { try { return JSON.parse(localStorage.getItem(key)) ?? fb; } catch { return fb; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { } },
};
const likedMap = LS.get("ss_liked", {});      // { id: true }
const userComments = LS.get("ss_cmts", {});   // { id: [ {nick,time,text} ] }（仅降级模式）
const submitted = [];                          // 降级模式的会话内投稿

/* ---------- 后端对接 & 关键节点日志 ---------- */
const API_BASE = "https://api.agarena.xyz";
let SERVER_MODE = false;        // /api/stickers 拉取成功后置 true：数据以服务端为准
let SERVER_COMMENTS = null;     // { stickerId: [{id,nick,text,ts}] }
const SERVER_LIKES = {};        // stickerId → 服务端权威点赞数
let API_ON = false;             // 拉取成功才启用上报
let VID = null; try { VID = localStorage.getItem("shufy_anon"); } catch { }
if (!VID) { VID = "u-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); try { localStorage.setItem("shufy_anon", VID); } catch { } }
const SID = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);

const PF_LOGQ = [];
function pfLog(type, stickerId, meta) {
  if (!API_ON) return;
  PF_LOGQ.push({ type, stickerId: stickerId || "", meta: meta || null, ts: Date.now() });
  if (PF_LOGQ.length >= 10) flushPfLog();
}
function flushPfLog() {
  if (!API_ON || !PF_LOGQ.length) return;
  const body = JSON.stringify({ site: "stickers", vid: VID, sid: SID, events: PF_LOGQ.splice(0) });
  // 跨域 sendBeacon + JSON Blob 会被静默丢弃，统一 fetch keepalive
  try { fetch(API_BASE + "/api/prompts/log", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => { }); } catch { }
}
setInterval(flushPfLog, 10000);
addEventListener("pagehide", flushPfLog);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPfLog(); });

/* 页面访问与停留时长 → /api/collect（visits 表，后台图表可见） */
const T0 = Date.now();
let dwellSent = false;
const SITE_PATH = '/stickers/'; // 独立域名下 pathname 是 /，用固定路径让后台访问路径能区分各站
function collectSend(events) {
  const body = JSON.stringify({
    anonId: VID, sessionId: SID,
    context: { path: SITE_PATH, referrer: document.referrer || null, landing: location.host + location.pathname + location.search },
    events
  });
  try { fetch(API_BASE + "/api/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => { }); } catch { }
}
function reportDwell() {
  if (dwellSent || !API_ON) return;
  dwellSent = true;
  collectSend([{ type: "dwell", path: SITE_PATH, ts: Date.now(), meta: { dwell: Date.now() - T0 } }]);
  flushPfLog();
}
addEventListener("pagehide", reportDwell);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") reportDwell(); });

const state = { chars: new Set(), tag: null, uncategorized: false, noTags: false, q: "", sort: "new" };

const charName = (key) => (CHARACTERS.find(c => c.key === key) || { name: key }).name;
const esc = (s) => String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

function fmtTime(ts) {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return m + " 分钟前";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " 小时前";
  const dd = Math.floor(h / 24);
  if (dd < 30) return dd + " 天前";
  return new Date(ts).toLocaleDateString("zh-CN");
}
function commentsOf(s) {
  if (SERVER_MODE) return (SERVER_COMMENTS && SERVER_COMMENTS[s.id]) || [];
  return [...(SEED_COMMENTS[s.id] || []), ...(userComments[s.id] || [])];
}
function likeCount(s) { return SERVER_MODE ? (SERVER_LIKES[s.id] || 0) : (SEED_LIKES[s.id] || 0) + (likedMap[s.id] ? 1 : 0); }
function commentCount(s) { return commentsOf(s).length; }
function allStickers() { return [...submitted, ...STICKERS]; }

function filtered() {
  let list = allStickers().filter(s => {
    if (state.uncategorized) {
      if (s.characters.length !== 0) return false;
    } else if (state.chars.size) {
      /* AND 语义：需包含全部已选角色 */
      if (![...state.chars].every(c => s.characters.includes(c))) return false;
    }
    if (state.noTags) {
      if (s.tags.length !== 0) return false;
    } else if (state.tag && !s.tags.includes(state.tag)) return false;
    if (state.q) {
      const hay = [s.title, s.author, ...s.characters.map(charName), ...s.tags].join(" ").toLowerCase();
      if (!hay.includes(state.q.toLowerCase())) return false;
    }
    return true;
  });
  if (state.sort === "hot") {
    list = [...list].sort((a, b) => (likeCount(b) + commentCount(b)) - (likeCount(a) + commentCount(a)));
  }
  return list;
}

/* ---------- 通用小件 ---------- */

function toast(msg, isErr) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = isErr ? "⚠️ " + msg : msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2200);
}

function charChip(key, extra = "") {
  return `<button class="tag tag-char ${extra}" data-goto-char="${key}">${esc(charName(key))}</button>`;
}

/* ---------- 表情卡片 ---------- */

function cardHTML(s, idx) {
  const chars = s.characters.map(c => charChip(c)).join("");
  const emo = s.tags.map(e => `<span class="tag tag-emo">#${esc(e)}</span>`).join("");
  const badge = s._new ? `<span class="badge new">新投稿</span>` : "";
  return `
  <figure class="card" data-id="${s.id}" data-idx="${idx + 1}">
    <div class="ph">
      ${badge}
      <img src="${s.file}" alt="${esc(s.title)}" loading="lazy">
      <div class="ovl"><span class="ovl-zoom">${icon("zoom", 14)} 点击查看详情</span></div>
    </div>
    <figcaption class="meta">
      <div class="meta-title" title="${esc(s.title)}">${esc(s.title)}</div>
      <div class="meta-tags">${chars}${emo}</div>
      <div class="meta-acts">
        <button class="act" data-act="download" title="下载原图">${icon("download", 14)}</button>
        <button class="act act-like ${likedMap[s.id] ? "on" : ""}" data-act="like" data-like="${s.id}" title="点赞">${icon("heart", 13)}<i>${likeCount(s)}</i></button>
        <button class="act" data-act="copy" title="复制图片">${icon("copy", 13)}</button>
        <button class="act" data-act="comments" title="评论">${icon("message", 13)}<i>${commentCount(s)}</i></button>
        <button class="act" data-act="share" title="分享这张表情">${icon("share", 13)}</button>
      </div>
    </figcaption>
  </figure>`;
}

function bindCardEvents(root) {
  $$(".card", root).forEach(card => {
    const s = allStickers().find(x => x.id === card.dataset.id);
    card.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]");
      if (act) {
        e.stopPropagation();
        const kind = act.dataset.act;
        if (kind === "download") downloadSticker(s);
        if (kind === "like") toggleLike(s.id);
        if (kind === "copy") copySticker(s);
        if (kind === "comments") openModal(s.id, true);
        if (kind === "share") shareSticker(s);
        return;
      }
      const gotoChar = e.target.closest("[data-goto-char]");
      if (gotoChar) {
        e.stopPropagation();
        state.chars = new Set([gotoChar.dataset.gotoChar]);
        state.tag = null; state.uncategorized = false; state.noTags = false;
        closeModal();
        go("library");
        return;
      }
      openModal(s.id);
    });
  });
}

/* ---------- 动作 ---------- */

function downloadSticker(s) {
  const a = document.createElement("a");
  a.href = s.file; const ext = s.file.startsWith("data:") ? (s.file.slice(11, 15).includes("jpeg") ? "jpg" : s.file.slice(11, 14).replace(";", "")) : s.file.split(".").pop(); a.download = `${s.id}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  pfLog("download", s.id);
  toast("已开始下载原图");
}

function shareSticker(s) {
  const url = location.origin + "/?id=" + encodeURIComponent(s.id);
  const text = "【" + s.title + "】AI 表情库 · 不吃鲸B，各大模型角色二创表情一站收齐 " + url;
  copyText(text).then(ok => {
    if (ok) { toast("分享文案已复制，粘贴给朋友即可"); pfLog("share", s.id); }
    else toast("复制失败，请手动复制", true);
  });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch { return false; }
  }
}
async function copySticker(s) {
  try {
    const blob = await fetch(s.file).then(r => r.blob());
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    pfLog("copy", s.id);
    toast("图片已复制到剪贴板");
  } catch {
    toast("当前环境不支持复制，已改为打开原图");
    window.open(s.file, "_blank");
  }
}

function toggleLike(id) {
  const s = allStickers().find(x => x.id === id);
  if (SERVER_MODE) {
    // 服务端模式：乐观更新，POST 后用权威计数校正；点赞日志由服务端记
    const nowLiked = !likedMap[id];
    if (nowLiked) likedMap[id] = true; else delete likedMap[id];
    LS.set("ss_liked", likedMap);
    if (nowLiked) SERVER_LIKES[id] = (SERVER_LIKES[id] || 0) + 1;
    else SERVER_LIKES[id] = Math.max(0, (SERVER_LIKES[id] || 0) - 1);
    $$(`[data-like="${id}"]`).forEach(btn => {
      btn.classList.toggle("on", !!likedMap[id]);
      btn.querySelector("i").textContent = likeCount(s);
    });
    fetch(API_BASE + "/api/stickers/like", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, vid: VID, liked: nowLiked })
    }).then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j && j.ok && typeof j.likes === "number" && j.likes !== SERVER_LIKES[id]) {
          SERVER_LIKES[id] = j.likes;
          $$(`[data-like="${id}"]`).forEach(btn => { btn.querySelector("i").textContent = likeCount(s); });
          if (state.view === "library") renderResultBar();
        }
      }).catch(() => { });
    if (state.view === "library") renderResultBar();
    return;
  }
  likedMap[id] = !likedMap[id];
  if (!likedMap[id]) delete likedMap[id];
  LS.set("ss_liked", likedMap);
  $$(`[data-like="${id}"]`).forEach(btn => {
    btn.classList.toggle("on", !!likedMap[id]);
    btn.querySelector("i").textContent = likeCount(s);
  });
  if (state.view === "library") renderResultBar();
}

/* ---------- 详情弹窗 ---------- */

function openModal(id, focusComments = false) {
  const s = allStickers().find(x => x.id === id);
  if (!s) return;
  const series = allStickers().filter(x => x.id !== s.id && x.characters.some(c => s.characters.includes(c))).slice(0, 8);
  $("#modal").innerHTML = `
    <button class="modal-x" data-close title="关闭">${icon("x", 16)}</button>
    <div class="m-left">
      <div class="m-big"><img src="${s.file}" alt="${esc(s.title)}"></div>
      ${series.length ? `
      <div class="m-strip">
        ${series.map(x => `<button class="m-thumb" data-thumb="${x.id}" title="${esc(x.title)}"><img src="${x.file}" alt=""></button>`).join("")}
        <span class="m-strip-hint">同角色 / 同系列，点击切换</span>
      </div>` : ""}
    </div>
    <div class="m-right">
      <h3 class="m-title">${esc(s.title)}</h3>
      <div class="m-chars">${s.characters.map(c => charChip(c)).join("")}</div>
      <div class="m-kv">
        <div class="kv"><span class="k">标签</span><span>${s.tags.map(e => `<span class="tag tag-emo">#${esc(e)}</span>`).join(" ")}</span></div>
        <div class="kv"><span class="k">作者 / 出处</span><span>${esc(s.author)}</span></div>
        <div class="kv"><span class="k">格式</span><span>${esc(s.format || "图片")}</span></div>
        <div class="kv"><span class="k">收录时间</span><span>${esc(s.added)}</span></div>
      </div>
      <div class="m-actions">
        <button class="btn solid" data-act2="download">${icon("download", 15)} 下载原图</button>
        <button class="btn" data-act2="copy">${icon("copy", 14)} 复制图片</button>
        <button class="btn btn-like ${likedMap[s.id] ? "on" : ""}" data-act2="like" data-like="${s.id}">${icon("heart", 14)} <i>${likeCount(s)}</i></button>
        <button class="btn" data-act2="share" data-id="${esc(s.id)}">${icon("share", 14)} 分享</button>
        <span class="m-report">${icon("flag", 13)} 举报 / 侵权反馈</span>
      </div>
      <div class="m-cmts">
        <h4>${icon("message", 15)} 评论 <i>${commentCount(s)}</i></h4>
        <div class="cmt-list" id="cmtList"></div>
        <div class="cmt-form">
          <input id="cmtNick" maxlength="16" placeholder="昵称（选填）">
          <textarea id="cmtText" rows="2" maxlength="200" placeholder="说点什么…（Ctrl+回车 发送）"></textarea>
          <button class="btn solid" id="cmtSend">${icon("send", 14)} 发布</button>
        </div>
      </div>
    </div>`;
  $("#modal").dataset.id = s.id;
  document.body.classList.add("modal-open");
  renderComments(s);
  if (focusComments) setTimeout(() => $("#cmtText")?.focus(), 50);

  $("#modal [data-close]").onclick = closeModal;
  $("#modal .m-strip")?.addEventListener("click", (e) => {
    const t = e.target.closest("[data-thumb]");
    if (t) openModal(t.dataset.thumb, focusComments);
  });
  $("#modal .m-actions").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act2]");
    if (!b) return;
    if (b.dataset.act2 === "download") downloadSticker(s);
    if (b.dataset.act2 === "copy") copySticker(s);
    if (b.dataset.act2 === "like") { toggleLike(s.id); $("#modal .btn-like i").textContent = likeCount(s); }
    if (b.dataset.act2 === "share") shareSticker(s);
  });
  const send = () => sendComment(s);
  $("#cmtSend").onclick = send;
  $("#cmtText").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); });
}

function renderComments(s) {
  const list = commentsOf(s);
  const box = $("#cmtList");
  if (!list.length) { box.innerHTML = `<div class="cmt-empty">还没有评论，来抢沙发～</div>`; return; }
  box.innerHTML = list.map((c, i) => {
    const letter = esc((c.nick || "路")[0].toUpperCase());
    const time = c.time || (c.ts ? fmtTime(c.ts) : "");
    return `
    <div class="cmt">
      <span class="cmt-ava a${(c.nick || "路人").length % 5}">${letter}</span>
      <div class="cmt-body">
        <div class="cmt-head"><b>${esc(c.nick || "路人")}</b><time>${esc(time)}</time></div>
        <p>${esc(c.text)}</p>
      </div>
    </div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

function sendComment(s) {
  const nick = $("#cmtNick").value.trim();
  const text = $("#cmtText").value.trim();
  if (!text) { toast("先写点什么再发布～"); $("#cmtText").focus(); return; }
  if (SERVER_MODE) {
    const btn = $("#cmtSend");
    btn.disabled = true;
    fetch(API_BASE + "/api/stickers/comment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stickerId: s.id, nick: nick || "", text, vid: VID })
    }).then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(j => {
        if (!j || !j.ok || !j.comment) throw new Error("bad resp");
        SERVER_COMMENTS = SERVER_COMMENTS || {};
        (SERVER_COMMENTS[s.id] = SERVER_COMMENTS[s.id] || []).push(j.comment);
        $("#cmtText").value = "";
        renderComments(s);
        $("#modal .m-cmts h4 i").textContent = commentCount(s);
        $$(`.card[data-id="${s.id}"] [data-act="comments"] i`).forEach(el => el.textContent = commentCount(s));
        toast("评论已发布");
      })
      .catch(() => toast("评论发布失败，请稍后重试", true))
      .finally(() => { if ($("#cmtSend")) $("#cmtSend").disabled = false; });
    return;
  }
  if (nick) LS.set("ss_nick", nick);
  userComments[s.id] = [...(userComments[s.id] || []), { nick: nick || "路人", time: "刚刚", text }];
  LS.set("ss_cmts", userComments);
  $("#cmtText").value = "";
  renderComments(s);
  $("#modal .m-cmts h4 i").textContent = commentCount(s);
  $$(`.card[data-id="${s.id}"] [data-act="comments"] i`).forEach(el => el.textContent = commentCount(s));
  toast("评论已发布");
}

function closeModal() {
  document.body.classList.remove("modal-open");
  $("#modal").innerHTML = "";
  delete $("#modal").dataset.id;
}

/* ---------- 视图：首页 ---------- */

function viewHome() {
  const roleCards = CHARACTERS.map(c => {
    const n = allStickers().filter(s => s.characters.includes(c.key)).length;
    const inner = c.avatar
      ? `<img src="${c.avatar}" alt="${esc(c.name)}" style="object-position:${c.pos};transform:scale(${c.zoom || 1})">`
      : `<span class="ava-letter" style="background:${c.color}">${esc(c.name[0])}</span>`;
    return `
    <button class="role" data-role="${c.key}">
      <span class="avatar">${inner}</span>
      <span class="role-name">${esc(c.name)}</span>
      <span class="role-count">${n} 张</span>
    </button>`;
  }).join("");

  return `
  <section class="hero">
    <h1>各大模型角色 <em>二创表情</em>，一站式收齐</h1>
    <p>DeepSeek · 豆包 · ChatGPT · Claude · Gemini … 收集、检索、一键带走</p>
    <div class="search-big">
      <input id="heroSearch" placeholder="搜索角色 / 作品 / 标签，如「#无语」「合照」…">
      <button id="heroGo">搜索</button>
    </div>
    <div class="chips">
      <span class="lbl">热门标签：</span>
      ${["搞笑", "得意", "无语", "悲伤"].map(e => `<button class="chip" data-hot="${e}">#${e}</button>`).join("")}
      <button class="chip" data-hot-none>未分类</button>
    </div>
  </section>

  <section class="roles-wrap">
    <div class="sec"><h2>按角色逛</h2><span class="sec-more">多选即「同时包含」· 暂无角色归属的图在「未分类」</span></div>
    <div class="roles">${roleCards}</div>
  </section>

  <section class="latest">
      <div class="sec"><h2>最新上架</h2><button class="sec-more link" data-goto-lib>进入表情库 ${icon("arrow-right", 13)}</button></div>
    <div class="masonry" id="homeGrid">
      ${allStickers().slice(0, 8).map((s, i) => cardHTML(s, i)).join("")}
    </div>
  </section>`;
}

function bindHome(root) {
  const q = $("#heroSearch", root);
  const doSearch = () => { state.q = q.value.trim(); state.chars.clear(); state.tag = null; state.uncategorized = false; state.noTags = false; go("library"); };
  $("#heroGo", root).onclick = doSearch;
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
  $$("[data-hot]", root).forEach(c => c.onclick = () => { state.tag = c.dataset.hot; state.chars.clear(); state.uncategorized = false; state.noTags = false; go("library"); });
  const none = $("[data-hot-none]", root);
  if (none) none.onclick = () => { state.chars.clear(); state.tag = null; state.uncategorized = true; state.noTags = false; go("library"); };
  $$(".role", root).forEach(r => r.onclick = () => { state.chars = new Set([r.dataset.role]); state.tag = null; state.uncategorized = false; state.noTags = false; go("library"); });
  $("[data-goto-lib]", root).onclick = () => go("library");
  bindCardEvents($("#homeGrid", root));
}

/* ---------- 视图：表情库 ---------- */

function viewLibrary() {
  const charTabs = [
    `<button class="chip ${state.chars.size || state.uncategorized ? "" : "on"}" data-chars-all>全部</button>`,
    ...CHARACTERS.map(c => `<button class="chip ${state.chars.has(c.key) ? "on" : ""}" data-chars="${c.key}">${esc(c.name)}</button>`),
    `<button class="chip chip-none ${state.uncategorized ? "on" : ""}" data-none>未分类</button>`,
  ].join("");
  const allT = [...new Set([...TAGS, ...allStickers().flatMap(s => s.tags)])];
  const tagChips = [
    `<button class="chip ${state.tag || state.noTags ? "" : "on"}" data-tag-all>全部</button>`,
    ...allT.map(e => `<button class="chip ${state.tag === e ? "on" : ""}" data-tag="${esc(e)}">#${esc(e)}</button>`),
    `<button class="chip chip-none ${state.noTags ? "on" : ""}" data-notags>无标签</button>`,
  ].join("");

  return `
  <section class="lib-head">
    <h1>表情库</h1>
    <p>角色可多选，只显示同时包含全部已选角色的表情 · 「未分类」收录暂无角色归属的图</p>
  </section>
  <section class="toolbar">
    <div class="trow"><span class="lbl">角色</span><div class="chips">${charTabs}</div></div>
    <div class="trow"><span class="lbl">标签</span><div class="chips">${tagChips}</div>
      <label class="sort-wrap">排序
        <select id="sortSel">
          <option value="new" ${state.sort === "new" ? "selected" : ""}>最新上架</option>
          <option value="hot" ${state.sort === "hot" ? "selected" : ""}>最热（赞+评）</option>
        </select>
      </label>
    </div>
  </section>
  <div class="resultbar" id="resultBar"></div>
  <div class="masonry" id="libGrid"></div>
  <div id="libEmpty" class="empty" hidden></div>`;
}

function renderResultBar() {
  const list = filtered();
  const sel = [];
  if (state.chars.size) sel.push([...state.chars].map(charName).join(" + ") + "（同时包含）");
  if (state.uncategorized) sel.push("未分类");
  if (state.noTags) sel.push("无标签");
  if (state.tag) sel.push("#" + state.tag);
  if (state.q) sel.push(`搜索「${esc(state.q)}」`);
  $("#resultBar").innerHTML = `
    <span>共 <b>${list.length}</b> 张${sel.length ? " · " + sel.map(esc).join(" × ") : ""}</span>
    ${sel.length ? `<button class="clear-btn" data-clear>清除筛选</button>` : ""}`;
  $("#resultBar [data-clear]")?.addEventListener("click", () => {
    state.chars.clear(); state.tag = null; state.uncategorized = false; state.noTags = false; state.q = "";
    $("#navSearch").value = "";
    renderView();
  });
}

function renderGrid() {
  const list = filtered();
  $("#libGrid").innerHTML = list.map((s, i) => cardHTML(s, i)).join("");
  $("#libGrid").style.display = list.length ? "" : "none";
  const empty = $("#libEmpty");
  empty.hidden = list.length > 0;
  if (!list.length) empty.innerHTML = `这个筛选组合下还没有表情包<br><small>换个条件试试，或者去「投稿」补一张？</small>`;
  bindCardEvents($("#libGrid"));
  renderResultBar();
}

function bindLibrary(root) {
  $$("[data-chars]", root).forEach(b => b.onclick = () => {
    const k = b.dataset.chars;
    state.chars.has(k) ? state.chars.delete(k) : state.chars.add(k);
    state.uncategorized = false;
    renderView();
  });
  $("[data-chars-all]", root).onclick = () => { state.chars.clear(); state.uncategorized = false; renderView(); };
  $("[data-none]", root).onclick = () => {
    state.uncategorized = !state.uncategorized;
    if (state.uncategorized) state.chars.clear();
    renderView();
  };
  $$("[data-tag]", root).forEach(b => b.onclick = () => {
    state.tag = state.tag === b.dataset.tag ? null : b.dataset.tag;
    state.noTags = false;
    renderView();
  });
  $("[data-tag-all]", root).onclick = () => { state.tag = null; state.noTags = false; renderView(); };
  $("[data-notags]", root).onclick = () => {
    state.noTags = !state.noTags;
    if (state.noTags) state.tag = null;
    renderView();
  };
  $("#sortSel", root).onchange = (e) => { state.sort = e.target.value; renderGrid(); };
  renderGrid();
}

/* ---------- 视图：投稿 ---------- */

function viewSubmit() {
  return `
  <section class="sub-head">
    <h1>投稿</h1>
    <p>只填必要信息：选图、勾角色、勾标签（可自定义），完事。</p>
  </section>
  <section class="sub-form">
    <div class="f-block">
      <label class="f-label"><span class="f-no">1</span>选图 <i>必填</i></label>
      <div class="drop" id="drop" tabindex="0">
        <input type="file" id="fileInput" accept="image/*" hidden>
        <div class="drop-empty" id="dropEmpty">${icon("upload", 30)}<span>点击选择 或 把图片拖到这里</span></div>
        <div class="drop-preview" id="dropPreview" hidden>
          <img id="prevImg" alt="">
          <div class="prev-info" id="prevInfo"></div>
        </div>
      </div>
    </div>
    <div class="f-block">
      <label class="f-label"><span class="f-no">2</span>角色 <i>选填 · 多选（合照请把出场的都勾上；不勾将归入「未分类」）</i></label>
      <div class="chips" id="subChars">
        ${CHARACTERS.map(c => `<button type="button" class="chip" data-c="${c.key}">${esc(c.name)}</button>`).join("")}
      </div>
    </div>
    <div class="f-block">
      <label class="f-label"><span class="f-no">3</span>标签 <i>选填 · 可勾选常用标签，也可以自定义</i></label>
      <div class="chips" id="subTags">
        ${TAGS.map(e => `<button type="button" class="chip" data-t="${esc(e)}">#${esc(e)}</button>`).join("")}
      </div>
      <div class="chips" id="subCustomTags"></div>
      <div class="tag-add">
        <input class="f-input" id="tagInput" maxlength="12" placeholder="自定义标签，回车或点「添加」，如：人类高质量斗图">
        <button type="button" class="btn" id="tagAdd">${icon("plus", 14)} 添加</button>
      </div>
    </div>
    <div class="f-block">
      <label class="f-label"><span class="f-no">4</span>标题 <i>选填（默认用文件名）</i></label>
      <input class="f-input" id="subTitle" maxlength="40" placeholder="给这张表情起个名字，如：看馋了">
    </div>
    <div class="f-block">
      <label class="f-label"><span class="f-no">5</span>作者 / 出处 <i>选填</i></label>
      <div class="f-row2">
        <input class="f-input" id="subAuthor" maxlength="30" placeholder="作者名，如 @画师名（可留空）">
        <span class="f-divider"></span>
        <select class="f-input f-select" id="subPlatform">
          <option value="">平台（选填）</option>
          ${PLATFORMS.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="f-actions">
      <button class="btn solid" id="subGo">${icon("upload", 15)} 发布到表情库</button>
      <button class="btn" id="subReset">${icon("reset", 14)} 重置</button>
      <span class="f-note">投稿经审核通过后展示；图片会自动压缩后上传。若服务暂不可用将提示，不会丢失已选内容。</span>
    </div>
  </section>`;
}

function bindSubmit(root) {
  let picked = null; // {url,name,fmt,dims}
  const drop = $("#drop", root), fi = $("#fileInput", root);
  const show = (file) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      picked = { url, file, name: file.name, fmt: file.type.split("/")[1]?.toUpperCase() || "?", dims: `${img.naturalWidth}×${img.naturalHeight}` };
      $("#dropEmpty", root).hidden = true;
      $("#dropPreview", root).hidden = false;
      $("#prevImg", root).src = url;
      $("#prevInfo", root).innerHTML = `<b>${esc(file.name)}</b><span>${picked.fmt} · ${picked.dims}</span>`;
    };
    img.src = url;
  };
  drop.addEventListener("click", (e) => { if (!e.target.closest("#dropPreview")) fi.click(); });
  fi.addEventListener("change", () => fi.files[0] && show(fi.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.classList.remove("drag");
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith("image/"));
    if (f) show(f); else toast("请拖入图片文件");
  });

  const selC = new Set(), selT = new Set();
  $$("#subChars .chip", root).forEach(b => b.onclick = () => { selC.has(b.dataset.c) ? selC.delete(b.dataset.c) : selC.add(b.dataset.c); b.classList.toggle("on"); });
  const toggleTag = (box) => box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]");
    if (!b) return;
    const t = b.dataset.t;
    selT.has(t) ? selT.delete(t) : selT.add(t);
    b.classList.toggle("on");
  });
  toggleTag($("#subTags", root));
  toggleTag($("#subCustomTags", root));
  const addTag = () => {
    const inp = $("#tagInput", root);
    const v = inp.value.trim().replace(/^#+/, "");
    if (!v) { inp.focus(); return; }
    if (TAGS.includes(v) || selT.has(v)) { toast("这个标签已经有了"); inp.value = ""; return; }
    selT.add(v);
    $("#subCustomTags", root).insertAdjacentHTML("beforeend",
      `<button type="button" class="chip on" data-t="${esc(v)}">#${esc(v)}</button>`);
    inp.value = "";
  };
  $("#tagAdd", root).onclick = addTag;
  $("#tagInput", root).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } });

  $("#subReset", root).onclick = () => renderView();

  /* 压缩：最长边 ≤1080px；WebP(透明+小体积) 优先，PNG 保透明兜底，JPEG 最后；均须 ≤200KB */
  const compressImg = (dataUrl) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 1080 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.width * scale));
        cv.height = Math.max(1, Math.round(img.height * scale));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        const LIMIT = 200 * 1024;
        const candidates = [
          cv.toDataURL("image/webp", 0.8),
          cv.toDataURL("image/png"),
          cv.toDataURL("image/jpeg", 0.78),
        ];
        for (const d of candidates) if (d.length <= LIMIT) return resolve(d);
        resolve(candidates[candidates.length - 1]);
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });

  $("#subGo", root).onclick = async () => {
    if (!picked) { toast("先选一张图～"); drop.classList.add("shake"); setTimeout(() => drop.classList.remove("shake"), 500); return; }
    const authorName = $("#subAuthor", root).value.trim();
    const platform = $("#subPlatform", root).value;
    const author = authorName && platform ? `${authorName}（${platform}）`
      : authorName || platform || "我（本机投稿）";
    const titleIn = $("#subTitle", root).value.trim();
    const fallbackTitle = "投稿 · " + picked.name.replace(/\.[a-z]+$/i, "");

    const goBtn = $("#subGo", root);
    goBtn.disabled = true;
    try {
      if (API_ON) {
        // 正式通道：压缩 → dataURL → POST，先审后显
        const dataUrl = await new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => resolve(null);
          r.readAsDataURL(picked.file);
        });
        if (!dataUrl) throw new Error("read fail");
        let img;
        if (picked.file.type === "image/gif") {
          // GIF 动图无法 canvas 压缩（会丢帧变静图）：≤200KB 原样直传保动图，超限拒绝
          if (dataUrl.length > 200 * 1024) {
            toast("GIF 动图超 200KB 且无法自动压缩，请用工具缩小后投稿", true);
            goBtn.disabled = false; return;
          }
          img = dataUrl;
        } else {
          img = await compressImg(dataUrl);
          if (!img || img.length > 200 * 1024) {
            toast("图片压缩后仍过大，请换一张小图", true);
            goBtn.disabled = false; return;
          }
        }
        const r = await fetch(API_BASE + "/api/stickers/submit", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: titleIn || fallbackTitle.replace(/^投稿 · /, ""),
            characters: [...selC], tags: [...selT],
            author: authorName, platform,
            img, vid: VID
          })
        });
        const j = await r.json().catch(() => null);
        if (!j || !j.ok) throw new Error((j && j.msg) || r.status);
        pfLog("submit", j.id, { title: titleIn || fallbackTitle });
        toast("投稿成功，审核通过后会展现在表情库");
        renderView();
      } else {
        // 降级演示模式：仅本会话可见
        const s = {
          id: "u" + Date.now(), file: picked.url,
          title: titleIn || fallbackTitle,
          characters: [...selC], tags: [...selT],
          author,
          format: `${picked.fmt} · ${picked.dims}`,
          added: new Date().toISOString().slice(0, 10),
          _new: true,
        };
        submitted.unshift(s);
        toast("投稿成功，已放到表情库最前面");
        go("library");
        window.scrollTo({ top: 0 });
      }
    } catch (e) {
      toast("投稿提交失败，请检查网络后重试（已选内容保留）", true);
    } finally {
      if ($("#subGo")) $("#subGo").disabled = false;
    }
  };
}

/* ---------- 视图：关于 ---------- */

function viewAbout() {
  return `
  <section class="about">
    <h1>关于 / 版权声明</h1>
    <div class="about-card">
      <p><b>本站是什么：</b>个人收藏向的「AI 模型角色二创表情包」展示站，收录 DeepSeek、豆包、ChatGPT、Claude、Gemini 等角色的同人二创图，仅供学习交流与聊天斗图，不用于商业用途。</p>
      <p><b>版权说明：</b>二创作品版权归原作者所有；部分图片来自网络收集，标注尽力而为，若你是原作者且不希望被收录，请通过下方联系方式反馈，确认后会第一时间删除。</p>
      <p><b>投稿说明：</b>投稿即表示你确认该内容可被本站非商业展示；请尽量标注原作者与出处。</p>
      <p><b>联系：</b><span id="aboutMail">agarena@agent.qq.com</span>（反馈侵权 / 删除请求，确认后第一时间处理）</p>
    </div>
  </section>`;
}

/* ---------- 路由与骨架 ---------- */

const VIEWS = {
  home:    { title: "首页",     render: viewHome,    bind: bindHome },
  library: { title: "表情库",   render: viewLibrary, bind: bindLibrary },
  submit:  { title: "投稿",     render: viewSubmit,  bind: bindSubmit },
  about:   { title: "关于",     render: viewAbout,   bind: null },
};

function go(view) { location.hash = "#" + view; }

function currentView() {
  const v = location.hash.replace("#", "");
  return VIEWS[v] ? v : "home";
}

function renderView() {
  const v = currentView();
  state.view = v;
  $("#view").innerHTML = VIEWS[v].render();
  $("#view").dataset.view = v;
  $$(".nav-links a").forEach(a => a.classList.toggle("on", a.dataset.view === v));
  window.scrollTo({ top: 0 });
  VIEWS[v].bind && VIEWS[v].bind($("#view"));
}

function buildShell() {
  const mark = $(".logo .mark");
  if (mark) mark.innerHTML = icon("sticker", 16);
  $("#navLinks").innerHTML = Object.entries(VIEWS)
    .map(([k, v]) => `<a href="#${k}" data-view="${k}">${v.title}</a>`).join("");
  window.addEventListener("hashchange", renderView);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  $("#modalBackdrop").addEventListener("click", (e) => { if (e.target === $("#modalBackdrop")) closeModal(); });
  $("#navSearch").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    state.q = e.target.value.trim();
    if (currentView() === "library") renderView(); else go("library");
  });
  renderView();
}

document.addEventListener("DOMContentLoaded", buildShell);

/* ---------- 启动拉取：服务端数据替换演示数据，失败保留兜底 ---------- */
async function loadRemote() {
  try {
    const list = await fetch(API_BASE + "/api/stickers").then(r => r.ok ? r.json() : Promise.reject(r.status));
    if (Array.isArray(list) && list.length) {
      SERVER_MODE = true;
      API_ON = true;
      STICKERS.length = 0;
      STICKERS.push(...list);
      list.forEach(x => SERVER_LIKES[x.id] = x.likes || 0);
      try {
        const c = await fetch(API_BASE + "/api/stickers/comments").then(r => r.ok ? r.json() : null);
        if (c && typeof c === "object") SERVER_COMMENTS = c;
      } catch (e) { }
      renderView();
      // 计数校准：列表有 60s 缓存，like 接口幂等，把我赞过的拉齐
      await Promise.all(Object.keys(likedMap).map(id => {
        if (!STICKERS.some(x => x.id === id)) return Promise.resolve();
        return fetch(API_BASE + "/api/stickers/like", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, vid: VID, liked: true })
        }).then(r => r.ok ? r.json() : null)
          .then(j => { if (j && j.ok && typeof j.likes === "number") SERVER_LIKES[id] = j.likes; })
          .catch(() => { });
      }));
      renderView();
    }
  } catch (e) { /* 离线/预览：保留 data.js 兜底，不上报 */ }
  handleDeepLink();
  if (API_ON) {
    collectSend([{ type: "page_view", path: SITE_PATH, ts: Date.now() }]);
    pfLog("page_view", "", { ref: document.referrer || null });
  }
  try {
    const site = await fetch(API_BASE + "/api/site").then(r => r.ok ? r.json() : null);
    if (site && site.contact_email) { const m = $("#aboutMail"); if (m) m.textContent = site.contact_email; }
  } catch (e) { }
}
/* 分享深链：?id=表情id → 切表情库、清筛选、定位高亮并直接打开详情弹窗 */
const DEEP_ID = (() => { try { return (new URLSearchParams(location.search).get("id") || "").slice(0, 60); } catch { return ""; } })();
function handleDeepLink() {
  if (!DEEP_ID) return;
  const s = STICKERS.find(x => x.id === DEEP_ID);
  if (!s) {
    toast("该表情不存在或未公开", true);
    pfLog("share_open", DEEP_ID, { found: false });
    return;
  }
  state.chars.clear(); state.tag = null; state.uncategorized = false; state.noTags = false; state.q = "";
  const nav = $("#navSearch"); if (nav) nav.value = "";
  // 用 replaceState 切到表情库（不触发 hashchange 重渲染，避免与高亮竞态）
  history.replaceState(null, "", location.pathname + location.search + "#library");
  renderView();
  requestAnimationFrame(() => {
    const el = document.querySelector('.card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(DEEP_ID) : DEEP_ID) + '"]');
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 2400);
    }
  });
  openModal(DEEP_ID);
  pfLog("share_open", DEEP_ID, { found: true });
}
document.addEventListener("DOMContentLoaded", loadRemote);
