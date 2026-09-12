"use strict";
/* 特征验证:已选走 = 同一张图标的"去色+压暗"版。看 饱和度 与 灰度图案相关(与参考帧同一格比) */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const S = "/tmp/claude-1000/-home-ec2-user-work/2608dba7-e895-4f03-a37d-70fd076b49f3/scratchpad/adlogs/";
const load = f => { const p = PNG.sync.read(fs.readFileSync(S + f)); return { w: p.width, h: p.height, data: p.data }; };
const G = 16;
function feats(img, b) { const m = Math.floor(b[2] * 0.2), x = b[0] + m, y = b[1] + m, w = b[2] - 2 * m, h = b[3] - 2 * m, lum = new Float32Array(G * G);
  let sat = 0, ns = 0, L = 0;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { let s = 0, n = 0;
    for (let yy = y + Math.floor(j * h / G); yy < y + Math.floor((j + 1) * h / G); yy++) for (let xx = x + Math.floor(i * w / G); xx < x + Math.floor((i + 1) * w / G); xx++) {
      const p = (yy * img.w + xx) * 4, r = img.data[p], g = img.data[p + 1], bb = img.data[p + 2], mx = Math.max(r, g, bb), mn = Math.min(r, g, bb);
      s += 0.299 * r + 0.587 * g + 0.114 * bb; n++; if (mx >= 20) { sat += (mx - mn) / mx; ns++; } }
    lum[j * G + i] = s / n; L += s / n; }
  return { lum, L: L / (G * G), sat: ns ? sat / ns : 0 }; }
const ncc = (a, b) => { let ma = 0, mb = 0; for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; } ma /= a.length; mb /= b.length;
  let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db + 1e-9); };
const prep = f => { const img = load(f); R.rescale(img.w, img.h); const P = R.readPool(img); const { boxes } = R.alignBoard(img, false); return { img, P, boxes }; };
const cellOf = (P, name) => { const s = P.skills.find(r => R.cn(r.key) === name); if (s) return s.cell; const h = P.heroBoxes.find(h => R.cn(h.hero) === name); return h ? h.cell : null; };
const A = prep("屏幕截图 2026-09-09 213834.png"), B = prep("屏幕截图 2026-09-09 213916.png"), C = prep("屏幕截图 2026-09-09 213928.png");
console.log("== 同一格 选走前 → 选走后(同一局连续截图)");
for (const [name, X, Y] of [["风暴之拳", A, B], ["斯温", B, C]]) { const fx = feats(X.img, X.boxes[cellOf(X.P, name)]), fy = feats(Y.img, Y.boxes[cellOf(Y.P, name)]);
  console.log(`  ${name}: 亮度 ${fx.L.toFixed(0)}→${fy.L.toFixed(0)} (${(fy.L / fx.L).toFixed(2)}×) | 饱和度 ${fx.sat.toFixed(2)}→${fy.sat.toFixed(2)} | 灰度图案相关 ${ncc(fx.lum, fy.lum).toFixed(2)}`); }
console.log("== 同一局里一直没被选的格子(选走前后两帧对比, 应该不变)");
for (const name of ["巨力挥舞", "战吼", "神灵", "狂暴"]) { const c1 = cellOf(A.P, name), c2 = cellOf(B.P, name); if (c1 == null || c2 == null) continue; const fx = feats(A.img, A.boxes[c1]), fy = feats(B.img, B.boxes[c2]);
  console.log(`  ${name}: 亮度 ${(fy.L / fx.L).toFixed(2)}× | 饱和度 ${fx.sat.toFixed(2)}→${fy.sat.toFixed(2)} | 灰度图案相关 ${ncc(fx.lum, fy.lum).toFixed(2)}`); }
console.log("== image.png 全部格子的饱和度分布(已选走 vs 没选走)");
{ const I = prep("image.png"); const t = new R.Tracker(); t.reset(I.img); let St; for (let i = 0; i < 6; i++) St = t.update(I.img);
  const tk = new Set(St.skills.filter(s => s.taken).map(s => s.key).concat(St.taken_heroes));
  const rows = t.pool.skills.map(r => [r.key, r.cell, false]).concat(t.pool.heroBoxes.map(h => [h.hero, h.cell, true])).map(([k, c, hero]) => ({ k, hero, f: feats(I.img, I.boxes[c]), taken: tk.has(k) }));
  const show = arr => arr.map(r => r.f.sat.toFixed(2)).sort().join(" ");
  console.log(`  已选走(${rows.filter(r => r.taken).length}) 饱和度: ${show(rows.filter(r => r.taken))}`);
  console.log(`  没选走(${rows.filter(r => !r.taken).length}) 饱和度: ${show(rows.filter(r => !r.taken))}`); }
console.log("== 朋友截图:技能介绍框底下(右上区)那些格子的饱和度");
{ const F = prep("shots/friend_2560.png"); const L = R.LAYOUT();
  const under = F.P.skills.map(r => [r.key, r.cell]).concat(F.P.heroBoxes.map(h => [h.hero, h.cell])).filter(([k, c]) => { const b = L.board[c]; return (b.row >= 2 && b.row <= 4 && b.col >= 4) || (b.row === 0 && b.col === 5); });
  console.log("  " + under.map(([k, c]) => `${R.cn(k)} ${feats(F.img, F.boxes[c]).sat.toFixed(2)}`).join(" | "));
  const dark = ["潮汐猎人", "美杜莎", "编织者"].map(n => { const c = cellOf(F.P, n); return `${n}(暗色原画) ${feats(F.img, F.boxes[c]).sat.toFixed(2)}`; }); console.log("  " + dark.join(" | ")); }
