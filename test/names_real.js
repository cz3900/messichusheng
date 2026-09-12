"use strict";
/* 面板英雄名(英雄的第二信号), 真实截图:① 朋友 2560 中局(不朽尸王 L3 正在选、琼英碧灵 L5、混沌骑士 R5)② 测试者 1080 中局(8 个英雄)
   期望:名字确认的座位全对, 没有一个认错;"无英雄"的面板不会被认成有英雄 */
const fs = require("fs"), path = require("path"), { PNG } = require("pngjs");
const R = require("../recog.js"), D = path.join(__dirname, "..", "data");
const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const round = []; for (let i = 0; i < 5; i++) round.push(i, 5 + i); const ORDER = []; for (let r = 0; r < 5; r++) ORDER.push(...(r % 2 ? round.slice().reverse() : round));
const ld = f => { const p = PNG.sync.read(fs.readFileSync(f)); return { w: p.width, h: p.height, data: p.data }; };
const meta = JSON.parse(fs.readFileSync(D + "/meta.json")), key = c => Object.keys(meta.cn.hero).find(k => meta.cn.hero[k] === c);
let ok = true;
const run = (name, file, truth) => { const img = ld(file); R.rescale(img.w, img.h); const t = new R.Tracker(); t.fullOrder = ORDER; t.reset(img);
  const poolCn = t.pool.poolHeroes.map(R.cn); const t0 = Date.now(); for (let i = 0; i < 30; i++) t.update(img); const ms = (Date.now() - t0) / 30;
  const got = Object.entries(t.nameHero || {}).map(([k, h]) => `${k[0]}${+k.slice(1) + 1}=${R.cn(h)}`).sort();   // 座位转成 1 开始
  const bad = got.filter(g => { const [k, h] = g.split("="); return truth[k] !== h; });
  const inPool = Object.entries(truth).filter(([, h]) => poolCn.includes(h)).map(([k, h]) => `${k}=${h}`).sort();
  console.log(`${name}: 名字确认 ${got.join(" ") || "无"} | 应认出(在识别到的池子里) ${inPool.join(" ")} | 每帧 ${ms.toFixed(0)}ms`);
  const c = (w, v) => { console.log(`  ${v ? "✓" : "✗"} ${w}`); ok = ok && v; };
  c("没有认错的", bad.length === 0); console.log(`  认出 ${inPool.filter(x => got.includes(x)).length}/${inPool.length}(认不准的不确认, 退回按回合推算)`); };
const O = path.join(__dirname, "fixtures");
run("朋友 2560 中局", path.join(O, "friend_mid_2560.png"), { L3: "不朽尸王", L5: "琼英碧灵", R5: "混沌骑士" });
run("测试者 1080 中局", path.join(O, "sheen_1080p_0911.png"), { L1: "复仇之魂", L2: "虚空假面", L4: "暗影恶魔", R1: "莉娜", R2: "魅惑魔女", R3: "影魔", R4: "潮汐猎人", R5: "蝙蝠骑士" });
console.log(ok ? "通过" : "失败"); process.exit(ok ? 0 : 1);
