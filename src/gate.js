// 核心闸门:hook 和 CLI 包装器共用的决策逻辑
const { isNonEnglish, hasStopword, isGiveup, detectLanguage } = require("./detect");
const { translate, judgeEquivalence, assessNaturalnessSafe } = require("./llm");
const { enqueue } = require("./queue");
const { getPending, setPending, clearPending } = require("./state");
const { t } = require("./i18n");

// 返回 { action: "allow"|"block", reason?, additionalContext?, systemMessage? }
function decide(cfg, sessionId, prompt, source) {
  if (process.env.EBD_INTERNAL) return { action: "allow" };
  const text = (prompt || "").trim();
  if (!text) return { action: "allow" };

  // 先查 pending 再判断 '/'/'!' 快速放行:否则一句正在回复阻断的英文重写
  // 只要碰巧以 '/' 或 '!' 开头(比如提到路径 "/usr/local ..."),就会绕过
  // isGiveup/isNonEnglish/judgeEquivalence,而且这个会话的 pending 记录
  // 还留在磁盘上没清掉,会在下一条无关的新 prompt 上诡异地重新拦截。
  const pending = getPending(sessionId);

  if (pending) {
    return handlePending(cfg, sessionId, text, pending, source);
  }

  if (text.startsWith("/") || text.startsWith("!")) return { action: "allow" };

  if (!isNonEnglish(text)) return { action: "allow" };

  // 只对原始非英文文本判定一次语言,后续 pending 相关分支复用缓存的结果,
  // 不用每个 hook 进程(新 session 重入)都重新跑一遍脚本区间扫描。
  const lang = detectLanguage(text);

  // 紧急词:跳过阻断,直接放行并记录
  if (hasStopword(text, cfg.stopwords)) {
    enqueue(cfg, { original: text, english: null, mode: "stopword", skipped: true, source });
    return {
      action: "allow",
      systemMessage: t(lang, "stopwordBypass")
    };
  }

  if (cfg.mode === "block") {
    setPending(sessionId, text, lang);
    return {
      action: "block",
      reason: t(lang, "blockHeader") + "\n" + t(lang, "rewritePrompt") + "\n" + t(lang, "giveupHint")
    };
  }

  // warn / log:翻译后放行,英文版作为上下文喂给 LLM
  let english = null;
  try {
    english = translate(cfg, text);
  } catch (_) { /* 翻译失败不挡路 */ }
  enqueue(cfg, { original: text, english, mode: cfg.mode, source, ...assessNaturalnessSafe(cfg, english) });

  const ctx = english
    ? "english-by-default: The user's message translated to English:\n" + english +
      "\nPlease treat this English version as the user's request."
    : null;

  if (cfg.mode === "warn") {
    return {
      action: "allow",
      additionalContext: ctx,
      systemMessage: t(lang, "warnPrefix", { english: english || t(lang, "translationFailedShort") })
    };
  }
  return { action: "allow", additionalContext: ctx }; // log 模式静默
}

function handlePending(cfg, sessionId, text, pending, source) {
  // pending.lang 是原文第一次被拦截时缓存的语言判定结果(见 decide()),
  // 这里各分支都复用它,不重新跑 detectLanguage。
  const lang = pending.lang || null;

  // 放弃:给出英文表达并继续
  if (isGiveup(text, cfg.giveupWords)) {
    let english = null;
    try {
      english = translate(cfg, pending.original);
    } catch (_) { /* fail-open */ }
    clearPending(sessionId);
    enqueue(cfg, { original: pending.original, english, mode: "giveup", source, ...assessNaturalnessSafe(cfg, english) });
    if (!english) {
      return { action: "allow", systemMessage: t(lang, "giveupTranslateFailed") };
    }
    return {
      action: "allow",
      additionalContext:
        "english-by-default: The user originally wrote (in another language):\n" + pending.original +
        "\nEnglish translation:\n" + english +
        "\nFirst show the user this English translation so they can learn it, then respond to the translated request.",
      systemMessage: t(lang, "giveupResult", { english })
    };
  }

  // 重写仍是非英文:继续拦
  if (isNonEnglish(text)) {
    setPending(sessionId, pending.original, lang);
    return {
      action: "block",
      reason: t(lang, "stillNonEnglish", { original: pending.original }) + "\n" + t(lang, "giveupHint")
    };
  }

  // 英文重写:判断语义是否与原文一致
  let verdict;
  try {
    verdict = judgeEquivalence(cfg, pending.original, text);
  } catch (_) {
    // LLM 挂了不挡路
    clearPending(sessionId);
    enqueue(cfg, { original: pending.original, english: text, mode: "unverified", source, ...assessNaturalnessSafe(cfg, text) });
    return { action: "allow", systemMessage: t(lang, "judgeServiceDown") };
  }

  // verdict 来自 LLM 输出的裸 JSON.parse,没有 schema 校验:如果 equivalent
  // 被判定模型序列化成字符串 "false" 而不是布尔值 false,JS 里非空字符串是
  // truthy,用 || 直接短路会把 passed 误判成通过。这里严格要求 === true。
  const passed = verdict.equivalent === true || (Number(verdict.score) || 0) >= cfg.judgeThreshold;
  if (passed) {
    clearPending(sessionId);
    enqueue(cfg, { original: pending.original, english: text, mode: "rewrite", source, ...assessNaturalnessSafe(cfg, text) });
    return {
      action: "allow",
      systemMessage: t(lang, "matchOk", { score: verdict.score })
    };
  }

  setPending(sessionId, pending.original, lang);
  return {
    action: "block",
    reason: t(lang, "mismatchPrefix", { score: verdict.score, hint: verdict.hint || t(lang, "hintFallback") })
  };
}

module.exports = { decide };
