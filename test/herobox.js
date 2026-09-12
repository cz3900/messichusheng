"use strict";
/* 把识别框(外扩 25%)裁出来拼图, 看英雄卡/边缘格子的框有没有对准; 红框=识别框, 绿框=九宫格统计用的内圈 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const p = PNG.sync.read(fs.readFileSync(process.argv[2])); const img = { w: p.width, h: p.height, data: p.data }; R.rescale(img.w, img.h);
const al = R.alignBoard(img, true), L = R.LAYOUT();
const det = new Set(Object.keys(al.boxes).filter(j => al.boxes[j] && al.detected && al.detected.has(+j)));
const cells = L.board.map((c, j) => ({ c, j })).filter(x => x.c.role === "hero" || x.c.col === 0 || x.c.col === 7);
const T = 120, out = new PNG({ width: T * 6, height: T * Math.ceil(cells.length / 6) });
cells.forEach(({ c, j }, n) => { const b = al.boxes[j], e = Math.round(b[2] * 0.25), ox = (n % 6) * T, oy = Math.floor(n / 6) * T;
  const X0 = b[0] - e, Y0 = b[1] - e, W = b[2] + 2 * e, H = b[3] + 2 * e;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const sx = Math.min(img.w - 1, Math.max(0, X0 + Math.floor(x * W / T))), sy = Math.min(img.h - 1, Math.max(0, Y0 + Math.floor(y * H / T)));
    const si = (sy * img.w + sx) * 4, di = ((oy + y) * out.width + ox + x) * 4; out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255; }
  const box = (bx, by, bw, bh, col) => { const tx = v => ox + Math.round((v - X0) * T / W), ty = v => oy + Math.round((v - Y0) * T / H);
    for (let x = tx(bx); x <= tx(bx + bw); x++) for (const y of [ty(by), ty(by + bh)]) { if (x < ox || x >= ox + T || y < oy || y >= oy + T) continue; const di = (y * out.width + x) * 4; out.data.set(col, di); }
    for (let y = ty(by); y <= ty(by + bh); y++) for (const x of [tx(bx), tx(bx + bw)]) { if (x < ox || x >= ox + T || y < oy || y >= oy + T) continue; const di = (y * out.width + x) * 4; out.data.set(col, di); } };
  box(b[0], b[1], b[2], b[3], [255, 40, 40, 255]); const m = Math.floor(b[2] * 0.2); box(b[0] + m, b[1] + m, b[2] - 2 * m, b[3] - 2 * m, [40, 255, 40, 255]); });
fs.writeFileSync(process.argv[3], PNG.sync.write(out)); console.log(`检出格 ${al.nd}/60, 拼了 ${cells.length} 个边缘格 → ${process.argv[3]}`);
