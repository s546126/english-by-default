⬅️ חזרה אל [README.md](../../README.md) הראשי · קרא את המדריך הזה בשפה אחרת:
[en](en.md) · [zh](zh.md) · [ja](ja.md) · [ko](ko.md) · [ru](ru.md) · [ar](ar.md) · [es](es.md) · [pt](pt.md) · [fr](fr.md) · [de](de.md) · [it](it.md) · [nl](nl.md) · **he** (עברית, אתה כאן) · [hi](hi.md) · [th](th.md)

---

# English by Default

"שער אנגלית" לכלי שורת פקודה מבוססי בינה מלאכותית. הכלי מיירט כל prompt שאינו באנגלית לפני שהוא מגיע למודל, מכריח אותך לנסח אותו מחדש באנגלית בעצמך (או לוותר ולקבל את התרגום המוכן), והופך כל זוג טקסטים שהוא אוסף - המקורי מול הגרסה האנגלית - לתרגול בשיטת החזרה המרווחת (spaced repetition) ובטכניקת פיינמן (Feynman technique).

עובד באופן טבעי עם Claude Code, וגם עם כל כלי CLI מבוסס בינה מלאכותית אחר (Codex, Grok, ...) באמצעות פקודת עטיפה (wrapper) קטנה.

## איך זה עובד

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

כל prompt שמיורט עובר את אותו צינור עיבוד (pipeline):

1. **זיהוי (Detect)** — האם הטקסט אינו באנגלית? (`src/detect.js`, ראו את הפרק [קלט רב-לשוני](#multi-language-input) בהמשך להגדרה המדויקת של מה נחשב "לא אנגלית".)
2. **החלטה (Decide)** — בהתאם למצב הנוכחי (`block` / `warn` / `log`), הכלי או חוסם את הקלט ומבקש ניסוח מחדש באנגלית, או מתרגם אותו ומאפשר לו לעבור בצירוף הערה.
3. **שיפוט (Judge)** — במצב `block`, הניסוח האנגלי שלך מושווה לטקסט המקורי על ידי LLM לבדיקת שקילות סמנטית (לא רק "האם זו אנגלית", אלא "האם זו אותה משמעות"). ניסוח שמשמיט דרישה כלשהי או משנה את ההיקף מקבל רמז והזדמנות נוספת, לא את התרגום המלא - המטרה היא שתגיע לניסוח בעצמך.
4. **תיעוד (Log)** — הזוג מקורי/אנגלי מתווסף לתור JSONL מקומי לצורך סקירה מאוחרת יותר.

הכלי מתוכנן לפעול לפי עקרון "כשל פתוח" (fail-open): אם קריאת ה-LLM נכשלת, חורגת מזמן ההמתנה, או שה-hook עצמו זורק שגיאה, הקלט מועבר ללא שינוי. הכלי הזה לעולם לא אמור להיות הסיבה לכך שהעבודה האמיתית שלך נחסמת.

## התקנה

### מומלץ: תוסף (plugin) ל-Claude Code

המאגר (repository) מגיע כתוסף (plugin) טבעי ל-Claude Code (`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` + `hooks/hooks.json`), כך שאין צורך לשכפל (clone) את המאגר או להריץ `npm link`:

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

זהו - ה-hook מסוג `UserPromptSubmit` מחובר אוטומטית ומתחיל לשמור על ה-prompts שלך במצב `block` (ברירת המחדל).

### התקנה ידנית / CLI עצמאי

עדיין תזדקק למסלול הזה אם ברצונך להשתמש בפקודה `ebd` ישירות - פקודות כמו `ebd x`, `ebd gate`, `ebd quiz`, `ebd review`, `ebd feynman`, `ebd web` וכו' פועלות לגמרי מחוץ ל-Claude Code, וההתקנה של התוסף שלמעלה אינה מציבה קובץ הרצה (binary) בשם `ebd` על ה-`PATH` שלך.

```bash
git clone https://github.com/s546126/english-by-default.git
cd english-by-default
npm link                  # gives you the global `ebd` command
ebd install claude-code    # writes a UserPromptSubmit hook into ~/.claude/settings.json
```

הפקודה `ebd uninstall claude-code` מבטלת את התקנת ה-hook.

### מנוע ה-LLM (LLM backend)

התרגום והשיפוט מסתמכים כברירת מחדל על כלי ה-CLI המקומי `claude -p --model haiku`. אפשר להצביע עם `llm.command` בקובץ `~/.english-by-default/config.json` לכל CLI שבו הארגומנט האחרון הוא ה-prompt והפלט (stdout) הוא התשובה (למשל `codex exec`).

## שימוש

```bash
ebd mode block|warn|log     # strength: block | warn | log-and-pass (default: block)
ebd stopwords list|add <w>|rm <w>   # emergency words: matching one skips the block entirely
ebd list [n]                 # show the last n original/English pairs (default 10)
ebd stats                    # queue + review stats

ebd quiz [n]                 # pop quiz: see the original, write the English from memory, LLM scores it (default 5)
ebd review                   # spaced-repetition review: only due entries, pass promotes the interval, fail demotes it
ebd feynman                  # Feynman technique: explain the idea in the simplest English you can, LLM probes for gaps
```

### כלי CLI אחרים (Codex / Grok / כל אחד)

ל-Claude Code יש hook טבעי משלו. כל השאר פועל דרך עטיפה (wrapper) שבודקת ארגומנטים שאינם באנגלית לפני הפעלת הכלי האמיתי:

```bash
ebd x codex exec "帮我把这个接口改成分页的"
ebd x grok "解释一下这段代码"
ebd gate "帮我写个爬虫"     # non-interactive: prints the English version and logs the pair, good for scripts
```

`ebd x` בודק רק טקסט שמועבר אליו *כארגומנטים בשורת הפקודה* - הוא לא יכול לראות שום דבר שאתה מקליד לתוך REPL/TUI אינטראקטיבי לאחר שהכלי העטוף כבר החל לפעול (הקלט הזה הולך ישירות ל-stdin של תהליך הבן). ראו את [`docs/ADAPTERS.md`](../ADAPTERS.md) לפרטים ספציפיים לכל כלי, כולל אילו כלי CLI כוללים hook טבעי משלהם בסגנון `UserPromptSubmit` שאפשר להצביע ישירות אל `hooks/claude-code-hook.js` במקום להשתמש בעטיפה.

<a id="multi-language-input"></a>
## קלט רב-לשוני

זיהוי השפה מבוסס בכוונה על **טווחי Unicode של כתבים (script)**, ולא על מסווג שפה כללי. `src/detect.js` מסמן טקסט כלא-אנגלי כאשר הוא מכיל שני תווים או יותר מטווח Unicode שאינו לטיני (CJK, קאנה, האנגול, קירילית, עברית, ערבית, דוונאגרי, תאית). טקסט בתוך בלוקים גדורים (fenced code blocks) או קטעי קוד מוטבעים (inline code) מוסר לפני הספירה, כך שהדבקת קטע קוד עם הערות או מחרוזות שאינן באנגלית לא תפעיל את השער.

עבור טקסט שכן מפעיל את השער, הפונקציה `detectLanguage()` בתוך `src/detect.js` מצמצמת עוד יותר ומזהה *איזו* שפה מדובר, בהתבסס אך ורק על טווח ה-Unicode המעורב, ו-`src/i18n.js` משתמש בכך כדי לתרגם (localize) את הודעות ה-block/warn/hint עצמן (ה-prompt עדיין מתורגם לאנגלית על ידי ה-LLM בכל מקרה - זה משפיע רק על השפה שבה מוצגות הודעות הכלי עצמו). השפות הנתמכות:

| קוד | שפה | הכתב המשמש לזיהוי |
|---|---|---|
| `zh` | סינית | הירוגליפים CJK, ללא נוכחות קאנה |
| `ja` | יפנית | נוכחות הירגאנה/קטקנה (מבחין מ-`zh`, מכיוון שקאנג'י חופף לסינית) |
| `ko` | קוריאנית | האנגול |
| `ru` | רוסית | קירילית |
| `he` | עברית | כתב עברי |
| `ar` | ערבית | כתב ערבי |
| `hi` | הינדי | דוונאגרי |
| `th` | תאית | כתב תאי |

**שפות בעלות אלפבית לטיני אינן מזוהות או נחסמות בכוונה תחילה.** ספרדית, צרפתית, גרמנית, פורטוגזית, איטלקית, הולנדית ושפות דומות משתמשות באותן אותיות לטיניות כמו האנגלית, כך שבדיקה מבוססת-טווח-כתב אינה יכולה להבחין ביניהן לבין אנגלית (או מילה שאולה עם סימן דיאקריטי כמו "café"). הבחנה כזו הייתה דורשת רשימת מילים או היוריסטיקה סטטיסטית, מה שנמצא מחוץ לתחום של הפונקציה הזו במכוון - זוהי מגבלה ידועה ומכוונת, לא באג. Prompts בשפות אלו עוברים כרגע ללא בדיקה.

## לוח בקרה (dashboard) בווב

```bash
ebd web [port]   # default port 4173
```

מפעיל לוח בקרה מקומי לקריאה בלבד (מודול `http` הרגיל של Node, ללא תלויות) המציג:

- סך כל הזוגות שתועדו, ציון ממוצע של זכירה/סקירה, כמה רשומות ממתינות לסקירה, ופילוח לפי מצב (`rewrite` / `warn` / `log` / `giveup` / `stopword` / ...).
- מילים/ביטויים נפוצים שנשלפים מהטקסטים המקוריים שתועדו (מבוסס-מילים עבור טקסט בכתב לטיני, מבוסס-זוגות-תווים (character-bigram) עבור טקסט מסוג CJK, מכיוון שאין לו גבולות מילים טבעיים ללא מילון).
- ביטויים אחרונים ששופט הטבעיות סימן כ**לא** אידיומטיים (`natural: false`), יחד עם הניסוח הטבעי יותר שה-LLM מציע.

**הערת אבטחה:** השרת מאזין רק ל-`127.0.0.1` ואין לו שום מנגנון אימות (authentication). הוא מיועד לצפייה מאותו המחשב בלבד. אל תציבו אותו מאחורי פורט ציבורי, מנהרה (tunnel), או כל reverse proxy שחושף אותו לרשת - כל מי שיכול להגיע אליו יכול לקרוא את כל היסטוריית ה-prompts שלכם.

## פרטים נוספים

- **שיפוט סמנטי (Semantic judging)** — במצב `block`, הניסוח האנגלי שלך מושווה לטקסט המקורי על ידי ה-LLM מבחינת המשמעות, לא רק השפה (סף ברירת מחדל: ציון ≥ 70, ניתן להגדרה דרך `judgeThreshold` בקובץ `config.json`). אי-התאמה מקבלת רמז, לעולם לא את התרגום המלא, כך שאתה חייב להגיע לפתרון בעצמך.
- **giveup** — הקלד `giveup` בכל שלב של חסימה/ניסוח מחדש כדי לפרוש; תוצג לך התרגום לאנגלית והוא יישלח הלאה, והזוג עדיין יתועד לסקירה.
- **תור (Queue)** — נשמר בנתיב `~/.english-by-default/queue.jsonl`, אובייקט JSON אחד בכל שורה, מוגבל כברירת מחדל ל-1000 הרשומות האחרונות (`queueSize` בקובץ `config.json`).
- **מילות עצירה (Stopwords)** — רשומות שעוברות בזכות התאמה למילת עצירה מתועדות ללא תרגום סינכרוני (כדי שדבר לא יאט מקרה חירום אמיתי); הגרסה האנגלית מתמלאת באופן עצל (lazily) בפעם הבאה שאתה סוקר או נבחן על אותה רשומה.
- **כשל פתוח (Fail-open)** — כל כשל בקריאת LLM, חריגת זמן, או חריגה (exception) ב-hook מאפשרים למעבר ה-prompt ללא שינוי. הכלי הזה חייב לעולם לא להיות הסיבה לכך שעבודה לגיטימית נחסמת.
- **אפס תלויות (Zero dependencies)**, Node.js בגרסה 18 ומעלה.

## בדיקות

```bash
npm test
```

מריץ את חבילת בדיקות היחידה (unit tests) חסרת התלויות (`node --test test/unit.test.js`, המכסה את `detect.js`, `queue.js`, `state.js`, את `extractJSON` מתוך `llm.js`, ואת `i18n.js`), ולאחריה את בדיקת העשן (smoke test, `test/smoke.sh`), שמריצה את כל צינור ה-hook מקצה לקצה מול LLM מדומה (`test/fake-llm.js`) - ללא שום קריאות אמיתיות ל-LLM.

## רישיון

MIT
