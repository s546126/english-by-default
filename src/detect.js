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

// 判定:非拉丁文字 >= 2 即视为非英文输入
function isNonEnglish(text) {
  if (!text) return false;
  return countNonLatin(text) >= 2;
}

function hasStopword(text, stopwords) {
  const lower = text.toLowerCase();
  return stopwords.some((w) => w && lower.includes(w.toLowerCase()));
}

function isGiveup(text, giveupWords) {
  const t = text.trim().toLowerCase();
  return giveupWords.some((w) => t === w.toLowerCase());
}

module.exports = { isNonEnglish, countNonLatin, countLatinLetters, hasStopword, isGiveup };
