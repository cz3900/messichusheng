"use strict";
/* 快通道时序:全图 → 纯扫描帧流(每 250ms) → 中途某帧落子 → 测"落子到开始算"的延迟;再测提示框(多格同时黑)不误判 */
const { Worker } = require("worker_threads"); const S = require("./synth.js");
const w = new Worker(require("path").join(__dirname, "..", "worker.js")); const H = S.pickHeroes(12, 7), K = h => S.HERO[h];
const half = img => { const W = img.w >> 1, Hh = img.h >> 1, o = { w: W, h: Hh, data: new Uint8Array(W * Hh * 4) };
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const p = ((2 * j) * img.w + 2 * i) * 4, q = (j * W + i) * 4; o.data[q] = img.data[p]; o.data[q + 1] = img.data[p + 1]; o.data[q + 2] = img.data[p + 2]; o.data[q + 3] = 255; } return o; };
const mk = (o) => S.render(Object.assign({ heroes: H, cur: ["L", 1], me: ["R", 1] }, o));
const t0 = new Set([K(H[0]).basics[0]]);                                  // 开局前已有 1 件被选走
const tip = new Set([...t0, ...K(H[4]).basics, ...K(H[5]).basics]);       // 鼠标提示框盖住 6 格
const pick = new Set([...t0, K(H[2]).ult]);                               // L2 真的落子(多黑 1 格)
let t = 0, started = 0, i = 0;
const steps = [["全图(等画面停住)", () => mk({ taken: t0 }), true], ["全图基准", () => mk({ taken: t0 }), true], ["扫描", () => half(mk({ taken: t0 }))], ["扫描", () => half(mk({ taken: t0 }))],
  ["扫描:提示框盖住 6 格 → 不应判落子", () => half(mk({ taken: tip }))], ["扫描:提示框还在", () => half(mk({ taken: tip }))],
  ["扫描:提示框消失", () => half(mk({ taken: t0 }))], ["全图确认", () => mk({ taken: t0 }), true],
  ["扫描:鼠标拖动(只暗一帧) → 不该判落子", () => half(mk({ taken: new Set([...t0, K(H[6]).basics[1]]) }))],
  ["扫描:拖动结束, 格子亮回来", () => half(mk({ taken: t0 }))],
  ["扫描:L2 真落子(第 1 次黑)", () => { started = Date.now(); return half(mk({ taken: pick, panels: { L1: { skills: [null, null, null, K(H[2]).ult] } } })); }],
  ["扫描:L2 真落子(第 2 次黑) → 应判定", () => half(mk({ taken: pick, panels: { L1: { skills: [null, null, null, K(H[2]).ult] } } }))],
  ["扫描", () => half(mk({ taken: pick, panels: { L1: { skills: [null, null, null, K(H[2]).ult] } } }))]];
const send = () => { if (i >= steps.length) return setTimeout(() => process.exit(0), 4000); const [n, f] = steps[i++]; console.log(`=== ${i}. ${n}`);
  const img = f(); const buf = img.data.buffer.slice(0); w.postMessage({ type: "frame", w: img.w, h: img.h, buf, bgra: false, full: img.w >= 2000, all: true }, [buf]); };
w.on("message", m => { if (m.type === "ready") return send();
  if (m.type === "log" && /advice|fast|state/.test(m.tag)) console.log(`  [${m.tag}] ${m.msg}`);
  if (m.type === "advice" && m.stage === "top") console.log(`  >>> 出数 ${m.side}${m.seat % 5 + 1} pre=${m.pre}${started ? ` 落子后 ${Date.now() - started}ms` : ""}`);
  if (m.type === "state") setTimeout(send, 250); });
