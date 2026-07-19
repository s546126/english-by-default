// LLM 调用:翻译 / 语义一致性判定 / 学习反馈
// 默认走本机 claude CLI,可在 config.llm.command 换成任意兼容 `cmd ... "prompt"` 的工具
const { spawnSync } = require("child_process");

function callLLM(cfg, prompt) {
  const cmd = cfg.llm.command;
  const res = spawnSync(cmd[0], [...cmd.slice(1), prompt], {
    encoding: "utf8",
    timeout: cfg.llm.timeoutMs,
    env: { ...process.env, EBD_INTERNAL: "1" }, // 防止嵌套触发自身 hook
    maxBuffer: 10 * 1024 * 1024
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`llm exited ${res.status}: ${(res.stderr || "").slice(0, 500)}`);
  }
  return (res.stdout || "").trim();
}

// 从输出里抠出第一个 JSON 对象
function extractJSON(text) {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("no JSON in llm output");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("unbalanced JSON in llm output");
}

function translate(cfg, text) {
  const prompt =
    "Translate the following text into natural, concise English suitable as a prompt to an AI coding assistant. " +
    "Output ONLY the English translation, nothing else.\n\n" + text;
  return callLLM(cfg, prompt);
}

// 判断用户的英文重写是否与原文语义一致
function judgeEquivalence(cfg, original, attempt) {
  const prompt =
    "You are a language coach. Compare the MEANING of two texts.\n" +
    "A (original, may be any language):\n" + original + "\n\n" +
    "B (user's English rewrite):\n" + attempt + "\n\n" +
    "Judge whether B expresses the same intent and key details as A. Minor wording differences are fine; " +
    "missing key requirements, wrong scope, or changed intent are not.\n" +
    'Reply with ONLY a JSON object: {"equivalent": true|false, "score": 0-100, ' +
    '"hint": "if not equivalent, a short hint (in the language of A) about what is missing or wrong — do NOT give the full translation"}';
  return extractJSON(callLLM(cfg, prompt));
}

// 抽查/复习打分:用户看原文,凭记忆写英文
function gradeRecall(cfg, original, reference, attempt) {
  const prompt =
    "You are an English tutor grading a recall exercise.\n" +
    "Original text:\n" + original + "\n\n" +
    "Reference English:\n" + reference + "\n\n" +
    "Student's attempt:\n" + attempt + "\n\n" +
    'Reply with ONLY a JSON object: {"score": 0-100, "feedback": "one or two short sentences: what was good, what to fix", ' +
    '"better": "a more natural English version if the attempt was flawed, else empty string"}';
  return extractJSON(callLLM(cfg, prompt));
}

// 费曼学习法:评估"讲给别人听"的解释
function feynmanFeedback(cfg, original, reference, explanation) {
  const prompt =
    "You are a tutor using the Feynman technique. The student is learning to express this idea in English:\n" +
    "Original:\n" + original + "\n" +
    "English version:\n" + reference + "\n\n" +
    "The student explained it in their own simple English, as if teaching a beginner:\n" + explanation + "\n\n" +
    'Reply with ONLY a JSON object: {"score": 0-100, "gaps": "concepts the student glossed over or got wrong", ' +
    '"simpler": "an even simpler way to say it", "question": "one probing follow-up question to test true understanding"}';
  return extractJSON(callLLM(cfg, prompt));
}

module.exports = { callLLM, extractJSON, translate, judgeEquivalence, gradeRecall, feynmanFeedback };
