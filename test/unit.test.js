#!/usr/bin/env node
// 单元测试:覆盖 detect / queue / state / llm(extractJSON) / i18n 的核心逻辑。
// 零依赖,只用 node:test + node:assert。
// 运行: node --test test/unit.test.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

// src/config.js 在 require 时就读 EBD_HOME 决定数据目录(HOME 常量),必须在
// 任何 src 模块被 require 之前设好这个环境变量,否则会一不小心读到/写到
// 真实的 ~/.english-by-default。
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ebd-unit-test-"));
process.env.EBD_HOME = TMP_HOME;

const test = require("node:test");
const assert = require("node:assert/strict");

const detect = require("../src/detect");
const queue = require("../src/queue");
const state = require("../src/state");
const llm = require("../src/llm");
const i18n = require("../src/i18n");
const { HOME } = require("../src/config");

const DAY_MS = 24 * 60 * 60 * 1000;

test("EBD_HOME 接线检查:config.js 读到的 HOME 确实是测试用的临时目录", () => {
  assert.equal(HOME, TMP_HOME);
});

// ---------------------------------------------------------------------------
// src/detect.js
// ---------------------------------------------------------------------------

test("detect.isNonEnglish: 各类非拉丁文字脚本都能命中", () => {
  assert.equal(detect.isNonEnglish("帮我重构这个函数"), true); // CJK 汉字
  assert.equal(detect.isNonEnglish("한국어로 부탁해요"), true); // 谚文
  assert.equal(detect.isNonEnglish("Привет, помоги мне"), true); // 西里尔
  assert.equal(detect.isNonEnglish("مرحبا ساعدني من فضلك"), true); // 阿拉伯
});

test("detect.isNonEnglish: 纯英文不命中", () => {
  assert.equal(detect.isNonEnglish("please refactor this function"), false);
  assert.equal(detect.isNonEnglish(""), false);
  assert.equal(detect.isNonEnglish(null), false);
});

test("detect.isNonEnglish: 带重音符号的欧洲语言文本不应被当成非英文(重音字母是拉丁字母,不在 NON_LATIN_RANGES 里)", () => {
  assert.equal(detect.isNonEnglish("café résumé"), false);
  assert.equal(detect.isNonEnglish("This café's menu has a nice résumé of dishes"), false);
});

test("detect.isNonEnglish: 围栏代码块/行内代码里的非英文不计入判定", () => {
  assert.equal(detect.isNonEnglish("please explain this:\n```\n// 中文注释\nconst x = 1;\n```"), false);
  assert.equal(detect.isNonEnglish("run `echo 你好` and tell me the output"), false);
  // 但围栏之外的中文正文依然要判定为非英文
  assert.equal(detect.isNonEnglish("解释一下这段代码:\n```\nconst x = 1;\n```"), true);
});

test("detect.detectLanguage: 各脚本区间语言判定", () => {
  assert.equal(detect.detectLanguage("帮我重构这个函数"), "zh");
  assert.equal(detect.detectLanguage("こんにちは、手伝ってください"), "ja"); // 含假名 -> 优先判定为 ja
  assert.equal(detect.detectLanguage("한국어로 부탁해요"), "ko");
  assert.equal(detect.detectLanguage("Привет, помоги мне"), "ru");
  assert.equal(detect.detectLanguage("مرحبا ساعدني"), "ar");
  assert.equal(detect.detectLanguage("שלום, תעזור לי"), "he");
  assert.equal(detect.detectLanguage("मुझे मदद चाहिए"), "hi");
  assert.equal(detect.detectLanguage("ช่วยฉันหน่อย"), "th");
});

test("detect.detectLanguage: 拉丁字母语系(含重音符号的欧洲语言)刻意返回 null,这是文档化的已知局限,不是 bug", () => {
  assert.equal(detect.detectLanguage("café résumé"), null);
  assert.equal(detect.detectLanguage("s'il vous plaît"), null);
  assert.equal(detect.detectLanguage("please refactor this function"), null);
  assert.equal(detect.detectLanguage(""), null);
  assert.equal(detect.detectLanguage(null), null);
});

test("detect.hasStopword: 大小写不敏感(词表和文本任一边大小写都不影响匹配)", () => {
  const stopwords = ["urgent", "紧急"];
  assert.equal(detect.hasStopword("This is URGENT, please help", stopwords), true);
  assert.equal(detect.hasStopword("Urgent!!", stopwords), true);
  assert.equal(detect.hasStopword("紧急情况", stopwords), true);
  assert.equal(detect.hasStopword("nothing special here", stopwords), false);

  const mixedCaseStopwords = ["URGENT"];
  assert.equal(detect.hasStopword("this is urgent", mixedCaseStopwords), true);
});

test("detect.isGiveup: 要求整句精确匹配(忽略首尾空白和大小写),不是包含匹配", () => {
  const giveupWords = ["giveup", "give up", "放弃"];
  assert.equal(detect.isGiveup("giveup", giveupWords), true);
  assert.equal(detect.isGiveup("  GiveUp  ", giveupWords), true);
  assert.equal(detect.isGiveup("give up", giveupWords), true);
  assert.equal(detect.isGiveup("放弃", giveupWords), true);
  assert.equal(detect.isGiveup("I giveup on this", giveupWords), false);
});

// ---------------------------------------------------------------------------
// src/queue.js
// ---------------------------------------------------------------------------

test("queue.enqueue: 超过 queueSize 会裁掉最旧的,只保留最近的 N 条", () => {
  queue.saveQueue([]); // 保证从空队列开始,不受其他用例顺序影响
  const cfg = { queueSize: 3 };
  for (let i = 0; i < 5; i++) {
    queue.enqueue(cfg, { original: `item-${i}`, english: `english-${i}`, mode: "rewrite" });
  }
  const entries = queue.loadQueue();
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map((e) => e.original), ["item-2", "item-3", "item-4"]);
});

test("queue.enqueue: natural/naturalHint 字段round-trip(含未传时落到 null,而不是 undefined/false)", () => {
  queue.saveQueue([]);
  const cfg = { queueSize: 10 };
  queue.enqueue(cfg, { original: "a", english: "a-en", mode: "rewrite", natural: true, naturalHint: "sounds native" });
  queue.enqueue(cfg, { original: "b", english: "b-en", mode: "rewrite", natural: false, naturalHint: "a bit awkward" });
  queue.enqueue(cfg, { original: "c", english: "c-en", mode: "rewrite" }); // 不传 natural/naturalHint

  const entries = queue.loadQueue();
  assert.equal(entries[0].natural, true);
  assert.equal(entries[0].naturalHint, "sounds native");
  assert.equal(entries[1].natural, false);
  assert.equal(entries[1].naturalHint, "a bit awkward");
  assert.equal(entries[2].natural, null);
  assert.equal(entries[2].naturalHint, null);
});

test("queue.scheduleAfterReview: 通过 -> reviews+1,间隔按 INTERVALS 升档,并在数组末尾封顶", () => {
  const r1 = queue.scheduleAfterReview({ reviews: 0 }, true);
  assert.equal(r1.reviews, 1);
  let deltaDays = (r1.nextReview - Date.now()) / DAY_MS;
  assert.ok(Math.abs(deltaDays - queue.INTERVALS[1]) < 0.01); // INTERVALS[min(1,6)] = 2 天

  // reviews 故意超出 INTERVALS 数组长度,间隔应该封顶在最后一档(60 天),不会数组越界
  const rTop = queue.scheduleAfterReview({ reviews: queue.INTERVALS.length + 5 }, true);
  assert.equal(rTop.reviews, queue.INTERVALS.length + 6);
  deltaDays = (rTop.nextReview - Date.now()) / DAY_MS;
  assert.ok(Math.abs(deltaDays - queue.INTERVALS[queue.INTERVALS.length - 1]) < 0.01);
});

test("queue.scheduleAfterReview: 失败 -> reviews-1(不低于 0),固定明天再来", () => {
  const r = queue.scheduleAfterReview({ reviews: 2 }, false);
  assert.equal(r.reviews, 1);
  const deltaDays = (r.nextReview - Date.now()) / DAY_MS;
  assert.ok(Math.abs(deltaDays - 1) < 0.01);

  const rFloor = queue.scheduleAfterReview({ reviews: 0 }, false);
  assert.equal(rFloor.reviews, 0); // 不能降到负数
});

test("queue.dueEntries: 只返回 nextReview 已经到期(<= now)的条目", () => {
  queue.saveQueue([
    { id: "past", nextReview: Date.now() - 1000, original: "past" },
    { id: "future", nextReview: Date.now() + 60 * 60 * 1000, original: "future" }
  ]);
  const due = queue.dueEntries();
  assert.deepEqual(due.map((e) => e.id), ["past"]);
});

// ---------------------------------------------------------------------------
// src/state.js
// ---------------------------------------------------------------------------

test("state: setPending/getPending/clearPending 基本往返", () => {
  state.clearPending("sess-1");
  state.setPending("sess-1", "原文内容", "zh");
  const p = state.getPending("sess-1");
  assert.equal(p.original, "原文内容");
  assert.equal(p.lang, "zh");
  assert.equal(p.attempts, 0);
  state.clearPending("sess-1");
  assert.equal(state.getPending("sess-1"), null);
});

test("state.getPending: 超过 TTL(30 分钟)的记录视为过期,返回 null 且从磁盘清除", () => {
  const statePath = path.join(HOME, "pending.json");
  const oldTs = Date.now() - 31 * 60 * 1000; // 31 分钟前,超过 30 分钟 TTL
  fs.writeFileSync(statePath, JSON.stringify({ "sess-old": { original: "x", lang: null, ts: oldTs, attempts: 0 } }));
  assert.equal(state.getPending("sess-old"), null);
  const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.equal(raw["sess-old"], undefined); // 不是只在内存里判断过期,磁盘上也真的删掉了
});

test("state.setPending: 不传 lang 时沿用上一次缓存的 lang,而不是重置成 null", () => {
  state.clearPending("sess-2");
  state.setPending("sess-2", "第一次", "ja");
  state.setPending("sess-2", "第二次"); // 第三个参数不传
  const p = state.getPending("sess-2");
  assert.equal(p.lang, "ja");
  assert.equal(p.attempts, 1);
  state.clearPending("sess-2");
});

// ---------------------------------------------------------------------------
// src/llm.js — extractJSON
// ---------------------------------------------------------------------------

test("llm.extractJSON: 纯 JSON 文本", () => {
  const v = llm.extractJSON('{"equivalent": true, "score": 95}');
  assert.deepEqual(v, { equivalent: true, score: 95 });
});

test("llm.extractJSON: markdown 围栏包裹的 JSON", () => {
  const text = 'Sure, here is the result:\n```json\n{"score": 80, "feedback": "good"}\n```\nHope this helps.';
  const v = llm.extractJSON(text);
  assert.deepEqual(v, { score: 80, feedback: "good" });
});

test("llm.extractJSON: 嵌套花括号", () => {
  const text = '{"outer": {"inner": {"deep": 1}}, "score": 5}';
  const v = llm.extractJSON(text);
  assert.deepEqual(v, { outer: { inner: { deep: 1 } }, score: 5 });
});

test("llm.extractJSON: 没有花括号的纯垃圾文本应该抛错", () => {
  assert.throws(() => llm.extractJSON("no json here at all, sorry"), /no JSON in llm output/);
});

test("llm.extractJSON: 花括号不闭合应该抛错", () => {
  assert.throws(() => llm.extractJSON('{"score": 5, "note": "unterminated'), /unbalanced JSON in llm output/);
});

// ---------------------------------------------------------------------------
// src/llm.js — provider=openai/anthropic 的 key 解析与响应解析(纯函数,不碰网络)
// ---------------------------------------------------------------------------

test("llm.resolveApiKey: apiKeyEnv 优先级最高,其次 apiKey 明文,最后 provider 对应的标准环境变量", () => {
  const savedOpenAI = process.env.OPENAI_API_KEY;
  const savedCustom = process.env.MY_CUSTOM_KEY;
  try {
    process.env.MY_CUSTOM_KEY = "from-env-var";
    process.env.OPENAI_API_KEY = "from-standard-env";

    // apiKeyEnv 指向的变量存在时优先于 apiKey 明文
    assert.equal(
      llm.resolveApiKey({ llm: { provider: "openai", apiKeyEnv: "MY_CUSTOM_KEY", apiKey: "plaintext-key" } }),
      "from-env-var"
    );
    // 没有 apiKeyEnv(或它指向的变量不存在)时落到 apiKey 明文
    assert.equal(
      llm.resolveApiKey({ llm: { provider: "openai", apiKeyEnv: null, apiKey: "plaintext-key" } }),
      "plaintext-key"
    );
    assert.equal(
      llm.resolveApiKey({ llm: { provider: "openai", apiKeyEnv: "NOT_SET_AT_ALL", apiKey: "plaintext-key" } }),
      "plaintext-key"
    );
    // 两个都没配时,openai/anthropic 分别回退到各自的标准环境变量名
    assert.equal(
      llm.resolveApiKey({ llm: { provider: "openai", apiKeyEnv: null, apiKey: null } }),
      "from-standard-env"
    );
    // provider 不匹配就不会去读别的 provider 的标准环境变量
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "anthropic-standard";
    assert.equal(
      llm.resolveApiKey({ llm: { provider: "openai", apiKeyEnv: null, apiKey: null } }),
      null
    );
    assert.equal(
      llm.resolveApiKey({ llm: { provider: "anthropic", apiKeyEnv: null, apiKey: null } }),
      "anthropic-standard"
    );
    delete process.env.ANTHROPIC_API_KEY;
  } finally {
    if (savedOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedOpenAI;
    if (savedCustom === undefined) delete process.env.MY_CUSTOM_KEY; else process.env.MY_CUSTOM_KEY = savedCustom;
  }
});

test("llm.extractOpenAIContent: 从 chat/completions 响应里取出 message.content 并去首尾空白", () => {
  const json = { choices: [{ message: { content: "  refactor this function  " } }] };
  assert.equal(llm.extractOpenAIContent(json), "refactor this function");
});

test("llm.extractOpenAIContent: 形状不对(比如空 choices)应该抛错而不是返回 undefined/崩溃在别处", () => {
  assert.throws(() => llm.extractOpenAIContent({ choices: [] }), /unexpected OpenAI response shape/);
  assert.throws(() => llm.extractOpenAIContent({}), /unexpected OpenAI response shape/);
});

test("llm.extractAnthropicContent: 从 messages 响应里取出 content[0].text 并去首尾空白", () => {
  const json = { content: [{ type: "text", text: "  refactor this function  " }] };
  assert.equal(llm.extractAnthropicContent(json), "refactor this function");
});

test("llm.extractAnthropicContent: 形状不对应该抛错", () => {
  assert.throws(() => llm.extractAnthropicContent({ content: [] }), /unexpected Anthropic response shape/);
  assert.throws(() => llm.extractAnthropicContent({}), /unexpected Anthropic response shape/);
});

// ---------------------------------------------------------------------------
// src/i18n.js
// ---------------------------------------------------------------------------

test("i18n.t: 未知/空语言回退到 en", () => {
  assert.equal(i18n.t("xx-not-a-real-lang", "blockHeader"), i18n.MESSAGES.en.blockHeader);
  assert.equal(i18n.t(null, "blockHeader"), i18n.MESSAGES.en.blockHeader);
  assert.equal(i18n.t(undefined, "blockHeader"), i18n.MESSAGES.en.blockHeader);
});

test("i18n.t: 支持 {var} 占位符替换", () => {
  const msg = i18n.t("en", "matchOk", { score: 93 });
  assert.equal(msg, "✅ english-by-default: Meaning matches (score 93). Pair logged to queue.");
});

test("i18n.t: 所有文档化语言(detectLanguage 可能返回的 8 种 + en 兜底)的每个 key 都能取到字符串,不抛异常", () => {
  const langs = Object.keys(i18n.MESSAGES);
  assert.deepEqual(langs.sort(), ["ar", "en", "he", "hi", "ja", "ko", "ru", "th", "zh"].sort());
  const keys = Object.keys(i18n.MESSAGES.en);
  const vars = { score: 1, hint: "h", original: "o", english: "e" };
  for (const lang of langs) {
    for (const key of keys) {
      let v;
      assert.doesNotThrow(() => { v = i18n.t(lang, key, vars); });
      assert.equal(typeof v, "string");
    }
  }
});
