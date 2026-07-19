// 阻断挂起状态:按 session 记录"待重写"的原文
const fs = require("fs");
const path = require("path");
const { HOME, ensureHome, withLock } = require("./config");

const PENDING_TTL = 30 * 60 * 1000; // 半小时没跟进就作废

function statePath() {
  return path.join(HOME, "pending.json");
}

function lockPath() {
  return statePath() + ".lock";
}

function loadAll() {
  ensureHome();
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch (_) {
    return {};
  }
}

function saveAll(all) {
  ensureHome();
  const p = statePath();
  const tmp = p + ".tmp" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2) + "\n");
  fs.renameSync(tmp, p);
}

// getPending/setPending/clearPending 各自都是 load-改-save,
// 不同 Claude Code 会话是各自独立的 OS 进程,共享同一个 pending.json,
// 必须加锁让 读-改-写 整体串行,否则后写的会把别的会话刚写入的键覆盖掉。
function getPending(sessionId) {
  return withLock(lockPath(), () => {
    const all = loadAll();
    const p = all[sessionId];
    if (!p) return null;
    if (Date.now() - p.ts > PENDING_TTL) {
      delete all[sessionId];
      saveAll(all);
      return null;
    }
    return p;
  });
}

// lang: detectLanguage() 判定出的语言代码(或 null),跟原文一起缓存,
// 避免 handlePending 每次重入(它是新的 hook 进程)都要重新跑一遍判定。
function setPending(sessionId, original, lang) {
  withLock(lockPath(), () => {
    const all = loadAll();
    const prev = all[sessionId];
    all[sessionId] = {
      original,
      lang: lang !== undefined ? lang : (prev ? prev.lang : null),
      ts: Date.now(),
      attempts: prev ? prev.attempts + 1 : 0
    };
    saveAll(all);
  });
}

function clearPending(sessionId) {
  withLock(lockPath(), () => {
    const all = loadAll();
    delete all[sessionId];
    saveAll(all);
  });
}

module.exports = { getPending, setPending, clearPending };
