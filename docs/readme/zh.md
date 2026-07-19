返回 [README.md](../../README.md)

**阅读其他语言版本:**

- [en](en.md) — 英语
- [zh](zh.md) — 中文(当前页面)
- [ja](ja.md) — 日语
- [ko](ko.md) — 韩语
- [ru](ru.md) — 俄语
- [ar](ar.md) — 阿拉伯语
- [es](es.md) — 西班牙语
- [pt](pt.md) — 葡萄牙语
- [fr](fr.md) — 法语
- [de](de.md) — 德语
- [it](it.md) — 意大利语
- [nl](nl.md) — 荷兰语
- [he](he.md) — 希伯来语
- [hi](hi.md) — 印地语
- [th](th.md) — 泰语

# English by Default

一个面向 AI CLI 的"英语关卡"。它会在非英语提示词抵达模型之前将其拦截,强制你用英语重写(或者选择放弃并直接看翻译),并把每一次收集到的原文/英文对,变成间隔重复和费曼技巧的练习素材。

原生支持 Claude Code,也可以通过一个小巧的包装命令,配合任何其他 AI CLI(Codex、Grok……)使用。

## 工作原理

```
You type: "帮我重构这个函数,保持接口不变"
   │
   ├─ block mode  ──→ 🛡 Intercepted. Please rewrite it in English.
   │                   You: "please refactor this function"
   │                   LLM judge: ❌ score 55 — hint: missing "keep the interface unchanged"
   │                   You: "refactor this function but keep the interface unchanged"
   │                   LLM judge: ✅ score 93 — allowed through, pair logged
   │                   (type giveup at any point to get the English phrasing and continue)
   │
   ├─ warn mode  ──→ ⚠️ Warned, auto-translated to English, and logged
   ├─ log mode   ──→ Silently translated and logged
   └─ hits a stopword (e.g. "urgent"/"紧急") ──→ ⚡ block skipped, allowed straight through, still logged
```

每一条被拦截的提示词,都会经过同一套流程:

1. **检测(Detect)** — 判断文本是不是非英语。(`src/detect.js`,具体什么才算"非英语"见下文的[多语言输入](#多语言输入)一节。)
2. **判断(Decide)** — 根据当前模式(`block` / `warn` / `log`),要么拦截并要求你用英语重写,要么翻译后附带提示放行。
3. **评判(Judge)** — 在 `block` 模式下,你写的英语重写版本会由 LLM 与原文比对语义是否等价(不只是判断"这是不是英语",而是判断"意思是否一致")。如果重写丢掉了某个要求或改变了范围,你得到的是一个提示和再试一次的机会,而不是完整译文——目的就是逼你自己把它写出来。
4. **记录(Log)** — 原文/英文对会被追加写入本地 JSONL 队列,供之后复习使用。

设计上采用"失败即放行(fail-open)"策略:如果 LLM 调用失败、超时,或者钩子本身抛出异常,输入都会原样放行。这个工具绝不应该成为你正经工作被卡住的原因。

## 安装

### 推荐方式:Claude Code 插件

本仓库本身就是一个原生的 Claude Code 插件(`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`),所以不需要克隆仓库,也不需要 `npm link`:

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

就这么简单——`UserPromptSubmit` 钩子会自动接好,并以 `block` 模式(默认模式)开始对你的提示词进行拦截。

### 手动安装 / 独立 CLI

如果你想直接使用 `ebd` 命令——`ebd x`、`ebd gate`、`ebd quiz`、`ebd review`、`ebd feynman`、`ebd web` 等等——这些命令完全可以脱离 Claude Code 独立运行,但前面的插件安装方式并不会把 `ebd` 这个可执行文件放进你的 `PATH`,所以这种情况下你仍然需要走这条路径。

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

`ebd uninstall claude-code` 则会撤销这次钩子安装。

### LLM 后端

翻译和评判默认使用本地的 `claude -p --model haiku` CLI。你可以把 `~/.english-by-default/config.json` 里的 `llm.command` 指向任何 CLI,只要它的最后一个参数是提示词、标准输出是回答即可(比如 `codex exec`)。

## 使用方法

```bash
ebd mode block|warn|log     # strength: block | warn | log-and-pass (default: block)
ebd stopwords list|add <w>|rm <w>   # emergency words: matching one skips the block entirely
ebd list [n]                 # show the last n original/English pairs (default 10)
ebd stats                    # queue + review stats

ebd quiz [n]                 # pop quiz: see the original, write the English from memory, LLM scores it (default 5)
ebd review                   # spaced-repetition review: only due entries, pass promotes the interval, fail demotes it
ebd feynman                  # Feynman technique: explain the idea in the simplest English you can, LLM probes for gaps
```

### 其他 CLI(Codex / Grok / 任意工具)

Claude Code 有原生钩子。其他所有工具都通过一个包装命令来运行,它会在调用真正的工具之前,先对非英语参数进行拦截:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x` 只会检查以*命令行参数*形式传给它的文本——它没法看到被包装的工具启动后,你在交互式 REPL/TUI 里输入的任何内容(那部分输入是直接进到子进程的 stdin 的)。每个工具的具体细节参见 [`docs/ADAPTERS.md`](../ADAPTERS.md),包括哪些 CLI 自带原生的、类似 `UserPromptSubmit` 的钩子,可以直接指向 `hooks/claude-code-hook.js`,而不必使用这个包装命令。

## 多语言输入

语言检测有意采用**基于 Unicode 文字范围**的方式,而不是一个通用的语言分类器。当文本中包含两个或以上来自非拉丁 Unicode 范围(CJK、假名、谚文、西里尔字母、希伯来文、阿拉伯文、天城文、泰文)的字符时,`src/detect.js` 就会把它标记为非英语。围栏代码块和行内代码片段中的文字在计数前会被剥离,所以粘贴一段带有非英语注释或字符串的代码片段,并不会触发拦截。

对于确实触发了拦截的文本,`src/detect.js` 里的 `detectLanguage()` 会进一步根据所涉及的 Unicode 文字,判断出这具体*是哪种语言*,`src/i18n.js` 则据此把拦截/警告/提示消息本地化(不管怎样,提示词本身依然会由 LLM 翻译成英语——这里只影响工具自身消息展示所用的语言)。目前支持的语言:

| 代码 | 语言 | 用于检测的文字 |
|---|---|---|
| `zh` | 中文 | CJK 表意文字,且不含假名 |
| `ja` | 日语 | 出现平假名/片假名(用来与 `zh` 区分,因为汉字和中文有重叠) |
| `ko` | 韩语 | 谚文(Hangul) |
| `ru` | 俄语 | 西里尔字母 |
| `he` | 希伯来语 | 希伯来文字 |
| `ar` | 阿拉伯语 | 阿拉伯文字 |
| `hi` | 印地语 | 天城文 |
| `th` | 泰语 | 泰文字母 |

**使用拉丁字母的语言被有意排除在检测和拦截范围之外。** 西班牙语、法语、德语、葡萄牙语、意大利语、荷兰语等语言,用的都是和英语一样的拉丁字母,所以单纯按文字范围检查,没法把它们和英语区分开(也没法和像 "café" 这样带重音符号的英语外来词区分开)。要区分这些语言,需要词表或者统计式的启发式方法,而这在设计上超出了这个函数的范围——这是一个已知且有意为之的限制,不是 bug。这些语言的提示词目前会不受拦截地直接通过。

## Web 仪表盘

```bash
ebd web [port]   # default port 4173
```

启动一个本地的只读仪表盘(纯 Node `http` 实现,没有任何依赖),展示:

- 已记录的原文/英文对总数、平均回忆/复习得分、有多少条目到了复习时间,以及按模式(`rewrite` / `warn` / `log` / `giveup` / `stopword` / ……)划分的统计。
- 从你记录的原文中提取的高频词/短语(拉丁字母文本按单词统计,CJK 类文本按字符二元组统计,因为没有词典就没有天然的分词边界)。
- 最近被"地道性判定"标记为**不**地道(`natural: false`)的表达,以及 LLM 建议的更地道说法。

**安全提示:** 该服务只绑定 `127.0.0.1`,没有任何身份验证机制,只适合在本机查看。不要把它挂在公网端口、隧道,或任何会把它暴露到网络上的反向代理后面——任何能访问到它的人都能读到你完整的提示词历史。

## 详情

- **语义评判** — 在 `block` 模式下,你的英语重写版本会由 LLM 与原文比对语义,而不只是比对语言本身(默认阈值:得分 ≥ 70,可通过 `config.json` 中的 `judgeThreshold` 配置)。语义不匹配只会得到提示,永远不会拿到完整译文,所以你必须自己把它想明白。
- **giveup(放弃)** — 在任何拦截/重写提示中输入 `giveup` 即可退出;你会看到英语译文并被直接放行,这一对原文/英文依然会被记录下来供复习。
- **队列** — 存储在 `~/.english-by-default/queue.jsonl`,每行一个 JSON 对象,默认最多保留最近 1000 条(对应 `config.json` 中的 `queueSize`)。
- **紧急词(Stopwords)** — 通过紧急词匹配放行的条目,不会同步做翻译(这样真正紧急的情况就不会被拖慢);它的英文版本会在你下次复习或测验到这条时才惰性补上。
- **失败即放行(Fail-open)** — 任何 LLM 调用失败、超时,或钩子异常,都会让提示词原样通过。这个工具绝不能成为正当工作被卡住的原因。
- **零依赖**,Node.js >= 18。

## 测试

```bash
npm test
```

会运行零依赖的单元测试套件(`node --test test/unit.test.js`,覆盖 `detect.js`、`queue.js`、`state.js`、`llm.js` 里的 `extractJSON`,以及 `i18n.js`),然后再运行冒烟测试(`test/smoke.sh`),后者会针对一个假的 LLM 桩(`test/fake-llm.js`)端到端地跑通整条钩子流程——不会产生任何真实的 LLM 调用。

## 许可证

MIT
