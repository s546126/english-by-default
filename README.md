# English by Default

Force yourself to prompt AI tools in English.

给 Claude Code / Codex / Grok 等 AI CLI 加一道"英文闸门":检测到非英文输入时,按配置强度**阻断 / 提示 / 放过并记录**,最终尽量让 LLM 收到英文输入。攒下来的中英对照进入复习队列,支持**随机抽查、艾宾浩斯间隔复习、费曼学习法**——把每天写 prompt 的过程变成英语练习。

## How it works

```
你输入: "帮我重构这个函数,保持接口不变"
   │
   ├─ block 模式 ──→ 🛡 拦截。请用英文重写
   │                  你: "please refactor this function"
   │                  LLM 判定: ❌ score 55 — 提示: 少了"保持接口不变"
   │                  你: "refactor this function but keep the interface unchanged"
   │                  LLM 判定: ✅ score 93 — 放行,对照入队
   │                  (随时输入 giveup: 给出英文表达并自动继续)
   │
   ├─ warn 模式 ──→ ⚠️ 提醒 + 自动翻译成英文喂给 LLM + 记录
   ├─ log 模式  ──→ 静默翻译 + 记录
   └─ 命中紧急词(如 "紧急"/"hotfix") ──→ ⚡ 跳过阻断直接放行,只记录
```

## Install

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link          # 得到全局 ebd 命令
ebd install claude-code   # 写入 ~/.claude/settings.json 的 UserPromptSubmit hook
```

也可以作为 Claude Code plugin 使用(仓库自带 `.claude-plugin/plugin.json` 和 `hooks/hooks.json`)。

翻译/判定默认走本机 `claude -p --model haiku`,可在 `~/.english-by-default/config.json` 里把 `llm.command` 换成任何"最后一个参数是 prompt、stdout 是回答"的 CLI(如 `codex exec`)。

## Usage

```bash
ebd mode block|warn|log   # 强度: 阻断 | 提示 | 放过并记录 (默认 block)
ebd stopwords add 救火    # 紧急词: 命中即跳过阻断
ebd list 20               # 最近 20 条中英对照
ebd stats                 # 队列/复习统计

ebd quiz 5                # 随机抽查: 看原文,凭记忆写英文,LLM 打分
ebd review                # 艾宾浩斯复习: 1/2/4/7/15/30/60 天间隔,过则升档,挂则退档
ebd feynman               # 费曼学习法: 用最简单的英语讲给初学者听,LLM 指出含糊处并追问
```

### Other CLIs (Codex / Grok / anything)

Claude Code 有原生 hook;其他工具用包装器,非英文参数先过同一道闸门:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # 非交互: 输出英文版并记录,适合接到脚本里
```

## Details

- **语义判定**:block 模式下你的英文重写会和原文做 LLM 语义比对(默认阈值 70 分),不一致会给提示但不给完整译文——逼你自己想。
- **giveup**:随时认输,给出英文表达并把翻译版继续发给 LLM,对照照样入队。
- **队列**:`~/.english-by-default/queue.jsonl`,默认保留最近 1000 条(`config.json` 的 `queueSize` 可调)。
- **紧急词放行**的条目不做同步翻译(不耽误救火),复习时懒翻译补齐。
- **Fail-open**:LLM 调用失败、hook 异常一律放行,绝不挡住正常工作。
- 零依赖,Node >= 18。

## Test

```bash
npm test   # 冒烟测试,用 fake-llm 桩走完整链路,不调真实 LLM
```

## License

MIT
