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
    provider: "cli", // cli(默认,走本机 CLI 命令) | openai | anthropic(直连 API)
    command: ["claude", "-p", "--model", "haiku"], // provider=cli 时使用
    baseUrl: null,   // provider=openai/anthropic 时的 endpoint,留空用官方默认值
    model: null,     // provider=openai/anthropic 时的模型,留空用内置默认值
    apiKey: null,      // provider=openai/anthropic 时的 key,明文存在 config.json 里
    apiKeyEnv: null,   // 优先级更高:从这个环境变量名读 key,不用把 key 写进配置文件
    timeoutMs: 90000
  }
};

function ensureHome() {
  fs.mkdirSync(HOME, { recursive: true });
}

// 跨进程文件锁:用独占创建(wx)的锁文件当互斥量,避免多个 ebd/hook 进程
// 并发 读-改-写 同一个 JSON(L) 文件时互相覆盖、丢数据。
// 忙等用 Atomics.wait 同步阻塞,不引入定时器/依赖。
function withLock(lockPath, fn) {
  const start = Date.now();
  let fd;
  for (;;) {
    try {
      fd = fs.openSync(lockPath, "wx");
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      // 锁文件存在太久,大概率是持有者进程崩溃遗留的,强行清理避免死锁
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > 10000) fs.unlinkSync(lockPath);
      } catch (_) { /* 可能刚好被别的进程释放,忽略 */ }
      if (Date.now() - start > 5000) throw new Error("lock timeout: " + lockPath);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
    }
  }
  try {
    return fn();
  } finally {
    try { fs.closeSync(fd); } catch (_) {}
    try { fs.unlinkSync(lockPath); } catch (_) {}
  }
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

module.exports = { HOME, DEFAULTS, loadConfig, saveConfig, ensureHome, withLock };
