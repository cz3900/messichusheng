"use strict";
const MODES = Object.freeze([
  { id: "mcts", label: "现役" }, { id: "net", label: "网络" },
  { id: "combo", label: "组合" }, { id: "combo-team", label: "二步优化" },
  { id: "duel", label: "双方推演" }, { id: "duel-fast", label: "双方推演优化" },
]);
const normalize = mode => MODES.some(m => m.id === mode) ? mode : "mcts";
const isDuel = mode => mode === "duel" || mode === "duel-fast";
const isGpu = mode => mode === "combo" || mode === "combo-team" || isDuel(mode);
function migrate(settings) {
  if (!settings.aiModeSchema && settings.aimode === "combo") settings.aimode = "combo-team";
  settings.aiModeSchema = 6;
  settings.aimode = normalize(settings.aimode);
  return settings;
}
module.exports = { MODES, normalize, isDuel, isGpu, migrate };
