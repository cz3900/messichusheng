"use strict";
/* 标定"个人优先"的档位:大量随机局面上, 不同 δ(最多让队伍少几个百分点)的 队伍代价 vs 个人收益 */
const fs = require("fs"), path = require("path");
const E = path.join(__dirname, "..", "engine", "server"), Dr = require(E + "/draft.js"), AI = require(E + "/ai.js");
const win = {}; new Function("window", fs.readFileSync(path.join(__dirname, "..", "engine", "public", "ad_data.js"), "utf8"))(win); Dr.setExclusive(win.AD_EXCLUSIVE || []);
const POOL = require("../pool.js"); POOL.start(() => {});
const sig = z => 1 / (1 + Math.exp(-z)), NST = +(process.argv[2] || 40), M = +(process.argv[3] || 96);
const DELTAS = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 7, 10];
let rng = 20260911; const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
const omni = (st, seat, seed) => new Promise(res => POOL.omni(st, M, seed, b => { if (b.stage === "done") res(b); }, null, seat));
(async () => { await new Promise(r => setTimeout(r, 1500));
  const acc = DELTAS.map(() => ({ dp: 0, dm: 0, diff: 0, n: 0 })); const byStage = {};
  for (let k = 0; k < NST; k++) {
    const pool = Dr.buildPool(win.AD_HEROES, rnd); const st = Dr.newState(pool); st.order = Dr.draftOrder(); st.step = 0; st.taken = []; st.blocked = [];
    const npre = Math.floor(rnd() * 45); for (let i = 0; i < npre; i++) Dr.pick(st, AI.choose(st));
    const seat = st.order[st.step], sg = seat < 5 ? 1 : -1, rest = { ...st, order: st.order.slice(st.step), step: 0 };
    const b = await omni(rest, seat, 1000 + k * 7);
    const rows = Object.values(b.vals).map((v, i) => ({ p: sig(sg * v.z), m: v.m })).sort((a, c) => c.p - a.p); if (rows.length < 2) continue;
    const best = rows[0];
    DELTAS.forEach((d, j) => { const band = rows.filter(r => r.p >= best.p - d / 100); const ch = band.reduce((a, r) => r.m > a.m ? r : a, band[0]);
      acc[j].dp += 100 * (best.p - ch.p); acc[j].dm += ch.m - best.m; acc[j].diff += ch !== best ? 1 : 0; acc[j].n++; });
    process.stderr.write(`\r局面 ${k + 1}/${NST}`);
  }
  console.log(`\n\n${NST} 个随机局面(每个局面 = 随机池子 + 引擎按正常选法走 0~44 手, 然后轮到"我"), 每候选推演 ${M} 局`);
  console.log(`δ(最多让队伍少)  每手平均让队伍少   每手平均个人分多拿   和团队最优不一样的比例   整局(我 5 手)大约少`);
  acc.forEach((a, j) => console.log(`  ${String(DELTAS[j]).padStart(4)} 个百分点      ${(a.dp / a.n).toFixed(2).padStart(5)} 个百分点       +${(a.dm / a.n).toFixed(3)}(≈${(25 * a.dm / a.n).toFixed(1)}个百分点)        ${(100 * a.diff / a.n).toFixed(0).padStart(3)}%                 ${(5 * a.dp / a.n).toFixed(1)} 个百分点`));
  process.exit(0); })();
