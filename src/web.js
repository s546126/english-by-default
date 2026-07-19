// 本地仪表盘:纯 Node 内置 http 模块,零依赖。展示高频词/短语 + 最近不地道表达。
// 只绑定 127.0.0.1 —— 这是个人本地看板,没有鉴权,绝不能对外暴露。
const http = require("http");
const { loadQueue, dueEntries } = require("./queue");
const { countNonLatin, countLatinLetters } = require("./detect");

function computeStats() {
  const entries = loadQueue();
  const due = dueEntries();
  const scored = entries.filter((e) => e.lastScore !== null && e.lastScore !== undefined);
  const avgLastScore = scored.length
    ? Math.round(scored.reduce((s, e) => s + e.lastScore, 0) / scored.length)
    : null;
  const modeBreakdown = {};
  for (const e of entries) modeBreakdown[e.mode] = (modeBreakdown[e.mode] || 0) + 1;
  return { total: entries.length, avgLastScore, dueForReview: due.length, modeBreakdown };
}

// 分词:拉丁字母为主的原文按空白切分、去标点、小写;CJK 为主的原文没有天然
// 词边界,真正分词需要词典/模型,这里退化成"字符 bigram"做粗略近似统计
// (仅用于"高频词/短语"这个大致趋势展示,不追求精确)。
// 复用 detect.js 里已有的 countNonLatin/countLatinLetters 来判断"以谁为主",
// 不再发明新的启发式阈值。
function tokenize(text) {
  const isCJKish = countNonLatin(text) > countLatinLetters(text);
  if (isCJKish) {
    const chars = Array.from(text.replace(/\s+/g, ""));
    const bigrams = [];
    for (let i = 0; i < chars.length - 1; i++) bigrams.push(chars[i] + chars[i + 1]);
    return bigrams;
  }
  const stripped = text.toLowerCase().replace(/[^a-z0-9\s']/g, " ");
  return stripped.split(/\s+/).filter(Boolean);
}

function frequentWords(limit) {
  const entries = loadQueue();
  const counts = new Map();
  for (const e of entries) {
    if (!e.original) continue;
    for (const tok of tokenize(e.original)) {
      counts.set(tok, (counts.get(tok) || 0) + 1);
    }
  }
  let list = [...counts.entries()].map(([word, count]) => ({ word, count }));
  // 队列条目够多时,只出现过一次的词/bigram 大概率是噪音,过滤掉
  if (entries.length > 20) list = list.filter((x) => x.count > 1);
  list.sort((a, b) => b.count - a.count);
  return list.slice(0, limit);
}

function nonIdiomatic(limit) {
  const entries = loadQueue();
  const filtered = entries.filter((e) => e.natural === false);
  return filtered
    .slice(-limit)
    .reverse()
    .map((e) => ({ original: e.original, english: e.english, naturalHint: e.naturalHint, ts: e.ts }));
}

function recentEntries(limit) {
  return loadQueue().slice(-limit).reverse();
}

const PAGE = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>english-by-default 仪表盘</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; background: #f5f5f7; color: #1d1d1f; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
  .card { background: #fff; border-radius: 10px; padding: 14px 18px; min-width: 120px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .card .num { font-size: 24px; font-weight: 600; }
  .card .label { font-size: 12px; color: #666; margin-top: 2px; }
  section { background: #fff; border-radius: 10px; padding: 16px 18px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  section h2 { font-size: 15px; margin: 0 0 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
  th { color: #666; font-weight: 500; }
  .freq-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { background: #eef0f3; border-radius: 999px; padding: 4px 10px; font-size: 12px; }
  .chip b { color: #444; }
  .item { padding: 10px 0; border-bottom: 1px solid #eee; font-size: 13px; }
  .item:last-child { border-bottom: none; }
  .item .orig { color: #666; }
  .item .eng { margin: 4px 0; }
  .item .hint { color: #b45309; }
  .item .ts { color: #999; font-size: 11px; margin-top: 4px; }
  .empty { color: #999; font-size: 13px; }
  @media (prefers-color-scheme: dark) {
    body { background: #1c1c1e; color: #eee; }
    .card, section { background: #2c2c2e; box-shadow: none; }
    th, td { border-color: #3a3a3c; }
    .chip { background: #3a3a3c; }
    .chip b { color: #ddd; }
    .item { border-color: #3a3a3c; }
  }
</style>
</head>
<body>
<h1>english-by-default 仪表盘</h1>
<div class="cards" id="cards"></div>
<section>
  <h2>高频词/短语</h2>
  <div class="freq-grid" id="freq"></div>
</section>
<section>
  <h2>最近不地道表达</h2>
  <div id="nonidiomatic"></div>
</section>
<script>
async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function fmtTs(ts) {
  const d = new Date(ts);
  return d.toISOString().slice(0, 16).replace("T", " ");
}
async function renderStats() {
  const s = await getJSON("/api/stats");
  const modes = Object.entries(s.modeBreakdown || {}).map(([k, v]) => k + ":" + v).join(" ") || "-";
  document.getElementById("cards").innerHTML = [
    ["总条数", s.total],
    ["平均得分", s.avgLastScore == null ? "-" : s.avgLastScore],
    ["待复习", s.dueForReview],
    ["模式分布", modes]
  ].map(([label, num]) => '<div class="card"><div class="num">' + esc(num) + '</div><div class="label">' + esc(label) + '</div></div>').join("");
}
async function renderFreq() {
  const list = await getJSON("/api/frequent?limit=40");
  const el = document.getElementById("freq");
  el.innerHTML = list.length
    ? list.map((x) => '<span class="chip">' + esc(x.word) + ' <b>' + x.count + '</b></span>').join("")
    : '<span class="empty">暂无数据</span>';
}
async function renderNonIdiomatic() {
  const list = await getJSON("/api/nonidiomatic?limit=20");
  const el = document.getElementById("nonidiomatic");
  el.innerHTML = list.length
    ? list.map((x) =>
        '<div class="item"><div class="orig">原文: ' + esc(x.original) + '</div>' +
        '<div class="eng">英文: ' + esc(x.english) + '</div>' +
        (x.naturalHint ? '<div class="hint">建议: ' + esc(x.naturalHint) + '</div>' : '') +
        '<div class="ts">' + fmtTs(x.ts) + '</div></div>'
      ).join("")
    : '<span class="empty">暂无数据</span>';
}
renderStats();
renderFreq();
renderNonIdiomatic();
</script>
</body>
</html>
`;

function sendJSON(res, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function limitParam(url, def) {
  const raw = url.searchParams.get("limit");
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function startServer(cfg, port) {
  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, "http://127.0.0.1");
    } catch (_) {
      res.writeHead(400);
      return res.end();
    }
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "method not allowed" }));
    }
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(PAGE);
    }
    if (url.pathname === "/api/stats") return sendJSON(res, computeStats());
    if (url.pathname === "/api/frequent") return sendJSON(res, frequentWords(limitParam(url, 30)));
    if (url.pathname === "/api/nonidiomatic") return sendJSON(res, nonIdiomatic(limitParam(url, 20)));
    if (url.pathname === "/api/entries") return sendJSON(res, recentEntries(limitParam(url, 50)));
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ 端口 ${port} 已被占用,换个端口重试: ebd web <port>`);
    } else {
      console.error("❌ 仪表盘启动失败: " + err.message);
    }
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Dashboard: http://127.0.0.1:${port}`);
  });

  return server;
}

module.exports = { startServer, computeStats, frequentWords, nonIdiomatic, recentEntries, tokenize };
