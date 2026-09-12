"use strict";
/* 同一个局面, 换随机种子算三遍:前三会不会自己变?(用朋友截图读出的真实池子) */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const p = PNG.sync.read(fs.readFileSync(process.argv[2])); const img = { w: p.width, h: p.height, data: p.data }; R.rescale(img.w, img.h); const P = R.readPool(img);
const E = path.join(__dirname, "..", "engine", "server"), Dr = require(E + "/draft.js");
const win = {}; new Function("window", fs.readFileSync(path.join(__dirname, "..", "engine", "public", "ad_data.js"), "utf8"))(win); Dr.setExclusive(win.AD_EXCLUSIVE || []);
const pool = { heroKeys: P.poolHeroes.slice(), basics: [], ults: [], filled: [] };
for (const s of P.skills) { const a = win.AD_ABILITIES[s.key]; if (!a) continue; (s.ultslot || a.ult) ? pool.ults.push(s.key) : pool.basics.push(s.key); }
const st = Dr.newState(pool); st.order = Dr.draftOrder().slice(3); st.step = 0; st.taken = []; st.blocked = [];
// 模拟前 3 手已经选了(让局面像对局中段一点)
const P2 = require("../pool.js"); P2.start(() => {}); const sig = z => 1 / (1 + Math.exp(-z));
const run = seed => new Promise(res => P2.omni(st, 128, seed, b => { if (b.stage === "done") res(Object.entries(b.vals).map(([k, v]) => [R.cn(k), sig(v.z)]).sort((a, b) => b[1] - a[1])); }));
(async () => { await new Promise(r => setTimeout(r, 1500)); const outs = [];
  for (const seed of [1, 104730, 209459]) { const rows = await run(seed); outs.push(rows); console.log(`种子 ${String(seed).padStart(6)}: 前五 ${rows.slice(0, 5).map(([n, p]) => `${n} ${(100 * p).toFixed(1)}`).join(" | ")}`); }
  const again = await run(1); console.log(`种子      1 再算一遍: 前五 ${again.slice(0, 5).map(([n, p]) => `${n} ${(100 * p).toFixed(1)}`).join(" | ")}  ← 与第一遍${JSON.stringify(again.slice(0, 5)) === JSON.stringify(outs[0].slice(0, 5)) ? "逐位相同" : "不同"}`);
  const gaps = []; for (const rows of outs) for (let i = 0; i < 4; i++) gaps.push(100 * (rows[i][1] - rows[i + 1][1]));
  console.log(`前五名相邻之间的差距(百分点): ${gaps.map(g => g.toFixed(1)).join(" ")}`);
  process.exit(0); })();
