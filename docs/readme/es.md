**[← README.md](../../README.md)**

**Lee esto en tu idioma:**

- [en](en.md) — Inglés
- [zh](zh.md) — Chino
- [ja](ja.md) — Japonés
- [ko](ko.md) — Coreano
- [ru](ru.md) — Ruso
- [ar](ar.md) — Árabe
- **es** — Español (estás aquí)
- [pt](pt.md) — Portugués
- [fr](fr.md) — Francés
- [de](de.md) — Alemán
- [it](it.md) — Italiano
- [nl](nl.md) — Neerlandés
- [he](he.md) — Hebreo
- [hi](hi.md) — Hindi
- [th](th.md) — Tailandés

---

# English by Default

Una «puerta de inglés» para las CLI de IA. Intercepta los prompts que no están en inglés antes de que lleguen al modelo, te obliga a reescribirlos en inglés (o te rindes y te enseña la traducción), y convierte cada par recogido en práctica de repetición espaciada y de la técnica Feynman.

Funciona de forma nativa con Claude Code, y con cualquier otra CLI de IA (Codex, Grok, ...) a través de un pequeño comando envoltorio (wrapper).

## Cómo funciona

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

Cada prompt interceptado pasa por el mismo proceso:

1. **Detectar** — ¿el texto no está en inglés? (`src/detect.js`; consulta [Entrada multilingüe](#entrada-multilingüe) más abajo para saber exactamente qué cuenta como "no inglés".)
2. **Decidir** — según el modo actual (`block` / `warn` / `log`), o bien bloquea y pide una reescritura en inglés, o bien traduce y lo deja pasar con una nota.
3. **Juzgar** — en modo `block`, un LLM compara tu reescritura en inglés con el original para verificar equivalencia semántica (no solo "¿esto está en inglés?", sino "¿significa lo mismo?"). Una reescritura que omite un requisito o cambia el alcance recibe una pista y otra oportunidad, no la traducción completa — la idea es que la produzcas tú mismo.
4. **Registrar** — el par original/inglés se añade a una cola JSONL local para repasarlo más adelante.

Diseñado para fallar abierto (fail-open): si la llamada al LLM falla, se agota el tiempo de espera, o el propio hook lanza una excepción, la entrada se deja pasar sin modificar. Esta herramienta nunca debería ser la razón por la que se bloquee tu trabajo real.

## Instalación

### Recomendado: plugin de Claude Code

El repositorio se distribuye como un plugin nativo de Claude Code (`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`), así que no hace falta clonar el repo ni usar `npm link`:

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

Y ya está — el hook `UserPromptSubmit` se conecta automáticamente y empieza a filtrar tus prompts en modo `block` (el predeterminado).

### Manual / CLI independiente

Aún necesitas esta vía si quieres usar el comando `ebd` directamente — `ebd x`, `ebd gate`, `ebd quiz`, `ebd review`, `ebd feynman`, `ebd web`, etc. funcionan completamente fuera de Claude Code, y la instalación del plugin de arriba no coloca ningún binario `ebd` en tu `PATH`.

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

`ebd uninstall claude-code` revierte la instalación del hook.

### Backend de LLM

La traducción y el juicio usan por defecto la CLI local `claude -p --model haiku`. Puedes apuntar `llm.command` en `~/.english-by-default/config.json` a cualquier CLI donde el último argumento sea el prompt y la salida estándar (stdout) sea la respuesta (por ejemplo, `codex exec`).

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

### Otras CLIs (Codex / Grok / lo que sea)

Claude Code tiene un hook nativo. Todo lo demás pasa por un wrapper que filtra los argumentos que no están en inglés antes de invocar la herramienta real:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x` solo inspecciona el texto que se le pasa *como argumentos de línea de comandos* — no puede ver nada que escribas en un REPL/TUI interactivo después de que arranque la herramienta envuelta (esa entrada va directa al stdin del proceso hijo). Consulta [`docs/ADAPTERS.md`](../ADAPTERS.md) para más detalles por herramienta, incluyendo qué CLIs tienen su propio hook nativo estilo `UserPromptSubmit` al que puedes apuntar directamente `hooks/claude-code-hook.js` en lugar de usar el wrapper.

## Entrada multilingüe

La detección de idioma se basa intencionalmente en **el rango Unicode de la escritura**, no en un clasificador de idiomas general. `src/detect.js` marca un texto como no inglés cuando contiene dos o más caracteres de un rango Unicode no latino (CJK, Kana, Hangul, cirílico, hebreo, árabe, devanagari, tailandés). El texto dentro de bloques de código con fences o de spans de código en línea se elimina antes de contar, así que pegar un fragmento con comentarios o cadenas en otro idioma no activa el filtro.

Para el texto que sí activa el filtro, la función `detectLanguage()` de `src/detect.js` determina además *qué* idioma es, basándose únicamente en la escritura Unicode implicada, y `src/i18n.js` usa ese dato para localizar los propios mensajes de bloqueo/aviso/pista (el prompt igualmente se traduce al inglés mediante el LLM; esto solo afecta al idioma en que se muestran los mensajes de la propia herramienta). Idiomas soportados:

| Código | Idioma | Escritura usada para detectarlo |
|---|---|---|
| `zh` | Chino | Ideogramas CJK, sin Kana presente |
| `ja` | Japonés | Presencia de Hiragana/Katakana (lo distingue del `zh`, ya que el Kanji se solapa con el chino) |
| `ko` | Coreano | Hangul |
| `ru` | Ruso | Cirílico |
| `he` | Hebreo | Escritura hebrea |
| `ar` | Árabe | Escritura árabe |
| `hi` | Hindi | Devanagari |
| `th` | Tailandés | Escritura tailandesa |

**Los idiomas de alfabeto latino no se detectan ni se bloquean, deliberadamente.** El español, el francés, el alemán, el portugués, el italiano, el neerlandés y otros idiomas similares usan las mismas letras latinas que el inglés, así que una comprobación por rango de escritura no puede distinguirlos del inglés (ni de un préstamo con tilde como "café"). Distinguirlos requeriría una lista de palabras o una heurística estadística, algo que queda fuera del alcance de esta función por diseño — es una limitación conocida e intencional, no un error. Los prompts en esos idiomas actualmente pasan sin filtrar.

## Panel web

```bash
ebd web [port]   # default port 4173
```

Inicia un panel de solo lectura local (usando el módulo `http` de Node puro, sin dependencias) que muestra:

- Total de pares registrados, puntuación media de recuerdo/repaso, cuántas entradas están pendientes de repaso, y un desglose por modo (`rewrite` / `warn` / `log` / `giveup` / `stopword` / ...).
- Palabras/frases frecuentes extraídas de tus originales registrados (basado en palabras para texto en escritura latina, y en bigramas de caracteres para texto tipo CJK, ya que este no tiene límites de palabra naturales sin un diccionario).
- Expresiones recientes que el juez de naturalidad marcó como **no** idiomáticas (`natural: false`), junto con la formulación más nativa que sugiere el LLM.

**Nota de seguridad:** el servidor se vincula únicamente a `127.0.0.1` y no tiene autenticación. Está pensado para verse desde la misma máquina. No lo pongas detrás de un puerto público, un túnel, ni ningún tipo de proxy inverso que lo exponga a la red — cualquiera que pueda alcanzarlo podrá leer todo tu historial de prompts.

## Detalles

- **Juicio semántico** — en modo `block`, el LLM compara tu reescritura en inglés con el original en cuanto a significado, no solo en cuanto a idioma (umbral por defecto: puntuación ≥ 70, configurable mediante `judgeThreshold` en `config.json`). Un desajuste recibe una pista, nunca la traducción completa, así que tienes que resolverlo tú mismo.
- **giveup** — escribe `giveup` en cualquier prompt de bloqueo/reescritura para rendirte; se te muestra la traducción al inglés y se deja pasar, y el par se sigue registrando para su repaso.
- **Cola** — almacenada en `~/.english-by-default/queue.jsonl`, un objeto JSON por línea, limitada por defecto a las 1000 entradas más recientes (`queueSize` en `config.json`).
- **Stopwords (palabras de emergencia)** — las entradas que pasan gracias a una coincidencia de stopword se registran sin traducción síncrona (para que nada retrase una emergencia real); la versión en inglés se rellena de forma diferida la próxima vez que repases o hagas un quiz de esa entrada.
- **Fail-open** — cualquier fallo en la llamada al LLM, tiempo de espera agotado, o excepción del hook deja pasar el prompt sin modificar. Esta herramienta nunca debe ser la razón por la que se bloquee un trabajo legítimo.
- **Cero dependencias**, Node.js >= 18.

## Pruebas

```bash
npm test
```

Ejecuta la suite de pruebas unitarias sin dependencias (`node --test test/unit.test.js`, que cubre `detect.js`, `queue.js`, `state.js`, el `extractJSON` de `llm.js`, e `i18n.js`), seguida de la prueba de humo (`test/smoke.sh`), que ejerce todo el pipeline del hook de extremo a extremo contra un stub de LLM falso (`test/fake-llm.js`) — no se hace ninguna llamada real a un LLM.

## Licencia

MIT
