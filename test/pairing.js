"use strict";
/* 配对式归属:① 正常选技能(棋盘变暗+面板多图标) ② 暗图标误判(只有棋盘) ③ 棋盘漏看(只有面板) ④ 英雄按回合填空 ⑤ 悬停预览(只有当前选人的面板) */
const R = require("../recog.js"), S = require("./synth.js"), fs = require("fs"), path = require("path");
const D = path.join(__dirname, "..", "data"); const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const round = []; for (let i = 0; i < 5; i++) round.push(i, 5 + i); const ORDER = []; for (let r = 0; r < 5; r++) ORDER.push(...(r % 2 ? round.slice().reverse() : round));
const H = S.pickHeroes(12, 3), K = h => S.HERO[h]; const sid = x => (x < 5 ? "L" : "R") + (x % 5);
const t = new R.Tracker(); t.fullOrder = ORDER; t.reset(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] }));
const picks = []; let cur = 0;
const frame = (extra = {}) => S.render({ heroes: H, cur: [sid(ORDER[cur])[0], +sid(ORDER[cur]).slice(1)], me: ["R", 2], picks, ...extra });
// 真实落子之后再来一手:R2 选技能(配对应正常)
const step = (n, name, extra) => { let St; for (let i = 0; i < n; i++) St = t.update(frame(extra)); const lg = t.log.splice(0); if (lg.length) console.log(`  ${name}: ` + lg.map(([a, k, q, how]) => `${R.cn(k) || ""}→${q} [${how}]`).join(" ; ")); return St; };
step(2, "开局");
// ① 正常:L1 选技能, R1 选英雄(按回合), L2 选技能
picks.push(["L0", K(H[0]).basics[0]]); step(3, "① L1 选技能"); cur = 1;
picks.push(["R0", "hero:" + H[1]]); step(3, "④ R1 选英雄"); cur = 2;
picks.push(["L1", K(H[2]).ult]); step(3, "① L2 选大招"); cur = 3;
// ⑥ 拖动:L1 把已有的掘地穿刺拖起来(3 帧空着), 再放到第 3 格 —— 不应当成新落子
const a0 = K(H[0]).basics[0], rest = () => picks.filter(([q]) => q !== "L0");
step(3, "⑥ L1 拖起技能(那一格空着)", { picks: rest(), taken: new Set([a0]), panels: { L0: { skills: [] } } });
step(3, "⑥ 放到第 3 格", { picks: rest(), taken: new Set([a0]), panels: { L0: { skills: [null, null, a0] } } });
step(2, "⑥ 之后正常", { picks: rest(), taken: new Set([a0]), panels: { L0: { skills: [null, null, a0] } } });
// ② 暗图标误判:某格只在棋盘上变暗, 没有面板变化
const fake = K(H[4]).basics[1]; step(6, "② 只有棋盘变暗(模拟暗图标)", { taken: new Set([fake]) });
// ③ 棋盘漏看:R2 的面板多了图标, 但棋盘上那格没变暗
const miss = K(H[5]).basics[2]; step(5, "③ 只有面板多图标(棋盘漏看)", { panels: { R1: { skills: [miss] } } });
// ⑤ 悬停预览:当前选人 R2 自己面板多出一个图标, 棋盘不变
picks.push(["R1", miss]); cur = 4;   // (上一步其实是 R2 真选了, 补进 picks 保持一致)
const hover = K(H[6]).basics[0]; step(3, "⑤ 当前选人 L3 面板闪出预览", { panels: { L2: { skills: [hover] } } });
step(2, "   预览消失");
picks.push(["R1", K(H[8]).basics[0]]); cur = 5; step(3, "⑦ 拖动之后的正常落子(R2)");
const St = t.update(frame()); console.log("\n最终认定:", t.snapshotLine()); console.log("没认出的:", (t.unknownBy || []).length); console.log("回合数 turn =", t.turn, " 不当落子:", Object.keys(t.suspect).map(R.cn).join(","));
