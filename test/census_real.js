"use strict";
/* 面板普查 + 全局匹配, 真实截图:开局帧(全亮)当参考 → 中局帧。
   棋盘说"这些技能被选走了", 普查把它们配到各人面板的槽里, 和插件当时逐帧增量得出的归属对比。 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), C = require("../census.js"), D = path.join(__dirname, "..", "data"), F = path.join(__dirname, "fixtures");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const ld = f => { const p = PNG.sync.read(fs.readFileSync(path.join(F, f))); return { w: p.width, h: p.height, data: p.data }; };
const a = ld("start_1080p_0911.png"), b = ld("sheen_1080p_0911.png"); R.rescale(a.w, a.h);
const t = new R.Tracker(); t.reset(a);
const { boxes } = R.alignBoard(b, false), raw = R.takenFlags(b, t.refB, t.pool, boxes, t.refS);
const taken = t.pool.skills.filter(s => raw[s.key] === "T" && !s.unknown).map(s => s.key);
const pool = t.pool.skills.map(s => s.key);
const t0 = Date.now(); const c = C.census(b, pool, taken); const ms = Date.now() - t0;
const bySeat = {}; for (const k in c.owner) { const q = c.owner[k][0] + (c.owner[k][1] + 1); (bySeat[q] = bySeat[q] || []).push(`${R.cn(k)} ${c.scores[k].toFixed(2)}`); }
console.log(`棋盘上已选走技能 ${taken.length} 件, 面板上有图标的槽 ${c.slots} 个, 普查用时 ${ms}ms`);
for (const q of ["L1", "L2", "L3", "L4", "L5", "R1", "R2", "R3", "R4", "R5"]) console.log(`  ${q}: ${(bySeat[q] || []).join(" | ") || "-"}`);
console.log("  没配上槽的(多半是被别人拿走但面板没看到, 或漏认):", c.unplaced.map(R.cn).join(", ") || "无");
