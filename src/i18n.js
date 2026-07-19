// 多语言消息表:给 gate.js 的拦截/放弃/语义不一致/紧急词放行/warn 提示
// 提供本地化文案。语言由 detect.js 的 detectLanguage() 基于 Unicode 脚本
// 区间判定,只覆盖 zh/ja/ko/ru/ar/he/hi/th 这 8 种;拉丁字母语系
// (西班牙语/法语/...) 永远判不出来,落到下面的 en 兜底,是刻意行为。
const MESSAGES = {
  en: {
    blockHeader: "🛡 English by Default — Non-English input detected, blocked.",
    rewritePrompt: "Please rephrase the same meaning in English (the LLM will judge semantic equivalence before allowing it through).",
    giveupHint: "Type giveup to give up — you'll get the English phrasing and continue automatically.",
    stillNonEnglish: "🛡 Still not English. Please rewrite this sentence in English:\n\"{original}\"",
    mismatchPrefix: "🛡 Meaning still doesn't match (score {score}).\nHint: {hint}\nKeep rewriting in English, or type giveup to give up.",
    matchOk: "✅ english-by-default: Meaning matches (score {score}). Pair logged to queue.",
    stopwordBypass: "⚡ english-by-default: Emergency stopword matched, block skipped (logged, you can translate later).",
    warnPrefix: "⚠️ english-by-default: Non-English input (warn mode, logged). English version: {english}",
    giveupResult: "🏳 giveup — English phrasing: {english}",
    giveupTranslateFailed: "english-by-default: Translation failed, allowed the original through.",
    judgeServiceDown: "english-by-default: Judge service unavailable, allowed through (fail-open).",
    hintFallback: "think about what might be missing",
    translationFailedShort: "translation failed"
  },
  zh: {
    blockHeader: "🛡 English by Default — 检测到非英文输入，已拦截。",
    rewritePrompt: "请用英文重新表达同样的意思（LLM 会判断语义是否一致，一致才放行）。",
    giveupHint: "想放弃就输入 giveup，会给出英文表达并自动继续。",
    stillNonEnglish: "🛡 还是非英文。请用英文重写这句话：\n「{original}」",
    mismatchPrefix: "🛡 语义还不一致 (score {score})。\n提示: {hint}\n继续用英文重写，或输入 giveup 放弃。",
    matchOk: "✅ english-by-default: 语义一致 (score {score})。对照已入队。",
    stopwordBypass: "⚡ english-by-default: 命中紧急词，跳过拦截（已记录，可稍后补翻译）。",
    warnPrefix: "⚠️ english-by-default: 非英文输入（warn 模式，已记录）。英文版: {english}",
    giveupResult: "🏳 giveup — 英文表达: {english}",
    giveupTranslateFailed: "english-by-default: 翻译失败，已放行原文。",
    judgeServiceDown: "english-by-default: 判定服务异常，fail-open 放行。",
    hintFallback: "再想想缺了什么",
    translationFailedShort: "翻译失败"
  },
  ja: {
    blockHeader: "🛡 English by Default — 英語以外の入力を検知し、ブロックしました。",
    rewritePrompt: "同じ意味を英語で表現し直してください（LLM が意味が一致するか判定し、一致すれば通過します）。",
    giveupHint: "諦める場合は giveup と入力してください。英語表現が提示され、自動的に続行します。",
    stillNonEnglish: "🛡 まだ英語ではありません。この文を英語で書き直してください：\n「{original}」",
    mismatchPrefix: "🛡 意味がまだ一致しません (score {score})。\nヒント: {hint}\n英語での書き直しを続けるか、giveup と入力して諦めてください。",
    matchOk: "✅ english-by-default: 意味が一致しました (score {score})。対応をキューに記録しました。",
    stopwordBypass: "⚡ english-by-default: 緊急ワードを検知、ブロックをスキップしました（記録済み、後で翻訳可能）。",
    warnPrefix: "⚠️ english-by-default: 英語以外の入力です（warnモード、記録済み）。英語版: {english}",
    giveupResult: "🏳 giveup — 英語表現: {english}",
    giveupTranslateFailed: "english-by-default: 翻訳に失敗したため、原文のまま通過させました。",
    judgeServiceDown: "english-by-default: 判定サービスが異常なため、fail-openで通過させました。",
    hintFallback: "何が足りないか考えてみてください",
    translationFailedShort: "翻訳失敗"
  },
  ko: {
    blockHeader: "🛡 English by Default — 비영어 입력이 감지되어 차단되었습니다.",
    rewritePrompt: "같은 의미를 영어로 다시 표현해 주세요 (LLM이 의미가 일치하는지 판단한 후 통과시킵니다).",
    giveupHint: "포기하려면 giveup 을 입력하세요. 영어 표현을 제시하고 자동으로 계속 진행합니다.",
    stillNonEnglish: "🛡 아직 영어가 아닙니다. 이 문장을 영어로 다시 써주세요:\n「{original}」",
    mismatchPrefix: "🛡 의미가 아직 일치하지 않습니다 (score {score}).\n힌트: {hint}\n영어로 계속 다시 작성하거나, giveup 을 입력해 포기하세요.",
    matchOk: "✅ english-by-default: 의미가 일치합니다 (score {score}). 대조 내용을 큐에 기록했습니다.",
    stopwordBypass: "⚡ english-by-default: 긴급 단어가 감지되어 차단을 건너뛰었습니다 (기록됨, 나중에 번역 가능).",
    warnPrefix: "⚠️ english-by-default: 비영어 입력입니다 (warn 모드, 기록됨). 영어 버전: {english}",
    giveupResult: "🏳 giveup — 영어 표현: {english}",
    giveupTranslateFailed: "english-by-default: 번역에 실패하여 원문을 그대로 통과시켰습니다.",
    judgeServiceDown: "english-by-default: 판정 서비스 이상으로 fail-open 처리되어 통과되었습니다.",
    hintFallback: "무엇이 빠졌는지 다시 생각해 보세요",
    translationFailedShort: "번역 실패"
  },
  ru: {
    blockHeader: "🛡 English by Default — обнаружен неанглийский ввод, заблокировано.",
    rewritePrompt: "Пожалуйста, выразите ту же мысль на английском (LLM проверит соответствие смысла и только тогда пропустит).",
    giveupHint: "Чтобы сдаться, введите giveup — будет показан английский вариант, и работа продолжится автоматически.",
    stillNonEnglish: "🛡 Всё ещё не английский. Перепишите эту фразу на английском:\n«{original}»",
    mismatchPrefix: "🛡 Смысл всё ещё не совпадает (score {score}).\nПодсказка: {hint}\nПродолжайте переписывать на английском, или введите giveup, чтобы сдаться.",
    matchOk: "✅ english-by-default: смысл совпадает (score {score}). Пара сохранена в очереди.",
    stopwordBypass: "⚡ english-by-default: обнаружено экстренное слово, блокировка пропущена (записано, перевод можно добавить позже).",
    warnPrefix: "⚠️ english-by-default: неанглийский ввод (режим warn, записано). Английская версия: {english}",
    giveupResult: "🏳 giveup — английский вариант: {english}",
    giveupTranslateFailed: "english-by-default: перевод не удался, пропущен оригинал.",
    judgeServiceDown: "english-by-default: служба проверки недоступна, пропущено (fail-open).",
    hintFallback: "подумайте, чего не хватает",
    translationFailedShort: "перевод не удался"
  },
  he: {
    blockHeader: "🛡 English by Default — זוהה קלט שאינו אנגלית, נחסם.",
    rewritePrompt: "נא לנסח מחדש את אותה משמעות באנגלית (ה-LLM יבדוק התאמה סמנטית, ורק אז יאפשר להמשיך).",
    giveupHint: "כדי לוותר, הקליד/י giveup — תוצג הניסוח באנגלית וההמשך יתבצע אוטומטית.",
    stillNonEnglish: "🛡 עדיין לא אנגלית. נא לנסח מחדש באנגלית:\n„{original}”",
    mismatchPrefix: "🛡 המשמעות עדיין לא תואמת (score {score}).\nרמז: {hint}\nהמשיכו לנסח באנגלית, או הקלידו giveup כדי לוותר.",
    matchOk: "✅ english-by-default: המשמעות תואמת (score {score}). הזוג נשמר בתור.",
    stopwordBypass: "⚡ english-by-default: זוהתה מילת חירום, החסימה דולגה (נרשם, ניתן לתרגם מאוחר יותר).",
    warnPrefix: "⚠️ english-by-default: קלט שאינו אנגלית (מצב warn, נרשם). גרסה באנגלית: {english}",
    giveupResult: "🏳 giveup — ניסוח באנגלית: {english}",
    giveupTranslateFailed: "english-by-default: התרגום נכשל, המקור הועבר כפי שהוא.",
    judgeServiceDown: "english-by-default: שירות השיפוט אינו זמין, הועבר במצב fail-open.",
    hintFallback: "חשבו מה חסר",
    translationFailedShort: "התרגום נכשל"
  },
  ar: {
    blockHeader: "🛡 English by Default — تم اكتشاف إدخال غير إنجليزي، وتم الحظر.",
    rewritePrompt: "يرجى إعادة صياغة نفس المعنى بالإنجليزية (سيتحقق النموذج من التكافؤ الدلالي، ولن يسمح بالمرور إلا عند التطابق).",
    giveupHint: "للتنازل، اكتب giveup — سيتم عرض الصياغة الإنجليزية والمتابعة تلقائيًا.",
    stillNonEnglish: "🛡 ما زال النص غير إنجليزي. يرجى إعادة كتابة هذه الجملة بالإنجليزية:\n«{original}»",
    mismatchPrefix: "🛡 المعنى لا يزال غير متطابق (score {score}).\nتلميح: {hint}\nتابع إعادة الصياغة بالإنجليزية، أو اكتب giveup للتنازل.",
    matchOk: "✅ english-by-default: المعنى متطابق (score {score}). تم تسجيل الزوج في القائمة.",
    stopwordBypass: "⚡ english-by-default: تم رصد كلمة طارئة، تم تجاوز الحظر (تم التسجيل، يمكن الترجمة لاحقًا).",
    warnPrefix: "⚠️ english-by-default: إدخال غير إنجليزي (وضع warn، تم التسجيل). النسخة الإنجليزية: {english}",
    giveupResult: "🏳 giveup — الصياغة الإنجليزية: {english}",
    giveupTranslateFailed: "english-by-default: فشلت الترجمة، تم تمرير النص الأصلي كما هو.",
    judgeServiceDown: "english-by-default: خدمة التقييم غير متاحة، تم التمرير (fail-open).",
    hintFallback: "فكر فيما قد يكون ناقصًا",
    translationFailedShort: "فشلت الترجمة"
  },
  hi: {
    blockHeader: "🛡 English by Default — गैर-अंग्रेज़ी इनपुट मिला, ब्लॉक कर दिया गया।",
    rewritePrompt: "कृपया वही अर्थ अंग्रेज़ी में दोबारा लिखें (LLM यह जांचेगा कि अर्थ समान है या नहीं, तभी आगे बढ़ने दिया जाएगा)।",
    giveupHint: "छोड़ना हो तो giveup लिखें — अंग्रेज़ी अनुवाद दिखा दिया जाएगा और अपने आप आगे बढ़ जाएगा।",
    stillNonEnglish: "🛡 अभी भी अंग्रेज़ी नहीं है। कृपया इस वाक्य को अंग्रेज़ी में दोबारा लिखें:\n“{original}”",
    mismatchPrefix: "🛡 अर्थ अभी भी मेल नहीं खाता (score {score})।\nसंकेत: {hint}\nअंग्रेज़ी में दोबारा लिखते रहें, या छोड़ने के लिए giveup लिखें।",
    matchOk: "✅ english-by-default: अर्थ मेल खाता है (score {score})। जोड़ी कतार में दर्ज कर दी गई।",
    stopwordBypass: "⚡ english-by-default: आपातकालीन शब्द मिला, ब्लॉक छोड़ दिया गया (दर्ज कर लिया गया, बाद में अनुवाद कर सकते हैं)।",
    warnPrefix: "⚠️ english-by-default: गैर-अंग्रेज़ी इनपुट (warn मोड, दर्ज कर लिया गया)। अंग्रेज़ी संस्करण: {english}",
    giveupResult: "🏳 giveup — अंग्रेज़ी अनुवाद: {english}",
    giveupTranslateFailed: "english-by-default: अनुवाद विफल रहा, मूल पाठ को वैसे ही आगे बढ़ने दिया गया।",
    judgeServiceDown: "english-by-default: जांच सेवा में गड़बड़ी है, fail-open मोड में आगे बढ़ने दिया गया।",
    hintFallback: "सोचिए कि क्या छूट गया",
    translationFailedShort: "अनुवाद विफल"
  },
  th: {
    blockHeader: "🛡 English by Default — ตรวจพบข้อความที่ไม่ใช่ภาษาอังกฤษ ถูกบล็อกแล้ว",
    rewritePrompt: "กรุณาเขียนความหมายเดียวกันใหม่เป็นภาษาอังกฤษ (LLM จะตรวจสอบว่าความหมายตรงกันหรือไม่ ก่อนจะปล่อยผ่าน)",
    giveupHint: "หากต้องการยกเลิก ให้พิมพ์ giveup ระบบจะแสดงคำแปลภาษาอังกฤษและดำเนินการต่อโดยอัตโนมัติ",
    stillNonEnglish: "🛡 ยังไม่ใช่ภาษาอังกฤษ กรุณาเขียนประโยคนี้ใหม่เป็นภาษาอังกฤษ:\n“{original}”",
    mismatchPrefix: "🛡 ความหมายยังไม่ตรงกัน (score {score})\nคำใบ้: {hint}\nเขียนใหม่เป็นภาษาอังกฤษต่อไป หรือพิมพ์ giveup เพื่อยกเลิก",
    matchOk: "✅ english-by-default: ความหมายตรงกัน (score {score}) บันทึกคู่ข้อความลงคิวแล้ว",
    stopwordBypass: "⚡ english-by-default: พบคำฉุกเฉิน ข้ามการบล็อก (บันทึกไว้แล้ว แปลภายหลังได้)",
    warnPrefix: "⚠️ english-by-default: ข้อความไม่ใช่ภาษาอังกฤษ (โหมด warn บันทึกไว้แล้ว) ฉบับภาษาอังกฤษ: {english}",
    giveupResult: "🏳 giveup — คำแปลภาษาอังกฤษ: {english}",
    giveupTranslateFailed: "english-by-default: แปลไม่สำเร็จ ปล่อยข้อความต้นฉบับผ่านไป",
    judgeServiceDown: "english-by-default: บริการตรวจสอบขัดข้อง ปล่อยผ่านแบบ fail-open",
    hintFallback: "ลองคิดดูว่าขาดอะไรไป",
    translationFailedShort: "แปลไม่สำเร็จ"
  }
};

// t(lang, key, vars): 取本地化文案,支持 {varName} 占位符替换。
// lang 为 null 或不在表里(拉丁字母语系永远如此)时落到 en 兜底。
function t(lang, key, vars) {
  const table = MESSAGES[lang] || MESSAGES.en;
  let str = table[key] !== undefined ? table[key] : MESSAGES.en[key];
  if (!str) return "";
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? "" : vars[k]));
  }
  return str;
}

module.exports = { t, MESSAGES };
