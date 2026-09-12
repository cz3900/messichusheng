"use strict";
/* 面板信号量化:"无英雄"标题 / 问号头像 与模板的相似度;4 个技能槽的亮度。模板取自朋友准备阶段截图(10 个面板全是无英雄、空槽) */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const S = "/tmp/claude-1000/-home-ec2-user-work/2608dba7-e895-4f03-a37d-70fd076b49f3/scratchpad/adlogs/";
const load = f => { const p = PNG.sync.read(fs.readFileSync(S + f)); return { w: p.width, h: p.height, data: p.data }; };
const L = JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json"));
const TITLE = { L: [60, 4, 330, 44], R: [90, 4, 380, 44] }, FACE = { L: [8, 40, 132, 220], R: [288, 40, 412, 220] };
function patch(img, side, i, r, G = 24) { const P = L.panels[side], x0 = P.x0 + r[0], y0 = P.y_top + P.pitch * i + r[1], w = r[2] - r[0], h = r[3] - r[1], o = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let k = 0; k < G; k++) { let s = 0, n = 0; for (let y = y0 + Math.floor(j * h / G); y < y0 + Math.floor((j + 1) * h / G); y++) for (let x = x0 + Math.floor(k * w / G); x < x0 + Math.floor((k + 1) * w / G); x++) { const p = (y * img.w + x) * 4; s += (img.data[p] + img.data[p + 1] + img.data[p + 2]) / 3; n++; } o[j * G + k] = s / n; } return o; }
const ncc = (a, b) => { let ma = 0, mb = 0; for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; } ma /= a.length; mb /= b.length; let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db + 1e-9); };
const slotB = (img, side, i) => L.panels[side].slots.map(([sx, sy, sw]) => { const P = L.panels[side], x0 = P.x0 + sx, y0 = P.y_top + P.pitch * i + sy; let s = 0, n = 0;
  for (let y = y0 + 10; y < y0 + sw - 10; y++) for (let x = x0 + 10; x < x0 + sw - 10; x++) { const p = (y * img.w + x) * 4; s += (img.data[p] + img.data[p + 1] + img.data[p + 2]) / 3; n++; } return Math.round(s / n); });
// 模板:朋友截图 10 个面板的平均
const F = load("shots/friend_2560.png"); const T = {};
for (const side of ["L", "R"]) { for (const [nm, r] of [["title", TITLE[side]], ["face", FACE[side]]]) { const acc = new Float32Array(24 * 24); for (let i = 0; i < 5; i++) { const q = patch(F, side, i, r); for (let k = 0; k < q.length; k++) acc[k] += q[k] / 5; } T[side + nm] = acc; } }
for (const f of ["shots/friend_2560.png", "屏幕截图 2026-09-09 213834.png", "屏幕截图 2026-09-09 213916.png", "屏幕截图 2026-09-09 213928.png", "image.png"]) {
  const img = load(f); console.log(`\n${path.basename(f)}`);
  for (const side of ["L", "R"]) for (let i = 0; i < 5; i++) { const t = ncc(patch(img, side, i, TITLE[side]), T[side + "title"]), fc = ncc(patch(img, side, i, FACE[side]), T[side + "face"]);
    const sb = slotB(img, side, i); console.log(`  ${side}${i + 1}: 标题像"无英雄" ${t.toFixed(2)}  头像像"问号" ${fc.toFixed(2)}  → ${t > 0.6 && fc > 0.6 ? "无英雄" : (t < 0.4 && fc < 0.4 ? "有英雄" : "?")}   技能槽亮度 [${sb.join(", ")}] → 有图标 ${sb.filter(v => v >= 35).length} 个`); } }
/* 标题只取"队伍颜色的字"(左绿/右红, 高饱和), 金色高亮光被色相过滤掉;字形二值图与"无英雄"比 */
function titleMask(img, side, i, G = 48) { const P = L.panels[side], r = TITLE[side], x0 = P.x0 + r[0], y0 = P.y_top + P.pitch * i + r[1], w = r[2] - r[0], h = r[3] - r[1], o = new Float32Array(G * 12);
  for (let j = 0; j < 12; j++) for (let k = 0; k < G; k++) { let s = 0, n = 0;
    for (let y = y0 + Math.floor(j * h / 12); y < y0 + Math.floor((j + 1) * h / 12); y++) for (let x = x0 + Math.floor(k * w / G); x < x0 + Math.floor((k + 1) * w / G); x++) {
      const p = (y * img.w + x) * 4, rr = img.data[p], gg = img.data[p + 1], bb = img.data[p + 2]; n++;
      const isText = side === "L" ? (gg > 150 && gg > rr * 1.5 && gg > bb * 1.5) : (rr > 150 && rr > gg * 1.8 && rr > bb * 1.8); if (isText) s++; }
    o[j * G + k] = s / n; } return o; }
const TM = {}; for (const side of ["L", "R"]) { const acc = new Float32Array(48 * 12); for (let i = 0; i < 5; i++) { const q = titleMask(F, side, i); for (let k = 0; k < q.length; k++) acc[k] += q[k] / 5; } TM[side] = acc; }
console.log("\n==== 标题只看队伍颜色的字:与\"无英雄\"字形的相似度 / 字的像素量");
for (const f of ["shots/friend_2560.png", "屏幕截图 2026-09-09 213834.png", "屏幕截图 2026-09-09 213916.png", "屏幕截图 2026-09-09 213928.png", "image.png"]) {
  const img = load(f); const row = [];
  for (const side of ["L", "R"]) for (let i = 0; i < 5; i++) { const m = titleMask(img, side, i), c = ncc(m, TM[side]), ink = m.reduce((a, b) => a + b, 0);
    row.push(`${side}${i + 1} ${c.toFixed(2)}/${ink.toFixed(0)}${c > 0.6 ? "无" : c < 0.35 ? "有" : "?"}`); }
  console.log(`  ${path.basename(f).padEnd(28)} ${row.join("  ")}`); }
