"use strict";
/* 鼠标遮住格子一部分 vs 真被选走(整格变暗):前者任何比例都不该算已选走 */
const fs = require("fs"), path = require("path"); const R = require("../recog.js"); const S = require("./synth.js");
const D = path.join(__dirname, "..", "data"); const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const H = S.pickHeroes(12, 21), key = S.HERO[H[5]].basics[1];
const tr = new R.Tracker(); tr.reset(S.render({ heroes: H, cur: ["L", 0], me: ["R", 0] }));
const cellOf = tr.pool.skills.find(r => r.key === key);
const test = (name, img) => { const { boxes } = R.alignBoard(img, false); const st = R.cellStats(img, boxes[cellOf.cell]); const ref = tr.refB[cellOf.cell];
  const dark = R.isDarkCell(img, boxes[cellOf.cell], ref);
  console.log(`${name.padEnd(22)} 参考亮度 ${ref.toFixed(0).padStart(3)} | 平均 ${st.mean.toFixed(0).padStart(3)}(${(st.mean / ref).toFixed(2)}×) 最亮一格 ${st.max.toFixed(0).padStart(3)}(${(st.max / ref).toFixed(2)}×) → ${dark ? "判定已选走" : "不算"}`); };
for (const c of [0.25, 0.4, 0.5, 0.6, 0.75]) test(`鼠标盖住 ${(c * 100) | 0}%`, S.render({ heroes: H, cur: ["L", 0], me: ["R", 0], cover: { [key]: c } }));
test("真被选走(整格变暗)", S.render({ heroes: H, cur: ["L", 0], me: ["R", 0], taken: new Set([key]) }));
test("什么都没发生", S.render({ heroes: H, cur: ["L", 0], me: ["R", 0] }));
