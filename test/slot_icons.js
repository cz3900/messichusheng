"use strict";
/* 面板技能槽里的图标, 在"本局池子全部技能"里认:第一名是谁、分数、领先第二名多少 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const S = "/tmp/claude-1000/-home-ec2-user-work/2608dba7-e895-4f03-a37d-70fd076b49f3/scratchpad/adlogs/";
for (const f of process.argv.slice(2)) { const p = PNG.sync.read(fs.readFileSync(S + f)); const img = { w: p.width, h: p.height, data: p.data }; R.rescale(img.w, img.h);
  const P = R.readPool(img), cands = P.skills.filter(s => !s.unknown).map(s => s.key); const pan = R.readPanels(img, cands);
  console.log(`\n${f}  (候选 = 本局池子全部 ${cands.length} 个技能)`);
  for (const q of pan) { const got = q.skills.map((s, j) => s ? `槽${j + 1}:${R.cn(s.key)} ${s.s.toFixed(2)}` : null).filter(Boolean);
    if (got.length) console.log(`  ${q.side}${q.idx + 1}: ${got.join("  ")}`); } }
