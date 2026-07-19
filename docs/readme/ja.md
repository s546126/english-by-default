[← READMEに戻る](../../README.md)

**この文書を他の言語で読む:**

- [en](docs/readme/en.md) — 英語
- [zh](docs/readme/zh.md) — 中国語
- [ja](docs/readme/ja.md) — 日本語
- [ko](docs/readme/ko.md) — 韓国語
- [ru](docs/readme/ru.md) — ロシア語
- [ar](docs/readme/ar.md) — アラビア語
- [es](docs/readme/es.md) — スペイン語
- [pt](docs/readme/pt.md) — ポルトガル語
- [fr](docs/readme/fr.md) — フランス語
- [de](docs/readme/de.md) — ドイツ語
- [it](docs/readme/it.md) — イタリア語
- [nl](docs/readme/nl.md) — オランダ語
- [he](docs/readme/he.md) — ヘブライ語
- [hi](docs/readme/hi.md) — ヒンディー語
- [th](docs/readme/th.md) — タイ語

---

# English by Default

AIのCLIツールのための「英語ゲート」です。モデルに届く前に英語以外のプロンプトを検知して差し止め、英語での書き直しを求めます(諦めれば代わりに翻訳を見せてくれます)。そうして集まった原文と英訳のペアはすべて、間隔反復とファインマン・テクニックによる学習教材に変わります。

Claude Codeとはネイティブに連携し、それ以外のAI CLI(Codex、Grok、...)とも小さなラッパーコマンドを介して連携します。

## 仕組み

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

差し止められたプロンプトはすべて、同じパイプラインを通ります。

1. **検知(Detect)** — テキストが英語以外かどうかを判定します(`src/detect.js`。「英語以外」の判定基準の詳細は、後述の[多言語入力](#多言語入力)を参照してください)。
2. **判定(Decide)** — 現在のモード(`block` / `warn` / `log`)に応じて、差し止めて英語での書き直しを求めるか、翻訳した上で注記付きで通過させるかを決めます。
3. **採点(Judge)** — `block` モードでは、書き直した英語をLLMが元の原文と突き合わせ、意味が同じかどうかを判定します(単に「英語になっているか」ではなく「意味が変わっていないか」を見ます)。要件が抜け落ちたり範囲が変わってしまった書き直しには、正解の翻訳ではなくヒントが示され、もう一度チャンスが与えられます — あくまで自分の力で英語を作り出すことが目的だからです。
4. **記録(Log)** — 原文と英訳のペアがローカルのJSONLキューに追記され、後から復習できるようになります。

設計上、フェイルオープン(fail-open)です。LLM呼び出しが失敗・タイムアウトした場合や、フック自体が例外を投げた場合は、入力はそのまま変更なしで通過します。このツールが原因で本来の作業が止まってしまうことは、あってはならないからです。

## インストール

### 推奨: Claude Codeプラグイン

このリポジトリはClaude Codeのネイティブプラグイン(`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`)として配布されているため、cloneも`npm link`も不要です。

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

これだけです。`UserPromptSubmit` フックが自動的に組み込まれ、デフォルトの `block` モードでプロンプトのゲーティングが始まります。

### 手動インストール / スタンドアロンCLI

`ebd` コマンドを直接使いたい場合は、この方法が必要です。`ebd x`、`ebd gate`、`ebd quiz`、`ebd review`、`ebd feynman`、`ebd web` などはClaude Codeの外でも完全に動作しますが、上記のプラグインインストールでは `ebd` バイナリが `PATH` に追加されません。

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

`ebd uninstall claude-code` を実行すると、フックのインストールを元に戻せます。

### LLMバックエンド

翻訳と採点は、デフォルトではローカルの `claude -p --model haiku` CLIを使います。`~/.english-by-default/config.json` の `llm.command` を、最後の引数がプロンプトで標準出力が回答になっている任意のCLI(例: `codex exec`)に向けることもできます。

## 使い方

```bash
ebd mode block|warn|log     # strength: block | warn | log-and-pass (default: block)
ebd stopwords list|add <w>|rm <w>   # emergency words: matching one skips the block entirely
ebd list [n]                 # show the last n original/English pairs (default 10)
ebd stats                    # queue + review stats

ebd quiz [n]                 # pop quiz: see the original, write the English from memory, LLM scores it (default 5)
ebd review                   # spaced-repetition review: only due entries, pass promotes the interval, fail demotes it
ebd feynman                  # Feynman technique: explain the idea in the simplest English you can, LLM probes for gaps
```

### 他のCLI(Codex / Grok / なんでも)

Claude Codeにはネイティブフックが用意されています。それ以外のツールは、実際のコマンドを呼び出す前にラッパーが非英語の引数をゲーティングする形で動作します。

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x` が検査するのは *コマンドライン引数として渡されたテキスト* だけです。ラップされたツールが起動した後にインタラクティブなREPL/TUIへ入力した内容は関知できません(その入力は子プロセスの標準入力へ直接渡されるためです)。ツールごとの詳細——ラッパーを使わずに `hooks/claude-code-hook.js` を直接指定できる、独自のネイティブな `UserPromptSubmit` 相当のフックを持つCLIの一覧を含む——は [`docs/ADAPTERS.md`](../ADAPTERS.md) を参照してください。

## 多言語入力

言語検知は意図的に**Unicodeのスクリプト(文字種)ベース**で行われており、汎用的な言語判別器ではありません。`src/detect.js` は、非ラテン系のUnicode範囲(CJK、かな、ハングル、キリル文字、ヘブライ文字、アラビア文字、デーヴァナーガリー文字、タイ文字)の文字が2文字以上含まれている場合に、そのテキストを英語以外と判定します。フェンス付きコードブロックやインラインコードスパンの中身はカウント前に取り除かれるため、非英語のコメントや文字列を含むコードスニペットを貼り付けてもゲートは反応しません。

ゲートに引っかかったテキストについては、`src/detect.js` の `detectLanguage()` が、関わっているUnicodeスクリプトだけをもとに、*どの言語か* をさらに絞り込みます。`src/i18n.js` はその結果を使って、差し止め・警告・ヒントのメッセージ自体をローカライズします(プロンプト自体はどのみちLLMによって英語に翻訳されるので、これが影響するのはツール自身のメッセージがどの言語で表示されるかだけです)。対応言語は以下のとおりです。

| コード | 言語 | 検知に使うスクリプト |
|---|---|---|
| `zh` | 中国語 | CJK表意文字(かなを含まない) |
| `ja` | 日本語 | ひらがな/カタカナの存在(`zh`との判別に使う。漢字は中国語と重なるため) |
| `ko` | 韓国語 | ハングル |
| `ru` | ロシア語 | キリル文字 |
| `he` | ヘブライ語 | ヘブライ文字 |
| `ar` | アラビア語 | アラビア文字 |
| `hi` | ヒンディー語 | デーヴァナーガリー文字 |
| `th` | タイ語 | タイ文字 |

**ラテン文字を使う言語は、意図的に検知・差し止めの対象外です。** スペイン語、フランス語、ドイツ語、ポルトガル語、イタリア語、オランダ語などは英語と同じラテン文字を使うため、スクリプト範囲によるチェックでは英語と区別がつきません(アクセント付きの英語の外来語、たとえば「café」との区別もつきません)。これらを判別するには単語リストや統計的なヒューリスティックが必要になりますが、それはこの機能の設計上のスコープ外です——これはバグではなく、既知の意図的な制限です。現状、これらの言語のプロンプトはゲートを通らずそのまま通過します。

## Webダッシュボード

```bash
ebd web [port]   # default port 4173
```

ローカルの読み取り専用ダッシュボード(素の Node `http`、依存パッケージなし)を起動し、以下を表示します。

- 記録済みペアの総数、平均の想起/レビュースコア、復習期限が来ているエントリ数、モード別(`rewrite` / `warn` / `log` / `giveup` / `stopword` / ...)の内訳。
- 記録された原文から抽出した頻出の単語・フレーズ(ラテン文字のテキストは単語単位、CJK系のテキストは辞書なしでは自然な単語境界がないため、文字バイグラム単位で集計)。
- 自然さ判定で慣用的では**ない**とフラグが付いた(`natural: false`)最近の表現と、LLMが提案するより自然な言い回し。

**セキュリティに関する注意:** サーバーは `127.0.0.1` のみにバインドされ、認証機能はありません。同一マシンから閲覧する前提の設計です。公開ポート、トンネル、ネットワークに公開するような類のリバースプロキシの背後に置かないでください——到達できる人は誰でも、あなたのプロンプト履歴を丸ごと読めてしまいます。

## 詳細

- **意味の採点(Semantic judging)** — `block` モードでは、英語への書き直しがLLMによって原文と意味の面で比較されます(言語だけでなく)。デフォルトの閾値はスコア70以上で、`config.json` の `judgeThreshold` で変更できます。一致しない場合はヒントのみが示され、完全な翻訳は与えられません。あくまで自分で答えを導き出す必要があります。
- **giveup** — 差し止め・書き直しのプロンプトでいつでも `giveup` と入力すれば切り上げられます。英訳が表示されてそのまま送信され、ペアは復習用にきちんと記録されます。
- **キュー(Queue)** — `~/.english-by-default/queue.jsonl` に保存され、1行につき1つのJSONオブジェクトが記録されます。デフォルトでは直近1000件まで(`config.json` の `queueSize`)に制限されます。
- **ストップワード(Stopwords)** — ストップワードの一致によって通過したエントリは、同期的な翻訳なしで記録されます(本当に緊急のときに何も遅らせないため)。英訳は、そのエントリを次回レビューまたはクイズする際に遅延して補完されます。
- **フェイルオープン(Fail-open)** — LLM呼び出しの失敗、タイムアウト、フックの例外が発生した場合、プロンプトは変更なしでそのまま通過します。このツールが原因で正当な作業が差し止められることは、決してあってはなりません。
- **依存パッケージゼロ**、Node.js >= 18。

## テスト

```bash
npm test
```

依存パッケージゼロのユニットテストスイート(`node --test test/unit.test.js`。`detect.js`、`queue.js`、`state.js`、`llm.js` の `extractJSON`、および `i18n.js` をカバー)を実行したあと、スモークテスト(`test/smoke.sh`)を実行します。これはフェイクのLLMスタブ(`test/fake-llm.js`)を使って、フックパイプライン全体をエンドツーエンドで動かすものです——実際のLLM呼び出しは一切行われません。

## ライセンス

MIT
</content>
