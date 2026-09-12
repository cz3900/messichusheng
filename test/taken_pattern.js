"use strict";
/* 验证"被选走后的样子是固定的":同一局连续截图里, 同一格 选走前 vs 选走后 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const load = f => { const p = PNG.sync.read(fs.readFileSync(f)); return { w: p.width, h: p.height, data: p.data }; };
const G = 16;
function patch(img, b) {   // 内圈 60% 缩成 16×16×3(面积平均)
  const m = Math.floor(b[2] * 0.2), x = b[0] + m, y = b[1] + m, w = b[2] - 2 * m, h = b[3] - 2 * m, o = new Float32Array(G * G * 3);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { let r = 0, g = 0, bb = 0, n = 0;
    for (let yy = y + Math.floor(j * h / G); yy < y + Math.floor((j + 1) * h / G); yy++) for (let xx = x + Math.floor(i * w / G); xx < x + Math.floor((i + 1) * w / G); xx++) { const p = (yy * img.w + xx) * 4; r += img.data[p]; g += img.data[p + 1]; bb += img.data[p + 2]; n++; }
    o.set([r / n, g / n, bb / n], (j * G + i) * 3); } return o; }
const ncc = (a, b) => { let ma = 0, mb = 0; for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; } ma /= a.length; mb /= b.length;
  let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db + 1e-9); };
const fit = (x, y) => { let sx = 0, sy = 0, sxx = 0, sxy = 0; const n = x.length; for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; }
  const a = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - a * sx) / n; let res = 0, tot = 0; for (let i = 0; i < n; i++) { res += (y[i] - a * x[i] - b) ** 2; tot += (y[i] - sy / n) ** 2; } return { a, b, r2: 1 - res / (tot + 1e-9), rmse: Math.sqrt(res / n) }; };
const S = "/tmp/claude-1000/-home-ec2-user-work/2608dba7-e895-4f03-a37d-70fd076b49f3/scratchpad/adlogs/";
const fr = ["屏幕截图 2026-09-09 213834.png", "屏幕截图 2026-09-09 213916.png", "屏幕截图 2026-09-09 213928.png"].map(f => { const img = load(S + f); R.rescale(img.w, img.h); const P = R.readPool(img); const al = R.alignBoard(img, false); return { f, img, P, boxes: al.boxes }; });
const cellOf = (P, name) => { const s = P.skills.find(r => R.cn(r.key) === name); if (s) return s.cell; const h = P.heroBoxes.find(h => R.cn(h.hero) === name); return h ? h.cell : null; };
const pairs = [["风暴之拳", 0, 1], ["斯温", 1, 2]];
const takenP = [];
for (const [name, a, b] of pairs) { const cA = cellOf(fr[a].P, name), cB = cellOf(fr[b].P, name);
  const pa = patch(fr[a].img, fr[a].boxes[cA]), pb = patch(fr[b].img, fr[b].boxes[cB]); takenP.push([name, pb]);
  const gray = p => { const o = new Float32Array(G * G); for (let i = 0; i < G * G; i++) o[i] = (p[i * 3] + p[i * 3 + 1] + p[i * 3 + 2]) / 3; return o; };
  const f1 = fit(pa, pb), fg = fit(gray(pa), gray(pb));
  const mean = p => p.reduce((s, v) => s + v, 0) / p.length;
  console.log(`${name}: 选走前平均 ${mean(pa).toFixed(0)} → 选走后平均 ${mean(pb).toFixed(1)} | 选走后 vs 选走前 图案相关 ${ncc(pa, pb).toFixed(2)} | 线性拟合 后=${f1.a.toFixed(3)}×前+${f1.b.toFixed(1)} R²=${f1.r2.toFixed(2)} 残差 ${f1.rmse.toFixed(1)}`); }
console.log(`两个"选走后"格子之间的图案相关: ${ncc(takenP[0][1], takenP[1][1]).toFixed(2)}`);
// 同一帧里其它已选走格(感染)也看一眼
const f3 = fr[2], cI = cellOf(f3.P, "感染"); if (cI != null) { const pi = patch(f3.img, f3.boxes[cI]); console.log(`感染(已选走)与 风暴之拳(已选走) 图案相关 ${ncc(pi, takenP[0][1]).toFixed(2)}, 与 斯温(已选走) ${ncc(pi, takenP[1][1]).toFixed(2)}`); }
// 导出放大图肉眼看
const out = new PNG({ width: 64 * 4, height: 64 }); const put = (p, k) => { for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const s = ((y >> 2) * G + (x >> 2)) * 3, d = (y * out.width + k * 64 + x) * 4; const boost = k % 2 ? 4 : 1; out.data[d] = Math.min(255, p[s] * boost); out.data[d + 1] = Math.min(255, p[s + 1] * boost); out.data[d + 2] = Math.min(255, p[s + 2] * boost); out.data[d + 3] = 255; } };
put(patch(fr[0].img, fr[0].boxes[cellOf(fr[0].P, "风暴之拳")]), 0); put(takenP[0][1], 1); put(patch(fr[1].img, fr[1].boxes[cellOf(fr[1].P, "斯温")]), 2); put(takenP[1][1], 3);
fs.writeFileSync(S + "taken_pairs.png", PNG.sync.write(out)); console.log("对比图(选走后 ×4 提亮): " + S + "taken_pairs.png");
