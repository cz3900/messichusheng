"use strict";
/* 提前算:L1 在自己回合内选了(高亮还在 L1),我是 R1 → 应立刻为 R1(我) 算;轮到 R1 后不重算 */
const { Worker } = require("worker_threads"); const S = require("./synth.js");
const w = new Worker(require("path").join(__dirname, "..", "worker.js")); const H = S.pickHeroes(12, 3), K = h => S.HERO[h];
const half = img => { const W = img.w >> 1, Hh = img.h >> 1, o = { w: W, h: Hh, data: new Uint8Array(W * Hh * 4) };
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const p = ((2 * j) * img.w + 2 * i) * 4, q = (j * W + i) * 4; o.data[q] = img.data[p]; o.data[q + 1] = img.data[p + 1]; o.data[q + 2] = img.data[p + 2]; o.data[q + 3] = 255; } return o; };
const f0 = () => S.render({ heroes: H, cur: ["L", 0], me: ["R", 0] });
const f1 = () => S.render({ heroes: H, cur: ["L", 0], me: ["R", 0], taken: new Set([K(H[0]).basics[0]]), panels: { L0: { skills: [K(H[0]).basics[0]] } } });
const f2 = () => S.render({ heroes: H, cur: ["R", 0], me: ["R", 0], taken: new Set([K(H[0]).basics[0]]), panels: { L0: { skills: [K(H[0]).basics[0]] } } });
/* 扫描帧=半分辨率。L1 落子后只发扫描帧, 看快通道能不能立刻起算 */
const steps = [["开局(全图)", f0], ["开局(全图)", f0], ["扫描帧", () => half(f0())], ["扫描帧", () => half(f0())],
  ["L1 选了(扫描帧) → 应立刻提前算", () => half(f1())], ["扫描帧", () => half(f1())], ["全图确认", f1],
  ["轮到 R1(我)(全图)", f2], ["全图", f2], ["全图", f2]];
let i = 0; const send = () => { if (i >= steps.length) return setTimeout(() => process.exit(0), 6000); const [n, mk] = steps[i++]; console.log(`=== ${i}. ${n}`); const img = mk(); const buf = img.data.buffer.slice(0);
  w.postMessage({ type: "frame", w: img.w, h: img.h, buf, bgra: false, full: img.w >= 2000, all: false }, [buf]); };
w.on("message", m => { if (m.type === "ready") return send(); if (m.type === "log" && /advice|state|track|fast/.test(m.tag)) console.log(`  [${m.tag}] ${m.msg}`);
  if (m.type === "advice") console.log(`  advice ${m.side}${m.seat % 5 + 1} pre=${m.pre} my=${m.my_turn} stage=${m.stage} base=${(100 * m.base).toFixed(1)}`);
  if (m.type === "clear") console.log("  clear"); if (m.type === "state") setTimeout(send, m.idle ? 50 : (m.skipped ? 200 : 3000)); });
