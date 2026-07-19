# 多 CLI 适配指南 (Adapters)

`english-by-default`(`ebd`)本身对 Claude Code 提供原生 `UserPromptSubmit` hook(见仓库根目录 `hooks/claude-code-hook.js` + `hooks/hooks.json`,`ebd install claude-code` 一键写入 `~/.claude/settings.json`)。这篇文档记录**其他 AI CLI** 的接入方式:哪些工具有原生"提交前拦截"钩子可以直接复用同一套判定逻辑,哪些只能靠 `ebd` 自带的命令行包装器。

内容基于一次只读调研(未验证到能实际跑通,标注处请自行实测),涉及外部工具的行为可能随版本变化,接入前请自行核实一遍。

## 速查表

| 工具 | 命令 | 原生"提交前可拦截"钩子 | 建议接入方式 |
|---|---|---|---|
| OpenAI Codex CLI | `codex` | **有** — `UserPromptSubmit` | 原生 hook,复用 `hooks/claude-code-hook.js` |
| xAI 官方 Grok Build | `grok` | 没有(`UserPromptSubmit` 只读审计,不能拦) | `ebd x` 包装器 |
| 社区版 superagent-ai/grok-cli | `grok`(与上面同名,需自行区分) | **有** — `UserPromptSubmit` | 原生 hook,复用 `hooks/claude-code-hook.js` |
| oh-my-pi(即"ohmypi") | `omp` | 没有(只有 `tool_call` 能拦,拦不到用户提交的 prompt) | `ebd x` 包装器 |
| 其它任何 CLI | — | 未知 | 先看有没有 hook 文档;没有就用 `ebd x` / `ebd gate` |

以下所有 `ebd` 命令均取自 `bin/ebd.js` 现有实现,没有虚构的参数。

---

## 1. OpenAI Codex CLI — 原生 hook

Codex 有和 Claude Code 几乎同构的 hooks 引擎,`UserPromptSubmit` 事件在 prompt 发给模型前触发,能真正拦截并把拒绝原因回显给用户。

- 参考:[Hooks | ChatGPT Learn](https://learn.chatgpt.com/docs/hooks)、[Config Reference](https://learn.chatgpt.com/docs/config-file/config-reference)、[openai/codex docs/config.md](https://github.com/openai/codex/blob/main/docs/config.md)
- 拦截约定:命令退出码 `2`,或者 stdout 输出 JSON `{"decision":"block","reason":"..."}`。

`hooks/claude-code-hook.js` 目前的实现是:遇到需要拦截的情况时,**退出码始终是 0**,靠 stdout 打印 `{"decision":"block","reason":...}` 来表达"拦截"(这正是上面两种约定里的第二种,理论上 Codex 也认)。所以直接复用同一个文件大概率可行,但有两处没有验证过,接入前务必实测:

1. **stdin 的 prompt 字段名**。`claude-code-hook.js` 读取的是 `input.prompt`,Codex 的 `UserPromptSubmit` payload 是否也用 `prompt` 这个字段名没有核实过——如果 Codex 用的是别的字段(比如 `text` / `message`),需要在 hook 里做一层兼容读取,或者写个 5 行的适配 wrapper。
2. **`session_id` 的稳定性**。`ebd` 的"block 模式多轮重写"体验(拦截 → 用户用英文重写 → 判定语义一致才放行 → 或输入 `giveup` 放弃)依赖同一个 `session_id` 在同一次对话的连续几次 `UserPromptSubmit` 调用里保持不变(状态存在 `src/state.js` 管理的 pending 表里)。如果 Codex 每次调用传的 `session_id` 不稳定,拦截后的重写就对不上号,体验会退化成"每次都从头拦一遍"。

配置片段(项目级 `.codex/hooks.json`):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/english-by-default/hooks/claude-code-hook.js",
            "statusMessage": "EBD: checking prompt language"
          }
        ]
      }
    ]
  }
}
```

等价的 `~/.codex/config.toml` 写法:

```toml
[[hooks.UserPromptSubmit]]
[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = 'node /path/to/english-by-default/hooks/claude-code-hook.js'
statusMessage = "EBD: checking prompt language"
```

注意:项目级 `.codex/` 目录下的 hook 需要该项目被 Codex 标记为 trusted 才会加载;想全局生效就写到用户级 `~/.codex/config.toml` / `~/.codex/hooks.json`。

---

## 2. "Grok CLI" — 先分清是哪个 `grok`

调研发现两个完全不同的工具都装出一个叫 `grok` 的命令,接入前先跑 `which grok` 确认装的是哪个(Rust 二进制大概率是官方版,npm 包 `grok-dev` 是社区版)。

### 2a. xAI 官方 Grok Build — 没有原生拦截钩子,只能用包装器

2026-07-15 开源于 `github.com/xai-org/grok-build`,安装后二进制叫 `grok`。

- 参考:[docs.x.ai/build/features/hooks](https://docs.x.ai/build/features/hooks)、[x.ai/cli](https://x.ai/cli)
- 事件列表里确实有 `UserPromptSubmit`,但文档原话是:*"PreToolUse [is] the only blocking event"*——`UserPromptSubmit` 的 stdout 会被忽略,只能拿来做审计记录,拦不住东西。
- **结论:老老实实用包装器。**

```bash
# ~/.zshrc 或 ~/.bashrc
grok() { ebd x grok "$@"; }
```

**重要限制**:`ebd x` 只会检查*作为命令行参数传进来*的文本(`bin/ebd.js` 里 `cmdX` 遍历 `argv`,逐个过闸门,再用 `spawnSync(..., { stdio: "inherit" })` 拉起子进程)。Grok Build 是个交互式 TUI,如果你 `grok` 不带参数直接进入对话界面,之后在 TUI 里手打的每一句话,`ebd` 完全看不到、也拦不住——因为那些输入是直接从终端 stdin 流进子进程的,根本没经过 `ebd x` 的参数检查。这个包装器只对"一次性把 prompt 当参数传进去"的用法有效,例如 `grok -p "..."` 这类非交互调用(具体参数名以 Grok Build 自己的 CLI 帮助为准,`ebd` 这边不替你猜)。如果 Grok Build 只有交互式一种用法,那这道闸门基本形同虚设,只能退而求其次,让用户自己养成习惯手动跑 `ebd gate "中文"` 换出英文再贴进 TUI。

### 2b. 社区版 superagent-ai/grok-cli — 有原生拦截钩子

- 仓库:[github.com/superagent-ai/grok-cli](https://github.com/superagent-ai/grok-cli)
- 支持和 Claude Code 同款的 `UserPromptSubmit`:退出码 `0` = 放行,`2` = 拦截,其它 = 非阻断错误。
- 配置文件:`~/.grok/user-settings.json`(注意路径和官方版共用 `~/.grok/` 目录根,装了两个 `grok` 容易互相干扰,确认清楚再改)。

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "node /path/to/english-by-default/hooks/claude-code-hook.js" }
        ]
      }
    ]
  }
}
```

这里同样存在和 Codex 一节里一样的两个未验证点(stdin 里 prompt 字段名是否叫 `prompt`、`session_id` 跨轮次是否稳定),接入前按同样方式实测。

---

## 3. oh-my-pi(即研究里的"ohmypi")— 没有原生拦截钩子,只能用包装器

`can1357/oh-my-pi`,二进制名叫 `omp`,包名 `@oh-my-pi/pi-coding-agent`。

- 参考:[github.com/can1357/oh-my-pi/blob/main/docs/hooks.md](https://github.com/can1357/oh-my-pi/blob/main/docs/hooks.md)、[omp.sh/docs/quickstart](https://omp.sh/docs/quickstart)
- 生命周期事件里没有"提交前可拒绝用户这轮输入"的事件。唯一真正能"拦"的是 `tool_call`(返回 `{ block: true, reason?: string }` 能挡掉某次工具调用),但这和"用户刚打的这句话是不是中文"无关。
- `context` 事件能改写发给模型的消息数组,但只是重写,不能取消这一轮。
- **结论:同 Grok Build,只能用 shell 包装器**,并且有一模一样的限制——`omp` 同样是交互式 TUI,`ebd x` 只能挡住*作为命令行参数*传给 `omp` 的文本,挡不住进入 TUI 之后手打的内容。

```bash
omp() { ebd x omp "$@"; }
```

---

## 4. 通用:任何其它 CLI

不管目标工具有没有钩子文档,`ebd` 都提供两个不依赖对方钩子机制的最小接入点:

### `ebd x <tool> [args...]` — 包装器

逐个检查传给 `ebd x` 的参数,遇到非英文就按当前 `ebd mode`(`block` / `warn` / `log`)处理(交互重写、自动翻译、或静默翻译并记录),处理完再把结果作为参数拉起目标命令:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x some-other-cli --prompt "解释一下这段代码"
```

局限性上一节已经反复说过:这只覆盖"prompt 作为 CLI 参数一次性传入"的用法。如果目标工具是交互式 REPL/TUI(没带参数直接进对话界面),`ebd x` 拉起子进程之后,后续所有键盘输入是直接进子进程 stdin 的,`ebd` 完全介入不了。

### `ebd gate "<text>"` — 非交互单次转换

不拉起任何子进程,单纯把一段文本过一遍闸门:非英文就调用 LLM 翻译成英文、记录中英对照并打印英文版;已经是英文就原样打印。适合接到脚本里,或者在没有参数式调用、又不想手动包一层进程的场景下,自己先转一遍再手动贴到目标工具里:

```bash
ebd gate "帮我写个爬虫"
# 输出: Please help me write a web scraper
```

### Shell alias 示例

对没有原生钩子、且大多数时候是"一次性传参数调用"的工具,最简单的接入方式就是一行 alias/函数,把 `ebd x` 套在原命令外面:

```bash
# ~/.zshrc 或 ~/.bashrc
alias sometool='ebd x sometool'
# 或者需要传更多参数时用函数形式
sometool() { ebd x sometool "$@"; }
```

对纯交互式、拿不到"prompt 作为参数"这个切入点的工具,退而求其次的做法是:不装任何包装器,直接教用户在打字前手动跑一遍 `ebd gate "中文"`,把输出的英文贴进目标工具的对话框。

补充一点,免得看着眼熟:上面这种"函数名和被包装的命令同名"(`grok() { ebd x grok "$@"; }`)不会死循环。`bin/ebd.js` 里 `cmdX` 最终是用 Node 的 `spawnSync(tool, args)` 直接按 `PATH` 找可执行文件拉起子进程,不会经过当前 shell 的 alias/函数解析,所以拉起来的是真正的 `grok` 二进制,不会又绕回这个 shell 函数。

---

## 总结

Codex CLI 和社区版 `superagent-ai/grok-cli` 都有和 Claude Code 同构的 `UserPromptSubmit` 拦截钩子,理论上可以直接复用 `hooks/claude-code-hook.js` 接入原生拦截(但 stdin 的 prompt 字段名和 `session_id` 跨轮次稳定性这两点没有实测验证过,上线前务必自己跑一遍);而 xAI 官方 Grok Build 和 oh-my-pi(`omp`)都没有能在模型看到 prompt 之前拒绝这一轮输入的钩子,只能退回到 `ebd x` 这种 shell 包装器方案,并且这个方案本身只对"prompt 以命令行参数形式一次性传入"的调用方式有效——对纯交互式 TUI 输入完全无能为力,那种场景下用户得自己养成手动跑 `ebd gate` 的习惯。
