"use strict";
/* 单人/团队模式 + 我回合锁定。合成帧, 全部发全分辨率。 */
const { Worker } = require("worker_threads"); const S = require("./synth.js");
const mode = process.argv[2] || "solo"; const ALL = mode === "team"; const PL = +(process.argv[3] || 0);
const w = new Worker(require("path").join(__dirname, "..", "worker.js")); const H = S.pickHeroes(12, 3), K = h => S.HERO[h];
const me = ALL ? ["L", 2] : ["L", 1];   // 单人:我是左2;团队:我是左3(左2 是队友)
const a = K(H[0]).basics[0], b = K(H[1]).ult, c = K(H[2]).basics[1], flick = "hero:" + H[7];
const SEAT = { [a]: "L0", [b]: "R0", [c]: "L1" };   // 谁选的(真实游戏里选了什么, 他面板就多一个图标)
const fr = (cur, taken, extra = {}) => () => S.render({ heroes: H, cur, me, picks: taken.map(k => [SEAT[k], k]), ...extra });
const steps = [
  ["开局 左1 在选", fr(["L", 0], [])], ["开局", fr(["L", 0], [])],
  ["左1 落子 → 右1 在选", fr(["R", 0], [a])], ["同上", fr(["R", 0], [a])],
  ["右1 落子 → 左2 在选", fr(["L", 1], [a, b])], ["同上", fr(["L", 1], [a, b])], ["同上", fr(["L", 1], [a, b])],
  ["左2 回合中:一张英雄卡被提示框压暗到 55%(抖动)", () => S.render({ heroes: H, cur: ["L", 1], me, picks: [["L0", a], ["R0", b]], takenHeroes: new Set([H[7]]), darkMul: 0.55 })],
  ["同上", () => S.render({ heroes: H, cur: ["L", 1], me, picks: [["L0", a], ["R0", b]], takenHeroes: new Set([H[7]]), darkMul: 0.55 })],
  ["闪完恢复", fr(["L", 1], [a, b])], ["同上", fr(["L", 1], [a, b])],
  ["左2 落子 → 右2 在选", fr(["R", 1], [a, b, c])], ["同上", fr(["R", 1], [a, b, c])],
];
let i = 0, lastTop = null, nShow = 0; const send = () => { if (i >= steps.length) return setTimeout(() => { console.log(`覆盖层共收到 ${nShow} 次推荐`); process.exit(0); }, 2500); const [n, mk] = steps[i++]; console.log(`=== ${i}. ${n}`); const img = mk(); const buf = img.data.buffer.slice(0);
  w.postMessage({ type: "frame", w: img.w, h: img.h, buf, bgra: false, full: true, all: ALL, plevel: PL }, [buf]); };
w.on("message", m => { if (m.type === "ready") { w.postMessage({ type: "display", w: 2560, h: 1440 }); return send(); }
  if (m.type === "log" && /advice/.test(m.tag)) console.log(`  [${m.tag}] ${m.msg}`);
  if (m.type === "advice") nShow++;
  if (m.type === "advice" && m.stage === "done") { const top = m.rows.slice(0, 3).map(r => r.name).join("/"); console.log(`  >>> 显示 ${m.side}${m.seat % 5 + 1} ${m.pre === "preview" ? `预估(前面还有${m.ahead}手)` : m.pre ? "马上轮到" : "在选"} 前三 ${top}${lastTop && lastTop !== top ? "   ← 变了" : ""}`); lastTop = top; }
  if (m.type === "state") setTimeout(send, m.idle ? 50 : 4000); });
