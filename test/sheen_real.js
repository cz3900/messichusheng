"use strict";
/* 09-11 测试者 1080p 截图(fixtures/sheen_1080p_0911.png):影魔已被右3 选走, 插件却一直推荐影魔。
   根因:棋盘左下角的格子选走后是"带高光的光面黑"(亮度 35~67), 影魔原画本来就暗(~46), 按亮度永远判"没变"。
   没有开局图 → 把游戏素材(英雄横版原画 / 技能图标)贴回这几格当"开局样子", 走真实的 takenFlags 判定。
   期望:影魔卡 / 魔王降临(光面反光)/ 毁灭阴影(纯黑)三格都判 T;贴回素材的开局帧自己全部 N。 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data"), ICON = path.join(__dirname, "..", "..", "plugin", "icons");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const load = f => { const p = PNG.sync.read(fs.readFileSync(f)); return { w: p.width, h: p.height, data: p.data }; };
const now = load(process.argv[2] || path.join(__dirname, "fixtures", "sheen_1080p_0911.png")); R.rescale(now.w, now.h);
const { boxes } = R.alignBoard(now, true);
const before = { w: now.w, h: now.h, data: Uint8Array.from(now.data) };
const blit = (src, sx, sy, sw, sh, b) => { for (let j = 0; j < b[3]; j++) for (let i = 0; i < b[2]; i++) {
  const q = (Math.floor(sy + j * sh / b[3]) * src.w + Math.floor(sx + i * sw / b[2])) * 4, p = ((b[1] + j) * now.w + b[0] + i) * 4; for (let c = 0; c < 3; c++) before.data[p + c] = src.data[q + c]; } };
const H = "npc_dota_hero_nevermore", pool = { skills: [{ key: "nevermore_dark_lord", cell: 53 }, { key: "nevermore_shadowraze2", cell: 55 }], heroBoxes: [{ hero: H, cell: 52 }] };
{ const s = load(`${ICON}/heroes_land/${H}.png`); blit(s, Math.round((s.w - s.h) / 2), 0, s.h, s.h, boxes[52]); }
for (const r of pool.skills) { const s = load(`${ICON}/full/${r.key}.png`); blit(s, 0, 0, s.w, s.h, boxes[r.cell]); }
const refB = {}, refS = {};
for (const c of [52, 53, 55]) { const st = R.cellStats(before, boxes[c]); refB[c] = Math.max(12, st.mean); refS[c] = st.sat; }
let ok = true;
const show = (tag, img, want) => { const out = R.takenFlags(img, refB, pool, boxes, refS); out[H] = pool.heroBoxes[0].state;
  const line = Object.entries(out).map(([k, v]) => { const good = v === want; ok = ok && good; return `${R.cn(k)}=${v}${good ? "" : "✗"}`; }).join("  ");
  console.log(`${tag}: ${line}`); };
for (const c of [52, 53, 55]) { const a = R.cellStats(before, boxes[c]), b = R.cellStats(now, boxes[c]);
  console.log(`格 ${c}: 开局 亮${a.mean.toFixed(0)} 饱和${a.sat.toFixed(2)} → 截图 亮${b.mean.toFixed(0)}/最亮格${b.max.toFixed(0)} 饱和${b.sat.toFixed(2)}`); }
show("开局帧(应全 N)", before, "N");
show("截图帧(应全 T)", now, "T");
console.log(ok ? "通过" : "失败"); process.exit(ok ? 0 : 1);
