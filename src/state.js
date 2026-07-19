// 阻断挂起状态:按 session 记录"待重写"的原文
const fs = require("fs");
const path = require("path");
const { HOME, ensureHome } = require("./config");

const PENDING_TTL = 30 * 60 * 1000; // 半小时没跟进就作废

function statePath() {
  return path.join(HOME, "pending.json");
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
  fs.writeFileSync(statePath(), JSON.stringify(all, null, 2) + "\n");
}

function getPending(sessionId) {
  const all = loadAll();
  const p = all[sessionId];
  if (!p) return null;
  if (Date.now() - p.ts > PENDING_TTL) {
    delete all[sessionId];
    saveAll(all);
    return null;
  }
  return p;
}

function setPending(sessionId, original) {
  const all = loadAll();
  const prev = all[sessionId];
  all[sessionId] = { original, ts: Date.now(), attempts: prev ? prev.attempts + 1 : 0 };
  saveAll(all);
}

function clearPending(sessionId) {
  const all = loadAll();
  delete all[sessionId];
  saveAll(all);
}

module.exports = { getPending, setPending, clearPending };
