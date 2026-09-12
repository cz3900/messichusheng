"use strict";
/* 原型:团队优先 vs 个人优先。真实池子(朋友截图), 引擎自己把前 N 手走完, 然后给"我"算全部候选的 队伍胜率 + 个人分。
   个人优先 = 在"队伍胜率比最好的低不超过 δ"的候选里, 挑个人分最高的。 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const p = PNG.sync.read(fs.readFileSync(process.argv[2])); const img = { w: p.width, h: p.height, data: p.data }; R.rescale(img.w, img.h); const P = R.readPool(img);
const E = path.join(__dirname, "..", "engine", "server"), Dr = require(E + "/draft.js"), AI = require(E + "/ai.js");
const win = {}; new Function("window", fs.readFileSync(path.join(__dirname, "..", "engine", "public", "ad_data.js"), "utf8"))(win); Dr.setExclusive(win.AD_EXCLUSIVE || []);
const pool = { heroKeys: P.poolHeroes.slice(), basics: [], ults: [], filled: [] };
for (const s of P.skills) { const a = win.AD_ABILITIES[s.key]; if (!a) continue; (s.ultslot || a.ult) ? pool.ults.push(s.key) : pool.basics.push(s.key); }
const NPRE = +(process.argv[3] || 13), DELTA = +(process.argv[4] || 0.02);
const st = Dr.newState(pool); st.order = Dr.draftOrder(); st.step = 0; st.taken = []; st.blocked = [];
for (let i = 0; i < NPRE; i++) { const k = AI.choose(st); Dr.pick(st, k); }   // 引擎一步封锁策略把前 NPRE 手走完
const mySeat = st.order[st.step], seats = st.seats;
const heroOf = k => { const h = win.AD_HEROES.find(x => x.key === k); return h ? `${R.cn(k)}(${h.attr}/${h.atk === "Melee" ? "近战" : "远程"})` : R.cn(k); };
console.log(`前 ${NPRE} 手已走完, 现在轮到 ${mySeat < 5 ? "左" : "右"}${mySeat % 5 + 1}。我方现状:`);
for (let i = (mySeat < 5 ? 0 : 5); i < (mySeat < 5 ? 5 : 10); i++) { const s = seats[i]; console.log(`  ${i < 5 ? "左" : "右"}${i % 5 + 1}${i === mySeat ? "(我)" : "    "} 英雄 ${s.hero ? heroOf(s.hero) : "-"} | 技能 ${s.basics.concat(s.ult ? [s.ult] : []).map(R.cn).join(" / ") || "-"}`); }
const rest = { ...st, order: st.order.slice(st.step), step: 0 };
const POOLM = require("../pool.js"); POOLM.start(() => {});
const sig = z => 1 / (1 + Math.exp(-z)), sg = mySeat < 5 ? 1 : -1;
setTimeout(() => POOLM.omni(rest, +(process.env.M || 128), 12345, b => { if (b.stage !== "done") return;
  const rows = Object.entries(b.vals).map(([k, v]) => ({ k, name: win.AD_ABILITIES[k] ? R.cn(k) : heroOf(k), p: sig(sg * v.z), m: v.m })).sort((a, c) => c.p - a.p);
  const best = rows[0].p, elig = rows.filter(r => r.p >= best - DELTA).sort((a, c) => c.m - a.m);
  const fmt = r => `${r.name.padEnd(14)} 队伍胜率 ${(100 * r.p).toFixed(1)}%  个人分 ${r.m >= 0 ? "+" : ""}${r.m.toFixed(3)}`;
  console.log(`\n【团队优先】按队伍胜率:`); rows.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${fmt(r)}`));
  console.log(`\n【个人优先】在胜率不低于 ${(100 * (best - DELTA)).toFixed(1)}%(最好 −${100 * DELTA} 个百分点)的 ${elig.length} 个里按个人分:`); elig.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${fmt(r)}`));
  /* 候选这一手本身的贡献拆开:本体 / 座位内配合 / 簇对 / 打钱配比 / 克制 / 阵容轴 */
  const F = require(E + "/mcts_fast.js"); const sim = AI._simFrom(rest), items = rest.pool.heroKeys.concat(rest.pool.basics, rest.pool.ults), out = new Float64Array(6);
  const partsOf = k => { const i = items.indexOf(k); if (i < 0) return null; F.deltaParts(sim, i, out); return Array.from(out, v => sg * v); };
  const showParts = r => { const q = partsOf(r.k); return q ? `本体 ${q[0].toFixed(2)} 配合 ${(q[1] + q[2]).toFixed(2)} 打钱配比 ${q[3].toFixed(3)} 阵容轴 ${q[5].toFixed(3)} 克制 ${q[4].toFixed(3)}` : ""; };
  console.log(`\n这一手本身的贡献拆开(团队优先前五 + 个人优先前三):`); const seen = new Set();
  for (const r of rows.slice(0, 5).concat(elig.slice(0, 3))) { if (seen.has(r.k)) continue; seen.add(r.k); console.log(`  ${r.name.padEnd(14)} ${showParts(r)}`); }
  const greedy = rows.slice().sort((a, c) => c.m - a.m);
  console.log(`\n【纯贪心】只看个人分(不管队伍):`); greedy.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${fmt(r)}`));
  process.exit(0); }, null, mySeat), 1500);
