// LLM 调用:翻译 / 语义一致性判定 / 学习反馈
// provider=cli(默认)走本机 CLI 命令;provider=openai/anthropic 直连对应 API。
// 全部保持同步调用(跟 gate.js/hook 的现有同步执行模型一致),HTTP 请求用
// spawnSync 拉起 curl 完成 —— 不是"不能用 fetch",而是这样才不用把
// callLLM 及其所有调用方(gate.js/review.js/bin/ebd.js)都改成 async,
// 属于一次意外从"翻译工具"膨胀成"全异步重构"的范围蔓延,不值得。
const { spawnSync } = require("child_process");

// key 优先级:apiKeyEnv 指定的环境变量 > apiKey 明文配置 > 对应 provider 的
// 标准环境变量名(跟官方 SDK 默认行为一致,方便已经 export 过的用户零配置直接用)。
function resolveApiKey(cfg) {
  const llm = cfg.llm;
  if (llm.apiKeyEnv && process.env[llm.apiKeyEnv]) return process.env[llm.apiKeyEnv];
  if (llm.apiKey) return llm.apiKey;
  if (llm.provider === "openai" && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (llm.provider === "anthropic" && process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  return null;
}

// body 走 stdin(--data-binary @-)而不是 argv:prompt 可能很长,拼进命令行
// 参数有 ARG_MAX 限制,真实场景下贴一大段代码进去很容易炸。header(含 key)
// 走 argv 是接受的风险 —— 跟 command 模式下 prompt 本身出现在 argv 里是同一
// 威胁模型,这是个本地个人工具,不是要扛企业级密钥托管。
function curlPostJSON(url, headers, bodyObj, timeoutMs) {
  const args = ["-sS", "--max-time", String(Math.ceil(timeoutMs / 1000)), "-X", "POST", url];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  args.push("-H", "Content-Type: application/json", "--data-binary", "@-");
  const res = spawnSync("curl", args, { input: JSON.stringify(bodyObj), encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`curl exited ${res.status}: ${(res.stderr || "").slice(0, 300)}`);
  let json;
  try {
    json = JSON.parse(res.stdout);
  } catch (_) {
    throw new Error("LLM endpoint returned non-JSON: " + res.stdout.slice(0, 300));
  }
  if (json.error) throw new Error("LLM API error: " + JSON.stringify(json.error).slice(0, 300));
  return json;
}

// 纯函数,方便脱离网络单测:从 OpenAI /chat/completions 响应里取文本
function extractOpenAIContent(json) {
  const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (typeof content !== "string") throw new Error("unexpected OpenAI response shape: " + JSON.stringify(json).slice(0, 300));
  return content.trim();
}

// 纯函数,方便脱离网络单测:从 Anthropic /v1/messages 响应里取文本
function extractAnthropicContent(json) {
  const content = json && json.content && json.content[0] && json.content[0].text;
  if (typeof content !== "string") throw new Error("unexpected Anthropic response shape: " + JSON.stringify(json).slice(0, 300));
  return content.trim();
}

function callOpenAI(cfg, prompt) {
  const apiKey = resolveApiKey(cfg);
  if (!apiKey) throw new Error("provider=openai but no API key (set llm.apiKey, llm.apiKeyEnv, or OPENAI_API_KEY)");
  const baseUrl = cfg.llm.baseUrl || "https://api.openai.com/v1";
  const model = cfg.llm.model || "gpt-4o-mini";
  const json = curlPostJSON(
    `${baseUrl}/chat/completions`,
    { Authorization: `Bearer ${apiKey}` },
    { model, messages: [{ role: "user", content: prompt }], temperature: 0 },
    cfg.llm.timeoutMs
  );
  return extractOpenAIContent(json);
}

function callAnthropic(cfg, prompt) {
  const apiKey = resolveApiKey(cfg);
  if (!apiKey) throw new Error("provider=anthropic but no API key (set llm.apiKey, llm.apiKeyEnv, or ANTHROPIC_API_KEY)");
  const baseUrl = cfg.llm.baseUrl || "https://api.anthropic.com";
  const model = cfg.llm.model || "claude-haiku-4-5-20251001";
  const json = curlPostJSON(
    `${baseUrl}/v1/messages`,
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    { model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] },
    cfg.llm.timeoutMs
  );
  return extractAnthropicContent(json);
}

function callLLM(cfg, prompt) {
  const provider = cfg.llm.provider || "cli";
  if (provider === "openai") return callOpenAI(cfg, prompt);
  if (provider === "anthropic") return callAnthropic(cfg, prompt);

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

// 判断一段英文是否地道/自然(母语者会不会真的这么说),给仪表盘的"最近不地道表达"用
function assessNaturalness(cfg, englishText) {
  const prompt =
    "You are a native English speaker and writing coach reviewing prompts written to an AI coding assistant.\n" +
    "Judge whether the following English text reads as natural, idiomatic phrasing a native speaker would " +
    "actually use, as opposed to awkward, overly literal, or non-native-sounding phrasing.\n\n" +
    "Text:\n" + englishText + "\n\n" +
    'Reply with ONLY a JSON object: {"natural": true|false, "score": 0-100, ' +
    '"hint": "if natural=false, a more natural/idiomatic way to phrase the same text, else empty string"}';
  return extractJSON(callLLM(cfg, prompt));
}

// assessNaturalness 的 fail-open 包装:调用方(gate.js / bin/ebd.js)在若干个不同的
// 入队点都要做"英文非空才判断、LLM 挂了就存 natural=null 别挡路"这套样板逻辑,
// 抽到这里统一实现一次,避免每个调用点各自重复 try/catch。
function assessNaturalnessSafe(cfg, englishText) {
  if (!englishText) return { natural: null, naturalHint: null };
  try {
    const v = assessNaturalness(cfg, englishText);
    return {
      natural: v.natural === true ? true : (v.natural === false ? false : null),
      naturalHint: typeof v.hint === "string" ? v.hint : null
    };
  } catch (_) {
    return { natural: null, naturalHint: null };
  }
}

module.exports = {
  callLLM, extractJSON, translate, judgeEquivalence, gradeRecall, feynmanFeedback,
  assessNaturalness, assessNaturalnessSafe,
  resolveApiKey, extractOpenAIContent, extractAnthropicContent
};
