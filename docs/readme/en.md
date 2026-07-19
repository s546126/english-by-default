# English by Default

An "English gate" for AI CLIs. It intercepts non-English prompts before they reach the model, makes you rewrite them in English (or gives up and shows you the translation), and turns every pair it collects into spaced-repetition and Feynman-technique practice.

Works natively with Claude Code, and with any other AI CLI (Codex, Grok, ...) through a small wrapper command.

## How it works

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

Every intercepted prompt goes through the same pipeline:

1. **Detect** — is the text non-English? (`src/detect.js`, see [Multi-language input](#multi-language-input) below for exactly what counts as "non-English".)
2. **Decide** — based on the current mode (`block` / `warn` / `log`), either block and ask for an English rewrite, or translate and let it through with a note.
3. **Judge** — in `block` mode, your English rewrite is compared against the original by an LLM for semantic equivalence (not just "is this English", but "does it mean the same thing"). A rewrite that drops a requirement or changes scope gets a hint and another chance, not the full translation — the point is to make you produce it yourself.
4. **Log** — the original/English pair is appended to a local JSONL queue for later review.

Fail-open by design: if the LLM call fails, times out, or the hook itself throws, the input is allowed through unmodified. This tool should never be the reason your real work gets blocked.

## Install

### Recommended: Claude Code plugin

The repository ships as a native Claude Code plugin (`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`), so no cloning or `npm link` is required:

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

That's it — the `UserPromptSubmit` hook is wired up automatically and starts gating your prompts in `block` mode (the default).

### Manual / standalone CLI

You still need this path if you want to use the `ebd` command directly — `ebd x`, `ebd gate`, `ebd quiz`, `ebd review`, `ebd feynman`, `ebd web`, etc. work outside of Claude Code entirely, and the plugin install above does not put an `ebd` binary on your `PATH`.

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

`ebd uninstall claude-code` reverses the hook installation.

### LLM backend

Translation, judging, and naturalness scoring all go through one of three providers, set in `~/.english-by-default/config.json` (or with `ebd provider`, see below):

- **`cli`** (default) — shells out to a local command. `llm.command` is an array where the last argument is the prompt and stdout is the answer, e.g. `["claude", "-p", "--model", "haiku"]` or `["codex", "exec"]`.
- **`openai`** — calls `POST {baseUrl}/chat/completions` directly (default `baseUrl`: `https://api.openai.com/v1`, default `model`: `gpt-4o-mini`). Works with any OpenAI-compatible endpoint (self-hosted gateways, proxies, etc.) by pointing `baseUrl` elsewhere.
- **`anthropic`** — calls `POST {baseUrl}/v1/messages` directly (default `baseUrl`: `https://api.anthropic.com`, default `model`: `claude-haiku-4-5-20251001`).

The `openai`/`anthropic` paths shell out to `curl` (still zero npm dependencies — this keeps every LLM call synchronous, matching the rest of the codebase, instead of forcing an async rewrite of the whole gate/hook pipeline just to use `fetch`).

Configure it with the CLI:

```bash
ebd provider                                          # show current provider config (keys are masked)
ebd provider openai --key sk-...  --model gpt-4o-mini
ebd provider anthropic --key-env ANTHROPIC_API_KEY    # read the key from an env var instead of storing it in config.json
ebd provider cli                                      # back to the local-CLI default
```

API key resolution order: `llm.apiKeyEnv` (an env var name you point it at) → `llm.apiKey` (plaintext in `config.json`) → the provider's standard env var (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`), so if you've already exported the standard variable you don't need to configure anything. `ebd config` always masks `apiKey` when printing (`sk-t…1234`), it never dumps it in full.

## Usage

```bash
ebd mode block|warn|log     # strength: block | warn | log-and-pass (default: block)
ebd stopwords list|add <w>|rm <w>   # emergency words: matching one skips the block entirely
ebd list [n]                 # show the last n original/English pairs (default 10)
ebd stats                    # queue + review stats

ebd quiz [n]                 # pop quiz: see the original, write the English from memory, LLM scores it (default 5)
ebd review                   # spaced-repetition review: only due entries, pass promotes the interval, fail demotes it
ebd feynman                  # Feynman technique: explain the idea in the simplest English you can, LLM probes for gaps
```

### Other CLIs (Codex / Grok / anything)

Claude Code gets a native hook. Everything else runs through a wrapper that gates non-English arguments before invoking the real tool:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x` only inspects text passed to it *as command-line arguments* — it cannot see anything you type into an interactive REPL/TUI after the wrapped tool starts (that input goes straight to the child process's stdin). See [`docs/ADAPTERS.md`](../ADAPTERS.md) for per-tool details, including which CLIs have their own native `UserPromptSubmit`-style hook you can point at `hooks/claude-code-hook.js` directly instead of using the wrapper.

## Multi-language input

Language detection is intentionally **Unicode-script-based**, not a general language classifier. `src/detect.js` flags text as non-English when it contains two or more characters from a non-Latin Unicode range (CJK, Kana, Hangul, Cyrillic, Hebrew, Arabic, Devanagari, Thai). Text inside fenced code blocks or inline code spans is stripped before counting, so pasting a snippet with non-English comments or strings doesn't trip the gate.

For text that does trigger the gate, `src/detect.js`'s `detectLanguage()` further narrows down *which* language it is, purely from the Unicode script involved, and `src/i18n.js` uses that to localize the block/warn/hint messages themselves (the prompt still gets translated to English by the LLM regardless — this only affects what language the tool's own messages are shown in). Supported languages:

| Code | Language | Script used to detect it |
|---|---|---|
| `zh` | Chinese | CJK ideographs, no Kana present |
| `ja` | Japanese | Presence of Hiragana/Katakana (disambiguates from `zh`, since Kanji overlaps with Chinese) |
| `ko` | Korean | Hangul |
| `ru` | Russian | Cyrillic |
| `he` | Hebrew | Hebrew script |
| `ar` | Arabic | Arabic script |
| `hi` | Hindi | Devanagari |
| `th` | Thai | Thai script |

**Latin-alphabet languages are deliberately not detected or blocked.** Spanish, French, German, Portuguese, Italian, Dutch, and similar languages use the same Latin letters as English, so a script-range check can't tell them apart from English (or from an accented English loanword like "café"). Distinguishing them would need a wordlist or statistical heuristic, which is out of scope for this function by design — it is a known, intentional limitation, not a bug. Prompts in those languages currently pass through ungated.

## Web dashboard

```bash
ebd web [port]   # default port 4173
```

Starts a local read-only dashboard (plain Node `http`, no dependencies) showing:

- Total pairs logged, average recall/review score, how many entries are due for review, and a breakdown by mode (`rewrite` / `warn` / `log` / `giveup` / `stopword` / ...).
- Frequent words/phrases pulled from your logged originals (word-based for Latin-script text, character-bigram-based for CJK-ish text, since it has no natural word boundaries without a dictionary).
- Recent expressions the naturalness judge flagged as **not** idiomatic (`natural: false`), with the LLM's suggested more-native phrasing.

**Security note:** the server binds to `127.0.0.1` only and has no authentication. It is meant to be viewed from the same machine. Do not put it behind a public port, a tunnel, or any kind of reverse proxy that exposes it to the network — anyone who can reach it can read your entire prompt history.

## Details

- **Semantic judging** — in `block` mode, your English rewrite is compared to the original by the LLM for meaning, not just language (default threshold: score ≥ 70, configurable via `judgeThreshold` in `config.json`). A mismatch gets a hint, never the full translation, so you have to work it out yourself.
- **giveup** — type `giveup` at any block/rewrite prompt to bail out; you're shown the English translation and it's sent through, and the pair is still logged for review.
- **Queue** — stored at `~/.english-by-default/queue.jsonl`, one JSON object per line, capped at the most recent 1000 entries by default (`queueSize` in `config.json`).
- **Stopwords** — entries let through via a stopword match are logged without a synchronous translation (so nothing slows down a real emergency); the English version is filled in lazily the next time you review or quiz that entry.
- **Fail-open** — any LLM call failure, timeout, or hook exception allows the prompt through unmodified. This tool must never be the reason legitimate work gets blocked.
- **Zero dependencies**, Node.js >= 18.

## Test

```bash
npm test
```

Runs the zero-dependency unit test suite (`node --test test/unit.test.js`, covering `detect.js`, `queue.js`, `state.js`, `llm.js`'s `extractJSON`, and `i18n.js`) followed by the smoke test (`test/smoke.sh`), which drives the full hook pipeline end-to-end against a fake LLM stub (`test/fake-llm.js`) — no real LLM calls are made.

## License

MIT
