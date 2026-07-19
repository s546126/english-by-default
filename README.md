# Watch This Plugin Turn Me Into a Native English Speaker

![CI](https://github.com/s546126/english-by-default/actions/workflows/ci.yml/badge.svg)

This plugin stops you from typing prompts to your AI CLI in any language but English. It can block your non-English text, warn you and translate it, or just log it quietly — you pick the mode. When it blocks you, you rewrite your prompt in English yourself, or type `giveup` to see the English version and move on. Every pair it collects goes into a review queue, so later you can quiz yourself, do spaced-repetition review, or explain a phrase back in simple English (the Feynman way). There's also a small local web dashboard that shows your common mistakes and most-used words.

## Quick start

**Claude Code:**

```
/plugin marketplace add s546126/english-by-default
/plugin install english-by-default@english-by-default
```

**Codex, Grok, oh-my-pi, or any other AI CLI:** install the `ebd` command, then put it in front of your tool.

```bash
git clone https://github.com/s546126/english-by-default.git && cd english-by-default && npm link
ebd x codex exec "your prompt"   # or: ebd x grok "...", ebd x omp "...", etc.
```

Exact steps per tool (including which ones have a native hook instead of the wrapper) are in [docs/ADAPTERS.md](docs/ADAPTERS.md).

## Pick your language — this page won't block you

- [English, the language this whole tool is obsessed with](docs/readme/en.md)
- [四六级过了，开口卡了。](docs/readme/zh.md)
- [中高6年も英語を習ったのに、本番になると「あの…」しか出てこない。](docs/readme/ja.md)
- [영어 공부는 오늘도 작심삼일](docs/readme/ko.md)
- [Английский — со словарём. Тут можно без.](docs/readme/ru.md)
- [احكي عربي... مش فرانكو](docs/readme/ar.md)
- [Aquí nadie te obliga a nada — bastante tenemos ya con el subjuntivo.](docs/readme/es.md)
- [Aqui seu inglês pode parar no "the book is on the table" mesmo.](docs/readme/pt.md)
- [Un village peuplé d'irréductibles Gaulois résiste encore à l'anglais.](docs/readme/fr.md)
- [Hier bitte auf Deutsch bleiben – bevor wir wie immer ins Englische abdriften.](docs/readme/de.md)
- [Qui doppiamo tutto in italiano, pure l'inglese di questo plugin.](docs/readme/it.md)
- [Doe maar Nederlands, dan doe je al gek genoeg](docs/readme/nl.md)
- [הדף היחיד שלא מכריח אתכם לכתוב משמאל לימין](docs/readme/he.md)
- [यहाँ अंग्रेज़ी झाड़ने की ज़बरदस्ती नहीं — हिंदी में भी झाड़ सकते हैं!](docs/readme/hi.md)
- [พูดไทยคำ อังกฤษคำ มาตั้งแต่เกิด จะมาบล็อกตอนนี้ทำไม](docs/readme/th.md)

The English page is the full manual. It covers install (including the manual/standalone CLI path), every command, exactly which languages get detected, the web dashboard, and more.

## License

MIT
