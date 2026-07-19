// 核心闸门:hook 和 CLI 包装器共用的决策逻辑
const { isNonEnglish, hasStopword, isGiveup } = require("./detect");
const { translate, judgeEquivalence } = require("./llm");
const { enqueue } = require("./queue");
const { getPending, setPending, clearPending } = require("./state");

// 返回 { action: "allow"|"block", reason?, additionalContext?, systemMessage? }
function decide(cfg, sessionId, prompt, source) {
  if (process.env.EBD_INTERNAL) return { action: "allow" };
  const text = (prompt || "").trim();
  if (!text || text.startsWith("/") || text.startsWith("!")) return { action: "allow" };

  const pending = getPending(sessionId);

  if (pending) {
    return handlePending(cfg, sessionId, text, pending, source);
  }

  if (!isNonEnglish(text)) return { action: "allow" };

  // 紧急词:跳过阻断,直接放行并记录
  if (hasStopword(text, cfg.stopwords)) {
    enqueue(cfg, { original: text, english: null, mode: "stopword", skipped: true, source });
    return {
      action: "allow",
      systemMessage: "⚡ english-by-default: 命中紧急词,跳过阻断(已记录,可稍后补翻译)。"
    };
  }

  if (cfg.mode === "block") {
    setPending(sessionId, text);
    return {
      action: "block",
      reason:
        "🛡 English by Default — 检测到非英文输入,已拦截。\n" +
        "请用英文重新表达同样的意思(LLM 会判断语义是否一致,一致才放行)。\n" +
        "想放弃就输入 giveup,会给出英文表达并自动继续。"
    };
  }

  // warn / log:翻译后放行,英文版作为上下文喂给 LLM
  let english = null;
  try {
    english = translate(cfg, text);
  } catch (_) { /* 翻译失败不挡路 */ }
  enqueue(cfg, { original: text, english, mode: cfg.mode, source });

  const ctx = english
    ? "english-by-default: The user's message translated to English:\n" + english +
      "\nPlease treat this English version as the user's request."
    : null;

  if (cfg.mode === "warn") {
    return {
      action: "allow",
      additionalContext: ctx,
      systemMessage: "⚠️ english-by-default: 非英文输入(warn 模式,已记录)。英文版: " + (english || "翻译失败")
    };
  }
  return { action: "allow", additionalContext: ctx }; // log 模式静默
}

function handlePending(cfg, sessionId, text, pending, source) {
  // 放弃:给出英文表达并继续
  if (isGiveup(text, cfg.giveupWords)) {
    let english = null;
    try {
      english = translate(cfg, pending.original);
    } catch (_) { /* fail-open */ }
    clearPending(sessionId);
    enqueue(cfg, { original: pending.original, english, mode: "giveup", source });
    if (!english) {
      return { action: "allow", systemMessage: "english-by-default: 翻译失败,已放行原文。" };
    }
    return {
      action: "allow",
      additionalContext:
        "english-by-default: The user originally wrote (in another language):\n" + pending.original +
        "\nEnglish translation:\n" + english +
        "\nFirst show the user this English translation so they can learn it, then respond to the translated request.",
      systemMessage: "🏳 giveup — 英文表达: " + english
    };
  }

  // 重写仍是非英文:继续拦
  if (isNonEnglish(text)) {
    setPending(sessionId, pending.original);
    return {
      action: "block",
      reason:
        "🛡 还是非英文。请用英文重写这句话:\n「" + pending.original + "」\n输入 giveup 可放弃并获得英文表达。"
    };
  }

  // 英文重写:判断语义是否与原文一致
  let verdict;
  try {
    verdict = judgeEquivalence(cfg, pending.original, text);
  } catch (_) {
    // LLM 挂了不挡路
    clearPending(sessionId);
    enqueue(cfg, { original: pending.original, english: text, mode: "unverified", source });
    return { action: "allow", systemMessage: "english-by-default: 判定服务异常,fail-open 放行。" };
  }

  const passed = verdict.equivalent || (verdict.score || 0) >= cfg.judgeThreshold;
  if (passed) {
    clearPending(sessionId);
    enqueue(cfg, { original: pending.original, english: text, mode: "rewrite", source });
    return {
      action: "allow",
      systemMessage: `✅ english-by-default: 语义一致 (score ${verdict.score})。对照已入队。`
    };
  }

  setPending(sessionId, pending.original);
  return {
    action: "block",
    reason:
      `🛡 语义还不一致 (score ${verdict.score})。\n提示: ${verdict.hint || "再想想缺了什么"}\n` +
      "继续用英文重写,或输入 giveup 放弃。"
  };
}

module.exports = { decide };
