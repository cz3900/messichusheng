"use strict";
/* 真机基准 / 回放共用的环境:加载图标库、发现真实截图、按需读图(一次一张, 读完即弃 —— 服务器内存有限)。 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
let inited = false;
function init() { if (inited) return R; inited = true;
  R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
    names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
    meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
    bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
  return R; }
/* 真机截图目录:realframes/(主)、realframes/v116/、test/fixtures/。同名内容(md5 前 8 位)只留一份。 */
const DIRS = [path.join(__dirname, "..", "..", "realframes"), path.join(__dirname, "..", "..", "realframes", "v116"), path.join(__dirname, "fixtures")];
function frames() {
  const seen = new Map(), out = [];
  for (const d of DIRS) { if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).sort()) { if (!f.toLowerCase().endsWith(".png")) continue;
      const p = path.join(d, f), st = fs.statSync(p);
      const key = st.size;                                     // 同尺寸文件再比前 4KB, 够区分
      const head = fs.readFileSync(p).slice(0, 4096).toString("latin1");
      const sig = key + ":" + require("crypto").createHash("md5").update(head).digest("hex").slice(0, 8);
      if (seen.has(sig)) continue; seen.set(sig, f);
      out.push({ name: f.replace(/\.png$/i, ""), path: p, size: st.size }); } }
  return out;
}
function load(p) { const g = PNG.sync.read(fs.readFileSync(p)); return { w: g.width, h: g.height, data: g.data }; }
module.exports = { init, frames, load, R };
