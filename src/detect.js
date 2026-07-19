// 非英文检测:统计非拉丁文字字符
const NON_LATIN_RANGES = [
  [0x3400, 0x4dbf],  // CJK 扩展 A
  [0x4e00, 0x9fff],  // CJK 统一汉字
  [0xf900, 0xfaff],  // CJK 兼容
  [0x3040, 0x309f],  // 平假名
  [0x30a0, 0x30ff],  // 片假名
  [0xac00, 0xd7af],  // 谚文
  [0x0400, 0x04ff],  // 西里尔
  [0x0590, 0x05ff],  // 希伯来
  [0x0600, 0x06ff],  // 阿拉伯
  [0x0900, 0x097f],  // 天城文
  [0x0e00, 0x0e7f]   // 泰文
];

function countNonLatin(text) {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    for (const [lo, hi] of NON_LATIN_RANGES) {
      if (cp >= lo && cp <= hi) { n++; break; }
    }
  }
  return n;
}

function countLatinLetters(text) {
  const m = text.match(/[a-zA-Z]/g);
  return m ? m.length : 0;
}

// 剥掉围栏代码块 ``` ... ``` 和行内代码 `...`:用户粘贴的日志/代码/本地化字符串
// 不代表"用户自己在说非英文",不该被算进非英文判定,否则一句纯英文请求
// 会因为贴了一段中文注释的代码就被整体拦截,陷入无法"翻译"代码的死胡同。
function stripQuoted(text) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
}

// 判定:非拉丁文字 >= 2 即视为非英文输入(不含引用/代码块里的内容)
function isNonEnglish(text) {
  if (!text) return false;
  return countNonLatin(stripQuoted(text)) >= 2;
}

function hasStopword(text, stopwords) {
  const lower = text.toLowerCase();
  return stopwords.some((w) => w && lower.includes(w.toLowerCase()));
}

function isGiveup(text, giveupWords) {
  const t = text.trim().toLowerCase();
  return giveupWords.some((w) => t === w.toLowerCase());
}

// 用 Unicode 脚本区间猜测非英文文本使用的语言,只覆盖"文字系统本身就能
// 近乎零误判地标识语言"的情况:CJK 表意文字(汉字)本身中日共用,靠平假名/
// 片假名的存在来消歧;谚文、西里尔、希伯来、阿拉伯、天城文、泰文各自是
// 单一语言专用的文字系统,命中即可判定。
// 刻意不做拉丁字母语系(西班牙语/法语/德语/...)的识别:拉丁字母本身
// 不能区分语言,那需要词表/统计之类的启发式,不在这个函数的职责范围内 ——
// 这些语言目前就是返回 null,是已知且刻意的局限,不是 bug。
function detectLanguage(text) {
  if (!text) return null;
  let hasCJK = false;
  let hasKana = false;
  let hasHangul = false;
  let hasCyrillic = false;
  let hasHebrew = false;
  let hasArabic = false;
  let hasDevanagari = false;
  let hasThai = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)) {
      hasCJK = true;
    } else if ((cp >= 0x3040 && cp <= 0x309f) || (cp >= 0x30a0 && cp <= 0x30ff)) {
      hasKana = true;
    } else if (cp >= 0xac00 && cp <= 0xd7af) {
      hasHangul = true;
    } else if (cp >= 0x0400 && cp <= 0x04ff) {
      hasCyrillic = true;
    } else if (cp >= 0x0590 && cp <= 0x05ff) {
      hasHebrew = true;
    } else if (cp >= 0x0600 && cp <= 0x06ff) {
      hasArabic = true;
    } else if (cp >= 0x0900 && cp <= 0x097f) {
      hasDevanagari = true;
    } else if (cp >= 0x0e00 && cp <= 0x0e7f) {
      hasThai = true;
    }
  }
  if (hasCJK || hasKana) return hasKana ? "ja" : "zh";
  if (hasHangul) return "ko";
  if (hasCyrillic) return "ru";
  if (hasHebrew) return "he";
  if (hasArabic) return "ar";
  if (hasDevanagari) return "hi";
  if (hasThai) return "th";
  return null;
}

module.exports = { isNonEnglish, countNonLatin, countLatinLetters, hasStopword, isGiveup, detectLanguage };
