// 配置与数据目录管理
const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = process.env.EBD_HOME || path.join(os.homedir(), ".english-by-default");

const DEFAULTS = {
  mode: "block", // block | warn | log
  queueSize: 1000,
  judgeThreshold: 70,
  stopwords: ["紧急", "加急", "urgent", "asap", "立刻", "马上", "线上事故", "hotfix", "incident"],
  giveupWords: ["giveup", "give up", "放弃", "算了"],
  llm: {
    command: ["claude", "-p", "--model", "haiku"],
    timeoutMs: 90000
  }
};

function ensureHome() {
  fs.mkdirSync(HOME, { recursive: true });
}

function configPath() {
  return path.join(HOME, "config.json");
}

function loadConfig() {
  ensureHome();
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch (_) { /* 首次运行,用默认值 */ }
  const merged = { ...DEFAULTS, ...cfg };
  merged.llm = { ...DEFAULTS.llm, ...(cfg.llm || {}) };
  return merged;
}

function saveConfig(cfg) {
  ensureHome();
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n");
}

module.exports = { HOME, DEFAULTS, loadConfig, saveConfig, ensureHome };
