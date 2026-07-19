#!/usr/bin/env node
// Claude Code UserPromptSubmit hook 入口
// stdin: {session_id, prompt, ...} → stdout: hook JSON 决策
const { loadConfig } = require("../src/config");
const { decide } = require("../src/gate");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

(async () => {
  let input = {};
  try {
    input = JSON.parse(await readStdin());
  } catch (_) {
    process.exit(0); // 解析失败不挡路
  }

  let result;
  try {
    const cfg = loadConfig();
    result = decide(cfg, input.session_id || "default", input.prompt || "", "claude-code");
  } catch (e) {
    // 任何异常都 fail-open,绝不阻塞用户正常使用
    process.exit(0);
  }

  if (result.action === "block") {
    console.log(JSON.stringify({ decision: "block", reason: result.reason }));
    process.exit(0);
  }

  const out = {};
  if (result.additionalContext) {
    out.hookSpecificOutput = {
      hookEventName: "UserPromptSubmit",
      additionalContext: result.additionalContext
    };
  }
  if (result.systemMessage) out.systemMessage = result.systemMessage;
  if (Object.keys(out).length) console.log(JSON.stringify(out));
  process.exit(0);
})();
