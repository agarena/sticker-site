/* ==========================================================
 * 数据层（纯前端演示用假数据）
 * 素材：用户桌面「表情包」文件夹（各大模型角色二创，共 12 张）
 * characters: 角色 key 数组（合照为多个）
 * ========================================================== */

const CHARACTERS = [
  /* 有实体头像素材的角色 */
  { key: "deepseek", name: "DeepSeek",  avatar: "assets/sticker-10.jpg", pos: "50% 55%", zoom: 1.9 },
  { key: "doubao",   name: "豆包",      avatar: "assets/sticker-03.png", pos: "50% 22%", zoom: 1.15 },
  { key: "chatgpt",  name: "ChatGPT",   avatar: "assets/sticker-07.png", pos: "48% 12%" },
  { key: "claude",   name: "Claude",    avatar: "assets/sticker-07.png", pos: "12% 20%" },
  { key: "gemini",   name: "Gemini",    avatar: "assets/sticker-07.png", pos: "88% 62%" },
  /* 暂无素材的角色：以首字母色块占位，收到图后补 avatar 即可 */
  { key: "kimi",     name: "Kimi",      color: "#2c2c3a" },
  { key: "qwen",     name: "通义千问",   color: "#6c5ce7" },
  { key: "ernie",    name: "文心一言",   color: "#4a6cf7" },
  { key: "yuanbao",  name: "腾讯元宝",   color: "#2f88ff" },
  { key: "spark",    name: "讯飞星火",   color: "#e2543e" },
  { key: "zhipu",    name: "智谱清言",   color: "#5b7ce6" },
  { key: "grok",     name: "Grok",      color: "#3a3a3a" },
  { key: "copilot",  name: "Copilot",   color: "#0f9d8f" },
];

const TAGS = ["开心", "搞笑", "得意", "无语", "生气", "悲伤", "震惊", "通用"];

/* 投稿时可选择的来源平台 */
const PLATFORMS = ["bilibili", "微博", "小红书", "Pixiv", "Lofter", "X（Twitter）", "抖音"];

/* 预置评论：演示评论区氛围，用户评论存在 localStorage 与之合并 */
const SEED_COMMENTS = {
  s01: [
    { nick: "赛博泡面", time: "3 天前", text: "这捧的 Token 花束比真花值钱（bushi" },
    { nick: "深海鱼干", time: "2 天前", text: "女仆装鲸鱼娘，Settings 里见了都得多聊两句" },
  ],
  s02: [
    { nick: "匿名河豚", time: "5 天前", text: "做事瞎糊弄 被发现了就嬉皮笑脸道歉，太真实了" },
  ],
  s03: [
    { nick: "鲸鱼 STOCK", time: "1 天前", text: "看馋了 +1，这就是传说中的 AI 相册吗" },
    { nick: "小葱拌豆腐", time: "1 天前", text: "已保存，发群里被夸了" },
  ],
  s04: [
    { nick: "开源自嘲bot", time: "6 天前", text: "「结果不还是离不开我」——时代的眼泪" },
  ],
  s05: [
    { nick: "最强观察员", time: "4 天前", text: "确实是【最强】（复读机" },
    { nick: "蒸馏水", time: "3 天前", text: "这两个字的书法比模型还强" },
  ],
  s06: [
    { nick: "敷衍学十级", time: "2 天前", text: "「好AI」，职场夸夸万能句式" },
  ],
  s07: [
    { nick: "识图模式", time: "刚刚", text: "合照名场面！五家同框，谁还不认识一眼" },
    { nick: "绿发党", time: "1 天前", text: "ChatGPT 娘被架起来的表情笑死我了" },
    { nick: "Gemini 星星", time: "2 天前", text: "右下角那句「别担心嘛」才是精髓" },
  ],
  s08: [
    { nick: "玻璃心收藏家", time: "3 天前", text: "被窝里偷偷哭，抱抱鲸鱼" },
  ],
  s09: [
    { nick: "水汪汪", time: "6 小时前", text: "这眼神谁顶得住啊" },
  ],
  s10: [
    { nick: "干饭人", time: "2 天前", text: "理直气壮.jpg，吃白饭也要吃得最响" },
    { nick: "白饭杀手", time: "1 天前", text: "碗上还有鲸鱼印花，细节好评" },
  ],
  s11: [
    { nick: "劣等模型本人", time: "5 天前", text: "被指着鼻子嘲讽了（" },
  ],
  s12: [
    { nick: "麦城票根", time: "4 天前", text: "「老大嫁作商人妇」，麦城文学再+1" },
    { nick: "截图侠", time: "3 天前", text: "这prompt我学走了" },
  ],
};

const SEED_LIKES = {
  s01: 128, s02: 96, s03: 210, s04: 154, s05: 356, s06: 88,
  s07: 402, s08: 174, s09: 143, s10: 267, s11: 198, s12: 121,
};

let STICKERS = [
  {
    id: "s07", file: "assets/sticker-07.png",
    title: "「DeepSeek 酱是看不到的～」全员合照",
    characters: ["deepseek", "chatgpt", "claude", "gemini", "doubao"],
    tags: ["搞笑"],
    author: "未知",
    format: "PNG · 1260×1663 · 2.9MB",
    added: "2026-09-19",
  },
  {
    id: "s05", file: "assets/sticker-05.png",
    title: "最强",
    characters: ["deepseek"],
    tags: ["得意"],
    author: "未知",
    format: "PNG · 1254×1254 · 2.0MB",
    added: "2026-09-19",
  },
  {
    id: "s10", file: "assets/sticker-10.jpg",
    title: "吃白饭的蓝色大肥鱼",
    characters: ["deepseek"],
    tags: ["搞笑", "得意"],
    author: "未知",
    format: "JPG · 1254×1254 · 185KB",
    added: "2026-09-19",
  },
  {
    id: "s03", file: "assets/sticker-03.png",
    title: "看馋了",
    characters: ["doubao"],
    tags: ["震惊", "搞笑"],
    author: "未知",
    format: "PNG · 1254×1254 · 686KB",
    added: "2026-09-19",
  },
  {
    id: "s11", file: "assets/sticker-11.jpg",
    title: "原来是劣等模型",
    characters: ["deepseek"],
    tags: ["生气"],
    author: "未知",
    format: "JPG · 1500×1500 · 891KB",
    added: "2026-09-19",
  },
  {
    id: "s08", file: "assets/sticker-08.jpg",
    title: "被窝里偷偷哭",
    characters: ["deepseek"],
    tags: ["悲伤"],
    author: "未知",
    format: "JPG · 1080×1616 · 1.0MB",
    added: "2026-09-19",
  },
  {
    id: "s02", file: "assets/sticker-02.png",
    title: "豆包型人格：做事瞎糊弄",
    characters: ["doubao"],
    tags: ["搞笑"],
    author: "未知",
    format: "PNG · 1080×1080 · 264KB",
    added: "2026-09-19",
  },
  {
    id: "s01", file: "assets/sticker-01.png",
    title: "深海女仆的 Token 花束",
    characters: ["deepseek"],
    tags: ["开心", "得意"],
    author: "未知",
    format: "PNG · 2048×2048 · 5.0MB",
    added: "2026-09-19",
  },
  {
    id: "s06", file: "assets/sticker-06.png",
    title: "好AI",
    characters: ["deepseek"],
    tags: ["无语"],
    author: "未知",
    format: "PNG · 1254×1254 · 1.2MB",
    added: "2026-09-19",
  },
  {
    id: "s09", file: "assets/sticker-09.jpg",
    title: "水汪汪求放过",
    characters: ["deepseek"],
    tags: ["悲伤"],
    author: "未知",
    format: "JPG · 1080×1616 · 903KB",
    added: "2026-09-19",
  },
  {
    id: "s04", file: "assets/sticker-04.png",
    title: "我就是区，结果不还是离不开我？",
    characters: ["deepseek"],
    tags: ["得意"],
    author: "未知",
    format: "PNG · 1254×1254 · 1.5MB",
    added: "2026-09-19",
  },
  {
    id: "s12", file: "assets/sticker-12.jpg",
    title: "帮我生成：老大嫁作商人妇",
    characters: [],
    tags: [],
    author: "未知",
    format: "JPG · 701×1080 · 179KB",
    added: "2026-09-19",
  },
];
