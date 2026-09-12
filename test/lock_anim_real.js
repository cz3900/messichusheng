"use strict";
/* 09-11 第 2 局真实截图:anim = 翻牌动画中(右下角格子还侧着), settled = 动画结束。
   期望:动画帧不锁(以前锁了, 认错 4 个英雄);停住后锁上, 池子里有 主宰/噬魂鬼/灰烬之灵, 没有 光之守卫/冥界亚龙 */
const { Worker } = require("worker_threads"), fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const w = new Worker(path.join(__dirname, "..", "worker.js"));
const ld = f => { const p = PNG.sync.read(fs.readFileSync(path.join(__dirname, "fixtures", f))); return { w: p.width, h: p.height, data: p.data }; };
const A = ld("anim_2560_0911.png"), B = ld("settled_2560_0911.png");
const frames = [A, A, B, B, B, B]; let i = 0, pool = null, ok = true; const logs = [];
const send = () => { if (i >= frames.length) return finish(); const f = frames[i++]; const buf = Buffer.from(f.data); w.postMessage({ type: "frame", w: f.w, h: f.h, buf: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), full: true, all: false, plevel: 0 }); };
w.on("message", m => { if (m.type === "ready") { w.postMessage({ type: "display", w: 2560, h: 1440 }); setTimeout(send, 50); return; }
  if (m.type === "log") { logs.push(`${m.tag} ${m.msg}`); if (m.tag === "pool" && m.msg.startsWith("池子:")) pool = m.msg; return; }
  if (m.type === "state") setTimeout(send, 500); });
function finish() { for (const l of logs.filter(l => l.startsWith("pool"))) console.log("  " + (process.env.FULL ? l : l.slice(0, 160)));
  const has = x => pool && pool.includes(" " + x + "[");   // 按"英雄名[" 查, 补位注释里出现的名字不算
  const c = (what, v) => { console.log(`${v ? "✓" : "✗"} ${what}`); ok = ok && v; };
  c("锁上了", !!pool); c("池子对:有 主宰/噬魂鬼/灰烬之灵, 没有 光之守卫/冥界亚龙", has("主宰") && has("噬魂鬼") && has("灰烬之灵") && !has("光之守卫") && !has("冥界亚龙"));
  console.log(ok ? "通过" : "失败"); process.exit(ok ? 0 : 1); }
setTimeout(() => { console.log("超时"); finish(); }, 120000);
