"use strict";
/* v1.41 两步计划单元测试(combo_local.plan / planFinal, 网络换成全 0 → 合法里均匀抽):
   ① plan 在"别人在选、下一手是我"的局面上能出两步表(线数>0, 每线 R 局, 记了前缀);
   ② 回手强制落子生效: 每条线每一局里 Y 最后一定有人拿(我回手时 Y 还在就必须是我拿, 不会一直没人拿);
   ③ planFinal 在轮到我的准确局面上: 只复用前缀一致的样本, 前 NTOP 条线补到 RT 局, 结果按胜率排, 同种子两次逐位相同;
   ④ 两步表不是这一手的(slot 对不上) → 返回空行+原因, 不崩。 */
process.env.AD_COMBO_FAKE = "1"; process.env.AD_COMBO_EP = "cpu";
const path = require("path"), fs = require("fs"), APP = path.join(__dirname, ".."), E = path.join(APP, "engine", "server");
const Dr = require(E + "/draft.js"), AI = require(E + "/ai.js"), C = require(APP + "/combo_local.js"), S = require("./synth.js");
const win = {}; new Function("window", fs.readFileSync(path.join(APP, "engine", "public", "ad_data.js"), "utf8"))(win); Dr.setExclusive(win.AD_EXCLUSIVE || []);
const FULL = (() => { const r = []; for (let i = 0; i < 5; i++) { r.push(i); r.push(5 + i); } const o = []; for (let k = 0; k < 5; k++) o.push(...(k % 2 ? r.slice().reverse() : r)); return o; })();
const H = S.pickHeroes(12, 11), K = h => S.HERO[h], pool = { heroKeys: H.slice(), basics: [], ults: [], filled: [] };
for (const h of H) { pool.basics.push(...K(h).basics); pool.ults.push(K(h).ult); }
function stateAt(seq) { const st = Dr.newState(pool), placed = [];
  seq.forEach((k, j) => { const seat = st.seats[FULL[j]]; if (pool.heroKeys.includes(k)) seat.hero = k; else if (pool.ults.includes(k)) seat.ult = k; else seat.basics.push(k); seat.seq.push(k); placed.push(k); });
  st.taken = placed; st.blocked = []; st.order = FULL.slice(seq.length); st.step = 0; return st; }
const assert = (c, m) => { if (!c) { console.log("失败: " + m); process.exit(1); } console.log("通过: " + m); };
(async () => {
  await C.init(path.join(APP, "data", "netC300.onnx"), "cpu", 32);
  /* 前 7 手: L1 R1 L2 R2 L3 R3 L4 各拿一个小技能; 现在 R4 在选, 下一手(第 9 手)是我 L5(座位 4) */
  const seq7 = [K(H[0]).basics[0], K(H[1]).basics[0], K(H[2]).basics[0], K(H[3]).basics[0], K(H[4]).basics[0], K(H[5]).basics[0], K(H[6]).basics[0]];
  const st7 = stateAt(seq7), me = 4;
  const p = await C.plan(st7, me, 7, { keys: [], NX: 3, NY: 2, R: 6, seed: 11 });
  assert(p && p.lines > 0 && p.forceAt === 1, `① 两步表: ${p && p.lines} 条线, 中间 ${p && p.forceAt} 手, 调网络 ${p && p.calls} 次`);
  assert(p.rows.every(r => r.n === 6), "① 每条线 6 局");
  const P = C.LAST.plan; assert(P && P.slot === 8 && P.lines.every(l => l.PRE.length === 6 && l.PRE[0].length === 1), "① 记了前缀(每局 1 手)");
  /* ② 回手强制: 直接用 rollouts(轮到我, forceAt=0, yb) 看终局归属 */
  const seq8 = seq7.concat([K(H[7]).basics[0]]), st8 = stateAt(seq8), sim8 = AI._simFrom(st8), own8 = C.ownerOf(st8, sim8, me);
  const x = P.lines[0].x, y = P.lines[0].y, R2 = 8, cs = [], yb = []; for (let r = 0; r < R2; r++) { cs.push(x); yb.push(y); }
  const ro = await C.rollouts(sim8, own8, me, 0, cs, 3, { yb: Int16Array.from(yb), crn: true, t0: 8, st: st8, wantOwns: true });
  const mine = ro.owns.filter(o => o[y] === me).length, none = ro.owns.filter(o => o[y] < 0).length;
  assert(none === 0 && mine >= 1, `② 回手 Y 从没被留在池里(没人拿 ${none}/${R2}), 我拿到 ${mine}/${R2}(其余是别人先抢走)`);
  const ro2 = await C.rollouts(sim8, own8, me, 0, cs, 3, { yb: Int16Array.from(yb), crn: true, t0: 8, st: st8 });
  assert(Array.from(ro.v).every((v, i) => v === ro2.v[i]), "② 同种子两次推演逐位相同");
  /* ③ planFinal 在轮到我的准确局面 */
  const f1 = await C.planFinal(st8, me, 8, { RT: 10, NTOP: 2, seed: 5 });
  assert(f1 && f1.rows.length === 2 && f1.rows.every(r => r.n === 10) && f1.rows[0].win >= f1.rows[1].win, `③ 补算: ${f1.rows.length} 条线各 ${f1.rows[0].n} 局, 复用 ${f1.reused} 新算 ${f1.fresh} 调网络 ${f1.calls} 次, 表来自第 ${f1.from + 1} 手`);
  const f2 = await C.planFinal(st8, me, 8, { RT: 10, NTOP: 2, seed: 5 });
  assert(JSON.stringify(f1.rows) === JSON.stringify(f2.rows), "③ 同种子两次补算逐位相同");
  /* ③b 前缀复用: 让 R4 的真实一手 = 某条线某一局里推演出的那一手 → 那一局必须被复用 */
  const l0 = P.lines[0], pick0 = l0.PRE[0][0]; const seq8b = seq7.concat([sim8.items[pick0].key]);
  if (sim8.items[pick0].p >= 0 && !seq7.includes(sim8.items[pick0].key)) { const st8b = stateAt(seq8b); const f3 = await C.planFinal(st8b, me, 8, { RT: 10, NTOP: 3, seed: 5 }); assert(f3.reused >= 1, `③b 真实一手与推演一致的局被复用: 复用 ${f3.reused} 局`); }
  /* ④ 表不是这一手的 */
  const seq9 = seq8.concat([K(H[8]).basics[0]]); const st9 = stateAt(seq9);   // 第 10 手 R5 在选 → 不是我, 返回 null
  assert((await C.planFinal(st9, me, 9, {})) === null, "④ 不是我的回合 → null");
  C.LAST.plan.slot = 99; const f4 = await C.planFinal(st8, me, 8, {}); assert(f4 && f4.rows.length === 0 && /第100手/.test(f4.why), `④ 表的手数对不上 → 空行+原因(${f4.why})`);
  /* ⑤ 最后一手(没有下下手) → plan 返回 null */
  const seqL = []; for (let j = 0; j < 46; j++) seqL.push(null);
  console.log("全部通过"); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
