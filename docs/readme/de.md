Zurück zu [README.md](../../README.md)

**Diese Seite in anderen Sprachen lesen:**

- [en](en.md) — Englisch
- [zh](zh.md) — Chinesisch
- [ja](ja.md) — Japanisch
- [ko](ko.md) — Koreanisch
- [ru](ru.md) — Russisch
- [ar](ar.md) — Arabisch
- [es](es.md) — Spanisch
- [pt](pt.md) — Portugiesisch
- [fr](fr.md) — Französisch
- [de](de.md) — Deutsch (diese Seite)
- [it](it.md) — Italienisch
- [nl](nl.md) — Niederländisch
- [he](he.md) — Hebräisch
- [hi](hi.md) — Hindi
- [th](th.md) — Thailändisch

# English by Default

Ein "Englisch-Gate" für KI-CLIs. Es fängt nicht-englische Prompts ab, bevor sie das Modell erreichen, zwingt dich dazu, sie auf Englisch neu zu formulieren (oder zeigt dir bei Aufgabe direkt die Übersetzung), und verwandelt jedes so gesammelte Original/Englisch-Paar in Übungen nach der Spaced-Repetition- und der Feynman-Methode.

Funktioniert nativ mit Claude Code und, über einen kleinen Wrapper-Befehl, mit jeder anderen KI-CLI (Codex, Grok, ...).

## Funktionsweise

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

Jeder abgefangene Prompt durchläuft dieselbe Pipeline:

1. **Erkennen (Detect)** — Ist der Text nicht englisch? (`src/detect.js`; was dabei genau als "nicht englisch" zählt, steht weiter unten unter [Mehrsprachige Eingabe](#mehrsprachige-eingabe).)
2. **Entscheiden (Decide)** — Je nach aktuellem Modus (`block` / `warn` / `log`) wird entweder blockiert und eine englische Umformulierung verlangt, oder der Text wird übersetzt und mit einem Hinweis durchgelassen.
3. **Bewerten (Judge)** — Im `block`-Modus vergleicht ein LLM deine englische Umformulierung mit dem Original auf semantische Gleichwertigkeit (nicht nur "ist das Englisch", sondern "bedeutet es dasselbe"). Lässt eine Umformulierung eine Anforderung weg oder verändert sie den Umfang, bekommst du einen Hinweis und eine weitere Chance — nicht die vollständige Übersetzung. Der Sinn dahinter: Du sollst sie selbst erarbeiten.
4. **Protokollieren (Log)** — Das Original/Englisch-Paar wird an eine lokale JSONL-Warteschlange angehängt, zur späteren Wiederholung.

Von Grund auf fail-open: Schlägt der LLM-Aufruf fehl, läuft er in ein Timeout, oder wirft der Hook selbst eine Exception, wird die Eingabe unverändert durchgelassen. Dieses Tool darf niemals der Grund dafür sein, dass deine eigentliche Arbeit blockiert wird.

## Installation

### Empfohlen: Claude-Code-Plugin

Das Repository wird als natives Claude-Code-Plugin ausgeliefert (`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`), daher ist weder ein Klonen des Repos noch `npm link` nötig:

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

Das war's schon — der `UserPromptSubmit`-Hook wird automatisch eingerichtet und beginnt sofort damit, deine Prompts im `block`-Modus (dem Standard) zu filtern.

### Manuell / eigenständige CLI

Diesen Weg brauchst du trotzdem, wenn du den Befehl `ebd` direkt nutzen willst — `ebd x`, `ebd gate`, `ebd quiz`, `ebd review`, `ebd feynman`, `ebd web` usw. funktionieren völlig unabhängig von Claude Code, und die Plugin-Installation oben legt kein `ebd`-Binary in deinen `PATH`.

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

`ebd uninstall claude-code` macht die Hook-Installation wieder rückgängig.

### LLM-Backend

Übersetzung und Bewertung laufen standardmäßig über die lokale `claude -p --model haiku`-CLI. Du kannst `llm.command` in `~/.english-by-default/config.json` auf jede beliebige CLI zeigen lassen, bei der das letzte Argument der Prompt ist und die Antwort über stdout ausgegeben wird (z. B. `codex exec`).

## Verwendung

```bash
ebd mode block|warn|log     # strength: block | warn | log-and-pass (default: block)
ebd stopwords list|add <w>|rm <w>   # emergency words: matching one skips the block entirely
ebd list [n]                 # show the last n original/English pairs (default 10)
ebd stats                    # queue + review stats

ebd quiz [n]                 # pop quiz: see the original, write the English from memory, LLM scores it (default 5)
ebd review                   # spaced-repetition review: only due entries, pass promotes the interval, fail demotes it
ebd feynman                  # Feynman technique: explain the idea in the simplest English you can, LLM probes for gaps
```

### Andere CLIs (Codex / Grok / beliebige)

Claude Code bekommt einen nativen Hook. Alles andere läuft über einen Wrapper, der nicht-englische Argumente abfängt, bevor das eigentliche Tool aufgerufen wird:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x` prüft ausschließlich Text, der ihm *als Kommandozeilenargumente* übergeben wird — es sieht nichts von dem, was du nach dem Start des umschlossenen Tools in ein interaktives REPL/TUI eintippst (diese Eingabe geht direkt an die stdin des Kindprozesses). Details je Tool findest du in [`docs/ADAPTERS.md`](../ADAPTERS.md), einschließlich der Frage, welche CLIs einen eigenen, `UserPromptSubmit`-artigen nativen Hook mitbringen, den du direkt auf `hooks/claude-code-hook.js` verweisen lassen kannst, statt den Wrapper zu benutzen.

## Mehrsprachige Eingabe

Die Spracherkennung basiert bewusst auf **Unicode-Schriftbereichen** und nicht auf einem allgemeinen Sprachklassifikator. `src/detect.js` markiert einen Text als nicht-englisch, sobald er zwei oder mehr Zeichen aus einem nicht-lateinischen Unicode-Bereich enthält (CJK, Kana, Hangul, Kyrillisch, Hebräisch, Arabisch, Devanagari, Thai). Text innerhalb von eingezäunten Codeblöcken oder Inline-Code wird vor dem Zählen entfernt, sodass das Einfügen eines Snippets mit nicht-englischen Kommentaren oder Strings das Gate nicht auslöst.

Bei Text, der das Gate tatsächlich auslöst, grenzt `detectLanguage()` aus `src/detect.js` anhand des beteiligten Unicode-Schriftsystems weiter ein, *welche* Sprache es ist, und `src/i18n.js` nutzt das, um die Block-/Warn-/Hinweistexte selbst zu lokalisieren (der Prompt wird davon unabhängig trotzdem vom LLM ins Englische übersetzt — das betrifft nur die Sprache, in der die Meldungen des Tools selbst angezeigt werden). Unterstützte Sprachen:

| Code | Sprache | Zur Erkennung verwendete Schrift |
|---|---|---|
| `zh` | Chinesisch | CJK-Ideogramme, keine Kana vorhanden |
| `ja` | Japanisch | Vorhandensein von Hiragana/Katakana (grenzt gegen `zh` ab, da sich Kanji mit Chinesisch überschneiden) |
| `ko` | Koreanisch | Hangul |
| `ru` | Russisch | Kyrillisch |
| `he` | Hebräisch | Hebräische Schrift |
| `ar` | Arabisch | Arabische Schrift |
| `hi` | Hindi | Devanagari |
| `th` | Thailändisch | Thailändische Schrift |

**Sprachen mit lateinischem Alphabet werden bewusst nicht erkannt oder blockiert.** Spanisch, Französisch, Deutsch, Portugiesisch, Italienisch, Niederländisch und ähnliche Sprachen verwenden dieselben lateinischen Buchstaben wie Englisch, sodass eine Prüfung anhand des Schriftbereichs sie nicht von Englisch unterscheiden kann (auch nicht von einem englischen Lehnwort mit Akzent wie „café"). Um sie zu unterscheiden, bräuchte es eine Wortliste oder eine statistische Heuristik — das liegt bewusst außerhalb des Geltungsbereichs dieser Funktion. Es handelt sich um eine bekannte, beabsichtigte Einschränkung, keinen Bug. Prompts in diesen Sprachen laufen derzeit ungefiltert durch.

## Web-Dashboard

```bash
ebd web [port]   # default port 4173
```

Startet ein lokales, reines Lese-Dashboard (nacktes Node-`http`, ohne Abhängigkeiten), das Folgendes anzeigt:

- Anzahl aller protokollierten Paare, durchschnittlicher Erinnerungs-/Wiederholungs-Score, wie viele Einträge zur Wiederholung fällig sind, sowie eine Aufschlüsselung nach Modus (`rewrite` / `warn` / `log` / `giveup` / `stopword` / ...).
- Häufige Wörter/Phrasen aus deinen protokollierten Originaltexten (bei lateinschriftlichem Text wortbasiert, bei CJK-artigem Text auf Basis von Zeichen-Bigrammen, da es dort ohne Wörterbuch keine natürlichen Wortgrenzen gibt).
- Zuletzt vom Natürlichkeits-Check als **nicht** idiomatisch markierte Ausdrücke (`natural: false`), zusammen mit der vom LLM vorgeschlagenen, natürlicheren Formulierung.

**Sicherheitshinweis:** Der Server bindet ausschließlich an `127.0.0.1` und hat keine Authentifizierung. Er ist ausschließlich für die Ansicht auf derselben Maschine gedacht. Stelle ihn nicht hinter einen öffentlichen Port, einen Tunnel oder irgendeinen Reverse-Proxy, der ihn im Netzwerk erreichbar macht — wer immer ihn erreichen kann, kann deine gesamte Prompt-Historie lesen.

## Details

- **Semantische Bewertung** — Im `block`-Modus vergleicht das LLM deine englische Umformulierung inhaltlich mit dem Original, nicht nur sprachlich (Standardschwelle: Score ≥ 70, konfigurierbar über `judgeThreshold` in `config.json`). Bei einer Abweichung gibt es einen Hinweis, nie die vollständige Übersetzung — du musst es selbst herausfinden.
- **giveup** — Tippe bei jedem Block-/Umformulierungs-Prompt `giveup` ein, um auszusteigen; dir wird die englische Übersetzung angezeigt, sie wird durchgelassen, und das Paar wird trotzdem zur Wiederholung protokolliert.
- **Warteschlange** — Gespeichert unter `~/.english-by-default/queue.jsonl`, ein JSON-Objekt pro Zeile, standardmäßig auf die letzten 1000 Einträge begrenzt (`queueSize` in `config.json`).
- **Stoppwörter** — Einträge, die durch einen Stoppwort-Treffer durchgelassen werden, werden ohne synchrone Übersetzung protokolliert (damit bei einem echten Notfall nichts ausgebremst wird); die englische Version wird nachträglich ergänzt, sobald du diesen Eintrag das nächste Mal wiederholst oder abfragst.
- **Fail-open** — Jeder fehlgeschlagene LLM-Aufruf, jedes Timeout oder jede Hook-Exception lässt den Prompt unverändert durch. Dieses Tool darf niemals der Grund sein, warum legitime Arbeit blockiert wird.
- **Keine Abhängigkeiten**, Node.js >= 18.

## Tests

```bash
npm test
```

Führt zuerst die abhängigkeitsfreie Unit-Test-Suite aus (`node --test test/unit.test.js`, deckt `detect.js`, `queue.js`, `state.js`, `extractJSON` aus `llm.js` sowie `i18n.js` ab) und anschließend den Smoke-Test (`test/smoke.sh`), der die komplette Hook-Pipeline End-to-End gegen einen gefälschten LLM-Stub (`test/fake-llm.js`) durchspielt — es werden keine echten LLM-Aufrufe gemacht.

## Lizenz

MIT
