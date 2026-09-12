"use strict";
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const S = "/tmp/claude-1000/-home-ec2-user-work/2608dba7-e895-4f03-a37d-70fd076b49f3/scratchpad/adlogs/";
const load = f => { const p = PNG.sync.read(fs.readFileSync(S + f)); return { w: p.width, h: p.height, data: p.data }; };
/* 把 image.png 里所有"已选走"的格子(暗)原样裁出来, 亮度×3, 连同它们的行列 → 看是不是同一种"空底座"图案 */
const img = load("image.png"); R.rescale(img.w, img.h); const t = new R.Tracker(); t.reset(img); let St; for (let i = 0; i < 6; i++) St = t.update(img);
const L = R.LAYOUT(), { boxes } = R.alignBoard(img, false);
const takenCells = t.pool.skills.filter(r => St.skills.find(s => s.key === r.key && s.taken)).map(r => [r.cell, R.cn(r.key)]).concat(t.pool.heroBoxes.filter(h => St.taken_heroes.includes(h.hero)).map(h => [h.cell, R.cn(h.hero) + "(英雄)"]));
const T = 110, cols = 7, out = new PNG({ width: T * cols, height: T * Math.ceil(takenCells.length / cols) });
takenCells.forEach(([cell, name], n) => { const b = boxes[cell], ox = (n % cols) * T, oy = Math.floor(n / cols) * T;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const sx = b[0] + Math.floor(x * b[2] / T), sy = b[1] + Math.floor(y * b[3] / T), si = (sy * img.w + sx) * 4, di = ((oy + y) * out.width + ox + x) * 4;
    out.data[di] = Math.min(255, img.data[si] * 3); out.data[di + 1] = Math.min(255, img.data[si + 1] * 3); out.data[di + 2] = Math.min(255, img.data[si + 2] * 3); out.data[di + 3] = 255; }
  console.log(`${n + 1}. (${L.board[cell].row},${L.board[cell].col}) ${L.board[cell].role} ${name}`); });
fs.writeFileSync(S + "taken_all.png", PNG.sync.write(out)); console.log(S + "taken_all.png");
