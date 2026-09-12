"use strict";
/* 会闪的格子:亮/暗每帧交替 → 不能被当成已选走,也不能触发"已落子";真选走的(一直黑)照常认 */
const { Worker } = require("worker_threads"); const S = require("./synth.js");
const w = new Worker(require("path").join(__dirname, "..", "worker.js")); const H = S.pickHeroes(12, 13), K = h => S.HERO[h];
const blink = K(H[3]).basics[0], real = K(H[6]).ult;
const mk = t => t.has(real) ? S.render({ heroes: H, cur: ["L", 0], me: ["R", 2], picks: [["L0", real]] }) : S.render({ heroes: H, cur: ["L", 0], me: ["R", 2], taken: t });
const steps = [];
for (let i = 0; i < 3; i++) steps.push(["锁池", new Set()]);   /* v1.13 起锁池要等连续两帧画面停住(翻牌动画), 开局多给一帧 —— 真实游戏里棋盘出现后离第一手还有好几秒 */
for (let i = 0; i < 6; i++) steps.push([`快闪 ${i + 1}`, i % 2 ? new Set([blink]) : new Set()]);              // 一帧亮一帧暗 → 本来就不会被认
for (let i = 0; i < 16; i++) steps.push([`慢闪(两帧一换) ${i + 1}`, (i >> 1) % 2 ? new Set([blink]) : new Set()]);   // 这种会被认成"选走了又还回来"(用户实测)
for (let i = 0; i < 6; i++) steps.push([`真选走(一直黑) ${i + 1}`, new Set([real])]);
let i = 0; const send = () => { if (i >= steps.length) return setTimeout(() => process.exit(0), 200); const [n, t] = steps[i++];
  const img = mk(t); const buf = img.data.buffer.slice(0); process.stdout.write(`${String(i).padStart(2)}. ${n}: `);
  w.postMessage({ type: "frame", w: img.w, h: img.h, buf, bgra: false, full: true, all: false }, [buf]); };
w.on("message", m => { if (m.type === "ready") { w.postMessage({ type: "display", w: 2560, h: 1440 }); return send(); }
  if (m.type === "log" && /fast/.test(m.tag)) process.stdout.write(`\n     [${m.tag}] ${m.msg}`);
  if (m.type === "state") { console.log(m.idle ? "(idle)" : `已选走=${m.taken}`); setTimeout(send, 40); } });
