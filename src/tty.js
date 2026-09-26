// 交互式终端输入:review.js 和 bin/ebd.js 共用
const readline = require("readline/promises");

function createRl() {
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

module.exports = { createRl, StdinClosed, askQuestion };
