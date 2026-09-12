"use strict";
/* 线程池 vs 单线程:同一个 seed0 下数值必须逐个候选一致, 并量一下加速比 */
const fs = require("fs"), path = require("path");
const E = path.join(__dirname, "..", "engine", "server");
const Dr = require(E + "/draft.js"), AI = require(E + "/ai.js");
const win = {}; new Function("window", fs.readFileSync(path.join(__dirname, "..", "engine", "public", "ad_data.js"), "utf8"))(win);
Dr.setExclusive(win.AD_EXCLUSIVE || []);
const pool = Dr.buildPool(win.AD_HEROES, Math.random);
const st = Dr.newState(pool); st.order = Dr.draftOrder(); st.step = 0; st.taken = []; st.blocked = [];
(async () => {
  const t0 = Date.now(); let single = null;
  const r = await AI.omniAsync(st, res => { if (res.stage === "done") single = res; }, () => true);
  if (r) single = r; const tSingle = Date.now() - t0;
  console.log(`单线程: ${tSingle}ms, 候选 ${Object.keys(single.vals).length}, base ${single.base.toFixed(4)}`);
  const P = require("../pool.js"); const n = P.start((t, m) => console.log(`  [${t}] ${m}`));
  await new Promise(r => setTimeout(r, 800));
  const t1 = Date.now();
  const done = await new Promise(res => P.omni(st, 128, 1, b => { if (b.stage === "done") res(b); }));
  const tPool = Date.now() - t1;
  console.log(`${n} 线程: ${tPool}ms, 候选 ${Object.keys(done.vals).length}, base ${done.base.toFixed(4)} → 加速 ${(tSingle / tPool).toFixed(2)}x`);
  let bad = 0, maxd = 0;
  for (const k in single.vals) { const a = single.vals[k].z, b = done.vals[k] && done.vals[k].z;
    if (b == null) { bad++; console.log("  缺", k); continue; } const d = Math.abs(a - b); if (d > maxd) maxd = d; if (d > 1e-9) { bad++; if (bad < 5) console.log(`  不一致 ${k}: 单 ${a} vs 池 ${b}`); } }
  console.log(bad ? `✗ ${bad} 个不一致(最大差 ${maxd})` : `✓ ${Object.keys(single.vals).length} 个候选数值完全一致(最大差 ${maxd})`);
  process.exit(0);
})();
