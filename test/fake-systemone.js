#!/usr/bin/env node
// 测试桩:按 TypeSafe /v1/systemone 的 wire format(Ollaya docs/api.md §8.1)
// 返回固定的 noul 概率,避免真实决策模型调用。
// 用法: node fake-systemone.js [port]  —— 就绪后在 stdout 打印 "READY <port>"
// 触发器:english_rewrite 含 FAILWORD → 判不一致;model=BROKEN → 返回错误体;
// model=SLOW → 2 秒后才响应(测超时回退)。
const http = require("http");

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (status, obj) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.method !== "POST" || req.url !== "/v1/systemone") return send(404, { error: "not found", code: "NOT_FOUND" });
    let reqJson;
    try {
      reqJson = JSON.parse(body);
    } catch (_) {
      return send(400, { error: "invalid json", code: "INVALID_JSON" });
    }
    const { model, state, questions } = reqJson;
    if (!model || !state || !questions || !questions.equivalent) {
      return send(422, { error: "invalid request", code: "VALIDATION_ERROR" });
    }
    if (model === "BROKEN") return send(500, { error: "boom", code: "INTERNAL" });
    const answer = () => {
      const fail = String(state.english_rewrite || "").includes("FAILWORD");
      send(200, {
        model: model === "laya" ? "laya:multilingual" : model,
        answers: {
          equivalent: { type: "noul", noul: fail ? 0.12 : 0.93 },
          natural: { type: "noul", noul: fail ? 0.3 : 0.81 }
        },
        usage: { input_tokens: 42, output_tokens: 0 }
      });
    };
    if (model === "SLOW") setTimeout(answer, 2000);
    else answer();
  });
});

server.listen(parseInt(process.argv[2], 10) || 0, "127.0.0.1", () => {
  console.log("READY " + server.address().port);
});
