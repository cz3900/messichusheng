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
const files = process.argv.slice(2); const imgs = files.map(load); R.rescale(imgs[0].w, imgs[0].h);
const t = new R.Tracker(); t.reset(imgs[0]);
console.log(`以 ${files[0]} 为开局参考;开局前已被选(纯黑): ${t.preTaken.map(k => R.cn(k.replace(/^hero:/, ""))).join(", ") || "无"}`);
files.forEach((f, i) => { let St; for (let k = 0; k < 3; k++) St = t.update(imgs[i]);
  const raw = R.takenFlags(imgs[i], t.refB, t.pool, R.alignBoard(imgs[i], false).boxes, t.refS);
  const cnt = { N: 0, T: 0, O: 0 }; Object.values(raw).forEach(v => cnt[v]++); t.pool.heroBoxes.forEach(h => cnt[h.state]++);
  const O = Object.entries(raw).filter(([, v]) => v === "O").map(([k]) => R.cn(k)).concat(t.pool.heroBoxes.filter(h => h.state === "O").map(h => R.cn(h.hero) + "(英雄)"));
  console.log(`${f}: 没变 ${cnt.N} / 被选走 ${cnt.T} / 看不清 ${cnt.O}${O.length ? " (" + O.join(", ") + ")" : ""}  → 确认已选走: ${St.skills.filter(s => s.taken).map(s => R.cn(s.key)).concat(St.taken_heroes.map(h => R.cn(h) + "(英雄)")).join(", ") || "无"}`); });
