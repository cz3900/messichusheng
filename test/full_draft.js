"use strict";
/* 整局压力测试:按真实顺序表走完 50 手, 随机选什么 + 随机时序(面板图标晚 0~5 帧出现、秒选、部分面板图标认不准/偏暗),
   最后把追踪器的归属和真实答案逐手比对。RECOG=路径 可换别的版本对比;SEED=种子。 */
const path = require("path"), fs = require("fs");
const R = require(process.env.RECOG || "../recog.js"), S = require("./synth.js"), C = require("../census.js");
const D = path.join(__dirname, "..", "data"); const rd = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
R.init({ lib: { keys: JSON.parse(fs.readFileSync(D + "/lib_keys.json")), q: new Int8Array(rd(D + "/lib_i8.bin")), scale: new Float32Array(rd(D + "/lib_scale.bin")) },
  names: { tpl: JSON.parse(fs.readFileSync(D + "/names.json")), bin: new Uint8Array(fs.readFileSync(D + "/names.bin")) },
  meta: JSON.parse(fs.readFileSync(D + "/meta.json")), layout: JSON.parse(fs.readFileSync(D + "/layout_2560x1440.json")),
  bright: JSON.parse(fs.readFileSync(D + "/lib_bright.json")), heroBright: JSON.parse(fs.readFileSync(D + "/hero_bright.json")) });
let seed = +(process.env.SEED || 1); const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const pickOf = a => a[Math.floor(rnd() * a.length)];
const round = []; for (let i = 0; i < 5; i++) round.push(i, 5 + i); const ORDER = []; for (let r = 0; r < 5; r++) ORDER.push(...(r % 2 ? round.slice().reverse() : round));
const H = S.pickHeroes(12, +(process.env.SEED || 1) + 7), K = h => S.HERO[h], sid = x => (x < 5 ? "L" : "R") + (x % 5), seatQ = x => [x < 5 ? "L" : "R", x % 5];
const L = S.LAYOUT, slotBox = (x, j) => { const P = L.panels[x < 5 ? "L" : "R"], [sx, sy, sw] = P.slots[j]; return [P.x0 + sx, P.y_top + P.pitch * (x % 5) + sy, sw, sw]; };
const edit = (img, b, f) => { for (let y = b[1]; y < b[1] + b[3]; y++) for (let x = b[0]; x < b[0] + b[2]; x++) f(img.data, (y * img.w + x) * 4); };
const WEAK = +(process.env.WEAK || 0.2), DARK = +(process.env.DARK || 0.1);
/* 真实局面 */
const basics = H.flatMap(h => K(h).basics), ults = H.map(h => K(h).ult), need = Array.from({ length: 10 }, () => ({ hero: 1, ult: 1, basic: 3 }));
const taken = new Set(), takenHeroes = new Set(), panels = {}, truthSkill = {}, truthHero = {}, fx = {}, pendingPanel = [], names = {}, shownHeroes = new Set();
const HEROMISS = +(process.env.HEROMISS || 0), NAMES_ON = process.env.NAMES !== "0";   // HEROMISS=棋盘英雄卡变暗漏看的比例;NAMES=0 关掉面板名字
const t = new R.Tracker(); t.fullOrder = ORDER;
{ const img0 = S.render({ heroes: H, cur: ["L", 0], me: ["R", 2] }); t.reset(img0);
  if (process.env.TRACE_OUT) { try { fs.unlinkSync(process.env.TRACE_OUT); } catch (e) { }
    global.__REC = new (require("../trace.js").Recorder)(process.env.TRACE_OUT); global.__REC.head(t, [img0.w, img0.h], ORDER); } }
const LG = new C.Ledger(); const CENSUS_EVERY = +(process.env.CENSUS_EVERY || 3); let incFlips = 0, incPrev = {};
let frames = 0;
/* 到点的面板图标全部放出(不按入队顺序:晚 5 帧的那件不能挡住后面晚 0~1 帧的) */
const flushDue = () => { for (let i = 0; i < pendingPanel.length;) if (pendingPanel[i].at <= frames) pendingPanel.splice(i, 1)[0].fn(); else i++; };
/* 随机遮挡:每帧有 OCCL 的概率在画面上盖一块半透明暗矩形(提示框/弹窗/动画), 盖住棋盘或面板的一片 */
const OCCL = +(process.env.OCCL || 0), BLIND = +(process.env.BLIND || 0); let blindLeft = 0;
const occlude = img => { if (!OCCL || rnd() >= OCCL) return img;
  const w = 200 + Math.floor(rnd() * 700), h = 150 + Math.floor(rnd() * 500), x = Math.floor(rnd() * (img.w - w)), y = Math.floor(rnd() * (img.h - h)), k = 0.25 + rnd() * 0.5;
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const o = (j * img.w + i) * 4; for (let c = 0; c < 3; c++) img.data[o + c] = Math.round(img.data[o + c] * k); }
  return img; };
const frame = cur => { const img = S.render({ heroes: H, cur: seatQ(cur), me: ["R", 2], taken, takenHeroes: shownHeroes, panels: JSON.parse(JSON.stringify(panels)), names: NAMES_ON ? names : undefined });
  for (const [x, j, kind] of Object.values(fx)) { const b = slotBox(x, j); if (!panels[sid(x)] || !panels[sid(x)].skills[j]) continue;
    if (kind === "dark") edit(img, b, (d, p) => { d[p] *= 0.3; d[p + 1] *= 0.3; d[p + 2] *= 0.3; });
    else { let s = 99 + j; edit(img, b, (d, p) => { s = (s * 1103515245 + 12345) & 0x7fffffff; const n = 40 + 160 * s / 0x7fffffff; for (let c = 0; c < 3; c++) d[p + c] = 0.45 * d[p + c] + 0.55 * n; }); } }
  occlude(img); frames++;
  /* BLIND:模拟插件"瞎"几秒(切出去/卡帧/被完全挡住) —— 这几帧完全不喂给增量识别, 但普查照样能在之后看出来 */
  if (blindLeft > 0) { blindLeft--; if (frames % CENSUS_EVERY === 0 && LG.taken.size) LG.addCensus(img, t.pool.skills.map(x => x.key), [...LG.taken], null); return; }
  if (BLIND && rnd() < BLIND) { blindLeft = 3 + Math.floor(rnd() * 3); return; }
  if (global.__REC) { global.__REC.capture(img, t); t.update(img); global.__REC.flush(); } else t.update(img);
  { const o = t.owner; for (const k in o) { const q = o[k][0] + o[k][1]; if (incPrev[k] && incPrev[k] !== q) incFlips++; incPrev[k] = q; } }   // 增量版:结论改变次数
  if (frames % CENSUS_EVERY === 0) { const st = t.state(t.prev); LG.addCensus(img, t.pool.skills.map(x => x.key), st.skills.filter(x => x.taken).map(x => x.key), null); } if (process.env.TRACE) for (const [a, k, q, how] of t.log.splice(0)) console.log(`   f${frames} [插件] ${a} ${R.cn(k)}→${q} ${how}`); };
for (let i = 0; i < 2; i++) frame(0);
for (let i = 0; i < ORDER.length; i++) { const x = ORDER[i], nd = need[x];
  const kinds = []; if (nd.hero) kinds.push("hero"); if (nd.ult && ults.some(u => !taken.has(u))) kinds.push("ult"); if (nd.basic && basics.some(b => !taken.has(b))) kinds.push("basic", "basic");
  const kind = pickOf(kinds); nd[kind]--;
  const think = rnd() < +(process.env.FAST || 0.25) ? 0 : 1 + Math.floor(rnd() * 3); for (let f = 0; f < think; f++) { frame(x); flushDue(); }
  if (kind === "hero") { const h = pickOf(H.filter(h => !takenHeroes.has(h))); takenHeroes.add(h); truthHero[h] = sid(x); if (rnd() >= HEROMISS) shownHeroes.add(h);
    { const dn = pickOf([0, 1, 2, 3]), fn = () => { names[sid(x)] = h; }; if (!dn) fn(); else pendingPanel.push({ at: frames + dn, fn }); } if (process.env.TRACE) console.log(`f${frames + 1} 真: 第${i + 1}手 ${sid(x)} 选英雄 ${R.cn(h)}`); }
  else { const k = pickOf((kind === "ult" ? ults : basics).filter(k => !taken.has(k))); taken.add(k); truthSkill[k] = sid(x);
    if (process.env.TRACE) console.log(`f${frames + 1} 真: 第${i + 1}手 ${sid(x)} 选 ${R.cn(k)}`);
    const delay = pickOf((process.env.DELAYS || "0,0,1,2,3,5").split(",").map(Number)), slot = kind === "ult" ? 3 : (3 - nd.basic - 1);
    const fire = () => { const pn = panels[sid(x)] = panels[sid(x)] || { skills: [] }; pn.skills[slot] = k; const r = rnd(); if (r < WEAK) fx[k] = [x, slot, "weak"]; else if (r < WEAK + DARK) fx[k] = [x, slot, "dark"]; };
    if (process.env.TRACE) console.log(`      (面板图标晚 ${delay} 帧)`);
    if (!delay) fire(); else pendingPanel.push({ at: frames + delay, fn: fire }); }
  frame(x); flushDue(); }
for (let f = 0; f < 10; f++) { frame(0);   /* 选完了:高亮离开最后一个人(真实游戏里选技结束) */ flushDue(); }
const q2 = q => q ? q[0] + q[1] : "-";
if (process.env.PEAKS) { const img = S.render({ heroes: H, cur: seatQ(0), me: ["R", 2], taken, takenHeroes, panels: JSON.parse(JSON.stringify(panels)) });
  for (const [k, [x, j, kind]] of Object.entries(fx)) { const b = slotBox(x, j); if (kind === "dark") edit(img, b, (d, p) => { d[p] *= 0.3; d[p + 1] *= 0.3; d[p + 2] *= 0.3; });
    const st = R.cellStats(img, b), pp = R.readPanels(img, [k]).find(q => q.side === (x < 5 ? 'L' : 'R') && q.idx === x % 5), m = pp.skills[j], g = R.readPanels(img, null).find(q => q.side === (x < 5 ? 'L' : 'R') && q.idx === x % 5).skills[j];
    console.log(`  ${kind} ${R.cn(k)} ${sid(x)} 槽${j}: 最亮一格 ${st.max.toFixed(0)} 平均 ${st.mean.toFixed(0)} 本件匹配 ${m ? m.s.toFixed(2) : '空'} 全库第一 ${g ? R.cn(g.key) + ' ' + g.s.toFixed(2) : '空'}`); } }
let sk = 0, hs = 0; const bad = [];
for (const k in truthSkill) { const o = t.owner[k]; if (o && q2(o) === truthSkill[k]) sk++; else bad.push(`${R.cn(k)} 真${truthSkill[k]} 记${o ? q2(o) : (t.suspect && t.suspect[k] ? "不当落子" : "无")}`); }
for (const h in truthHero) { const o = t.heroOf[h]; if (o && q2(o) === truthHero[h]) hs++; else bad.push(`英雄${R.cn(h)} 真${truthHero[h]} 记${o ? q2(o) : "无"}`); }
if (global.__REC) { global.__REC.save();
  fs.writeFileSync(process.env.TRACE_OUT + ".expect.json", JSON.stringify({
    owner: t.owner, heroOf: t.heroOf, unknownBy: (t.unknownBy || []).map(u => [u[0], u[1], u.t]),
    suspect: Object.keys(t.suspect || {}).sort(), orphan: Object.keys(t.orphan || {}).sort(),
    turn: t.turn, nameHero: t.nameHero || {}, stable: Object.keys(t.stable || {}).filter(k => t.stable[k]).sort(),
    log: t.log.map(l => l.join("|")), truthSkill, truthHero }, null, 1));
  console.log(`轨迹已写 ${process.env.TRACE_OUT} (${global.__REC.n} 帧, ${(global.__REC.bytes / 1024).toFixed(0)}KB)`); }
console.log(`SEED=${process.env.SEED || 1} 帧${frames} | 增量版: 技能 ${sk}/40 英雄 ${hs}/10 改判${incFlips}次 | 没认出 ${(t.unknownBy || []).length}${process.env.QUIET ? "" : " | 错: " + (bad.join("; ") || "无")}`);
{ let ok2 = 0; const bad2 = [];
  for (const k in truthSkill) { const q = LG.owner[k]; const want = truthSkill[k][0] + (+truthSkill[k].slice(1)); if (q === want) ok2++; else bad2.push(`${R.cn(k)} 真${truthSkill[k]} 记${q || "无"}`); }
  console.log(`           普查版: 技能 ${ok2}/40 改判${LG.flips}次 (普查 ${LG.passes} 轮)${process.env.QUIET ? "" : " | 错: " + (bad2.join("; ") || "无")}`); }
{ let ok3 = 0; const bad3 = [];   // 合并:普查有结论就听普查, 没有就用增量的
  for (const k in truthSkill) { const q = LG.owner[k] || (t.owner[k] ? t.owner[k][0] + t.owner[k][1] : null); const want = truthSkill[k][0] + (+truthSkill[k].slice(1));
    if (q === want) ok3++; else bad3.push(`${R.cn(k)} 真${truthSkill[k]} 记${q || "无"}`); }
  console.log(`           合并版: 技能 ${ok3}/40${process.env.QUIET ? "" : " | 错: " + (bad3.join("; ") || "无")}`); }
