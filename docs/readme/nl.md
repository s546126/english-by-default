**[← README.md](../../README.md)**

**Lees dit in jouw taal:**

- [en](en.md) — Engels
- [zh](zh.md) — Chinees
- [ja](ja.md) — Japans
- [ko](ko.md) — Koreaans
- [ru](ru.md) — Russisch
- [ar](ar.md) — Arabisch
- [es](es.md) — Spaans
- [pt](pt.md) — Portugees
- [fr](fr.md) — Frans
- [de](de.md) — Duits
- [it](it.md) — Italiaans
- **nl** — Nederlands (je bent hier)
- [he](he.md) — Hebreeuws
- [hi](hi.md) — Hindi
- [th](th.md) — Thai

---

# English by Default

Een "Engels-poort" voor AI CLI's. De tool onderschept niet-Engelse prompts voordat ze het model bereiken, dwingt je ze in het Engels te herschrijven (of je geeft het op en krijgt de vertaling te zien), en verwerkt elk verzameld paar tot oefeningen met spaced repetition en de Feynman-techniek.

Werkt native samen met Claude Code, en met elke andere AI CLI (Codex, Grok, ...) via een klein wrapper-commando.

## Zo werkt het

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

Elke onderschepte prompt doorloopt dezelfde pijplijn:

1. **Detect** — is de tekst niet-Engels? (`src/detect.js`, zie [Meertalige invoer](#meertalige-invoer) hieronder voor precies wat er telt als "niet-Engels".)
2. **Decide** — op basis van de huidige modus (`block` / `warn` / `log`) wordt de prompt óf geblokkeerd met het verzoek om een Engelse herschrijving, óf vertaald en met een opmerking doorgelaten.
3. **Judge** — in `block`-modus wordt jouw Engelse herschrijving door een LLM vergeleken met het origineel op semantische gelijkwaardigheid (niet alleen "is dit Engels", maar "betekent het hetzelfde"). Een herschrijving die een vereiste laat vallen of de strekking verandert, krijgt een hint en nog een kans, niet de volledige vertaling — het punt is dat je hem zelf moet bedenken.
4. **Log** — het paar origineel/Engels wordt toegevoegd aan een lokale JSONL-wachtrij voor latere review.

Fail-open by design: als de LLM-aanroep mislukt, een timeout krijgt, of de hook zelf een fout gooit, wordt de invoer ongewijzigd doorgelaten. Deze tool mag nooit de reden zijn dat je echte werk wordt geblokkeerd.

## Installatie

### Aanbevolen: Claude Code-plugin

De repository wordt geleverd als een native Claude Code-plugin (`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`), dus clonen of `npm link` is niet nodig:

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

Dat is alles — de `UserPromptSubmit`-hook wordt automatisch aangesloten en begint je prompts te filteren in `block`-modus (de standaard).

### Handmatig / standalone CLI

Deze route heb je nog steeds nodig als je het commando `ebd` rechtstreeks wilt gebruiken — `ebd x`, `ebd gate`, `ebd quiz`, `ebd review`, `ebd feynman`, `ebd web`, enzovoort werken volledig los van Claude Code, en de plugin-installatie hierboven zet geen `ebd`-binary op je `PATH`.

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

`ebd uninstall claude-code` maakt de installatie van de hook weer ongedaan.

### LLM-backend

Vertalen en beoordelen gebruiken standaard de lokale CLI `claude -p --model haiku`. Je kunt `llm.command` in `~/.english-by-default/config.json` laten wijzen naar elke CLI waarbij het laatste argument de prompt is en stdout het antwoord (bijvoorbeeld `codex exec`).

## Gebruik

```bash
ebd mode block|warn|log     # strength: block | warn | log-and-pass (default: block)
ebd stopwords list|add <w>|rm <w>   # emergency words: matching one skips the block entirely
ebd list [n]                 # show the last n original/English pairs (default 10)
ebd stats                    # queue + review stats

ebd quiz [n]                 # pop quiz: see the original, write the English from memory, LLM scores it (default 5)
ebd review                   # spaced-repetition review: only due entries, pass promotes the interval, fail demotes it
ebd feynman                  # Feynman technique: explain the idea in the simplest English you can, LLM probes for gaps
```

### Andere CLI's (Codex / Grok / wat dan ook)

Claude Code krijgt een native hook. Al het andere loopt via een wrapper die niet-Engelse argumenten filtert voordat de eigenlijke tool wordt aangeroepen:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x` inspecteert alleen tekst die er *als command-line-argumenten* aan wordt doorgegeven — het kan niets zien van wat je typt in een interactieve REPL/TUI nadat de gewrapte tool is gestart (die invoer gaat rechtstreeks naar de stdin van het child-process). Zie [`docs/ADAPTERS.md`](../ADAPTERS.md) voor details per tool, inclusief welke CLI's hun eigen native `UserPromptSubmit`-achtige hook hebben waar je `hooks/claude-code-hook.js` rechtstreeks op kunt aansluiten in plaats van de wrapper te gebruiken.

## Meertalige invoer

Taaldetectie is bewust **gebaseerd op Unicode-scripts**, niet op een algemene taalclassificatie. `src/detect.js` markeert tekst als niet-Engels wanneer die twee of meer tekens uit een niet-Latijns Unicode-bereik bevat (CJK, Kana, Hangul, Cyrillisch, Hebreeuws, Arabisch, Devanagari, Thai). Tekst binnen fenced code blocks of inline code spans wordt vóór het tellen verwijderd, zodat het plakken van een snippet met niet-Engelse comments of strings de poort niet activeert.

Voor tekst die de poort wél activeert, bepaalt `detectLanguage()` uit `src/detect.js` verder *welke* taal het is, puur op basis van het betrokken Unicode-script, en `src/i18n.js` gebruikt dat om de block-/warn-/hint-berichten zelf te lokaliseren (de prompt wordt sowieso nog steeds door de LLM naar het Engels vertaald — dit heeft alleen invloed op de taal waarin de eigen berichten van de tool worden getoond). Ondersteunde talen:

| Code | Taal | Script waarmee het wordt gedetecteerd |
|---|---|---|
| `zh` | Chinees | CJK-ideogrammen, geen Kana aanwezig |
| `ja` | Japans | Aanwezigheid van Hiragana/Katakana (onderscheidt van `zh`, aangezien Kanji overlapt met het Chinees) |
| `ko` | Koreaans | Hangul |
| `ru` | Russisch | Cyrillisch |
| `he` | Hebreeuws | Hebreeuws schrift |
| `ar` | Arabisch | Arabisch schrift |
| `hi` | Hindi | Devanagari |
| `th` | Thai | Thais schrift |

**Talen met het Latijnse alfabet worden bewust niet gedetecteerd of geblokkeerd.** Spaans, Frans, Duits, Portugees, Italiaans, Nederlands en vergelijkbare talen gebruiken dezelfde Latijnse letters als het Engels, dus een controle op Unicode-scriptbereik kan ze niet onderscheiden van Engels (of van een Engels leenwoord met accent, zoals "café"). Om ze te onderscheiden zou je een woordenlijst of statistische heuristiek nodig hebben, en dat valt met opzet buiten de scope van deze functie — het is een bekende, bewuste beperking, geen bug. Prompts in die talen komen momenteel ongefilterd door.

## Webdashboard

```bash
ebd web [port]   # default port 4173
```

Start een lokaal alleen-lezen dashboard (met de gewone Node-module `http`, zonder dependencies) dat het volgende toont:

- Totaal aantal gelogde paren, gemiddelde recall-/reviewscore, hoeveel items klaarstaan voor review, en een uitsplitsing per modus (`rewrite` / `warn` / `log` / `giveup` / `stopword` / ...).
- Veelvoorkomende woorden/uitdrukkingen uit je gelogde originelen (op woordbasis voor tekst in Latijns schrift, op basis van karakter-bigrammen voor CJK-achtige tekst, omdat die zonder woordenboek geen natuurlijke woordgrenzen heeft).
- Recente uitdrukkingen die de natuurlijkheidsbeoordelaar als **niet** idiomatisch heeft aangemerkt (`natural: false`), samen met de meer native formulering die de LLM voorstelt.

**Beveiligingsopmerking:** de server bindt alleen aan `127.0.0.1` en heeft geen authenticatie. Hij is bedoeld om vanaf dezelfde machine te bekijken. Zet hem niet achter een publieke poort, een tunnel, of enige vorm van reverse proxy die hem blootstelt aan het netwerk — iedereen die hem kan bereiken, kan je volledige prompt-geschiedenis lezen.

## Details

- **Semantische beoordeling** — in `block`-modus vergelijkt de LLM jouw Engelse herschrijving met het origineel op betekenis, niet alleen op taal (standaarddrempel: score ≥ 70, instelbaar via `judgeThreshold` in `config.json`). Bij een mismatch krijg je een hint, nooit de volledige vertaling, zodat je het zelf moet uitzoeken.
- **giveup** — typ `giveup` bij elke block-/herschrijfprompt om eruit te stappen; je krijgt de Engelse vertaling te zien, die wordt doorgelaten, en het paar wordt alsnog gelogd voor review.
- **Wachtrij** — opgeslagen in `~/.english-by-default/queue.jsonl`, één JSON-object per regel, standaard begrensd tot de meest recente 1000 items (`queueSize` in `config.json`).
- **Stopwoorden** — items die worden doorgelaten via een stopwoord-match worden gelogd zonder synchrone vertaling (zodat niets een echte noodsituatie vertraagt); de Engelse versie wordt lui aangevuld de volgende keer dat je dat item reviewt of quizt.
- **Fail-open** — elke mislukte LLM-aanroep, timeout of hook-uitzondering laat de prompt ongewijzigd door. Deze tool mag nooit de reden zijn dat legitiem werk wordt geblokkeerd.
- **Geen dependencies**, Node.js >= 18.

## Test

```bash
npm test
```

Voert de dependency-vrije unit test suite uit (`node --test test/unit.test.js`, met dekking van `detect.js`, `queue.js`, `state.js`, de `extractJSON` van `llm.js`, en `i18n.js`), gevolgd door de smoke test (`test/smoke.sh`), die de volledige hook-pipeline end-to-end aanstuurt tegen een fake LLM-stub (`test/fake-llm.js`) — er worden geen echte LLM-aanroepen gedaan.

## Licentie

MIT
