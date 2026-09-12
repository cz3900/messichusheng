"use strict";
/* 1/8 分辨率扫描帧下,快通道还能不能正确抓到"多黑一格"、能不能不误判 */
const { Worker } = require("worker_threads"); const S = require("./synth.js");
const w = new Worker(require("path").join(__dirname, "..", "worker.js")); const H = S.pickHeroes(12, 9), K = h => S.HERO[h];
const down = (img, n) => { const W = Math.round(img.w / n), Hh = Math.round(img.h / n), o = { w: W, h: Hh, data: new Uint8Array(W * Hh * 4) };
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {   // 面积平均,模拟 GPU 缩放
    let r = 0, g = 0, b = 0, c = 0;
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) { const y = j * n + dy, x = i * n + dx; if (y >= img.h || x >= img.w) continue; const p = (y * img.w + x) * 4; r += img.data[p]; g += img.data[p + 1]; b += img.data[p + 2]; c++; }
    const q = (j * W + i) * 4; o.data[q] = r / c; o.data[q + 1] = g / c; o.data[q + 2] = b / c; o.data[q + 3] = 255; } return o; };
const base = new Set([K(H[0]).basics[0], K(H[1]).ult]);
const pick = new Set([...base, K(H[4]).basics[2]]);
const OW = { [K(H[0]).basics[0]]: "L0", [K(H[1]).ult]: "R0", [K(H[4]).basics[2]]: "L1" };
const mk = t => S.render({ heroes: H, cur: ["L", 2], me: ["R", 0], picks: [...t].map(k => [OW[k], k]) });
const steps = [["全图(第 1 帧)", () => mk(base), 1], ["全图(等画面停住)", () => mk(base), 1], ["全图(第 2 帧, 应锁池)", () => mk(base), 1], ["全图(建立基准)", () => mk(base), 1],
  ["1/8 扫描(无变化)", () => down(mk(base), 8), 8],
  ["1/8 扫描: L3 落子 → 应立刻判定", () => down(mk(pick), 8), 8], ["1/8 扫描", () => down(mk(pick), 8), 8], ["全图核对", () => mk(pick), 1]];
let i = 0; const send = () => { if (i >= steps.length) return setTimeout(() => process.exit(0), 200); const [n, f, div] = steps[i++]; console.log(`=== ${i}. ${n}`);
  const img = f(); const buf = img.data.buffer.slice(0); w.postMessage({ type: "frame", w: img.w, h: img.h, buf, bgra: false, full: div === 1, all: true }, [buf]); };
w.on("message", m => { if (m.type === "ready") { w.postMessage({ type: "display", w: 2560, h: 1440 }); return send(); }
  if (m.type === "log" && /fast|state|pool|disp/.test(m.tag) && !/池子:/.test(m.msg)) console.log(`  [${m.tag}] ${m.msg}`);
  if (m.type === "state") setTimeout(send, 120); });
