// 学习功能:抽查 quiz / 艾宾浩斯复习 review / 费曼学习法 feynman
const readline = require("readline/promises");
const { loadQueue, updateEntry, scheduleAfterReview, dueEntries } = require("./queue");
const { translate, gradeRecall, feynmanFeedback } = require("./llm");

function rlCreate() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

// 懒翻译:stopword 放行的条目此时补上英文
function ensureEnglish(cfg, entry) {
  if (entry.english) return entry.english;
  const english = translate(cfg, entry.original);
  updateEntry(entry.id, { english });
  return english;
}

function sampleRandom(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function askRecall(cfg, rl, entry, index, total) {
  console.log(`\n[${index + 1}/${total}] 原文:`);
  console.log("  " + entry.original.replace(/\n/g, "\n  "));
  const attempt = (await rl.question("你的英文表达 (回车跳过): ")).trim();
  if (!attempt) return null;
  const english = ensureEnglish(cfg, entry);
  const g = gradeRecall(cfg, entry.original, english, attempt);
  console.log(`  📊 得分 ${g.score} — ${g.feedback}`);
  if (g.better) console.log(`  💡 更地道: ${g.better}`);
  console.log(`  📖 参考: ${english}`);
  return g;
}

// 抽查:随机抽 n 条,不影响复习排期
async function quiz(cfg, n) {
  const entries = loadQueue();
  if (!entries.length) return console.log("队列为空,先去用非英文触发几条记录吧。");
  const picked = sampleRandom(entries, Math.min(n, entries.length));
  const rl = rlCreate();
  try {
    for (let i = 0; i < picked.length; i++) {
      const g = await askRecall(cfg, rl, picked[i], i, picked.length);
      if (g) updateEntry(picked[i].id, { lastScore: g.score });
    }
  } finally {
    rl.close();
  }
  console.log("\n抽查结束。");
}

// 艾宾浩斯复习:只复习到期条目,通过升档、失败退档
async function review(cfg) {
  const due = dueEntries();
  if (!due.length) return console.log("🎉 没有到期的复习条目。用 `ebd stats` 看下次复习时间。");
  console.log(`${due.length} 条到期,开始复习。`);
  const rl = rlCreate();
  let passedCount = 0;
  try {
    for (let i = 0; i < due.length; i++) {
      const g = await askRecall(cfg, rl, due[i], i, due.length);
      const passed = g ? g.score >= cfg.judgeThreshold : false;
      if (passed) passedCount++;
      const sched = scheduleAfterReview(due[i], passed);
      updateEntry(due[i].id, { ...sched, lastScore: g ? g.score : due[i].lastScore });
    }
  } finally {
    rl.close();
  }
  console.log(`\n复习完成: ${passedCount}/${due.length} 通过。`);
}

// 费曼:挑一条,让用户用最简单的英文讲解,LLM 指出含糊处并追问
async function feynman(cfg) {
  const entries = loadQueue();
  if (!entries.length) return console.log("队列为空。");
  // 优先挑最近得分低的,没有就随机
  const weak = entries.filter((e) => e.lastScore !== null && e.lastScore < 80);
  const entry = (weak.length ? sampleRandom(weak, 1) : sampleRandom(entries, 1))[0];
  const english = ensureEnglish(cfg, entry);
  console.log("\n费曼时间。这条表达:");
  console.log("  原文: " + entry.original);
  console.log("  英文: " + english);
  const rl = rlCreate();
  try {
    const explanation = (await rl.question(
      "\n用最简单的英语,把这个意思讲给一个初学者听 (讲人话,不要背译文):\n> "
    )).trim();
    if (!explanation) return console.log("跳过。");
    const f = feynmanFeedback(cfg, entry.original, english, explanation);
    console.log(`\n📊 得分 ${f.score}`);
    if (f.gaps) console.log(`🕳 含糊/遗漏: ${f.gaps}`);
    if (f.simpler) console.log(`💡 更简单的说法: ${f.simpler}`);
    if (f.question) {
      const answer = (await rl.question(`\n❓ 追问: ${f.question}\n> `)).trim();
      if (answer) console.log("(追问回答已收到——答不上来就说明这里还没真懂,值得再看一眼。)");
    }
    updateEntry(entry.id, { lastScore: f.score });
  } finally {
    rl.close();
  }
}

module.exports = { quiz, review, feynman };
