"use strict";
/* v1.9:09-11 1080p 那局日志里的三类漏认, 用合成画面复现:
   ① 暗色图标进面板(整格平均 ~30, 以前 <40 被当空槽 → 棋盘那格"不当落子")
   ② 面板先多出一件但认不准(1080p 只有 0.3~0.5)→ 记"没认出";棋盘那格晚几秒才确认变暗 → 应补认成同一手
   ③ 反过来:棋盘先变暗(没面板→判不当落子), 面板图标后到且认不准 → 应认成那格
   ④ 锁池:某个大招格分数很低(<0.25), 应按排除法配给剩下那个英雄的大招, 而不是"未知技能" */
const R = require("../recog.js"), S = require("./synth.js"), fs = require("fs"), path = require("path");
const D = path.join(__dirname, "..", "data"); const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
const round = []; for (let i = 0; i < 5; i++) round.push(i, 5 + i); const ORDER = []; for (let r = 0; r < 5; r++) ORDER.push(...(r % 2 ? round.slice().reverse() : round));
const H = S.pickHeroes(12, 3), K = h => S.HERO[h]; const sid = x => (x < 5 ? "L" : "R") + (x % 5);
const L = S.LAYOUT; const slotBox = (side, idx, j) => { const P = L.panels[side], [sx, sy, sw] = P.slots[j]; return [P.x0 + sx, P.y_top + P.pitch * idx + sy, sw, sw]; };
/* 图像后处理:整格变暗 / 和噪声混合(降低图标匹配分, 模拟 1080p 的面板小图标) */
const edit = (img, b, f) => { for (let y = b[1]; y < b[1] + b[3]; y++) for (let x = b[0]; x < b[0] + b[2]; x++) { const p = (y * img.w + x) * 4; f(img.data, p, x, y); } };
const darken = (img, b, k) => edit(img, b, (d, p) => { d[p] *= k; d[p + 1] *= k; d[p + 2] *= k; });
const degrade = (img, b, a, seed) => { let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  edit(img, b, (d, p) => { const n = 40 + 160 * rnd(); for (let c = 0; c < 3; c++) d[p + c] = a * d[p + c] + (1 - a) * n; }); };
let ok = true; const check = (what, cond) => { console.log(`${cond ? "✓" : "✗"} ${what}`); ok = ok && cond; };
const lastLog = t => t.log.splice(0).map(([a, k, q, how]) => `${R.cn(k) || ""}→${q} [${how}]`);

{ console.log("① 暗色图标进面板");
  const t = new R.Tracker(); t.fullOrder = ORDER; t.reset(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] }));
  const k = K(H[0]).basics[0], picks = [["L0", k]];
  for (let i = 0; i < 2; i++) t.update(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] })); t.log.splice(0);
  for (let i = 0; i < 4; i++) { const img = S.render({ heroes: H, cur: ["L", 0], me: ["R", 2], picks }); darken(img, slotBox("L", 0, 0), 0.3); t.update(img); }
  { const img = S.render({ heroes: H, cur: ["L", 0], me: ["R", 2], picks }), b = slotBox("L", 0, 0); darken(img, b, 0.3); let m = 0; edit(img, b, (d, p) => { m += (d[p] + d[p + 1] + d[p + 2]) / 3; });
    console.log(`   (压暗后整格平均 ${(m / (b[2] * b[3])).toFixed(0)}, 旧规则 <40 算空槽;最亮一格 ${R.cellStats(img, b).max.toFixed(0)})`); }
  const lg = lastLog(t); console.log("   " + lg.join(" ; "));
  check(`${R.cn(k)} 面板图标压暗到 0.3 倍后仍配给 L1`, t.owner[k] && t.owner[k][0] === "L" && t.owner[k][1] === 0); }

{ console.log("② 面板先到(认不准) → 棋盘晚到");
  const t = new R.Tracker(); t.fullOrder = ORDER; t.reset(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] }));
  const k = K(H[3]).basics[1];
  for (let i = 0; i < 2; i++) t.update(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] })); t.log.splice(0);
  const pan = { L0: { skills: [k] } };
  const f = (taken, cur) => { const img = S.render({ heroes: H, cur, me: ["R", 2], panels: pan, taken }); degrade(img, slotBox("L", 0, 0), 0.45, 7); return img; };
  { const img = f(new Set(), ["R", 0]); const r = R.readPanels(img, t.pool.skills.map(s => s.key)).find(p => p.side === "L" && p.idx === 0); console.log(`   (面板那格匹配分 ${r.skills[0] ? r.skills[0].s.toFixed(2) : "空"}, 模拟 1080p 认不准)`); }
  for (let i = 0; i < 6; i++) t.update(f(new Set(), ["R", 0]));        // 棋盘还没变暗:面板多一件 → 认不出
  console.log("   " + lastLog(t).join(" ; "));
  for (let i = 0; i < 7; i++) t.update(f(new Set([k]), ["R", 0]));     // 棋盘那格这才变暗
  console.log("   " + lastLog(t).join(" ; "));
  check(`${R.cn(k)} 最终归 L1, 没有剩下"没认出"`, t.owner[k] && t.owner[k][0] === "L" && t.owner[k][1] === 0 && !(t.unknownBy || []).length && !t.suspect[k]); }

{ console.log("③ 棋盘先到(判不当落子) → 面板晚到且认不准");
  const t = new R.Tracker(); t.fullOrder = ORDER; t.reset(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] }));
  const k = K(H[5]).basics[2];
  for (let i = 0; i < 2; i++) t.update(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] })); t.log.splice(0);
  for (let i = 0; i < 6; i++) t.update(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2], taken: new Set([k]) }));
  console.log("   " + lastLog(t).join(" ; "));
  const f = () => { const img = S.render({ heroes: H, cur: ["R", 0], me: ["R", 2], panels: { L0: { skills: [k] } }, taken: new Set([k]) }); degrade(img, slotBox("L", 0, 0), 0.45, 11); return img; };
  for (let i = 0; i < 7; i++) t.update(f());
  console.log("   " + lastLog(t).join(" ; "));
  check(`${R.cn(k)} 最终归 L1, 不再是不当落子`, t.owner[k] && t.owner[k][0] === "L" && t.owner[k][1] === 0 && !t.suspect[k] && !(t.unknownBy || []).length); }

{ console.log("④ 锁池:一个大招格认不准");
  const img = S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] });
  const cells = L.board.map((c, j) => [c, j]).filter(([c]) => c.role === "ult"); const [c0, j0] = cells[5];
  const truth = S.cellKey(H, c0);
  degrade(img, [Math.round(c0.cx - c0.w / 2), Math.round(c0.cy - c0.w / 2), Math.round(c0.w), Math.round(c0.w)], 0.1, 3);
  const P = R.readPool(img); const r = P.skills.find(s => s.cell === j0);
  console.log(`   格 ${j0} 真实 = ${R.cn(truth.key)};读成 ${R.cn(r.key)} ${r.s1.toFixed(2)}${r.byElim ? " (排除法)" : ""}`);
  check("认不准的大招格按排除法配对正确", r.key === truth.key && r.byElim);
  const P0 = R.readPool(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] }));
  check("正常画面:12 个大招格都直接认出(没有走排除法)", P0.skills.filter(s => s.ultslot && !s.unknown && !s.byElim).length === 12); }
{ console.log("⑤ 09-11 莉娜/复仇之魂对调的真实时序:L1 选技能(面板图标晚几秒才出现) → R1 秒选英雄 → …… → L1 再选英雄");
  const t = new R.Tracker(); t.fullOrder = ORDER; t.reset(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] }));
  const k = K(H[3]).basics[2], hR1 = H[7], hL1 = H[9];
  for (let i = 0; i < 2; i++) t.update(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] }));
  const f = (o) => S.render({ heroes: H, me: ["R", 2], ...o });
  for (let i = 0; i < 2; i++) t.update(f({ cur: ["R", 0], taken: new Set([k]) }));                                   // L1 落子:棋盘变暗, 面板还没出现
  for (let i = 0; i < 3; i++) t.update(f({ cur: ["R", 0], taken: new Set([k]), takenHeroes: new Set([hR1]) }));      // R1 秒选英雄
  for (let i = 0; i < 6; i++) t.update(f({ cur: ["L", 1], taken: new Set([k]), takenHeroes: new Set([hR1]), panels: { L0: { skills: [k] } } }));   // L1 面板图标这才出现
  console.log("   " + lastLog(t).join(" ; "));
  check(`${R.cn(hR1)} 归 R1(第 2 手)`, t.heroOf[hR1] && t.heroOf[hR1][0] === "R" && t.heroOf[hR1][1] === 0);
  check(`${R.cn(k)} 归 L1`, t.owner[k] && t.owner[k][0] === "L" && t.owner[k][1] === 0); }
{ console.log("⑥ 锁池晚了一步(L1 已经选了一件) → R1 选技能(面板图标晚到) → L2 秒选英雄:按时间复核仍要生效");
  const k1 = K(H[0]).basics[0], k2 = K(H[4]).basics[1], hL2 = H[6];
  const t = new R.Tracker(); t.fullOrder = ORDER;
  const f = (o) => S.render({ heroes: H, me: ["R", 2], ...o });
  t.reset(f({ cur: ["R", 0], taken: new Set([k1]), panels: { L0: { skills: [k1] } } }));
  for (let i = 0; i < 2; i++) t.update(f({ cur: ["R", 0], taken: new Set([k1]), panels: { L0: { skills: [k1] } } }));
  for (let i = 0; i < 2; i++) t.update(f({ cur: ["L", 1], taken: new Set([k1, k2]), panels: { L0: { skills: [k1] } } }));                       // R1 落子, 面板还没出现
  for (let i = 0; i < 3; i++) t.update(f({ cur: ["L", 1], taken: new Set([k1, k2]), takenHeroes: new Set([hL2]), panels: { L0: { skills: [k1] } } }));   // L2 秒选英雄
  for (let i = 0; i < 6; i++) t.update(f({ cur: ["R", 1], taken: new Set([k1, k2]), takenHeroes: new Set([hL2]), panels: { L0: { skills: [k1] }, R0: { skills: [k2] } } }));
  console.log("   " + lastLog(t).join(" ; "));
  check(`${R.cn(hL2)} 归 L2(第 3 手)`, t.heroOf[hL2] && t.heroOf[hL2][0] === "L" && t.heroOf[hL2][1] === 1);
  check("没有两个英雄同座", new Set(Object.values(t.heroOf).map(q => q.join())).size === Object.keys(t.heroOf).length); }
{ console.log("⑦ 09-11 第 3 局:已确认的英雄卡被鼠标悬停时\"亮回来\" —— 不许撤销(以前撤了, 还推荐给他, 英雄对调)");
  const t = new R.Tracker(); t.fullOrder = ORDER; t.reset(S.render({ heroes: H, cur: ["L", 0], me: ["L", 1] }));
  const h = H[4], f = (o) => S.render({ heroes: H, me: ["L", 1], ...o });
  for (let i = 0; i < 2; i++) t.update(f({ cur: ["L", 0] }));
  for (let i = 0; i < 12; i++) t.update(f({ cur: ["R", 0], takenHeroes: new Set([h]) }));              // 左1 拿了这张卡, 确认了很久
  const before = t.heroOf[h] && t.heroOf[h].join("");
  for (let i = 0; i < 8; i++) t.update(f({ cur: ["L", 1], takenHeroes: new Set() }));                 // 卡面"亮回来"(悬停时游戏把原画亮出来)
  console.log("   " + lastLog(t).join(" ; "));
  check(`${R.cn(h)} 先记给 L1, 卡面亮回来 8 帧后仍归 L1、仍算已被拿走`, before === "L0" && t.heroOf[h] && t.heroOf[h].join("") === "L0" && t.state(t.prev).taken_heroes.includes(h)); }
{ console.log("⑧ 鼠标停在某格上:这一格的明暗变化一律不算");
  const t = new R.Tracker(); t.fullOrder = ORDER; t.reset(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] }));
  const k = K(H[2]).basics[1], cell = t.pool.skills.find(r => r.key === k).cell, b = t.pool.skills.find(r => r.key === k).box;
  for (let i = 0; i < 2; i++) t.update(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] }));
  t.cursor = [b[0] + b[2] / 2, b[1] + b[3] / 2];
  for (let i = 0; i < 6; i++) t.update(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2], taken: new Set([k]) }));   // 鼠标下那格变暗(悬停效果)
  check(`鼠标下的 ${R.cn(k)} 变暗 6 帧不算被选走`, !t.stable[k]);
  t.cursor = null; for (let i = 0; i < 3; i++) t.update(S.render({ heroes: H, cur: ["L", 0], me: ["R", 2], taken: new Set([k]) }));
  check("鼠标移开后照常认出被选走", !!t.stable[k]); }
{ console.log("⑨ 09-12 日志:右边 4 个面板同一刻各显示 4 个图标, 棋盘上一个暗格都没有(以前记成 16 手)");
  const t = new R.Tracker(); t.fullOrder = ORDER; t.reset(S.render({ heroes: H, cur: ["L", 0], me: ["L", 0] }));
  for (let i = 0; i < 2; i++) t.update(S.render({ heroes: H, cur: ["R", 1], me: ["L", 0] }));
  const sk = j => [K(H[j]).basics[0], K(H[j]).basics[1], K(H[j]).basics[2], K(H[j]).ult], pan = { R0: { skills: sk(1) }, R2: { skills: sk(3) }, R3: { skills: sk(5) }, R4: { skills: sk(7) } };
  for (let i = 0; i < 8; i++) t.update(S.render({ heroes: H, cur: ["R", 1], me: ["L", 0], panels: pan }));
  const St = t.state(t.prev), n = St.skills.filter(x => x.taken).length + St.taken_heroes.length + (St.extraPicks || 0);
  console.log("   " + lastLog(t).join(" ; ").slice(0, 300));
  check(`记下的手数 ${n} ≤ 1(棋盘上没有暗格)`, n <= 1); }
console.log(ok ? "通过" : "失败"); process.exit(ok ? 0 : 1);
