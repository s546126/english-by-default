// 对照队列:JSONL 存储,保留最近 N 条(默认 1000)
const fs = require("fs");
const path = require("path");
const { HOME, ensureHome, withLock } = require("./config");

// 艾宾浩斯复习间隔(天)
const INTERVALS = [1, 2, 4, 7, 15, 30, 60];
const DAY = 24 * 60 * 60 * 1000;

function queuePath() {
  return path.join(HOME, "queue.jsonl");
}

function lockPath() {
  return queuePath() + ".lock";
}

function loadQueue() {
  ensureHome();
  let raw;
  try {
    raw = fs.readFileSync(queuePath(), "utf8");
  } catch (_) {
    return [];
  }
  // 逐行 parse,单行损坏(崩溃/断电导致的部分写入、手工误改)只丢那一行,
  // 不能因为一行坏了就把整条队列(最多 1000 条复习记录)当空处理。
  const entries = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (_) { /* 跳过这一行损坏的记录 */ }
  }
  return entries;
}

function saveQueue(entries) {
  ensureHome();
  const p = queuePath();
  const body = entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
  // 先写临时文件再 rename:rename 在同一文件系统内是原子的,
  // 避免进程中途崩溃留下半行 JSON。
  const tmp = p + ".tmp" + process.pid;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, p);
}

function enqueue(cfg, entry) {
  // loadQueue -> push -> saveQueue 必须作为一个整体加锁,
  // 否则两个并发进程各自读到旧快照、后写的会覆盖先写的,导致丢记录。
  withLock(lockPath(), () => {
    const entries = loadQueue();
    const now = Date.now();
    entries.push({
      id: now.toString(36) + Math.random().toString(36).slice(2, 6),
      ts: now,
      original: entry.original,
      english: entry.english || null,
      source: entry.source || "claude-code",
      mode: entry.mode,
      skipped: !!entry.skipped, // stopword 紧急放行,未翻译
      reviews: 0,
      nextReview: now + DAY,
      lastScore: null,
      // 地道度判定(assessNaturalness):没有英文可判(如 stopword 跳过)或 LLM
      // 判定失败时都是 null,不是 false —— null 表示"未知/未判",false 才表示
      // "判过了、不地道"。用 !== undefined 而非 || 是因为 natural 合法取值包含 false。
      natural: entry.natural !== undefined ? entry.natural : null,
      naturalHint: entry.naturalHint || null
    });
    // 超出上限时裁掉最旧的
    const cap = cfg.queueSize || 1000;
    saveQueue(entries.length > cap ? entries.slice(entries.length - cap) : entries);
  });
}

function updateEntry(id, patch) {
  return withLock(lockPath(), () => {
    const entries = loadQueue();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    entries[idx] = { ...entries[idx], ...patch };
    saveQueue(entries);
    return true;
  });
}

// 复习结果驱动排期:通过则间隔升级,失败则退档明天再来
function scheduleAfterReview(entry, passed) {
  const reviews = passed ? entry.reviews + 1 : Math.max(0, entry.reviews - 1);
  const interval = INTERVALS[Math.min(reviews, INTERVALS.length - 1)];
  return { reviews, nextReview: Date.now() + (passed ? interval : 1) * DAY };
}

function dueEntries() {
  const now = Date.now();
  return loadQueue().filter((e) => e.nextReview <= now);
}

module.exports = { loadQueue, saveQueue, enqueue, updateEntry, scheduleAfterReview, dueEntries, INTERVALS };
