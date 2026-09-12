"use strict";
/* 补位技能(池子外英雄的技能)能不能进引擎:用真实截图读出的池子直接跑一次全扫 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const p = PNG.sync.read(fs.readFileSync(process.argv[2])); let img = { w: p.width, h: p.height, data: p.data };
R.rescale(img.w, img.h); const P = R.readPool(img);
const E = path.join(__dirname, "..", "engine", "server"), Dr = require(E + "/draft.js"), AI = require(E + "/ai.js");
const win = {}; new Function("window", fs.readFileSync(path.join(__dirname, "..", "engine", "public", "ad_data.js"), "utf8"))(win); Dr.setExclusive(win.AD_EXCLUSIVE || []);
const pool = { heroKeys: P.poolHeroes.slice(), basics: [], ults: [], filled: [] };
for (const s of P.skills) { const a = win.AD_ABILITIES[s.key]; if (!a) continue; (s.ultslot || a.ult) ? pool.ults.push(s.key) : pool.basics.push(s.key); }
console.log(`池子进引擎: 英雄 ${pool.heroKeys.length} 普通 ${pool.basics.length} 大招 ${pool.ults.length}; 补位: ${P.skills.filter(s => s.filler).map(s => R.cn(s.key)).join(", ")}`);
const st = Dr.newState(pool); st.order = Dr.draftOrder(); st.step = 0; st.taken = []; st.blocked = [];
(async () => { const t0 = Date.now(); let fin = null;
  const r = await AI.omniAsync(st, b => { if (b.stage === "done") fin = b; }, () => true); fin = fin || r;
  const sig = z => 1 / (1 + Math.exp(-z));
  const rows = Object.entries(fin.vals).map(([k, v]) => [R.cn(k), sig(v.z)]).sort((a, b) => b[1] - a[1]);
  console.log(`引擎全扫 ${Date.now() - t0}ms 候选 ${rows.length}; 前五: ${rows.slice(0, 5).map(([n, p]) => `${n} ${(100 * p).toFixed(1)}`).join(" | ")}`);
  for (const k of ["磁场", "法力虚空", "骨隐步"]) { const i = rows.findIndex(r => r[0] === k); console.log(`  ${k}: ${i < 0 ? "不在候选里!" : `第 ${i + 1} 名 ${(100 * rows[i][1]).toFixed(1)}%`}`); }
  process.exit(0); })();
