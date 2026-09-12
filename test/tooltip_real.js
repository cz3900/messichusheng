"use strict";
/* 真实截图(朋友 4K 缩到 2560, 有技能介绍框挡住右上方):逐格看"会不会被判成已选走" */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const p = PNG.sync.read(fs.readFileSync(process.argv[2])); const img = { w: p.width, h: p.height, data: p.data };
R.rescale(img.w, img.h);
const t = new R.Tracker(); const q = t.reset(img);
console.log(`锁池: 参考黑格 ${q.darkCells}, 被当"可疑"的格: ${Object.keys(t.flaky).map(k => R.cn(k.replace(/^hero:/, ""))).join(", ") || "无"}`);
const L = R.LAYOUT(); const { boxes } = R.alignBoard(img, false);
const all = t.pool.skills.map(r => ({ k: r.key, cell: r.cell })).concat(t.pool.heroBoxes.map(h => ({ k: "hero:" + h.hero, cell: h.cell })));
console.log("格子(行,列)      名称            平均/参考  最亮一格/参考  老规则(平均<60且<半)  新规则(九宫格)");
for (const a of all.sort((x, y) => (L.board[x.cell].row - L.board[y.cell].row) || (L.board[x.cell].col - L.board[y.cell].col))) {
  const c = L.board[a.cell], st = R.cellStats(img, boxes[a.cell]), ref = t.refB[a.cell];
  const oldR = st.mean < 60 && st.mean < 0.5 * ref, newR = R.isDarkCell(img, boxes[a.cell], ref);
  if (st.mean / ref < 0.75 || oldR || newR)
    console.log(`(${c.row},${c.col})  ${R.cn(a.k.replace(/^hero:/, "")).padEnd(10)}  ${(st.mean / ref).toFixed(2).padStart(6)}  ${(st.max / ref).toFixed(2).padStart(10)}      ${oldR ? "判已选走" : "  -"}             ${newR ? "判已选走" : "  -"}`); }
console.log("\n--- 介绍框覆盖区(右上: 大招区第6列 + 上半区右侧技能/英雄列) 每格的 平均/参考 · 最亮一格/参考:");
for (const a of all) { const c = L.board[a.cell]; if (!((c.row === 0 && c.col === 5) || (c.row >= 2 && c.row <= 4 && c.col >= 4))) continue;
  const st = R.cellStats(img, boxes[a.cell]), ref = t.refB[a.cell];
  console.log(`  (${c.row},${c.col}) ${R.cn(a.k.replace(/^hero:/, "")).padEnd(8)} 平均 ${(st.mean / ref).toFixed(2)}  最亮一格 ${(st.max / ref).toFixed(2)}  → ${R.isDarkCell(img, boxes[a.cell], ref) ? "判已选走" : "不算"}`); }
console.log("\n--- 同一批格子, 改用 图标库亮度×屏幕系数 当基准(= 没被挡时应有的亮度):");
const LB = JSON.parse(fs.readFileSync(D + "/lib_bright.json")), HB = JSON.parse(fs.readFileSync(D + "/hero_bright.json"));
const ratios = []; for (const r of t.pool.skills) { if (r.unknown) continue; const v = R.cellBright(img, boxes[r.cell]); if (LB[r.key]) ratios.push(v / LB[r.key]); }
ratios.sort((a, b) => a - b); const k = ratios[ratios.length >> 1]; console.log(`  屏幕系数(全部技能格中位数) ${k.toFixed(2)}`);
for (const a of all) { const c = L.board[a.cell]; if (!((c.row === 0 && c.col === 5) || (c.row >= 2 && c.row <= 4 && c.col >= 4) || c.col === 7 || (c.row <= 1))) continue;
  const key = a.k.replace(/^hero:/, ""), lib = a.k.startsWith("hero:") ? HB[key] : LB[key]; if (!lib) continue;
  const exp = lib * k, st = R.cellStats(img, boxes[a.cell]);
  console.log(`  (${c.row},${c.col}) ${R.cn(key).padEnd(8)} 实测/应有 ${(st.mean / exp).toFixed(2)}  最亮一格/应有 ${(st.max / exp).toFixed(2)}  → 按应有亮度判: ${R.isDarkCell(img, boxes[a.cell], exp) ? "已选走 ✗" : "不算"}`); }
