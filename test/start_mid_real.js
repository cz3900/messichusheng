"use strict";
/* 09-11 测试者同一局两张 1080p 真实截图:开局帧(fixtures/start_1080p_0911.png, 全亮)当参考 → 中局帧(fixtures/sheen_1080p_0911.png)逐格判"被选走"。
   真实答案按截图目视:中局帧里还亮着的 17 格, 其余 43 格都已被选。期望:① 开局帧 12 个大招格全认对(时间结界/燃烧枷锁以前因检出框过大认不出)② 60 格全判对 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data"), F = path.join(__dirname, "fixtures");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const ld = f => { const p = PNG.sync.read(fs.readFileSync(path.join(F, f))); return { w: p.width, h: p.height, data: p.data }; };
const a = ld("start_1080p_0911.png"), b = ld("sheen_1080p_0911.png"); R.rescale(a.w, a.h);
const t = new R.Tracker(); const q = t.reset(a); let ok = true;
const ULT = { 0: "chaos_knight_phantasm", 1: "tidehunter_ravage", 2: "faceless_void_chronosphere", 3: "enchantress_untouchable", 4: "ringmaster_wheel", 5: "batrider_flaming_lasso",
  6: "phantom_lancer_juxtapose", 7: "shadow_demon_demonic_purge", 8: "nevermore_requiem", 9: "ursa_enrage", 10: "vengefulspirit_nether_swap", 11: "lina_laguna_blade" };
const ultBad = Object.entries(ULT).filter(([j, k]) => { const s = t.pool.skills.find(x => x.cell === +j); return !s || s.key !== k; }).map(([j, k]) => `格${j} 应为${R.cn(k)} 读成${R.cn((t.pool.skills.find(x => x.cell === +j) || {}).key)}`);
console.log(`锁池: 英雄 ${q.heroes} | 大招格 ${12 - ultBad.length}/12 认对${ultBad.length ? " — " + ultBad.join(", ") : ""}`); ok = ok && q.heroes === 12 && !ultBad.length;
const live = new Set([4, 5, 8, 12, 17, 26, 27, 33, 34, 36, 39, 40, 41, 46, 54, 56, 59]);
const { boxes } = R.alignBoard(b, false); const raw = R.takenFlags(b, t.refB, t.pool, boxes, t.refS); const bad = [];
for (const s of t.pool.skills) { const want = live.has(s.cell) ? "N" : "T"; if (raw[s.key] !== want) bad.push(`${s.cell}${R.cn(s.key)}:${raw[s.key]}(应${want})`); }
for (const h of t.pool.heroBoxes) { const want = live.has(h.cell) ? "N" : "T"; if (h.state !== want) bad.push(`${h.cell}${R.cn(h.hero)}卡:${h.state}(应${want})`); }
console.log(`中局帧: 60 格判对 ${60 - bad.length}/60${bad.length ? " — 错: " + bad.join(", ") : ""}`); ok = ok && !bad.length;
console.log(ok ? "通过" : "失败"); process.exit(ok ? 0 : 1);
