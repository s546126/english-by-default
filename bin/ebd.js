#!/usr/bin/env node
// ebd — English by Default CLI
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const { HOME, loadConfig, saveConfig } = require("../src/config");
const { isNonEnglish, hasStopword, isGiveup } = require("../src/detect");
const { translate, judgeEquivalence, assessNaturalnessSafe } = require("../src/llm");
const { loadQueue, enqueue, dueEntries } = require("../src/queue");
const reviewMod = require("../src/review");
const webMod = require("../src/web");

const HOOK_PATH = path.join(__dirname, "..", "hooks", "claude-code-hook.js");

// stdin 提前关闭(非 TTY/管道/CI,或用户按 Ctrl-D)时抛出这个,
// 而不是让 rl.question() 的 promise 永远悬空、静默 exit 0。
class StdinClosed extends Error {}

// readline/promises 的 question() 在 stdin 到达 EOF 时既不 resolve 也不 reject——
// 只有 interface 自己的 'close' 事件会触发。这里跟 'close' 赛跑,EOF 就转成显式异常。
function askQuestion(rl, prompt) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onClose = () => {
      if (!settled) { settled = true; reject(new StdinClosed("stdin closed before answering")); }
    };
    rl.once("close", onClose);
    rl.question(prompt).then((answer) => {
      if (!settled) {
        settled = true;
        rl.removeListener("close", onClose);
        resolve(answer);
      }
    }).catch((e) => {
      if (!settled) { settled = true; reject(e); }
    });
  });
}

const HELP = `ebd — English by Default

拦截/记录发给 AI CLI 的非英文输入,强制(或提醒)用英文表达,并把中英对照攒起来复习。

用法:
  ebd mode [block|warn|log]     查看/切换强度: 阻断 | 提示 | 放过并记录
  ebd install claude-code       安装 Claude Code UserPromptSubmit hook
  ebd uninstall claude-code     卸载 hook
  ebd x <tool> [args...]        包装其他 CLI (codex/grok/...),非英文参数先过闸门
  ebd gate "<text>"             脚本用:输出英文版并记录

  ebd web [port]                启动本地仪表盘 (默认端口 4173,仅监听 127.0.0.1)
  ebd list [n]                  最近 n 条对照 (默认 10)
  ebd stats                     队列/复习统计
  ebd quiz [n]                  随机抽查 n 条 (默认 5)
  ebd review                    艾宾浩斯复习 (只复习到期条目)
  ebd feynman                   费曼学习法:用简单英语讲给初学者听

  ebd stopwords list|add <w>|rm <w>   紧急词管理 (命中即跳过阻断)
  ebd provider [cli|openai|anthropic] [--key K] [--key-env NAME] [--base-url URL] [--model M]
                                 查看/配置 LLM 后端 (默认 cli,走本机 claude 命令)
  ebd config                    打印配置路径与内容 (key 会打码)
`;

function maskKey(k) {
  if (!k) return null;
  if (k.length <= 8) return "*".repeat(k.length);
  return k.slice(0, 4) + "…" + k.slice(-4);
}

// 打印配置前打码敏感字段,避免 ebd config 把明文 key 甩到终端历史/日志里
function redactConfig(cfg) {
  const copy = JSON.parse(JSON.stringify(cfg));
  if (copy.llm) copy.llm.apiKey = maskKey(copy.llm.apiKey);
  return copy;
}

function claudeSettingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function installClaudeCode() {
  const p = claudeSettingsPath();
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") {
      // 文件存在但不是合法 JSON:不能当成"没有就新建",否则下面的写入
      // 会用 {} 覆盖掉用户已有的 permissions/mcpServers/env/其他 hooks。
      console.error(`❌ ${p} 已存在但不是合法 JSON,为避免覆盖你其他的设置,已中止安装。请先手动修好这个文件里的 JSON 语法。`);
      process.exit(1);
    }
    // ENOENT:文件真的不存在,用空对象新建
  }
  settings.hooks = settings.hooks || {};
  const list = settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];
  const already = JSON.stringify(list).includes("english-by-default") || JSON.stringify(list).includes(HOOK_PATH);
  if (already) return console.log("已安装过,跳过。");
  list.push({ hooks: [{ type: "command", command: `node "${HOOK_PATH}"`, timeout: 120 }] });
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(settings, null, 2) + "\n");
  console.log(`✅ 已写入 ${p}\n重启 Claude Code 会话后生效。当前模式: ${loadConfig().mode}`);
}

function uninstallClaudeCode() {
  const p = claudeSettingsPath();
  let settings;
  try { settings = JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return console.log("settings.json 不存在。"); }
  const list = settings.hooks && settings.hooks.UserPromptSubmit;
  if (!list) return console.log("未安装。");
  settings.hooks.UserPromptSubmit = list.filter(
    (m) => !JSON.stringify(m).includes("english-by-default") && !JSON.stringify(m).includes(HOOK_PATH)
  );
  fs.writeFileSync(p, JSON.stringify(settings, null, 2) + "\n");
  console.log("✅ 已移除 hook。");
}

// 终端交互闸门:给 ebd x 用
async function gateInteractive(cfg, original) {
  if (hasStopword(original, cfg.stopwords)) {
    enqueue(cfg, { original, english: null, mode: "stopword", skipped: true, source: "wrapper" });
    console.log("⚡ 命中紧急词,原样放行(已记录)。");
    return original;
  }
  if (cfg.mode !== "block") {
    // fail-open:LLM 挂了/超时/命令不存在 也不能让 ebd x 直接崩溃、
    // 连被包装的工具都没跑起来(参照 gate.js 的 catch 逻辑)。
    let english = null;
    try {
      english = translate(cfg, original);
    } catch (_) { /* 翻译失败不挡路,原样放行 */ }
    enqueue(cfg, { original, english, mode: cfg.mode, source: "wrapper", ...assessNaturalnessSafe(cfg, english) });
    if (cfg.mode === "warn") {
      console.log(english ? `⚠️ 非英文输入,已自动转英文: ${english}` : "⚠️ 非英文输入,翻译失败,已原样放行。");
    }
    return english || original;
  }
  const readline = require("readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`🛡 非英文输入被拦截:「${original}」`);
    console.log("请用英文重写 (输入 giveup 放弃并获得英文表达):");
    for (;;) {
      const attempt = (await askQuestion(rl, "English > ")).trim();
      if (!attempt) continue;
      if (isGiveup(attempt, cfg.giveupWords)) {
        let english = null;
        try {
          english = translate(cfg, original);
        } catch (_) { /* fail-open */ }
        enqueue(cfg, { original, english, mode: "giveup", source: "wrapper", ...assessNaturalnessSafe(cfg, english) });
        console.log(english ? `🏳 英文表达: ${english}` : "🏳 翻译失败,已放行原文。");
        return english || original;
      }
      if (isNonEnglish(attempt)) { console.log("还是非英文,再来。"); continue; }
      let v;
      try {
        v = judgeEquivalence(cfg, original, attempt);
      } catch (_) {
        // LLM 挂了不挡路
        enqueue(cfg, { original, english: attempt, mode: "unverified", source: "wrapper", ...assessNaturalnessSafe(cfg, attempt) });
        console.log("判定服务异常,fail-open 放行。");
        return attempt;
      }
      if (v.equivalent === true || (Number(v.score) || 0) >= cfg.judgeThreshold) {
        enqueue(cfg, { original, english: attempt, mode: "rewrite", source: "wrapper", ...assessNaturalnessSafe(cfg, attempt) });
        console.log(`✅ 语义一致 (score ${v.score})。`);
        return attempt;
      }
      console.log(`❌ 不一致 (score ${v.score})。提示: ${v.hint || "再想想"}`);
    }
  } finally {
    rl.close();
  }
}

async function cmdX(cfg, argv) {
  if (!argv.length) return console.log("用法: ebd x <tool> [args...]");
  const out = [];
  try {
    for (const a of argv) {
      out.push(isNonEnglish(a) ? await gateInteractive(cfg, a) : a);
    }
  } catch (e) {
    if (!(e instanceof StdinClosed)) throw e;
    console.error("ebd: 输入流已关闭,无法完成英文重写确认,已取消执行。");
    process.exit(1);
  }
  const res = spawnSync(out[0], out.slice(1), { stdio: "inherit" });
  // res.status 在"进程根本没启动成功"(如命令拼错/不存在,ENOENT)或
  // "被信号杀掉"时都是 null,不能用 `res.status || 0` 一律当成功退出。
  if (res.error) {
    console.error(`ebd: 无法启动 "${out[0]}": ${res.error.message}`);
    process.exit(1);
  }
  if (res.signal) {
    console.error(`ebd: "${out[0]}" 被信号终止: ${res.signal}`);
    process.exit(1);
  }
  process.exit(res.status === null ? 0 : res.status);
}

function fmtDate(ts) {
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

function cmdList(n) {
  const entries = loadQueue().slice(-n);
  if (!entries.length) return console.log("队列为空。");
  for (const e of entries) {
    console.log(`\n[${fmtDate(e.ts)}] (${e.mode}${e.skipped ? ",紧急放行" : ""})`);
    console.log("  原文: " + e.original.slice(0, 200));
    console.log("  英文: " + (e.english ? e.english.slice(0, 200) : "(未翻译)"));
  }
}

function cmdStats() {
  const cfg = loadConfig();
  const entries = loadQueue();
  const due = dueEntries();
  const scored = entries.filter((e) => e.lastScore !== null);
  const avg = scored.length ? Math.round(scored.reduce((s, e) => s + e.lastScore, 0) / scored.length) : "-";
  const nextTs = entries.length ? Math.min(...entries.map((e) => e.nextReview)) : null;
  console.log(`模式: ${cfg.mode}  队列: ${entries.length}/${cfg.queueSize}  数据目录: ${HOME}`);
  console.log(`到期待复习: ${due.length}  平均分: ${avg}  紧急放行未翻译: ${entries.filter((e) => e.skipped && !e.english).length}`);
  if (nextTs) console.log(`最近一次复习到期: ${fmtDate(nextTs)}`);
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const cfg = loadConfig();
  switch (cmd) {
    case "mode":
      if (rest[0]) {
        if (!["block", "warn", "log"].includes(rest[0])) return console.log("模式只能是 block | warn | log");
        cfg.mode = rest[0];
        saveConfig(cfg);
      }
      console.log(`当前模式: ${cfg.mode} (block=阻断 warn=提示 log=放过并记录)`);
      break;
    case "install":
      if (rest[0] === "claude-code") installClaudeCode();
      else console.log("目前支持: ebd install claude-code。其他 CLI 用 ebd x <tool> 包装。");
      break;
    case "uninstall":
      if (rest[0] === "claude-code") uninstallClaudeCode();
      else console.log("用法: ebd uninstall claude-code");
      break;
    case "x":
      await cmdX(cfg, rest);
      break;
    case "gate": {
      const text = rest.join(" ");
      if (!text) return console.log('用法: ebd gate "<text>"');
      if (!isNonEnglish(text)) return console.log(text);
      // fail-open:翻译服务挂了也要给下游脚本一个可用的输出,而不是直接崩溃
      let english = null;
      try {
        english = translate(cfg, text);
      } catch (_) { /* 翻译失败,原样输出 */ }
      enqueue(cfg, { original: text, english, mode: "gate", source: "gate", ...assessNaturalnessSafe(cfg, english) });
      console.log(english || text);
      break;
    }
    case "web": {
      const port = parseInt(rest[0], 10) || 4173;
      webMod.startServer(cfg, port);
      break;
    }
    case "list":
      cmdList(parseInt(rest[0], 10) || 10);
      break;
    case "stats":
    case "status":
      cmdStats();
      break;
    case "quiz":
      await reviewMod.quiz(cfg, parseInt(rest[0], 10) || 5);
      break;
    case "review":
      await reviewMod.review(cfg);
      break;
    case "feynman":
      await reviewMod.feynman(cfg);
      break;
    case "stopwords": {
      const [sub, ...words] = rest;
      if (sub === "add" && words.length) {
        cfg.stopwords.push(...words.filter((w) => !cfg.stopwords.includes(w)));
        saveConfig(cfg);
      } else if ((sub === "rm" || sub === "remove") && words.length) {
        cfg.stopwords = cfg.stopwords.filter((w) => !words.includes(w));
        saveConfig(cfg);
      }
      console.log("紧急词: " + cfg.stopwords.join(", "));
      break;
    }
    case "provider": {
      const [name, ...flags] = rest;
      if (name && !["cli", "openai", "anthropic"].includes(name)) {
        console.log("provider 只能是 cli | openai | anthropic");
        break;
      }
      let changed = false;
      if (name) { cfg.llm.provider = name; changed = true; }
      for (let i = 0; i < flags.length; i++) {
        const val = flags[i + 1];
        if (flags[i] === "--key") { cfg.llm.apiKey = val; i++; changed = true; }
        else if (flags[i] === "--key-env") { cfg.llm.apiKeyEnv = val; i++; changed = true; }
        else if (flags[i] === "--base-url") { cfg.llm.baseUrl = val; i++; changed = true; }
        else if (flags[i] === "--model") { cfg.llm.model = val; i++; changed = true; }
      }
      if (changed) saveConfig(cfg);
      console.log(`provider: ${cfg.llm.provider}`);
      if (cfg.llm.provider === "cli") {
        console.log(`  command: ${cfg.llm.command.join(" ")}`);
      } else {
        console.log(`  baseUrl: ${cfg.llm.baseUrl || "(provider 默认)"}`);
        console.log(`  model: ${cfg.llm.model || "(内置默认)"}`);
        console.log(`  apiKey: ${cfg.llm.apiKeyEnv ? "读环境变量 " + cfg.llm.apiKeyEnv : (maskKey(cfg.llm.apiKey) || "(未设置,回退到标准环境变量)")}`);
      }
      break;
    }
    case "config":
      console.log(path.join(HOME, "config.json"));
      console.log(JSON.stringify(redactConfig(cfg), null, 2));
      break;
    default:
      console.log(HELP);
  }
})().catch((e) => {
  console.error("ebd error: " + e.message);
  process.exit(1);
});
