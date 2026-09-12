"use strict";
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs"); const R = require("./recog.js");
const D = path.join(__dirname, "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };   // 小文件的 Buffer 在共享池里, 必须按 offset 截

R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")) });
const load = f => { const p = PNG.sync.read(fs.readFileSync(f)); return { w: p.width, h: p.height, data: p.data }; };
const tr = new R.Tracker(); let st = null;
for (const f of process.argv.slice(2)) { const t0 = Date.now(); st = tr.update(load(f));
  console.log(`${path.basename(f)}: ${((Date.now() - t0) / 1000).toFixed(1)}s 对齐 ${JSON.stringify(st.align)} 当前 ${st.current.side}${st.current.idx + 1} 我 ${st.me.side}${st.me.idx + 1} 轮到我=${st.my_turn} 已选走 ${st.skills.filter(s => s.taken).length} 技能 + ${st.taken_heroes.length} 英雄`);
  if (f === process.argv[2]) { console.log("  池子:", st.pool_heroes.map(R.cn).join(" ")); const by = {}; for (const s of st.skills) (by[R.OWNER()[s.key]] = by[R.OWNER()[s.key]] || []).push(R.cn(s.key)); for (const h of st.pool_heroes) console.log("   ", R.cn(h), ":", by[h].join(" | ")); }
  for (const p of st.panels) if (p.hero || p.skills.length) console.log(`   ${p.side}${p.idx + 1}: ${p.hero ? R.cn(p.hero) : "-"} | ${p.skills.map(s => R.cn(s.key)).join(" ")}`); }
console.log("事件:", tr.log.map(([t, k, q, how]) => `${t}:${R.cn(k)}→${q}(${how})`).join("; "));
fs.writeFileSync(process.env.OUT || "/dev/null", JSON.stringify(st));
