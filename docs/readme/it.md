**[← README.md](../../README.md)**

**Leggi questo documento nella tua lingua:**

- [en](en.md) — Inglese
- [zh](zh.md) — Cinese
- [ja](ja.md) — Giapponese
- [ko](ko.md) — Coreano
- [ru](ru.md) — Russo
- [ar](ar.md) — Arabo
- [es](es.md) — Spagnolo
- [pt](pt.md) — Portoghese
- [fr](fr.md) — Francese
- [de](de.md) — Tedesco
- **it** — Italiano (sei qui)
- [nl](nl.md) — Olandese
- [he](he.md) — Ebraico
- [hi](hi.md) — Hindi
- [th](th.md) — Tailandese

---

# English by Default

Un "cancello inglese" (English gate) per le CLI di intelligenza artificiale. Intercetta i prompt non in inglese prima che raggiungano il modello, ti obbliga a riscriverli in inglese (oppure ti arrendi e ti mostra la traduzione), e trasforma ogni coppia raccolta in esercizi di ripetizione dilazionata (spaced repetition) e di pratica con la tecnica Feynman.

Funziona in modo nativo con Claude Code, e con qualsiasi altra CLI di IA (Codex, Grok, ...) tramite un piccolo comando wrapper.

## Come funziona

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

Ogni prompt intercettato attraversa la stessa pipeline:

1. **Rilevamento (Detect)** — il testo è in una lingua diversa dall'inglese? (`src/detect.js`; vedi [Input multilingue](#input-multilingue) più sotto per sapere esattamente cosa conta come "non inglese".)
2. **Decisione (Decide)** — in base alla modalità corrente (`block` / `warn` / `log`), blocca il prompt e chiede una riscrittura in inglese, oppure lo traduce e lo lascia passare con una nota.
3. **Giudizio (Judge)** — in modalità `block`, la tua riscrittura in inglese viene confrontata con l'originale da un LLM per verificarne l'equivalenza semantica (non solo "è inglese", ma "significa la stessa cosa"). Una riscrittura che omette un requisito o cambia l'ambito riceve un suggerimento e un'altra possibilità, non la traduzione completa — l'obiettivo è farti produrre la frase da solo.
4. **Registrazione (Log)** — la coppia originale/inglese viene aggiunta a una coda JSONL locale per una revisione successiva.

Progettato per fallire in modo permissivo (fail-open): se la chiamata all'LLM fallisce, va in timeout, o l'hook stesso genera un'eccezione, l'input viene lasciato passare invariato. Questo strumento non deve mai essere la ragione per cui il tuo lavoro vero viene bloccato.

## Installazione

### Consigliato: plugin per Claude Code

Il repository viene distribuito come plugin nativo per Claude Code (`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`), quindi non serve clonare il repo né usare `npm link`:

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

Tutto qui — l'hook `UserPromptSubmit` viene collegato automaticamente e inizia a filtrare i tuoi prompt in modalità `block` (l'impostazione predefinita).

### CLI manuale / standalone

Questo percorso serve comunque se vuoi usare direttamente il comando `ebd` — `ebd x`, `ebd gate`, `ebd quiz`, `ebd review`, `ebd feynman`, `ebd web`, ecc. funzionano del tutto al di fuori di Claude Code, e l'installazione del plugin descritta sopra non aggiunge un binario `ebd` al tuo `PATH`.

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

`ebd uninstall claude-code` annulla l'installazione dell'hook.

### Backend LLM

Per impostazione predefinita, traduzione e giudizio usano la CLI locale `claude -p --model haiku`. Puoi impostare `llm.command` in `~/.english-by-default/config.json` per puntare a qualsiasi CLI in cui l'ultimo argomento è il prompt e l'output standard (stdout) è la risposta (per esempio `codex exec`).

## Utilizzo

```bash
ebd mode block|warn|log     # strength: block | warn | log-and-pass (default: block)
ebd stopwords list|add <w>|rm <w>   # emergency words: matching one skips the block entirely
ebd list [n]                 # show the last n original/English pairs (default 10)
ebd stats                    # queue + review stats

ebd quiz [n]                 # pop quiz: see the original, write the English from memory, LLM scores it (default 5)
ebd review                   # spaced-repetition review: only due entries, pass promotes the interval, fail demotes it
ebd feynman                  # Feynman technique: explain the idea in the simplest English you can, LLM probes for gaps
```

### Altre CLI (Codex / Grok e altre)

Claude Code ha un hook nativo. Tutto il resto passa attraverso un wrapper che filtra gli argomenti non in inglese prima di invocare lo strumento reale:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x` esamina solo il testo che gli viene passato *come argomenti da riga di comando* — non può vedere nulla di ciò che digiti in un REPL/TUI interattivo dopo che lo strumento wrappato è partito (quell'input va direttamente allo stdin del processo figlio). Consulta [`docs/ADAPTERS.md`](../ADAPTERS.md) per i dettagli specifici di ogni strumento, incluse le CLI che dispongono di un proprio hook nativo in stile `UserPromptSubmit` a cui puoi puntare direttamente `hooks/claude-code-hook.js` invece di usare il wrapper.

## Input multilingue

Il rilevamento della lingua è intenzionalmente basato **sugli script Unicode** (Unicode-script-based), non su un classificatore linguistico generico. `src/detect.js` segnala un testo come non inglese quando contiene due o più caratteri appartenenti a un intervallo Unicode non latino (CJK, Kana, Hangul, cirillico, ebraico, arabo, devanagari, thai). Il testo all'interno di blocchi di codice delimitati o di frammenti di codice inline viene rimosso prima del conteggio, quindi incollare uno snippet con commenti o stringhe non in inglese non fa scattare il blocco.

Per il testo che fa effettivamente scattare il blocco, la funzione `detectLanguage()` di `src/detect.js` restringe ulteriormente *quale* lingua sia, basandosi esclusivamente sullo script Unicode coinvolto, e `src/i18n.js` usa questa informazione per localizzare i messaggi stessi di blocco/avviso/suggerimento (il prompt viene comunque tradotto in inglese dall'LLM in ogni caso — questo influisce solo sulla lingua in cui vengono mostrati i messaggi dello strumento). Lingue supportate:

| Codice | Lingua | Script usato per rilevarla |
|---|---|---|
| `zh` | Cinese | Ideogrammi CJK, assenza di Kana |
| `ja` | Giapponese | Presenza di Hiragana/Katakana (distingue da `zh`, poiché i Kanji si sovrappongono al cinese) |
| `ko` | Coreano | Hangul |
| `ru` | Russo | Cirillico |
| `he` | Ebraico | Script ebraico |
| `ar` | Arabo | Script arabo |
| `hi` | Hindi | Devanagari |
| `th` | Thai | Script thai |

**Le lingue che usano l'alfabeto latino non vengono deliberatamente rilevate né bloccate.** Spagnolo, francese, tedesco, portoghese, italiano, olandese e lingue simili usano le stesse lettere latine dell'inglese, quindi un controllo basato sull'intervallo di script non riesce a distinguerle dall'inglese (né da un prestito inglese con accento come "café"). Distinguerle richiederebbe un elenco di parole o un'euristica statistica, il che esula deliberatamente dallo scopo di questa funzione — è una limitazione nota e intenzionale, non un bug. I prompt in queste lingue attualmente passano senza essere filtrati.

## Dashboard web

```bash
ebd web [port]   # default port 4173
```

Avvia una dashboard locale in sola lettura (modulo `http` di Node puro, senza dipendenze) che mostra:

- Totale delle coppie registrate, punteggio medio di richiamo/revisione, quante voci sono in scadenza per la revisione, e una suddivisione per modalità (`rewrite` / `warn` / `log` / `giveup` / `stopword` / ...).
- Parole/frasi frequenti estratte dai tuoi originali registrati (basate su parole per il testo in script latino, basate su bigrammi di caratteri per il testo di tipo CJK, che non ha confini di parola naturali senza un dizionario).
- Espressioni recenti che il giudice di naturalezza ha segnalato come **non** idiomatiche (`natural: false`), insieme alla formulazione più naturale suggerita dall'LLM.

**Nota di sicurezza:** il server si mette in ascolto solo su `127.0.0.1` e non ha alcuna autenticazione. È pensato per essere consultato dalla stessa macchina. Non esporlo su una porta pubblica, un tunnel, o qualsiasi tipo di reverse proxy che lo renda raggiungibile dalla rete — chiunque riesca a raggiungerlo può leggere l'intera cronologia dei tuoi prompt.

## Dettagli

- **Giudizio semantico** — in modalità `block`, la tua riscrittura in inglese viene confrontata con l'originale dall'LLM in base al significato, non solo alla lingua (soglia predefinita: punteggio ≥ 70, configurabile tramite `judgeThreshold` in `config.json`). Una mancata corrispondenza riceve un suggerimento, mai la traduzione completa, così devi arrivarci da solo.
- **giveup** — digita `giveup` in qualsiasi prompt di blocco/riscrittura per arrenderti; ti viene mostrata la traduzione in inglese, che viene lasciata passare, e la coppia viene comunque registrata per la revisione.
- **Coda** — memorizzata in `~/.english-by-default/queue.jsonl`, un oggetto JSON per riga, limitata per impostazione predefinita alle 1000 voci più recenti (`queueSize` in `config.json`).
- **Stopwords** — le voci lasciate passare grazie a una corrispondenza con una stopword vengono registrate senza una traduzione sincrona (così nulla rallenta una vera emergenza); la versione inglese viene compilata in modo pigro (lazy) la volta successiva che rivedi o fai un quiz su quella voce.
- **Fail-open** — qualsiasi fallimento della chiamata all'LLM, timeout o eccezione dell'hook lascia passare il prompt invariato. Questo strumento non deve mai essere la ragione per cui un lavoro legittimo viene bloccato.
- **Zero dipendenze**, Node.js >= 18.

## Test

```bash
npm test
```

Esegue la suite di unit test a zero dipendenze (`node --test test/unit.test.js`, che copre `detect.js`, `queue.js`, `state.js`, `extractJSON` di `llm.js`, e `i18n.js`), seguita dallo smoke test (`test/smoke.sh`), che fa girare l'intera pipeline dell'hook end-to-end contro uno stub LLM fittizio (`test/fake-llm.js`) — non viene effettuata alcuna chiamata a un LLM reale.

## Licenza

MIT
