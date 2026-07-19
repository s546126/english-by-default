// 对照队列:JSONL 存储,保留最近 N 条(默认 1000)
const fs = require("fs");
const path = require("path");
const { HOME, ensureHome } = require("./config");

// 艾宾浩斯复习间隔(天)
const INTERVALS = [1, 2, 4, 7, 15, 30, 60];
const DAY = 24 * 60 * 60 * 1000;

function queuePath() {
  return path.join(HOME, "queue.jsonl");
}

function loadQueue() {
  ensureHome();
  try {
    return fs.readFileSync(queuePath(), "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  } catch (_) {
    return [];
  }
}

function saveQueue(entries) {
  ensureHome();
  fs.writeFileSync(queuePath(), entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : ""));
}

function enqueue(cfg, entry) {
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
    lastScore: null
  });
  // 超出上限时裁掉最旧的
  const cap = cfg.queueSize || 1000;
  saveQueue(entries.length > cap ? entries.slice(entries.length - cap) : entries);
}

function updateEntry(id, patch) {
  const entries = loadQueue();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  entries[idx] = { ...entries[idx], ...patch };
  saveQueue(entries);
  return true;
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
