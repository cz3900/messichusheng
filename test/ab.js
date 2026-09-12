"use strict";
/* 1.x ↔ 2.0 对比台。**同一条轨迹**上各跑一遍, 对同一份真值打分。
   合成轨迹(full_draft.js 产的)带真值; 真机轨迹没有真值, 就只报两版的分歧和各自的置信度。
   用法: node test/ab.js <轨迹.jsonl> [更多轨迹...]      TRACE_OUT 产出的 .expect.json 里带真值 */
const fs = require("fs"), path = require("path");
require("./_env.js").init();
const R = require("../recog.js"), T = require("../trace.js"), V2 = require("../v2.js");
const files = process.argv.slice(2);
if (!files.length) { console.log("用法: node test/ab.js <轨迹.jsonl> ..."); process.exit(2); }
const q2 = q => q ? q[0] + q[1] : null;
const tot = { n: 0, s1: 0, s2: 0, h1: 0, h2: 0, N: 0, HN: 0, r1: 0, f1: 0, f2: 0, t2: 0, ms1: 0, ms2: 0 };

for (const file of files) {
  const { head, frames } = T.read(file);
  let truth = null; try { truth = JSON.parse(fs.readFileSync(file + ".expect.json")); } catch (e) { }
  /* ---- 1.x ---- */
  const t1 = T.restore(head); let retract = 0, flips1 = 0; const prev1 = {};
  const firstSeen1 = {}, firstSeen2 = {};   // 每件"第一次被判定为已拿走"的帧号 —— 在线延迟
  const a0 = Date.now();
  for (const f of frames) { const src = new T.Frame(f, { poolKeys: head.poolKeys });
    R.setSource(src); t1.cursor = f.cursor || null; try { t1.update(null); } finally { R.setSource(null); }
    for (const [, , , how] of t1.log) if (how === "retract") retract++;
    t1.log.length = 0;
    for (const k in t1.owner) { const q = q2(t1.owner[k]); if (prev1[k] && prev1[k] !== q) flips1++; prev1[k] = q; }
    for (const k in t1.stable) if (t1.stable[k] && firstSeen1[k] == null) firstSeen1[k] = t1.frameNo; }
  const ms1 = Date.now() - a0;
  /* ---- 2.0 ---- */
  const e = new V2.Estimator(head); let flips2 = 0; const prev2 = {};
  const a1 = Date.now();
  for (const f of frames) { const src = new T.Frame(f, { poolKeys: head.poolKeys });
    e.observe(f, src);
    for (let i = 0; i < e.n; i++) { const k = e.items[i].key; if (firstSeen2[k] == null && e.pTaken(i) >= 0.5) firstSeen2[k] = e.frames; }
    if (e.frames % 5 === 0) { const st = e.state(); for (const k in st.owner) { if (prev2[k] && prev2[k] !== st.owner[k]) flips2++; prev2[k] = st.owner[k]; } } }
  const st2 = e.state({ force: 1 }); const ms2 = Date.now() - a1;

  /* 在线延迟:两版各自"第一次认定这件被拿走"的帧号之差(正 = 2.0 更慢) */
  const lat = []; for (const k in firstSeen1) if (firstSeen2[k] != null) lat.push(firstSeen2[k] - firstSeen1[k]);
  lat.sort((a, b) => a - b);
  const latMed = lat.length ? lat[lat.length >> 1] : null, latP90 = lat.length ? lat[Math.floor(lat.length * 0.9)] : null;
  const only1 = Object.keys(firstSeen1).filter(k => firstSeen2[k] == null).length, only2 = Object.keys(firstSeen2).filter(k => firstSeen1[k] == null).length;
  tot.lat = (tot.lat || []).concat(lat); tot.o1 = (tot.o1 || 0) + only1; tot.o2 = (tot.o2 || 0) + only2;
  const line = [`${path.basename(file)} ${frames.length}帧`];
  if (truth) {
    let s1 = 0, s2 = 0, h1 = 0, h2 = 0; const bad1 = [], bad2 = [];
    for (const k in truth.truthSkill) { const w = truth.truthSkill[k];
      const g1 = q2(t1.owner[k]); if (g1 === w) s1++; else bad1.push(`${R.cn(k)}:${w}→${g1 || "无"}`);
      const g2 = st2.owner[k]; if (g2 === w) s2++; else bad2.push(`${R.cn(k)}:${w}→${g2 || "无"}(p=${st2.p[k]},m=${st2.margin[k] ?? "-"})`); }
    for (const h in truth.truthHero) { const w = truth.truthHero[h];
      if (q2(t1.heroOf[h]) === w) h1++; else bad1.push(`英雄${R.cn(h)}:${w}→${q2(t1.heroOf[h]) || "无"}`);
      if (st2.heroOwner["hero:" + h] === w) h2++; else bad2.push(`英雄${R.cn(h)}:${w}→${st2.heroOwner["hero:" + h] || "无"}`); }
    const N = Object.keys(truth.truthSkill).length, HN = Object.keys(truth.truthHero).length;
    tot.n++; tot.s1 += s1; tot.s2 += s2; tot.h1 += h1; tot.h2 += h2; tot.N += N; tot.HN += HN;
    tot.r1 += retract; tot.f1 += flips1; tot.f2 += flips2; tot.t2 += st2.taken.length; tot.ms1 += ms1; tot.ms2 += ms2;
    console.log(`${line}  1.x 技能 ${s1}/${N} 英雄 ${h1}/${HN} 撤销${retract} 改判${flips1} | 2.0 技能 ${s2}/${N} 英雄 ${h2}/${HN} 改判${flips2} | 判定延迟中位 ${latMed}帧 p90 ${latP90}帧 (只1.x认 ${only1} 只2.0认 ${only2})`);
    if (process.env.V) { if (bad1.length) console.log(`    1.x 错: ${bad1.join("; ")}`); if (bad2.length) console.log(`    2.0 错: ${bad2.join("; ")}`); }
  } else {
    const dis = []; for (const k in t1.owner) { const g1 = q2(t1.owner[k]), g2 = st2.owner[k]; if (g2 && g1 !== g2) dis.push(`${R.cn(k)} 1.x=${g1} 2.0=${g2}`); }
    const only2 = Object.keys(st2.owner).filter(k => !t1.owner[k]), only1 = Object.keys(t1.owner).filter(k => !st2.owner[k]);
    console.log(`${line}  1.x 归属 ${Object.keys(t1.owner).length}技能/${Object.keys(t1.heroOf).length}英雄 撤销${retract} 改判${flips1} | 2.0 ${Object.keys(st2.owner).length}技能/${Object.keys(st2.heroOwner).length}英雄 改判${flips2} | 分歧 ${dis.length} 只有2.0有 ${only2.length} 只有1.x有 ${only1.length}`);
    if (process.env.V && dis.length) console.log("    " + dis.join("; "));
  }
}
if (tot.lat && tot.lat.length) { const L = tot.lat.sort((a, b) => a - b);
  console.log(`\n判定延迟(2.0 − 1.x, 单位=完整识别帧): p10 ${L[Math.floor(L.length * .1)]} 中位 ${L[L.length >> 1]} p90 ${L[Math.floor(L.length * .9)]}  |  只有 1.x 认定 ${tot.o1} 件, 只有 2.0 认定 ${tot.o2} 件`); }
if (tot.n > 1) console.log(`\n合计 ${tot.n} 局: 1.x 技能 ${tot.s1}/${tot.N} 英雄 ${tot.h1}/${tot.HN} 撤销${tot.r1} 改判${tot.f1} | 2.0 技能 ${tot.s2}/${tot.N} 英雄 ${tot.h2}/${tot.HN} 改判${tot.f2} (判定被拿走 ${tot.t2})  用时 ${tot.ms1}ms vs ${tot.ms2}ms`);
