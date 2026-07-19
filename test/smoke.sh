#!/usr/bin/env bash
# 冒烟测试:用 fake-llm 走一遍 阻断 → 重写失败 → giveup / 重写成功 → 入队 的完整链路
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export EBD_HOME="$(mktemp -d)"
trap 'rm -rf "$EBD_HOME"' EXIT

mkdir -p "$EBD_HOME"
cat > "$EBD_HOME/config.json" <<EOF
{ "mode": "block", "llm": { "command": ["node", "$ROOT/test/fake-llm.js"] } }
EOF

hook() {
  printf '%s' "$1" | node "$ROOT/hooks/claude-code-hook.js"
}

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. 非英文 → 阻断
out=$(hook '{"session_id":"s1","prompt":"帮我重构这个函数"}')
echo "$out" | grep -q '"decision":"block"' || fail "非英文应被阻断: $out"

# 2. 英文重写但语义不一致 → 继续阻断
out=$(hook '{"session_id":"s1","prompt":"FAILWORD something else entirely"}')
echo "$out" | grep -q '"decision":"block"' || fail "语义不一致应继续阻断: $out"

# 3. 英文重写语义一致 → 放行 + 入队
out=$(hook '{"session_id":"s1","prompt":"please refactor this function"}')
echo "$out" | grep -q '"decision":"block"' && fail "语义一致应放行: $out"
grep -q '"mode":"rewrite"' "$EBD_HOME/queue.jsonl" || fail "重写成功应入队"

# 4. giveup 流程:阻断后放弃 → 给英文并放行
hook '{"session_id":"s2","prompt":"帮我写一个排序算法"}' > /dev/null
out=$(hook '{"session_id":"s2","prompt":"giveup"}')
echo "$out" | grep -q 'English translation' || fail "giveup 应注入英文翻译: $out"
grep -q '"mode":"giveup"' "$EBD_HOME/queue.jsonl" || fail "giveup 应入队"

# 5. 紧急词 → 跳过阻断
out=$(hook '{"session_id":"s3","prompt":"紧急:线上挂了快看看"}')
echo "$out" | grep -q '"decision":"block"' && fail "紧急词应放行: $out"
grep -q '"skipped":true' "$EBD_HOME/queue.jsonl" || fail "紧急放行应记录"

# 6. 纯英文 → 直接放行且不记录
before=$(wc -l < "$EBD_HOME/queue.jsonl")
hook '{"session_id":"s4","prompt":"just a normal english prompt"}' > /dev/null
after=$(wc -l < "$EBD_HOME/queue.jsonl")
[ "$before" = "$after" ] || fail "纯英文不应入队"

# 7. warn 模式 → 放行 + 注入英文上下文
cat > "$EBD_HOME/config.json" <<EOF
{ "mode": "warn", "llm": { "command": ["node", "$ROOT/test/fake-llm.js"] } }
EOF
out=$(hook '{"session_id":"s5","prompt":"帮我写个爬虫"}')
echo "$out" | grep -q 'additionalContext' || fail "warn 模式应注入英文上下文: $out"

echo "ALL SMOKE TESTS PASSED"
