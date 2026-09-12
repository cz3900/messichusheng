"use strict";
/* 真实截图序列走完整新流程(配对式归属)。9/9 那组:同一局连续三张;真实答案:左1 选风暴之拳, 右1 被指定斯温, 感染没人选 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const S = "/tmp/claude-1000/-home-ec2-user-work/2608dba7-e895-4f03-a37d-70fd076b49f3/scratchpad/adlogs/";
const round = []; for (let i = 0; i < 5; i++) round.push(i, 5 + i); const ORDER = []; for (let r = 0; r < 5; r++) ORDER.push(...(r % 2 ? round.slice().reverse() : round));
const files = process.argv.slice(2).map(f => { const p = PNG.sync.read(fs.readFileSync(S + f)); return [f, { w: p.width, h: p.height, data: p.data }]; });
R.rescale(files[0][1].w, files[0][1].h); const t = new R.Tracker(); t.fullOrder = ORDER; t.reset(files[0][1]);
for (const [f, img] of files) { let St; for (let k = 0; k < 6; k++) St = t.update(img);   // 每张当 6 帧连续画面
  console.log(`\n${path.basename(f)}: 当前选人 ${St.current.side}${St.current.idx + 1} | 面板图标数 ${St.panels.map(p => p.filled).join("")} | 引擎看到已被拿走: ${St.skills.filter(x => x.taken).map(x => R.cn(x.key)).concat(St.taken_heroes.map(h => R.cn(h) + "(英雄)")).join(", ") || "无"}`);
  for (const [a, k, q, how] of t.log.splice(0)) console.log(`   ${a === "note" ? "·" : "→"} ${R.cn(k) || ""} ${q ? "归 " + q : ""} [${how}]`);
  console.log("   完整认定: " + t.snapshotLine()); }
