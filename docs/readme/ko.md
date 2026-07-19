# English by Default

> [README.md로 돌아가기](../../README.md) · 다른 언어로 읽기: [en](en.md) English · [zh](zh.md) 中文 · [ja](ja.md) 日本語 · [ko](ko.md) 한국어 · [ru](ru.md) Русский · [ar](ar.md) العربية · [es](es.md) Español · [pt](pt.md) Português · [fr](fr.md) Français · [de](de.md) Deutsch · [it](it.md) Italiano · [nl](nl.md) Nederlands · [he](he.md) עברית · [hi](hi.md) हिन्दी · [th](th.md) ไทย

AI CLI를 위한 "영어 게이트"입니다. 모델에 도달하기 전에 영어가 아닌 프롬프트를 가로채서 영어로 다시 쓰게 만들고(포기하면 번역본을 보여줍니다), 이렇게 수집된 모든 원문-영어 쌍을 간격 반복 학습과 파인만 기법 연습으로 바꿔줍니다.

Claude Code와는 네이티브로 동작하며, 그 밖의 다른 AI CLI(Codex, Grok 등)와는 작은 래퍼 명령어를 통해 연동됩니다.

## 작동 방식

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

가로채진 모든 프롬프트는 동일한 파이프라인을 거칩니다:

1. **감지(Detect)** — 텍스트가 영어가 아닌지 확인합니다 (`src/detect.js`, 정확히 무엇이 "영어가 아닌 것"으로 간주되는지는 아래 [다국어 입력](#다국어-입력)을 참고하세요).
2. **결정(Decide)** — 현재 모드(`block` / `warn` / `log`)에 따라 차단 후 영어로 다시 쓰도록 요청하거나, 번역한 뒤 안내 문구와 함께 통과시킵니다.
3. **판정(Judge)** — `block` 모드에서는 여러분이 다시 쓴 영어 문장을 LLM이 원문과 비교해 의미가 같은지 판단합니다("영어인가"가 아니라 "같은 뜻인가"를 봅니다). 요구사항이 빠지거나 범위가 바뀐 다시쓰기는 전체 번역이 아니라 힌트와 재시도 기회를 받습니다 — 핵심은 여러분 스스로 문장을 만들어내게 하는 것입니다.
4. **기록(Log)** — 원문과 영어 문장 쌍이 나중에 복습할 수 있도록 로컬 JSONL 큐에 추가됩니다.

설계상 **fail-open**(오류 시 통과) 방식입니다. LLM 호출이 실패하거나 타임아웃되거나 훅 자체에서 예외가 발생하면 입력은 수정 없이 그대로 통과됩니다. 이 도구가 여러분의 실제 작업을 가로막는 이유가 되어서는 안 되기 때문입니다.

## 설치

### 권장: Claude Code 플러그인

이 저장소는 네이티브 Claude Code 플러그인(`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`) 형태로 제공되므로, 클론이나 `npm link` 과정이 필요 없습니다:

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

이게 전부입니다 — `UserPromptSubmit` 훅이 자동으로 연결되어 기본값인 `block` 모드로 곧바로 프롬프트를 게이팅하기 시작합니다.

### 수동 설치 / 독립 실행형 CLI

`ebd` 명령어를 직접 사용하고 싶다면 이 방법이 필요합니다 — `ebd x`, `ebd gate`, `ebd quiz`, `ebd review`, `ebd feynman`, `ebd web` 등은 Claude Code와 완전히 별개로 동작하며, 위의 플러그인 설치만으로는 `PATH`에 `ebd` 바이너리가 추가되지 않습니다.

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

`ebd uninstall claude-code` 명령으로 훅 설치를 되돌릴 수 있습니다.

### LLM 백엔드

번역과 판정은 기본적으로 로컬 `claude -p --model haiku` CLI를 사용합니다. 마지막 인자가 프롬프트이고 표준출력(stdout)이 응답인 CLI라면 무엇이든 `~/.english-by-default/config.json`의 `llm.command`에 지정해 사용할 수 있습니다(예: `codex exec`).

## 사용법

```bash
ebd mode block|warn|log     # strength: block | warn | log-and-pass (default: block)
ebd stopwords list|add <w>|rm <w>   # emergency words: matching one skips the block entirely
ebd list [n]                 # show the last n original/English pairs (default 10)
ebd stats                    # queue + review stats

ebd quiz [n]                 # pop quiz: see the original, write the English from memory, LLM scores it (default 5)
ebd review                   # spaced-repetition review: only due entries, pass promotes the interval, fail demotes it
ebd feynman                  # Feynman technique: explain the idea in the simplest English you can, LLM probes for gaps
```

### 다른 CLI들 (Codex / Grok / 기타 등등)

Claude Code는 네이티브 훅을 사용합니다. 그 외의 모든 도구는 실제 도구를 실행하기 전에 영어가 아닌 인자를 게이팅하는 래퍼를 통해 동작합니다:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x`는 **명령줄 인자로 전달된** 텍스트만 검사합니다 — 래핑된 도구가 시작된 이후 대화형 REPL/TUI에 직접 입력하는 내용은 볼 수 없습니다(그런 입력은 자식 프로세스의 표준입력(stdin)으로 곧장 전달되기 때문입니다). 도구별 세부 사항은 [`docs/ADAPTERS.md`](../ADAPTERS.md)를 참고하세요. 어떤 CLI가 래퍼 대신 `hooks/claude-code-hook.js`를 직접 연결할 수 있는 자체 네이티브 `UserPromptSubmit` 방식 훅을 갖고 있는지도 여기에 정리되어 있습니다.

## 다국어 입력

언어 감지는 일반적인 언어 분류기가 아니라 의도적으로 **유니코드 스크립트 기반**으로 동작합니다. `src/detect.js`는 텍스트에 라틴 문자가 아닌 유니코드 범위(CJK, 가나, 한글, 키릴, 히브리, 아랍, 데바나가리, 태국 문자)에 속하는 문자가 2개 이상 포함되어 있으면 영어가 아닌 것으로 표시합니다. 코드 펜스나 인라인 코드 스팬 안의 텍스트는 집계 전에 제거되므로, 영어가 아닌 주석이나 문자열이 들어있는 코드 스니펫을 붙여넣어도 게이트가 작동하지 않습니다.

게이트를 작동시킨 텍스트에 대해서는, `src/detect.js`의 `detectLanguage()`가 관련된 유니코드 스크립트만으로 *어떤* 언어인지 한 번 더 좁혀서 판단하고, `src/i18n.js`는 이를 이용해 차단/경고/힌트 메시지 자체를 현지화합니다(프롬프트 자체는 어차피 LLM에 의해 영어로 번역됩니다 — 이 부분은 오직 도구 자체의 메시지가 어떤 언어로 표시되는지에만 영향을 줍니다). 지원되는 언어는 다음과 같습니다:

| 코드 | 언어 | 감지에 사용되는 문자 체계 |
|---|---|---|
| `zh` | 중국어 | 가나가 없는 한자(CJK) |
| `ja` | 일본어 | 히라가나/가타카나의 존재 (한자는 중국어와 겹치므로 이를 통해 `zh`와 구분) |
| `ko` | 한국어 | 한글 |
| `ru` | 러시아어 | 키릴 문자 |
| `he` | 히브리어 | 히브리 문자 |
| `ar` | 아랍어 | 아랍 문자 |
| `hi` | 힌디어 | 데바나가리 문자 |
| `th` | 태국어 | 태국 문자 |

**라틴 알파벳을 쓰는 언어는 의도적으로 감지·차단 대상에서 제외됩니다.** 스페인어, 프랑스어, 독일어, 포르투갈어, 이탈리아어, 네덜란드어 등은 영어와 동일한 라틴 문자를 사용하기 때문에, 스크립트 범위 검사만으로는 영어와 구분할 수 없습니다("café"처럼 악센트가 붙은 영어 차용어와도 구분되지 않습니다). 이를 구분하려면 단어 목록이나 통계적 휴리스틱이 필요한데, 이는 설계상 이 함수의 범위를 벗어납니다 — 버그가 아니라 알려진 의도적 한계입니다. 현재 이런 언어로 된 프롬프트는 게이트를 거치지 않고 그대로 통과합니다.

## 웹 대시보드

```bash
ebd web [port]   # default port 4173
```

다음 내용을 보여주는 로컬 읽기 전용 대시보드를 실행합니다(순수 Node `http`만 사용하며 별도 의존성 없음):

- 기록된 전체 쌍의 개수, 평균 회상/복습 점수, 복습 예정인 항목 수, 그리고 모드별 분류(`rewrite` / `warn` / `log` / `giveup` / `stopword` / ...).
- 기록된 원문에서 뽑아낸 자주 등장하는 단어/구문(라틴 문자 텍스트는 단어 단위로, CJK 계열 텍스트는 사전 없이는 자연스러운 단어 경계가 없기 때문에 문자 바이그램 단위로 처리합니다).
- 자연스러움 판정기가 관용적이지 **않다고**(`natural: false`) 표시한 최근 표현들과, 이에 대해 LLM이 제안하는 더 자연스러운 표현.

**보안 참고사항:** 이 서버는 `127.0.0.1`에만 바인딩되며 별도의 인증이 없습니다. 같은 머신에서 보는 용도로만 설계되었습니다. 공인 포트, 터널, 혹은 네트워크에 노출시키는 어떤 종류의 리버스 프록시 뒤에도 두지 마세요 — 접근할 수 있는 사람이라면 누구든 여러분의 전체 프롬프트 기록을 읽을 수 있습니다.

## 세부 사항

- **의미 판정(Semantic judging)** — `block` 모드에서는 여러분이 다시 쓴 영어 문장을 LLM이 언어가 아니라 의미 기준으로 원문과 비교합니다(기본 임계값: 점수 ≥ 70, `config.json`의 `judgeThreshold`로 조정 가능). 의미가 맞지 않으면 힌트만 받을 뿐 전체 번역은 절대 제공되지 않으므로, 결국 스스로 답을 찾아내야 합니다.
- **giveup** — 차단/재작성 프롬프트에서 언제든 `giveup`을 입력하면 중단할 수 있습니다. 이 경우 영어 번역이 표시되고 그대로 통과되며, 해당 쌍은 여전히 복습용으로 기록됩니다.
- **큐(Queue)** — `~/.english-by-default/queue.jsonl`에 저장되며, 한 줄에 JSON 객체 하나씩, 기본적으로 가장 최근 1000개 항목까지만 보관합니다(`config.json`의 `queueSize`).
- **불용어(Stopwords)** — 불용어 매칭으로 통과된 항목은 동기적인 번역 없이 기록됩니다(진짜 긴급 상황을 지연시키지 않기 위해서입니다). 영어 버전은 나중에 해당 항목을 복습하거나 퀴즈로 풀 때 지연 처리(lazily)로 채워집니다.
- **Fail-open** — LLM 호출 실패, 타임아웃, 훅 예외 등 어떤 경우든 프롬프트는 수정 없이 그대로 통과됩니다. 이 도구가 정당한 작업을 가로막는 원인이 되어서는 절대 안 됩니다.
- **의존성 제로(Zero dependencies)**, Node.js >= 18.

## 테스트

```bash
npm test
```

의존성 없는 단위 테스트 스위트(`node --test test/unit.test.js`, `detect.js`, `queue.js`, `state.js`, `llm.js`의 `extractJSON`, `i18n.js`를 다룹니다)를 실행한 뒤, 가짜 LLM 스텁(`test/fake-llm.js`)을 대상으로 전체 훅 파이프라인을 엔드투엔드로 구동하는 스모크 테스트(`test/smoke.sh`)를 실행합니다 — 실제 LLM 호출은 전혀 발생하지 않습니다.

## 라이선스

MIT
