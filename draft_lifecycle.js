"use strict";
// An uncertain observation may pause advice; only scene evidence can end a draft.
function fullRoster(S) {
  const panels = S.panels || [], skills = new Set((S.skills || []).map(s => s.key));
  const ults = new Set((S.skills || []).filter(s => s.ultslot).map(s => s.key));
  const heroes = S.pool_heroes && new Set(S.pool_heroes);
  return panels.length === 10 && new Set(panels.map(p => `${p.side}${p.idx}`)).size === 10 &&
    panels.every(p => (p.side === "L" || p.side === "R") && Number.isInteger(p.idx) && p.idx >= 0 && p.idx < 5 && Array.isArray(p.skills)) &&
    new Set(panels.map(p => p.hero)).size === 10 &&
    new Set(panels.flatMap(p => (p.skills || []).map(s => s.key))).size === 40 &&
    panels.every(p => p.hero && (!heroes || heroes.has(p.hero)) && p.skills.length === 4 &&
      p.skills.every(s => s.key && !s.key.startsWith("?") && skills.has(s.key)) &&
      p.skills.filter(s => ults.has(s.key)).length === 1);
}
class DraftLifecycle {
  constructor() { this.reset(); }
  reset() {
    this.mode = "drafting"; this.scene = "unknown"; this.cue = "unknown";
    this.vote = null; this.lastSample = null; this.full = null; this.good = null;
    this.reason = "";
  }
  observeScene(evidence, now, sample) {
    if (sample === this.lastSample) return this.mode;
    this.lastSample = sample;
    const stage = evidence.stage || "unknown";
    this.cue = stage;
    if (stage === "unknown") { this.vote = null; return this.mode; }
    if (stage === "drafting") {
      // A real choice prompt vetoes a conflicting roster/count immediately.
      this.scene = "drafting"; this.full = null;
      if (this.mode === "strategy" || this.mode === "away" || this.mode === "full") this.mode = "drafting";
      this.vote = null; return this.mode;
    }
    if (!this.vote || this.vote.stage !== stage) this.vote = { stage, at: now, n: 0 };
    this.vote.n++;
    const required = stage === "game" ? 3 : 2, ms = stage === "game" ? 1500 : 800;
    if (this.vote.n >= required && now - this.vote.at >= ms) {
      this.scene = stage; this.mode = stage === "game" ? "away" : "strategy";
      this.reason = stage === "game" ? "已进入游戏" : "选技结束 · 策略阶段";
    }
    return this.mode;
  }
  review(reason) { this.mode = "review"; this.reason = reason; this.good = null; this.full = null; return this.mode; }
  observeState(S, count, now) {
    if (this.mode === "strategy" || this.mode === "away") return this.mode;
    if (!Number.isFinite(count) || count > 50) return this.review("选技账目复核中，保留本局信息");
    if (S.offScreen || S.offMsg) return this.review("画面暂时遮挡，等待恢复");
    if (this.mode === "review") {
      if (!this.good) this.good = { at: now, n: 0 };
      this.good.n++;
      if (this.good.n < 2 || now - this.good.at < 800) return this.mode;
      this.mode = "drafting"; this.good = null;
    }
    if (fullRoster(S) && this.cue !== "drafting") {
      if (!this.full) this.full = { at: now, n: 0 };
      this.full.n++;
      if (this.full.n >= 3 && now - this.full.at >= 1500) {
        this.mode = "full"; this.reason = "阵容已满，等待游戏阶段确认";
      }
    } else { this.full = null; this.mode = "drafting"; }
    return this.mode;
  }
  get advicePaused() { return this.mode !== "drafting"; }
}
module.exports = { DraftLifecycle, fullRoster };
