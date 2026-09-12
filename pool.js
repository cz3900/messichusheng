"use strict";
/* 引擎线程池:把一次"全扫"拆给 K 个线程并行算,边算边回。
   为什么值得:一次全扫 ~55 个候选 × 128 次走子, 单线程在玩家机器上要 2.5~6 秒,
   而候选之间完全独立 —— 铺满核心就是接近线性的加速。游戏机通常 8~16 核, 这里取 min(4, 核数-2)。 */
const { Worker } = require("worker_threads"); const os = require("os"), path = require("path");
const K = +process.env.AD_THREADS || Math.max(1, Math.min(6, ((os.cpus() || []).length - 2) || 1));   // 选技时游戏几乎不吃 CPU, 留 2 个核给系统;AD_THREADS 可强制指定
const sab = new SharedArrayBuffer(4); const flag = new Int32Array(sab);
let threads = [], ready = 0, jobSeq = 0, cur = null, onLog = () => {};
function start(log) {
  onLog = log || onLog;
  for (let k = 0; k < K; k++) {
    const w = new Worker(path.join(__dirname, "engine_worker.js"), { workerData: { sab, k, K } });
    w.on("message", m => handle(m)); w.on("error", e => onLog("error", `引擎线程 ${k} 崩了: ${e}`));
    threads.push(w);
  }
  return K;
}
function handle(m) {
  const j = cur; if (!j || m.job !== j.job) return;
  if (m.type === "ready") { ready++; return; }
  if (m.type === "err") { onLog("error", `引擎线程 ${m.k}: ${m.msg}`); j.doneN++; return; }
  if (m.type === "base") { j.base = m.base; j.N = m.N; flush(j); return; }
  if (m.type === "part") { Object.assign(j.vals, m.vals); j.N = m.N || j.N; flush(j); return; }
  if (m.type === "done") { j.N = m.N || j.N; if (++j.doneN >= K) { j.finished = true; flush(j, true); } }
}
function flush(j, force) {
  if (j.base == null) return;                      // 没有基准 z 就没法换算胜率
  const n = Object.keys(j.vals).length;
  const first = !j.emitted && n >= Math.min(8, j.N);
  if (!force && !first && !(j.emitted && Date.now() - j.lastEmit > 1200 && n > j.lastN)) return;
  j.emitted = true; j.lastEmit = Date.now(); j.lastN = n;
  j.onBatch({ stage: j.finished ? "done" : (first ? "top" : "sweep"), n, N: j.N, base: j.base, vals: j.vals });
}
/* 发起一次全扫。返回 job 号;再调一次或 cancel() 会让上一次立刻收工 */
function omni(st, M, seed0, onBatch, only, mySeat) {
  const job = ++jobSeq; Atomics.store(flag, 0, job);
  cur = { job, base: null, N: 0, vals: {}, doneN: 0, emitted: false, lastEmit: 0, lastN: 0, finished: false, onBatch };
  for (const w of threads) w.postMessage({ type: "omni", job, st, M, seed0, chunk: 3, only: only || null, mySeat: mySeat == null ? null : mySeat });
  return job;
}
function cancel() { Atomics.store(flag, 0, 0); cur = null; }
module.exports = { start, omni, cancel, K, size: () => threads.length };
