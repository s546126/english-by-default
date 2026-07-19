#!/usr/bin/env node
// ebd — English by Default CLI
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const { HOME, loadConfig, saveConfig } = require("../src/config");
const { isNonEnglish, hasStopword, isGiveup } = require("../src/detect");
const { translate, judgeEquivalence } = require("../src/llm");
const { loadQueue, enqueue, dueEntries } = require("../src/queue");
const reviewMod = require("../src/review");

const HOOK_PATH = path.join(__dirname, "..", "hooks", "claude-code-hook.js");

const HELP = `ebd — English by Default

拦截/记录发给 AI CLI 的非英文输入,强制(或提醒)用英文表达,并把中英对照攒起来复习。

用法:
  ebd mode [block|warn|log]     查看/切换强度: 阻断 | 提示 | 放过并记录
  ebd install claude-code       安装 Claude Code UserPromptSubmit hook
  ebd uninstall claude-code     卸载 hook
  ebd x <tool> [args...]        包装其他 CLI (codex/grok/...),非英文参数先过闸门
  ebd gate "<text>"             脚本用:输出英文版并记录

  ebd list [n]                  最近 n 条对照 (默认 10)
  ebd stats                     队列/复习统计
  ebd quiz [n]                  随机抽查 n 条 (默认 5)
  ebd review                    艾宾浩斯复习 (只复习到期条目)
  ebd feynman                   费曼学习法:用简单英语讲给初学者听

  ebd stopwords list|add <w>|rm <w>   紧急词管理 (命中即跳过阻断)
  ebd config                    打印配置路径与内容
`;

function claudeSettingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function installClaudeCode() {
  const p = claudeSettingsPath();
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { /* 没有就新建 */ }
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
    const english = translate(cfg, original);
    enqueue(cfg, { original, english, mode: cfg.mode, source: "wrapper" });
    if (cfg.mode === "warn") console.log(`⚠️ 非英文输入,已自动转英文: ${english}`);
    return english;
  }
  const readline = require("readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`🛡 非英文输入被拦截:「${original}」`);
    console.log("请用英文重写 (输入 giveup 放弃并获得英文表达):");
    for (;;) {
      const attempt = (await rl.question("English > ")).trim();
      if (!attempt) continue;
      if (isGiveup(attempt, cfg.giveupWords)) {
        const english = translate(cfg, original);
        enqueue(cfg, { original, english, mode: "giveup", source: "wrapper" });
        console.log(`🏳 英文表达: ${english}`);
        return english;
      }
      if (isNonEnglish(attempt)) { console.log("还是非英文,再来。"); continue; }
      const v = judgeEquivalence(cfg, original, attempt);
      if (v.equivalent || (v.score || 0) >= cfg.judgeThreshold) {
        enqueue(cfg, { original, english: attempt, mode: "rewrite", source: "wrapper" });
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
  for (const a of argv) {
    out.push(isNonEnglish(a) ? await gateInteractive(cfg, a) : a);
  }
  const res = spawnSync(out[0], out.slice(1), { stdio: "inherit" });
  process.exit(res.status || 0);
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
      const english = translate(cfg, text);
      enqueue(cfg, { original: text, english, mode: "gate", source: "gate" });
      console.log(english);
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
    case "config":
      console.log(path.join(HOME, "config.json"));
      console.log(JSON.stringify(cfg, null, 2));
      break;
    default:
      console.log(HELP);
  }
})().catch((e) => {
  console.error("ebd error: " + e.message);
  process.exit(1);
});
