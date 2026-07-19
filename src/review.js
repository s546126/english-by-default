// 学习功能:抽查 quiz / 艾宾浩斯复习 review / 费曼学习法 feynman
const readline = require("readline/promises");
const { loadQueue, updateEntry, scheduleAfterReview, dueEntries } = require("./queue");
const { translate, gradeRecall, feynmanFeedback } = require("./llm");

function rlCreate() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

// stdin 提前关闭(非 TTY/管道/CI,或用户按 Ctrl-D)时抛出这个,
// 而不是让 rl.question() 的 promise 永远悬空、静默 exit 0。
class StdinClosed extends Error {}

// readline/promises 的 question() 在 stdin 到达 EOF 时既不 resolve 也不 reject——
// 只有 interface 自己的 'close' 事件会触发。这里跟 'close' 赛跑,EOF 就转成显式异常。
function askQuestion(rl, prompt) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onClose = () => {
      if (!settled) { settled = true; reject(new StdinClosed("stdin closed before answering")); }
    };
    rl.once("close", onClose);
    rl.question(prompt).then((answer) => {
      if (!settled) {
        settled = true;
        rl.removeListener("close", onClose);
        resolve(answer);
      }
    }).catch((e) => {
      if (!settled) { settled = true; reject(e); }
    });
  });
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
  const attempt = (await askQuestion(rl, "你的英文表达 (回车跳过): ")).trim();
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
  } catch (e) {
    if (!(e instanceof StdinClosed)) throw e;
    console.log("\n(输入流已关闭,抽查中断。)");
    process.exitCode = 1;
    return;
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
  let skippedCount = 0;
  let i = 0;
  try {
    for (; i < due.length; i++) {
      const g = await askRecall(cfg, rl, due[i], i, due.length);
      // 回车跳过(g === null)不等于答错:用户根本没作答,不该按"挂了"退档,
      // 否则赶时间连按回车跳过会把所有到期项目都误判为失败并降级排期。
      // 跳过就保持原排期不变,下次 review 它还会到期,重新出现。
      if (g === null) {
        skippedCount++;
        continue;
      }
      const passed = g.score >= cfg.judgeThreshold;
      if (passed) passedCount++;
      const sched = scheduleAfterReview(due[i], passed);
      updateEntry(due[i].id, { ...sched, lastScore: g.score });
    }
  } catch (e) {
    if (!(e instanceof StdinClosed)) throw e;
    console.log(`\n(输入流已关闭,复习中断于第 ${i + 1}/${due.length} 条。)`);
    process.exitCode = 1;
    return;
  } finally {
    rl.close();
  }
  console.log(`\n复习完成: ${passedCount}/${due.length} 通过,跳过 ${skippedCount} 条(排期不变)。`);
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
    const explanation = (await askQuestion(
      rl,
      "\n用最简单的英语,把这个意思讲给一个初学者听 (讲人话,不要背译文):\n> "
    )).trim();
    if (!explanation) return console.log("跳过。");
    const f = feynmanFeedback(cfg, entry.original, english, explanation);
    console.log(`\n📊 得分 ${f.score}`);
    if (f.gaps) console.log(`🕳 含糊/遗漏: ${f.gaps}`);
    if (f.simpler) console.log(`💡 更简单的说法: ${f.simpler}`);
    if (f.question) {
      const answer = (await askQuestion(rl, `\n❓ 追问: ${f.question}\n> `)).trim();
      if (answer) console.log("(追问回答已收到——答不上来就说明这里还没真懂,值得再看一眼。)");
    }
    updateEntry(entry.id, { lastScore: f.score });
  } catch (e) {
    if (!(e instanceof StdinClosed)) throw e;
    console.log("\n(输入流已关闭,费曼练习中断。)");
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

module.exports = { quiz, review, feynman };
