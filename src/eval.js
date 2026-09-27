// 判官评测:拿一份人工标注的「原文 / 英文重写 / 是否等价」用例集,
// 逐条跑语义判定,统计准确率、误放行、误拦截和延迟。
// 用数据决定换不换判官,而不是凭感觉。
const fs = require("fs");
const path = require("path");
const { judgeEquivalence } = require("./llm");
const { systemoneVerdict } = require("./judge");
const { judgePassed } = require("./gate");

const DEFAULT_CASES = path.join(__dirname, "..", "test", "eval", "cases.json");

// 可插拔判官:每个都是 (cfg, original, attempt) => verdict({equivalent, score, ...})。
// 以后接新的判定后端,在这里注册一个名字即可,评测流程不用动。
// systemone 这里直接测决策模型本身:不回退 llm、不额外生成提示,
// 出错就记为出错,否则回退会把决策模型的失败掩盖成 llm 的成绩。
const JUDGES = {
  llm: judgeEquivalence,
  systemone: systemoneVerdict
};

function loadCases(file) {
  const cases = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(cases)) throw new Error("cases file must be a JSON array: " + file);
  for (const c of cases) {
    if (!c.id || !c.original || !c.rewrite || typeof c.equivalent !== "boolean") {
      throw new Error("invalid case: " + JSON.stringify(c).slice(0, 200));
    }
  }
  return cases;
}

// nearest-rank 百分位
function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

// 纯函数,方便单测:results 每项 { id, expected, passed|null, ms, error? }
// passed=null 表示判官出错,不计入准确率,单独计数。
function summarize(results) {
  const judged = results.filter((r) => r.passed !== null);
  const correct = judged.filter((r) => r.passed === r.expected).length;
  // 误放行:本不等价却放行了 —— 对这个工具来说比误拦截更伤(用户没真正学会)
  const falsePass = judged.filter((r) => !r.expected && r.passed);
  const falseBlock = judged.filter((r) => r.expected && !r.passed);
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  return {
    total: results.length,
    judged: judged.length,
    errors: results.length - judged.length,
    accuracy: judged.length ? correct / judged.length : null,
    falsePass: falsePass.map((r) => r.id),
    falseBlock: falseBlock.map((r) => r.id),
    p50Ms: percentile(ms, 50),
    p95Ms: percentile(ms, 95)
  };
}

function runJudge(cfg, judgeName, cases, onProgress) {
  const judge = JUDGES[judgeName];
  if (!judge) throw new Error(`unknown judge "${judgeName}", available: ${Object.keys(JUDGES).join(", ")}`);
  const results = [];
  for (const c of cases) {
    const start = process.hrtime.bigint();
    let passed = null;
    let score = null;
    let error = null;
    try {
      const v = judge(cfg, c.original, c.rewrite);
      passed = judgePassed(cfg, v);
      score = v.score;
    } catch (e) {
      error = e.message;
    }
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const r = { id: c.id, expected: c.equivalent, passed, score, ms, error };
    results.push(r);
    if (onProgress) onProgress(r, results.length, cases.length);
  }
  return results;
}

function fmtPct(x) {
  return x === null ? "-" : (x * 100).toFixed(1) + "%";
}

function fmtMs(x) {
  return x === null ? "-" : Math.round(x) + " ms";
}

function parseArgs(argv) {
  const opts = { cases: DEFAULT_CASES, judges: ["llm"], limit: 0, lang: null, json: false, model: null, baseUrl: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cases") opts.cases = argv[++i];
    else if (a === "--model") opts.model = argv[++i];       // 只对 systemone 判官生效,不写回配置
    else if (a === "--base-url") opts.baseUrl = argv[++i];
    else if (a === "--judge") opts.judges = String(argv[++i] || "").split(",").filter(Boolean);
    else if (a === "--limit") opts.limit = parseInt(argv[++i], 10) || 0;
    else if (a === "--lang") opts.lang = argv[++i];
    else if (a === "--json") opts.json = true;
    else throw new Error("unknown option: " + a);
  }
  return opts;
}

// ebd eval [--cases file] [--judge llm[,systemone]] [--model M] [--base-url URL] [--lang zh] [--limit n] [--json]
function run(cfg, argv) {
  const opts = parseArgs(argv);
  if (opts.model || opts.baseUrl) {
    cfg = { ...cfg, judge: { ...cfg.judge, ...(opts.model && { model: opts.model }), ...(opts.baseUrl && { baseUrl: opts.baseUrl }) } };
  }
  let cases = loadCases(opts.cases);
  if (opts.lang) cases = cases.filter((c) => c.lang === opts.lang);
  if (opts.limit > 0) cases = cases.slice(0, opts.limit);
  if (!cases.length) return console.log("没有可评测的用例。");

  const report = {};
  for (const name of opts.judges) {
    const results = runJudge(cfg, name, cases, opts.json ? null : (r, i, n) => {
      const mark = r.passed === null ? "💥" : r.passed === r.expected ? "✓" : "✗";
      process.stderr.write(`\r[${name}] ${i}/${n} ${mark} ${r.id}          `);
    });
    if (!opts.json) process.stderr.write("\n");
    report[name] = { summary: summarize(results), results };
  }

  if (opts.json) return console.log(JSON.stringify(report, null, 2));

  console.log(`\n用例: ${cases.length} 条 (${opts.cases})  阈值: ${cfg.judgeThreshold}`);
  console.log("判官        准确率    误放行  误拦截  出错   P50       P95");
  for (const [name, { summary: s }] of Object.entries(report)) {
    console.log(
      `${name.padEnd(10)}  ${fmtPct(s.accuracy).padEnd(8)}  ${String(s.falsePass.length).padEnd(6)}  ` +
      `${String(s.falseBlock.length).padEnd(6)}  ${String(s.errors).padEnd(4)}  ${fmtMs(s.p50Ms).padEnd(8)}  ${fmtMs(s.p95Ms)}`
    );
    if (s.falsePass.length) console.log(`  误放行: ${s.falsePass.join(", ")}`);
    if (s.falseBlock.length) console.log(`  误拦截: ${s.falseBlock.join(", ")}`);
  }
}

module.exports = { run, runJudge, summarize, loadCases, percentile, JUDGES, DEFAULT_CASES };
