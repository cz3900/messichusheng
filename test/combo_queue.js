"use strict";
/* v1.43 组合版线程任务排队回归(09-28): 以前"新任务一来就取消旧任务", 真机上后台两步表把刚发的决赛顶掉(用户看到"出错, 用网络档"),
   两步补算把推荐理由顶掉(理由行几乎从不出现)。用桩任务(每个真等 120ms)钉死规则:
   A 理由(fate) 后紧跟 两步补算(planfinal): 两个都要算完, 顺序 fate→planfinal
   B 决赛(final) 后紧跟 后台两步表(plan): 决赛不能被顶掉, 两步表排在后面
   C 筛选(screen) 后紧跟 筛选: 旧的被取消(局面变了要重发)
   D 筛选 后紧跟 决赛: 筛选被取消, 决赛立刻跑
   E 决赛 后紧跟 决赛: 旧的被取消 */
const { Worker } = require("worker_threads"), path = require("path");
const w = new Worker(path.join(__dirname, "..", "combo_worker.js"), { workerData: { model: "", prefer: "cpu", combo: path.join(__dirname, "_combo_stub.js") } });
let id = 0; const pend = new Map(); const st = { seats: [], pool: { heroKeys: Array.from({length:12},(_,i)=>"h"+i), basics: Array.from({length:36},(_,i)=>"b"+i), ults: Array.from({length:12},(_,i)=>"u"+i) } };
w.on("message", m => { const p = pend.get(m.id); if (p) { pend.delete(m.id); p({ ...m, t: Date.now() }); } });
const send = (type, extra = {}) => { const i = ++id; const pr = new Promise(r => pend.set(i, r)); w.postMessage({ type, id: i, bfix: 128, budget: 0, st, me: 0, t0: 0, o: {}, ...extra }); return pr; };
const fin = m => m.type === "done" && m.r && !m.r.cancelled && !m.cancelled, canc = m => m.type === "done" && (m.cancelled || (m.r && m.r.cancelled));
const cases = [];
(async () => {
  let a = send("fate", { alt: "x", tgt: "y" }), b = send("planfinal"); let [ra, rb] = await Promise.all([a, b]);
  cases.push(["A 理由→两步补算 都算完且理由先回", fin(ra) && fin(rb) && ra.t <= rb.t, `fate ${ra.type}/${ra.r && ra.r.cancelled} planfinal ${rb.type}/${rb.r && rb.r.cancelled}`]);
  a = send("final", { keys: [] }); b = send("plan"); [ra, rb] = await Promise.all([a, b]);
  cases.push(["B 决赛→后台两步表 决赛不被顶掉", fin(ra) && fin(rb) && ra.t <= rb.t, `final ${ra.type}/${ra.r && ra.r.cancelled} plan ${rb.type}/${rb.r && rb.r.cancelled}`]);
  a = send("screen"); b = send("screen"); [ra, rb] = await Promise.all([a, b]);
  cases.push(["C 筛选→筛选 旧的被取消", canc(ra) && fin(rb), `screen1 cancelled=${canc(ra)} screen2 ok=${fin(rb)}`]);
  a = send("screen"); b = send("final", { keys: [] }); [ra, rb] = await Promise.all([a, b]);
  cases.push(["D 筛选→决赛 筛选被取消 决赛算完", canc(ra) && fin(rb), `screen cancelled=${canc(ra)} final ok=${fin(rb)}`]);
  a = send("final", { keys: [] }); b = send("final", { keys: [] }); [ra, rb] = await Promise.all([a, b]);
  cases.push(["E 决赛→决赛 旧的被取消", canc(ra) && fin(rb), `final1 cancelled=${canc(ra)} final2 ok=${fin(rb)}`]);
  a = send("refine"); b = send("screen"); const c = send("plan"); const d = send("planfinal"); const [r1, r2, r3, r4] = await Promise.all([a, b, c, d]);
  cases.push(["F 更新→筛选→两步表→两步补算 更新不被顶掉, 后台只留最新, 补算照跑", fin(r1) && canc(r2) && fin(r3) && fin(r4), `refine ${fin(r1)} screen cancelled=${canc(r2)} plan ${fin(r3)} planfinal ${fin(r4)}`]);
  a = send("final", { keys: [] }); b = send("planfinal"); w.postMessage({ type: "cancel" });
  [ra, rb] = await Promise.all([a, b]); cases.push(["G idle 取消正在执行和排队任务", canc(ra) && canc(rb), ""]);
  const invalid = await send("final", { st: { pool: { heroKeys: [], basics: [], ults: [] } } });
  cases.push(["H 不完整池子拒绝进入推演", invalid.type === "err" && invalid.msg.includes("无效技能池"), ""]);
  let ok = true; for (const [n, p, d] of cases) { console.log(`${p ? "通过" : "失败"}  ${n}   (${d})`); ok = ok && p; }
  console.log(ok ? "→ 通过" : "→ 失败"); await w.terminate(); process.exit(ok ? 0 : 1);
})();
