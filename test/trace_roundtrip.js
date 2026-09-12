"use strict";
/* 记录 ↔ 回放 等价性(2.0 第 1 步的验收):
   同一局, 线上路径(读像素)得出的归属 / 日志, 必须和纯从轨迹回放(完全不碰像素)得出的**逐字相同**。
   不相同 = 轨迹缺了某样观测, 缺口会被 Frame 记下来(miss)。
   用法: TRACE_OUT=/tmp/t.jsonl SEED=3 node test/full_draft.js && node test/trace_roundtrip.js /tmp/t.jsonl */
const fs = require("fs"), path = require("path");
require("./_env.js").init();
const T = require("../trace.js");
const file = process.argv[2] || "/tmp/ad_trace.jsonl";
const exp = JSON.parse(fs.readFileSync(file + ".expect.json"));
const t0 = Date.now();
const { head, frames, tracker: t, miss } = T.replay(file);
const ms = Date.now() - t0;
const got = { owner: t.owner, heroOf: t.heroOf, unknownBy: (t.unknownBy || []).map(u => [u[0], u[1], u.t]),
  suspect: Object.keys(t.suspect || {}).sort(), orphan: Object.keys(t.orphan || {}).sort(),
  turn: t.turn, nameHero: t.nameHero || {}, stable: Object.keys(t.stable || {}).filter(k => t.stable[k]).sort(),
  log: t.log.map(l => l.join("|")) };
const bad = [];
for (const k of ["owner", "heroOf", "unknownBy", "suspect", "orphan", "turn", "nameHero", "stable"]) {
  const a = JSON.stringify(exp[k]), b = JSON.stringify(got[k]);
  if (a !== b) bad.push(`${k} 不一致\n    线上: ${a.slice(0, 300)}\n    回放: ${b.slice(0, 300)}`); }
if (exp.log.length !== got.log.length) bad.push(`日志条数 ${exp.log.length} → ${got.log.length}`);
else { const d = exp.log.map((l, i) => [i, l, got.log[i]]).filter(x => x[1] !== x[2]);
  if (d.length) bad.push(`日志有 ${d.length} 条不同, 前 3 条:\n` + d.slice(0, 3).map(x => `    #${x[0]} 线上 ${x[1]}\n         回放 ${x[2]}`).join("\n")); }
const sz = fs.statSync(file).size;
console.log(`轨迹 ${path.basename(file)}: ${frames.length} 帧 ${(sz / 1024).toFixed(0)}KB (${(sz / frames.length / 1024).toFixed(1)}KB/帧) 回放 ${ms}ms (${(ms / frames.length).toFixed(1)}ms/帧) 观测缺口 ${miss}`);
console.log(`  归属 ${Object.keys(got.owner).length} 技能 / ${Object.keys(got.heroOf).length} 英雄, 日志 ${got.log.length} 条`);
if (!bad.length) console.log("✓ 记录与回放完全一致");
else { console.log("✗ 不一致:"); bad.forEach(b => console.log("  " + b)); }
process.exit(bad.length || miss ? 1 : 0);
