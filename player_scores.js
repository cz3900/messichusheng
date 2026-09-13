"use strict";
// 当前已归属组合的模型分，不推演未来选择，也不把分数解释成个人胜率。
const path = require("path");
const { loadModel } = require("./engine/server/mcts_fast.js");
function createPlayerScorer() {
  const win = loadModel(path.join(__dirname, "engine", "public"));
  win.ADScore.ready();
  const heroes = new Map(win.AD_HEROES.map(h => [h.key, "hero:" + h.id]));
  const known = k => Object.prototype.hasOwnProperty.call(win.AD_MODEL.index, k);
  return (panels, layout) => {
    const seats = Array.from({ length: 10 }, () => []);
    const rows = seats.map((_, i) => ({ side: i < 5 ? "L" : "R", idx: i % 5, heroKnown: false, skillCount: 0, unknown: 0 }));
    for (const p of panels || []) {
      if (!["L", "R"].includes(p.side) || !Number.isInteger(p.idx) || p.idx < 0 || p.idx > 4) continue;
      const i = (p.side === "L" ? 0 : 5) + p.idx, row = rows[i];
      if (p.hero) {
        const key = heroes.get(p.hero);
        if (key && known(key)) { seats[i].push(key); row.heroKnown = true; } else row.unknown++;
      }
      const seen = new Set();
      for (const s of p.skills || []) {
        if (!s) continue;
        if (!s.key || s.key.startsWith("?") || !known(s.key)) { row.unknown++; continue; }
        if (seen.has(s.key)) continue;
        seen.add(s.key); seats[i].push(s.key); row.skillCount++;
      }
    }
    const score = win.ADScore.evaluate(seats);
    return rows.map((row, i) => {
      const p = layout.panels[row.side], r = layout.res[1] / 1440;
      // 第五人的条带也位于覆盖窗的上方 80% 内；与英雄名、技能图标错开。
      const box = [p.x0 + (row.side === "L" ? 140 * r : 0), p.y_top + row.idx * p.pitch + 32 * r, 280 * r, 26 * r];
      return { ...row, total: seats[i].length ? score.seats[i].total : null, box };
    });
  };
}
module.exports = { createPlayerScorer };
