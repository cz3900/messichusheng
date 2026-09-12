"use strict";
/* 引擎线程:只干一件事 —— 把分配给自己的那批候选走子评分。
   与 ai.js omniAsync 的数学完全一致(同一套 seed0 + 每候选 M 次 playoutSoft 取平均),
   区别只是候选按 stride 分给 K 个线程并行:order[k], order[k+K], order[k+2K]…
   所以第一波就覆盖"一步加分最高"的前 K 名, 前十名照样最先出来。
   取消:靠 SharedArrayBuffer 里的 job 号 —— 线程在候选之间读一下, 号变了立刻收工。
   (不能靠收消息:评一个候选是 ~100ms 的同步计算, 事件循环进不来。) */
const { parentPort, workerData } = require("worker_threads");
const path = require("path");
const E = path.join(__dirname, "engine", "server");
const AI = require(E + "/ai.js"), F = require(E + "/mcts_fast.js"), P = require(E + "/mcts_policy.js");
const TEMP = +process.env.AI_T || 0.05;
const flag = new Int32Array(workerData.sab);   // [0] = 当前有效 job 号
const me = workerData.k, K = workerData.K;
parentPort.on("message", m => {
  if (m.type !== "omni") return;
  const job = m.job, t0 = Date.now();
  try {
    const sim = AI._simFrom(m.st);
    if (F.simDone(sim)) return parentPort.postMessage({ type: "done", job, k: me, N: 0, ms: 0 });
    const keys = m.st.pool.heroKeys.concat(m.st.pool.basics, m.st.pool.ults);
    const BI = new Int32Array(700), BV = new Float64Array(700);
    const n = F.scoreAll(sim, BI, BV);
    if (!n) return parentPort.postMessage({ type: "done", job, k: me, N: 0, ms: 0 });
    let order = Array.from({ length: n }, (_, c) => c).sort((a, b) => BV[b] - BV[a]);
    if (m.only) { const want = new Set(m.only); order = order.filter(c => want.has(keys[BI[c]])); }   // 决赛:只评这几个
    const M = m.M, seed0 = m.seed0, my = m.mySeat == null ? -1 : m.mySeat, mySg = my < 5 ? 1 : -1;
    /* 个人分:推演里"我"每落一手, 这一手让队伍总分(我方视角)变了多少就记到我头上。
       这个增量包含本体强度、我自己几件的配合、和队友的配合、队伍配比(同轴扎堆会扣分)—— 物理扎堆自然被扣。
       与 P.playoutSoft 同一套走子规则、同一串随机数(所以队伍胜率一个数不变)。 */
    const CI = new Int32Array(700), CV = new Float64Array(700);
    const playoutMine = (s0, rnd) => { const t = F.cloneSim(s0); let mine = 0;
      while (!F.simDone(t)) { const n = F.scoreAll(t, CI, CV); if (!n) break;
        let mx = CV[0]; for (let i = 1; i < n; i++) if (CV[i] > mx) mx = CV[i];
        let Z = 0; for (let i = 0; i < n; i++) { CV[i] = Math.exp((CV[i] - mx) / TEMP); Z += CV[i]; }
        let r = rnd() * Z, pick = CI[n - 1]; for (let i = 0; i < n; i++) { r -= CV[i]; if (r <= 0) { pick = CI[i]; break; } }
        const seat = t.order[t.step], z0 = t.z; F.applySim(t, pick); if (seat === my) mine += mySg * (t.z - z0); }
      return [t.z, mine]; };
    let lastMine = 0;
    const evalSim = s => { if (my < 0) { let sum = 0; for (let j = 0; j < M; j++) sum += P.playoutSoft(s, TEMP, P.mkRnd(seed0 + j * 7919)); return sum / M; }
      let sum = 0, ms = 0; for (let j = 0; j < M; j++) { const [z, mi] = playoutMine(s, P.mkRnd(seed0 + j * 7919)); sum += z; ms += mi; } lastMine = ms / M; return sum / M; };
    const alive = () => Atomics.load(flag, 0) === job;
    if (me === 0) { const base = evalSim(sim); if (!alive()) return; parentPort.postMessage({ type: "base", job, base, N: order.length }); }
    let vals = {}, cnt = 0;
    const nn = order.length;
    for (let idx = me; idx < nn; idx += K) {
      if (!alive()) return parentPort.postMessage({ type: "done", job, k: me, N: nn, cancelled: true, ms: Date.now() - t0 });
      const c = order[idx], i = BI[c];
      const t = F.cloneSim(sim); const z0 = t.z; F.applySim(t, i); const own = mySg * (t.z - z0);   // 候选这一手本身也是"我"落的
      const zz = evalSim(t); vals[keys[i]] = my < 0 ? { z: zz, d1: BV[c] } : { z: zz, d1: BV[c], m: own + lastMine }; cnt++;
      if (cnt >= (m.chunk || 3)) { parentPort.postMessage({ type: "part", job, k: me, vals, N: nn }); vals = {}; cnt = 0; }
    }
    if (cnt) parentPort.postMessage({ type: "part", job, k: me, vals, N: nn });
    parentPort.postMessage({ type: "done", job, k: me, N: nn, ms: Date.now() - t0 });
  } catch (e) { parentPort.postMessage({ type: "err", job, k: me, msg: String(e && e.stack || e) }); }
});
parentPort.postMessage({ type: "ready", k: me });
