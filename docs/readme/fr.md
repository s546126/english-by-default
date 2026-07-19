**[← README.md](../../README.md)**

**Lisez ceci dans votre langue :**

- [en](en.md) — Anglais
- [zh](zh.md) — Chinois
- [ja](ja.md) — Japonais
- [ko](ko.md) — Coréen
- [ru](ru.md) — Russe
- [ar](ar.md) — Arabe
- [es](es.md) — Espagnol
- [pt](pt.md) — Portugais
- **fr** — Français (vous êtes ici)
- [de](de.md) — Allemand
- [it](it.md) — Italien
- [nl](nl.md) — Néerlandais
- [he](he.md) — Hébreu
- [hi](hi.md) — Hindi
- [th](th.md) — Thaï

---

# English by Default

Un « portail anglais » pour les CLI d'IA. Il intercepte les prompts qui ne sont pas en anglais avant qu'ils n'atteignent le modèle, vous oblige à les reformuler en anglais (ou vous abandonnez et il vous montre la traduction), et transforme chaque paire collectée en exercice de répétition espacée et de technique Feynman.

Fonctionne nativement avec Claude Code, et avec n'importe quelle autre CLI d'IA (Codex, Grok, ...) via une petite commande wrapper.

## Comment ça fonctionne

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

Chaque prompt intercepté passe par le même pipeline :

1. **Détecter** — le texte est-il non anglais ? (`src/detect.js`, voir [Entrée multilingue](#entrée-multilingue) ci-dessous pour savoir exactement ce qui compte comme « non anglais ».)
2. **Décider** — selon le mode actuel (`block` / `warn` / `log`), soit bloquer et demander une reformulation en anglais, soit traduire et laisser passer avec une note.
3. **Juger** — en mode `block`, un LLM compare votre reformulation en anglais à l'original pour vérifier l'équivalence sémantique (pas seulement « est-ce de l'anglais », mais « est-ce que ça veut dire la même chose »). Une reformulation qui omet une exigence ou change le périmètre reçoit un indice et une nouvelle chance, pas la traduction complète — l'idée est de vous forcer à la produire vous-même.
4. **Enregistrer** — la paire original/anglais est ajoutée à une file JSONL locale pour une révision ultérieure.

Conçu pour être fail-open : si l'appel au LLM échoue, expire, ou si le hook lui-même lève une exception, l'entrée est laissée passer sans modification. Cet outil ne doit jamais être la raison pour laquelle votre vrai travail est bloqué.

## Installation

### Recommandé : le plugin Claude Code

Le dépôt est distribué comme un plugin natif de Claude Code (`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`), donc aucun clonage ni `npm link` n'est nécessaire :

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

Et voilà — le hook `UserPromptSubmit` est câblé automatiquement et commence à filtrer vos prompts en mode `block` (le mode par défaut).

### Manuel / CLI autonome

Cette voie reste nécessaire si vous voulez utiliser la commande `ebd` directement — `ebd x`, `ebd gate`, `ebd quiz`, `ebd review`, `ebd feynman`, `ebd web`, etc. fonctionnent entièrement en dehors de Claude Code, et l'installation du plugin ci-dessus ne place aucun binaire `ebd` dans votre `PATH`.

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

`ebd uninstall claude-code` annule l'installation du hook.

### Backend LLM

La traduction et le jugement utilisent par défaut la CLI locale `claude -p --model haiku`. Vous pouvez faire pointer `llm.command` dans `~/.english-by-default/config.json` vers n'importe quelle CLI où le dernier argument est le prompt et où la sortie standard (stdout) est la réponse (par exemple `codex exec`).

## Utilisation

```bash
ebd mode block|warn|log     # strength: block | warn | log-and-pass (default: block)
ebd stopwords list|add <w>|rm <w>   # emergency words: matching one skips the block entirely
ebd list [n]                 # show the last n original/English pairs (default 10)
ebd stats                    # queue + review stats

ebd quiz [n]                 # pop quiz: see the original, write the English from memory, LLM scores it (default 5)
ebd review                   # spaced-repetition review: only due entries, pass promotes the interval, fail demotes it
ebd feynman                  # Feynman technique: explain the idea in the simplest English you can, LLM probes for gaps
```

### Autres CLI (Codex / Grok / peu importe)

Claude Code dispose d'un hook natif. Tout le reste passe par un wrapper qui filtre les arguments non anglais avant d'invoquer l'outil réel :

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x` n'inspecte que le texte qui lui est passé *en tant qu'arguments de ligne de commande* — il ne peut rien voir de ce que vous tapez dans un REPL/TUI interactif une fois que l'outil enveloppé a démarré (cette saisie va directement vers le stdin du processus enfant). Consultez [`docs/ADAPTERS.md`](../ADAPTERS.md) pour le détail par outil, y compris quelles CLI disposent de leur propre hook natif de type `UserPromptSubmit` que vous pouvez pointer directement vers `hooks/claude-code-hook.js` au lieu d'utiliser le wrapper.

## Entrée multilingue

La détection de langue est intentionnellement basée sur **la plage Unicode de l'écriture**, et non sur un classificateur de langue générique. `src/detect.js` marque un texte comme non anglais lorsqu'il contient deux caractères ou plus provenant d'une plage Unicode non latine (CJK, Kana, Hangul, cyrillique, hébreu, arabe, devanagari, thaï). Le texte situé à l'intérieur de blocs de code délimités ou de segments de code en ligne est retiré avant le comptage, donc coller un extrait contenant des commentaires ou des chaînes dans une autre langue ne déclenche pas le portail.

Pour le texte qui déclenche effectivement le portail, la fonction `detectLanguage()` de `src/detect.js` détermine ensuite *quelle* langue il s'agit, uniquement à partir de l'écriture Unicode concernée, et `src/i18n.js` s'en sert pour localiser les messages de blocage/avertissement/indice eux-mêmes (le prompt est de toute façon traduit en anglais par le LLM ; cela n'affecte que la langue dans laquelle les messages de l'outil lui-même sont affichés). Langues prises en charge :

| Code | Langue | Écriture utilisée pour la détecter |
|---|---|---|
| `zh` | Chinois | Idéogrammes CJK, sans Kana présent |
| `ja` | Japonais | Présence de Hiragana/Katakana (permet de le distinguer du `zh`, car les Kanji chevauchent le chinois) |
| `ko` | Coréen | Hangul |
| `ru` | Russe | Cyrillique |
| `he` | Hébreu | Écriture hébraïque |
| `ar` | Arabe | Écriture arabe |
| `hi` | Hindi | Devanagari |
| `th` | Thaï | Écriture thaïe |

**Les langues à alphabet latin ne sont volontairement ni détectées ni bloquées.** L'espagnol, le français, l'allemand, le portugais, l'italien, le néerlandais et les langues similaires utilisent les mêmes lettres latines que l'anglais, donc une vérification par plage d'écriture ne peut pas les distinguer de l'anglais (ni d'un emprunt anglais accentué comme « café »). Les distinguer nécessiterait une liste de mots ou une heuristique statistique, ce qui sort volontairement du périmètre de cette fonction par conception — c'est une limitation connue et intentionnelle, pas un bug. Les prompts dans ces langues passent actuellement sans être filtrés.

## Tableau de bord web

```bash
ebd web [port]   # default port 4173
```

Démarre un tableau de bord local en lecture seule (module `http` natif de Node, sans dépendances) affichant :

- Le nombre total de paires enregistrées, le score moyen de rappel/révision, le nombre d'entrées à réviser, et une répartition par mode (`rewrite` / `warn` / `log` / `giveup` / `stopword` / ...).
- Les mots/expressions fréquents extraits de vos textes originaux enregistrés (par mot pour le texte en écriture latine, par bigrammes de caractères pour le texte de type CJK, puisqu'il n'a pas de frontières de mots naturelles sans dictionnaire).
- Les expressions récentes que le juge de naturalité a signalées comme **non** idiomatiques (`natural: false`), avec la formulation plus native suggérée par le LLM.

**Note de sécurité :** le serveur se lie uniquement à `127.0.0.1` et n'a aucune authentification. Il est destiné à être consulté depuis la même machine. Ne le placez pas derrière un port public, un tunnel, ou tout type de proxy inverse qui l'expose au réseau — quiconque peut l'atteindre peut lire tout votre historique de prompts.

## Détails

- **Jugement sémantique** — en mode `block`, le LLM compare votre reformulation en anglais à l'original sur le sens, pas seulement sur la langue (seuil par défaut : score ≥ 70, configurable via `judgeThreshold` dans `config.json`). Un décalage reçoit un indice, jamais la traduction complète, donc vous devez le trouver vous-même.
- **giveup** — tapez `giveup` à n'importe quelle invite de blocage/reformulation pour abandonner ; la traduction anglaise vous est montrée et elle est transmise, et la paire est quand même enregistrée pour révision.
- **File d'attente** — stockée dans `~/.english-by-default/queue.jsonl`, un objet JSON par ligne, limitée par défaut aux 1000 entrées les plus récentes (`queueSize` dans `config.json`).
- **Stopwords (mots-clés d'urgence)** — les entrées laissées passer via une correspondance de stopword sont enregistrées sans traduction synchrone (pour que rien ne ralentisse une véritable urgence) ; la version anglaise est renseignée paresseusement la prochaine fois que vous révisez ou testez cette entrée.
- **Fail-open** — tout échec d'appel au LLM, tout délai dépassé, ou toute exception du hook laisse passer le prompt sans modification. Cet outil ne doit jamais être la raison pour laquelle un travail légitime est bloqué.
- **Zéro dépendance**, Node.js >= 18.

## Tests

```bash
npm test
```

Exécute la suite de tests unitaires sans dépendances (`node --test test/unit.test.js`, couvrant `detect.js`, `queue.js`, `state.js`, `extractJSON` de `llm.js`, et `i18n.js`), suivie du test de fumée (`test/smoke.sh`), qui fait fonctionner l'ensemble du pipeline du hook de bout en bout face à un faux LLM (`test/fake-llm.js`) — aucun appel réel à un LLM n'est effectué.

## Licence

MIT
