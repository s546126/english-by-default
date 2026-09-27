// 语义判官:判断用户的英文重写是否与原文等价。
// provider=llm(默认)走 llm.js 的 judgeEquivalence;provider=systemone 走
// TypeSafe /v1/systemone 协议的决策模型 —— Jev 云端,或本机 Ollaya
// (同一套 wire format,换 baseUrl/model 即可)。决策模型只返回概率、不生成
// 文字,所以"缺了什么"的提示在判不一致时另找 llm 生成;决策模型出错或超时
// 一律回退到 llm 判定,行为和没开 systemone 时一致。
const { curlPostJSON, callLLM, extractJSON, judgeEquivalence } = require("./llm");

const DEFAULT_BASE_URL = "https://api.typesafe.ai";
const DEFAULT_MODEL = "jev-latest";

// 问题措辞:instructions 就是决策模型读到的判断标准,尽量对齐 llm 判官的标准
// (意图、范围、关键约束都要一致,语法错误不算)。
const QUESTIONS = {
  equivalent: {
    type: "noul",
    instructions:
      "english_rewrite expresses the same request as original (which may be in another language): " +
      "same intent, same scope, and every key requirement, constraint, number and name in original is kept, " +
      "with nothing important added or reversed. Grammar mistakes in english_rewrite do not matter."
  },
  natural: {
    type: "noul",
    instructions: "english_rewrite reads as natural, idiomatic English that a native speaker would actually write."
  }
};

function resolveJudgeKey(judgeCfg) {
  if (judgeCfg.apiKeyEnv && process.env[judgeCfg.apiKeyEnv]) return process.env[judgeCfg.apiKeyEnv];
  if (judgeCfg.apiKey) return judgeCfg.apiKey;
  return process.env.TYPESAFE_API_KEY || null;
}

// 纯函数,方便单测:从 /v1/systemone 响应里取出 noul 概率
function extractNoul(json, id) {
  const a = json && json.answers && json.answers[id];
  if (!a || typeof a.noul !== "number" || !Number.isFinite(a.noul)) {
    throw new Error(`unexpected systemone response for "${id}": ` + JSON.stringify(json).slice(0, 300));
  }
  return a.noul;
}

function systemoneVerdict(cfg, original, attempt) {
  const j = cfg.judge;
  const baseUrl = (j.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const key = resolveJudgeKey(j);
  // 本机 Ollaya 默认不校验 key;没配 key 时不带 Authorization,远端会 401 → 回退 llm
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  const json = curlPostJSON(
    `${baseUrl}/v1/systemone`,
    headers,
    { model: j.model || DEFAULT_MODEL, state: { original, english_rewrite: attempt }, questions: QUESTIONS },
    j.timeoutMs
  );
  const p = extractNoul(json, "equivalent");
  let natural = null;
  try {
    natural = extractNoul(json, "natural") >= 0.5;
  } catch (_) { /* 地道度缺失不影响主判定 */ }
  return {
    via: "systemone",
    model: json.model || j.model || DEFAULT_MODEL,
    equivalent: p >= j.threshold,
    score: Math.round(p * 100),
    hint: "",
    natural,
    naturalHint: null
  };
}

// 只生成"缺了什么"的提示,不做判定(判定已由决策模型给出)
function hintOnly(cfg, original, attempt) {
  const prompt =
    "You are a language coach. A student tried to rewrite text A in English as B, but B does not mean the same as A.\n" +
    "A (original):\n" + original + "\n\n" +
    "B (student's English rewrite):\n" + attempt + "\n\n" +
    'Reply with ONLY a JSON object: {"hint": "a short hint, in the language of A, about what is missing or wrong in B — do NOT give the full translation"}';
  const v = extractJSON(callLLM(cfg, prompt));
  return typeof v.hint === "string" ? v.hint : "";
}

// 返回形状与 judgeEquivalence 一致:{ equivalent, score, hint, natural, naturalHint },
// systemone 路径额外带 via/model。llm 判定失败时照常抛错,由调用方 fail-open。
function judgeRewrite(cfg, original, attempt) {
  const j = cfg.judge || {};
  if (j.provider !== "systemone") return judgeEquivalence(cfg, original, attempt);

  let verdict;
  try {
    verdict = systemoneVerdict(cfg, original, attempt);
  } catch (_) {
    // 决策模型挂了/超时/没 key:回退 llm 判定,和没开 systemone 时行为一致
    return { ...judgeEquivalence(cfg, original, attempt), via: "llm-fallback" };
  }
  if (!verdict.equivalent && j.hintFromLLM) {
    try {
      verdict.hint = hintOnly(cfg, original, attempt);
    } catch (_) { /* 没有提示就用通用提示,不影响判定 */ }
  }
  return verdict;
}

module.exports = { judgeRewrite, systemoneVerdict, extractNoul, resolveJudgeKey, QUESTIONS, DEFAULT_BASE_URL, DEFAULT_MODEL };
