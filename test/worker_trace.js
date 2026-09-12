"use strict";
/* 端到端:把 worker.js 当成真的工作线程跑起来(合成帧当截屏), 看它会不会
   ① 自动锁池 ② 开出观测轨迹 ③ 轨迹能被回放。
   这条测的是**真机那条路**(worker → trace.Recorder), 而不是测试里手工拼的调用。 */
const { Worker } = require("worker_threads"), path = require("path"), fs = require("fs"), os = require("os");
const S = require("./synth.js");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "adtrace-"));
const round = []; for (let i = 0; i < 5; i++) round.push(i, 5 + i);
const ORDER = []; for (let r = 0; r < 5; r++) ORDER.push(...(r % 2 ? round.slice().reverse() : round));
const H = S.pickHeroes(12, 5), K = h => S.HERO[h], sid = x => (x < 5 ? "L" : "R") + (x % 5);
const taken = new Set(), takenHeroes = new Set(), panels = {};
const w = new Worker(path.join(__dirname, "..", "worker.js"), { env: { ...process.env, AD_THREADS: "0" } });
const logs = []; let ready = false, locked = false, sent = 0;
let snaps = 0, points = [];
w.on("message", m => { if (m.type === "ready") ready = true;
  if (m.type === "snapshot") snaps++;   // 现在送的是裸像素, 主进程才编码
  if (m.type === "log") { logs.push(`${m.tag} ${m.msg}`);
    if (m.tag === "pool" && /锁定/.test(m.msg)) locked = true;
    if (m.tag === "point" || m.tag === "v2") points.push(m.msg); } });
w.on("error", e => { console.log("✗ worker 出错:", e.message); process.exit(1); });
const TEST = process.env.AD_TEST === "1", CORE = process.env.AD_CORE === "v2" ? "v2" : "1x";
const send = img => { const buf = img.data.buffer.slice(img.data.byteOffset, img.data.byteOffset + img.data.length);
  w.postMessage({ type: "frame", w: img.w, h: img.h, buf, full: true, cursor: null, test: TEST, core: CORE }, [buf]); sent++; };
const frame = cur => S.render({ heroes: H, cur: [cur < 5 ? "L" : "R", cur % 5], me: ["R", 2], taken, takenHeroes, panels: JSON.parse(JSON.stringify(panels)) });
(async () => {
  while (!ready) await new Promise(r => setTimeout(r, 20));
  w.postMessage({ type: "logdir", dir: DIR });
  w.postMessage({ type: "display", w: 2560, h: 1440 });
  for (let i = 0; i < 3; i++) { send(frame(0)); await new Promise(r => setTimeout(r, 250)); }
  /* 走 12 手:每手 2 帧 */
  const basics = H.flatMap(h => K(h).basics); let bi = 0;
  for (let i = 0; i < 12; i++) { const x = ORDER[i];
    const k = basics[bi++]; taken.add(k);
    const pn = panels[sid(x)] = panels[sid(x)] || { skills: [] }; pn.skills[pn.skills.length] = k;
    for (let f = 0; f < 2; f++) { send(frame(x)); await new Promise(r => setTimeout(r, 200)); } }
  await new Promise(r => setTimeout(r, 600));
  await w.terminate();
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".jsonl"));
  console.log(`模式=${TEST ? "测试" : "正式"} 内核=${CORE} | 锁池 ${locked ? "✓" : "✗"} | 送入 ${sent} 帧 | 轨迹 ${files.length} 个 | 截图 ${snaps} 张 | 点位/分歧 ${points.length} 条`);
  if (points.length) console.log("    " + points.slice(0, 3).join("\n    "));
  if (!locked || !files.length) { console.log("✗ 没有产出轨迹"); console.log(logs.slice(0, 12).join("\n")); process.exit(1); }
  const f = path.join(DIR, files[0]), sz = fs.statSync(f).size;
  require("./_env.js").init(); const T = require("../trace.js");
  const { head, frames, scans } = T.read(f);
  const rp = T.replay(f);
  console.log(`轨迹 ${(sz / 1024).toFixed(0)}KB: 头(池子 ${head.pool.heroes.length} 英雄) + ${frames.length} 完整帧 + ${(scans || []).length} 快扫行`);
  console.log(`回放: 归属 ${Object.keys(rp.tracker.owner).length} 技能 / ${Object.keys(rp.tracker.heroOf).length} 英雄, 观测缺口 ${rp.miss}`);
  const ok = frames.length >= 8 && rp.miss === 0 && Object.keys(rp.tracker.owner).length >= 3;
  console.log(ok ? "✓ 真机那条路能产出可回放的轨迹" : "✗ 轨迹不完整");
  fs.rmSync(DIR, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
})();
