"use strict";
/* 真被选走(纯黑) vs 原画偏暗/被遮挡:看绝对亮度能不能分开。两张真实截图:
   A = 朋友 4K(缩2560), 准备阶段, 什么都没被选;  B = 用户 9/9 截图, 右1 被随机指定斯温 + 有技能被选 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(fs.readFileSync(f)); const img = { w: p.width, h: p.height, data: p.data }; R.rescale(img.w, img.h);
  const P = R.readPool(img), { boxes } = R.alignBoard(img, false);
  const all = P.skills.map(r => [r.key, r.cell]).concat(P.heroBoxes.map(h => ["hero:" + h.hero, h.cell]));
  const rows = all.map(([k, c]) => { const st = R.cellStats(img, boxes[c]); return { k, mean: st.mean, max: st.max }; }).sort((a, b) => a.mean - b.mean);
  console.log(`\n${path.basename(f)}  最暗的 10 格(绝对亮度 0~255):`);
  for (const r of rows.slice(0, 10)) console.log(`  ${R.cn(r.k.replace(/^hero:/, "")).padEnd(8)}${r.k.startsWith("hero:") ? "(英雄卡)" : "        "} 平均 ${r.mean.toFixed(0).padStart(3)}  最亮一格 ${r.max.toFixed(0).padStart(3)}`);
}
