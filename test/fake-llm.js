#!/usr/bin/env node
// 测试桩:按 prompt 特征返回固定结果,避免真实 LLM 调用
const prompt = process.argv[process.argv.length - 1] || "";

if (prompt.includes('"equivalent"')) {
  // judgeEquivalence:包含 FAILWORD 时判不一致
  if (prompt.includes("FAILWORD")) {
    console.log(JSON.stringify({ equivalent: false, score: 40, hint: "缺了关键细节" }));
  } else {
    console.log(JSON.stringify({ equivalent: true, score: 95, hint: "" }));
  }
} else if (prompt.includes("recall exercise")) {
  console.log(JSON.stringify({ score: 88, feedback: "good", better: "" }));
} else if (prompt.includes("Feynman")) {
  console.log(JSON.stringify({ score: 80, gaps: "none", simpler: "say it plainly", question: "why?" }));
} else if (prompt.startsWith("Translate")) {
  console.log("Please refactor this function to be more readable");
} else {
  console.log("ok");
}
