"use strict";
/* 面板普查 + 全局最优匹配(重算通道的核心)。
   与逐帧增量归属的根本区别:**面板上的技能图标是持久的** —— 选到手就一直在那一格。
   所以不必抓住"图标出现的那一帧", 任何时候重看一遍 40 个技能槽, 就能知道每个人手里有什么;
   漏看了、当时认错了、画面被挡过, 下一次普查都能自己纠正。
   匹配也不逐格贪心判, 而是"棋盘上已被选走的技能" ↔ "面板上有图标的槽"整体求最优配对
   (一个技能只能在一个槽里、一个槽只装一个技能), 低分的那些靠这个约束互相顶回正确位置。 */
const R = require("./recog.js");

/* 匈牙利算法(Jonker-Volgenant 简化版):求最大总分的一一配对。n×m 矩阵, n ≤ m;
   返回 row → col(没配上的是 -1)。规模很小(≤40×50), 用 O(n²m) 的写法足够。 */
function assign(score) {
  const n = score.length, m = n ? score[0].length : 0; if (!n || !m) return [];
  const INF = 1e9, u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1).fill(-1), way = new Int32Array(m + 1).fill(-1);
  const cost = (i, j) => -score[i][j];   // 求最小 → 取负
  for (let i = 0; i < n; i++) {
    p[m] = i; let j0 = m; const minv = new Float64Array(m + 1).fill(INF), used = new Uint8Array(m + 1);
    do { used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = -1;
      for (let j = 0; j < m; j++) if (!used[j]) { const cur = cost(i0, j) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
      for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1; } while (p[j0] !== -1);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== m);
  }
  const rowOf = new Int32Array(n).fill(-1);
  for (let j = 0; j < m; j++) if (p[j] >= 0 && p[j] < n) rowOf[p[j]] = j;
  return rowOf;
}
/* 普查一帧:读 10 个面板的 40 个槽, 把 takenKeys(棋盘上已被选走的技能)配到有图标的槽上。
   返回 { owner: {key: [side, idx]}, seatSlots: {seat: 有图标的槽数}, unplaced: [key], scores: {key: 分} } */
function census(img, poolKeys, takenKeys) {
  const panels = R.readPanels(img, false), slots = [];                      // 先只数槽, 不认图标
  for (const p of panels) p.skills.forEach((s, j) => { if (s) slots.push({ seat: [p.side, p.idx], box: p.slotBoxes[j] }); });
  const keys = takenKeys.filter(k => k && k[0] !== "?" && poolKeys.includes(k));
  if (!slots.length || !keys.length) return { owner: {}, seatSlots: Object.fromEntries(panels.map(p => [p.side + p.idx, p.filled])), unplaced: keys, scores: {}, slots: slots.length };
  /* 分数矩阵:行=技能, 列=槽。行多于列时转置求解(匈牙利要求 n ≤ m) */
  const S = keys.map(k => slots.map(s => R.matchSkill(img, s.box, [k]).s1));
  const flip = keys.length > slots.length;
  const M = flip ? slots.map((_, j) => keys.map((_, i) => S[i][j])) : S;
  const res = assign(M), owner = {}, scores = {}, used = new Set();
  for (let a = 0; a < res.length; a++) { const b = res[a]; if (b < 0) continue;
    const ki = flip ? b : a, si = flip ? a : b; const sc = S[ki][si];
    owner[keys[ki]] = slots[si].seat.slice(); scores[keys[ki]] = sc; used.add(ki); }
  return { owner, scores, seatSlots: Object.fromEntries(panels.map(p => [p.side + p.idx, p.filled])),
    unplaced: keys.filter((k, i) => !used.has(i)), slots: slots.length };
}
/* 证据账本:每次普查往账上投一票(某技能在某人面板里的匹配分), 结论 = 按**累计**证据做一次全局最优匹配。
   一帧抽风只是 1 票, 推不翻已经积累的几十票;"已被选走"是单调的(只加不减), "归谁"允许随证据修正。 */
const MIN_EV = +(process.env.CENSUS_MIN || 0.25);   // 累计平均匹配分低于它就不下结论
class Ledger {
  constructor() { this.sum = {}; this.cnt = {}; this.cap = {}; this.taken = new Set(); this.owner = {}; this.flips = 0; this.passes = 0; }
  /* takenKeys:棋盘认定已被选走的技能(单调累加);hoverSeat:鼠标压着的面板(这轮它不作数, 拖动/悬停都在这时候) */
  /* 普查一轮:把每个"有图标的槽"和**全部池子技能**比一遍(每槽约 1~2 毫秒), 证据累加到 (技能, 座位) 上。
     "被选走"由面板自己判定 —— 图标出现在谁的面板里, 就说明它被选走了, 完全不依赖棋盘看没看见那一下变暗。
     takenKeys 只作为补充(棋盘看到、面板还没画出来的)。hoverSeat:鼠标压着的面板这轮跳过(拖动/悬停都在这时候)。 */
  addCensus(img, poolKeys, takenKeys, hoverSeat) {
    for (const k of takenKeys || []) if (k && k[0] !== "?" && poolKeys.includes(k)) this.taken.add(k);
    const panels = R.readPanels(img, false), slots = [];
    for (const p of panels) { const sk = p.side + p.idx; if (hoverSeat && hoverSeat === sk) continue;
      this.cap[sk] = Math.max(this.cap[sk] || 0, p.filled);
      p.skills.forEach((s, j) => { if (s) slots.push({ sk, box: p.slotBoxes[j] }); }); }
    if (!slots.length) return;
    const best = {};   // key → {seat: 本轮该座位上的最高分}
    for (const s of slots) { const r = R.matchSkill(img, s.box, poolKeys); if (!r.key) continue;
      (best[r.key] = best[r.key] || {}); if (!(best[r.key][s.sk] > r.s1)) best[r.key][s.sk] = r.s1;
      if (r.s1 >= 0.55) this.taken.add(r.key); }   // 图标认得准 = 这件已经被人拿走了(面板自己说了算)
    for (const k in best) { const row = (this.sum[k] = this.sum[k] || {}), c = (this.cnt[k] = this.cnt[k] || {});
      for (const sk in best[k]) { row[sk] = (row[sk] || 0) + best[k][sk]; c[sk] = (c[sk] || 0) + 1; } }
    this.passes++; this.solve();
  }
  solve() {
    const keys = [...this.taken].filter(k => this.sum[k]); if (!keys.length) return;
    const cols = []; for (const sk in this.cap) for (let i = 0; i < Math.min(4, this.cap[sk]); i++) cols.push(sk);
    if (!cols.length) return;
    const S = keys.map(k => cols.map(sk => (this.cnt[k][sk] ? this.sum[k][sk] / this.cnt[k][sk] : -1)));
    const flip = keys.length > cols.length, M = flip ? cols.map((_, j) => keys.map((_, i) => S[i][j])) : S;
    const res = assign(M), next = {};
    for (let a = 0; a < res.length; a++) { const b = res[a]; if (b < 0) continue; const ki = flip ? b : a, ci = flip ? a : b;
      if (S[ki][ci] < MIN_EV) continue; next[keys[ki]] = cols[ci]; }   // 证据不够就先不归属(刚选完、图标还没出现在面板上时, 硬配会先错后改)
    for (const k in next) if (this.owner[k] && this.owner[k] !== next[k]) this.flips++;   // 结论改变次数(稳定性指标)
    this.owner = next;
  }
}
module.exports = { census, assign, Ledger };
