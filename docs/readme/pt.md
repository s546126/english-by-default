**[← README.md](../../README.md)**

**Leia isto no seu idioma:**

- [en](en.md) — Inglês
- [zh](zh.md) — Chinês
- [ja](ja.md) — Japonês
- [ko](ko.md) — Coreano
- [ru](ru.md) — Russo
- [ar](ar.md) — Árabe
- [es](es.md) — Espanhol
- **pt** — Português (você está aqui)
- [fr](fr.md) — Francês
- [de](de.md) — Alemão
- [it](it.md) — Italiano
- [nl](nl.md) — Holandês
- [he](he.md) — Hebraico
- [hi](hi.md) — Hindi
- [th](th.md) — Tailandês

---

# English by Default

Um "portão de inglês" para CLIs de IA. Ele intercepta prompts que não estão em inglês antes que cheguem ao modelo, obriga você a reescrevê-los em inglês (ou desiste e mostra a tradução), e transforma cada par coletado em prática de repetição espaçada e da técnica de Feynman.

Funciona nativamente com o Claude Code, e com qualquer outra CLI de IA (Codex, Grok, ...) por meio de um pequeno comando wrapper.

## Como funciona

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

Todo prompt interceptado passa pelo mesmo pipeline:

1. **Detectar** — o texto não está em inglês? (`src/detect.js`, veja [Entrada multilíngue](#entrada-multilíngue) abaixo para saber exatamente o que conta como "não inglês".)
2. **Decidir** — de acordo com o modo atual (`block` / `warn` / `log`), bloqueia e pede uma reescrita em inglês, ou traduz e deixa passar com uma observação.
3. **Julgar** — no modo `block`, sua reescrita em inglês é comparada com o original por um LLM quanto à equivalência semântica (não apenas "isto está em inglês", mas "isto significa a mesma coisa"). Uma reescrita que omite um requisito ou muda o escopo recebe uma dica e mais uma chance, não a tradução completa — a ideia é fazer você mesmo chegar a ela.
4. **Registrar** — o par original/inglês é adicionado a uma fila JSONL local para revisão posterior.

Projetado para falhar de forma aberta (fail-open): se a chamada ao LLM falhar, expirar, ou o próprio hook lançar uma exceção, a entrada é deixada passar sem alterações. Esta ferramenta nunca deve ser o motivo de o seu trabalho de verdade ficar bloqueado.

## Instalação

### Recomendado: plugin do Claude Code

O repositório é distribuído como um plugin nativo do Claude Code (`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`), então não é preciso clonar nem usar `npm link`:

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

Pronto — o hook `UserPromptSubmit` é configurado automaticamente e já começa a filtrar seus prompts no modo `block` (o padrão).

### Manual / CLI standalone

Você ainda precisa deste caminho se quiser usar o comando `ebd` diretamente — `ebd x`, `ebd gate`, `ebd quiz`, `ebd review`, `ebd feynman`, `ebd web`, etc. funcionam totalmente fora do Claude Code, e a instalação via plugin acima não coloca um binário `ebd` no seu `PATH`.

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

`ebd uninstall claude-code` desfaz a instalação do hook.

### Backend de LLM

Tradução e julgamento usam por padrão a CLI local `claude -p --model haiku`. Você pode apontar `llm.command`, em `~/.english-by-default/config.json`, para qualquer CLI em que o último argumento seja o prompt e a saída padrão (stdout) seja a resposta (por exemplo, `codex exec`).

## Uso

```bash
ebd mode block|warn|log     # strength: block | warn | log-and-pass (default: block)
ebd stopwords list|add <w>|rm <w>   # emergency words: matching one skips the block entirely
ebd list [n]                 # show the last n original/English pairs (default 10)
ebd stats                    # queue + review stats

ebd quiz [n]                 # pop quiz: see the original, write the English from memory, LLM scores it (default 5)
ebd review                   # spaced-repetition review: only due entries, pass promotes the interval, fail demotes it
ebd feynman                  # Feynman technique: explain the idea in the simplest English you can, LLM probes for gaps
```

### Outras CLIs (Codex / Grok / qualquer uma)

O Claude Code recebe um hook nativo. Todo o resto passa por um wrapper que filtra argumentos que não estejam em inglês antes de chamar a ferramenta de verdade:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x` só inspeciona texto passado a ele *como argumentos de linha de comando* — ele não consegue ver nada que você digite em um REPL/TUI interativo depois que a ferramenta encapsulada é iniciada (essa entrada vai direto para o stdin do processo filho). Veja [`docs/ADAPTERS.md`](../ADAPTERS.md) para detalhes por ferramenta, incluindo quais CLIs têm seu próprio hook nativo estilo `UserPromptSubmit` que você pode apontar diretamente para `hooks/claude-code-hook.js`, em vez de usar o wrapper.

## Entrada multilíngue

A detecção de idioma é intencionalmente **baseada em script Unicode**, não um classificador de idiomas genérico. `src/detect.js` marca um texto como não-inglês quando ele contém dois ou mais caracteres de um intervalo Unicode não latino (CJK, Kana, Hangul, Cirílico, Hebraico, Árabe, Devanágari, Tailandês). O texto dentro de blocos de código cercados ou trechos de código inline é removido antes da contagem, então colar um trecho com comentários ou strings em outro idioma não aciona o portão.

Para o texto que aciona o portão, a função `detectLanguage()` de `src/detect.js` refina ainda mais *qual* idioma é, unicamente a partir do script Unicode envolvido, e `src/i18n.js` usa isso para localizar as próprias mensagens de bloqueio/aviso/dica (o prompt continua sendo traduzido para inglês pelo LLM de qualquer forma — isso afeta apenas em que idioma as mensagens da própria ferramenta são exibidas). Idiomas suportados:

| Código | Idioma | Script usado para detectar |
|---|---|---|
| `zh` | Chinês | Ideogramas CJK, sem Kana presente |
| `ja` | Japonês | Presença de Hiragana/Katakana (desambigua de `zh`, já que o Kanji se sobrepõe ao chinês) |
| `ko` | Coreano | Hangul |
| `ru` | Russo | Cirílico |
| `he` | Hebraico | Escrita hebraica |
| `ar` | Árabe | Escrita árabe |
| `hi` | Hindi | Devanágari |
| `th` | Tailandês | Escrita tailandesa |

**Idiomas de alfabeto latino deliberadamente não são detectados nem bloqueados.** Espanhol, francês, alemão, português, italiano, holandês e idiomas semelhantes usam as mesmas letras latinas que o inglês, então uma verificação por intervalo de script não consegue distingui-los do inglês (nem de um empréstimo em inglês com acento, como "café"). Diferenciá-los exigiria uma lista de palavras ou uma heurística estatística, o que está fora do escopo desta função por design — é uma limitação conhecida e intencional, não um bug. Prompts nesses idiomas atualmente passam sem serem filtrados.

## Painel web

```bash
ebd web [port]   # default port 4173
```

Inicia um painel local somente leitura (usando apenas o módulo `http` puro do Node, sem dependências) mostrando:

- Total de pares registrados, pontuação média de recordação/revisão, quantas entradas estão pendentes de revisão, e uma divisão por modo (`rewrite` / `warn` / `log` / `giveup` / `stopword` / ...).
- Palavras/frases frequentes extraídas dos seus originais registrados (baseado em palavras para texto em script latino, baseado em bigramas de caracteres para texto do tipo CJK, já que ele não tem fronteiras naturais de palavras sem um dicionário).
- Expressões recentes que o julgador de naturalidade marcou como **não** idiomáticas (`natural: false`), com a formulação mais nativa sugerida pelo LLM.

**Nota de segurança:** o servidor escuta somente em `127.0.0.1` e não tem autenticação. Ele foi feito para ser acessado da mesma máquina. Não o coloque atrás de uma porta pública, um túnel, ou qualquer tipo de proxy reverso que o exponha à rede — qualquer pessoa que consiga alcançá-lo pode ler todo o seu histórico de prompts.

## Detalhes

- **Julgamento semântico** — no modo `block`, sua reescrita em inglês é comparada ao original pelo LLM quanto ao significado, não apenas quanto ao idioma (limite padrão: pontuação ≥ 70, configurável via `judgeThreshold` em `config.json`). Uma incompatibilidade recebe uma dica, nunca a tradução completa, então você precisa descobrir por conta própria.
- **giveup** — digite `giveup` em qualquer prompt de bloqueio/reescrita para desistir; a tradução em inglês é mostrada a você e enviada adiante, e o par ainda é registrado para revisão.
- **Fila** — armazenada em `~/.english-by-default/queue.jsonl`, um objeto JSON por linha, limitada às 1000 entradas mais recentes por padrão (`queueSize` em `config.json`).
- **Stopwords** — entradas liberadas por correspondência com uma stopword são registradas sem tradução síncrona (para que nada atrase uma emergência real); a versão em inglês é preenchida posteriormente, de forma preguiçosa, na próxima vez que você revisar ou fizer o quiz dessa entrada.
- **Fail-open** — qualquer falha na chamada ao LLM, timeout, ou exceção no hook deixa o prompt passar sem alterações. Esta ferramenta nunca deve ser o motivo de um trabalho legítimo ser bloqueado.
- **Zero dependências**, Node.js >= 18.

## Teste

```bash
npm test
```

Executa a suíte de testes unitários sem dependências (`node --test test/unit.test.js`, cobrindo `detect.js`, `queue.js`, `state.js`, o `extractJSON` de `llm.js`, e `i18n.js`), seguida do teste de fumaça (`test/smoke.sh`), que conduz todo o pipeline do hook de ponta a ponta contra um stub de LLM falso (`test/fake-llm.js`) — nenhuma chamada real a um LLM é feita.

## Licença

MIT
