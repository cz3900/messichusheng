"use strict";
/* 遮挡 vs 真多选:① 半透明面板盖住 8 格 3 帧后消失 → 不该算已选走;② 离开一会儿回来真多了 3 件 → 应在几帧内接受 */
const { Worker } = require("worker_threads"); const S = require("./synth.js");
const w = new Worker(require("path").join(__dirname, "..", "worker.js")); const H = S.pickHeroes(12, 5), K = h => S.HERO[h];
const base = new Set([K(H[0]).basics[0]]);
const cover = new Set([...base, ...K(H[3]).basics, ...K(H[4]).basics, K(H[6]).ult, K(H[7]).ult]);
const real = new Set([...base, K(H[1]).ult, K(H[2]).basics[0], K(H[5]).basics[1]]);
const PK = { [K(H[1]).ult]: "R0", [K(H[2]).basics[0]]: "L1", [K(H[5]).basics[1]]: "R1", [K(H[0]).basics[0]]: "L0" };
const mk = t => t === real || t === base ? S.render({ heroes: H, cur: ["L", 0], me: ["R", 2], picks: [...t].map(k => [PK[k], k]) }) : S.render({ heroes: H, cur: ["L", 0], me: ["R", 2], taken: t, panels: { L0: { skills: [K(H[0]).basics[0]] } } });
const steps = [["基准", base], ["基准", base], ["基准", base], ["遮挡 8 格", cover], ["遮挡还在", cover], ["遮挡消失", base], ["基准", base],
  ["真的多了 3 件(我们在看的时候不可能一次多 3 件, 按遮挡嫌疑逐格等 5 次)", real], ...Array.from({ length: 6 }, () => ["同上", real])];
let i = 0; const send = () => { if (i >= steps.length) return setTimeout(() => process.exit(0), 300); const [n, t] = steps[i++]; console.log(`=== ${i}. ${n}`);
  const img = mk(t); const buf = img.data.buffer.slice(0); w.postMessage({ type: "frame", w: img.w, h: img.h, buf, bgra: false, full: img.w >= 2000, all: false }, [buf]); };
w.on("message", m => { if (m.type === "ready") return send();
  if (m.type === "log" && /fast|state|pool/.test(m.tag) && !/池子:/.test(m.msg)) console.log(`  [${m.tag}] ${m.msg}`);
  if (m.type === "state") { if (!m.idle) console.log(`  已选走=${m.taken}`); setTimeout(send, 60); } });
