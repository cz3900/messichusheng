"use strict";
/* 推荐计算不该被打断:快通道判定落子后, 完整识别确认要 1~2 秒(连续 2 帧 + 面板图标晚到), 这期间局面不能时有时无。
   数"开始计算"的次数:一次落子只该算一次(09-12 日志里一次落子重来 2~3 次, 每手白等 1.5~2 秒) */
const { Worker } = require("worker_threads"); const S = require("./synth.js");
const w = new Worker(require("path").join(__dirname, "..", "worker.js")); const H = S.pickHeroes(12, 7), K = h => S.HERO[h];
const half = img => { const W = img.w >> 1, Hh = img.h >> 1, o = { w: W, h: Hh, data: new Uint8Array(W * Hh * 4) };
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const p = ((2 * j) * img.w + 2 * i) * 4, q = (j * W + i) * 4; o.data[q] = img.data[p]; o.data[q + 1] = img.data[p + 1]; o.data[q + 2] = img.data[p + 2]; o.data[q + 3] = 255; } return o; };
const k = K(H[2]).basics[0];
const f0 = () => S.render({ heroes: H, cur: ["L", 0], me: ["R", 0] });
const fd = () => S.render({ heroes: H, cur: ["L", 0], me: ["R", 0], taken: new Set([k]) });                                  // L1 落子:棋盘变暗, 面板图标还没出来
const fp = () => S.render({ heroes: H, cur: ["R", 0], me: ["R", 0], picks: [["L0", k]] });                                    // 面板图标出来了, 高亮到 R1(我)
const steps = [["开局", f0, 1], ["开局", f0, 1], ["全图", f0, 1], ["扫描", () => half(f0()), 0], ["扫描", () => half(f0()), 0],
  ["扫描:L1 落子", () => half(fd()), 0], ["全图(还没确认)", fd, 1], ["全图(还没确认)", fd, 1], ["全图:面板图标到了", fp, 1], ["全图", fp, 1], ["全图", fp, 1]];
let i = 0, computing = 0, counting = false; const t0 = Date.now(); let tPick = 0, tDone = 0;
const send = () => { if (i >= steps.length) return setTimeout(finish, 6000); const [n, mk, full] = steps[i++]; if (n.includes("落子")) { counting = true; tPick = Date.now(); }
  const img = mk(); const buf = img.data.buffer.slice(0); w.postMessage({ type: "frame", w: img.w, h: img.h, buf, bgra: false, full: !!full, all: false }, [buf]); };
w.on("message", m => { if (m.type === "ready") { w.postMessage({ type: "display", w: 2560, h: 1440 }); return send(); }
  if (m.type === "computing" && counting) computing++;
  if (m.type === "advice" && counting && !tDone) tDone = Date.now();
  if (m.type === "state") setTimeout(send, 400); });
function finish() { console.log(`L1 落子后开始计算 ${computing} 次, 落子→结果 ${tDone ? ((tDone - tPick) / 1000).toFixed(1) + "s" : "没出结果"}`);
  const ok = computing === 1; console.log(ok ? "通过" : "失败"); process.exit(ok ? 0 : 1); }
