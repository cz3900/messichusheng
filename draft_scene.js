"use strict";
// Fixed-position UI text matching, not OCR: no native dependency in Windows builds.
// Templates contain game UI glyphs only; neither player names nor chat are stored.
const data = require("./data/draft_scene.json");
const templates = data.templates.map(t => {
  const bytes = Buffer.from(t.pixels, "base64"), samples = [];
  for (let y = 0; y < t.box[3]; y += 2) for (let x = 0; x < t.box[2]; x += 2)
    samples.push([x, y, Math.max(0, bytes[y * t.box[2] + x] - 100)]);
  const mean = samples.reduce((n, s) => n + s[2], 0) / samples.length;
  let norm = 0; for (const s of samples) { s[2] -= mean; norm += s[2] * s[2]; }
  return { ...t, samples, norm };
});
function reader(img) {
  const scale = img.h / 720;
  return (x, y) => {
    const px = Math.round(img.w / 2 + (x - 640) * scale), py = Math.round(y * scale);
    if (px < 0 || py < 0 || px >= img.w || py >= img.h) return [0, 0, 0];
    const i = (py * img.w + px) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
}
function textScore(header, t) {
  const coarse = t.samples.filter((_, i) => i % Math.max(1, Math.floor(t.samples.length / 72)) === 0);
  const mean = coarse.reduce((sum, s) => sum + s[2], 0) / coarse.length;
  const small = coarse.map(([x, y, v]) => [x, y, v - mean]);
  const norm = small.reduce((sum, s) => sum + s[2] * s[2], 0);
  const score = (samples, varianceTemplate, dx, dy, scale) => {
    let sum = 0, squares = 0, dot = 0;
    for (const [x, y, weight] of samples) {
      const value = header[(Math.round(t.box[1] + dy + y * scale) - 40) * 640 + Math.round(t.box[0] + dx + x * scale) - 320] || 0;
      sum += value; squares += value * value; dot += weight * value;
    }
    const variance = squares - sum * sum / samples.length;
    return variance > 100 ? dot / Math.sqrt(varianceTemplate * variance) : 0;
  };
  const top = [];
  for (const scale of [0.92, 1, 1.08]) for (let dy = -8; dy <= 8; dy += 2) for (let dx = -60; dx <= 60; dx += 4) {
    const q = score(small, norm, dx, dy, scale);
    if (top.length < 4 || q > top[top.length - 1].q) {
      top.push({ dx, dy, scale, q }); top.sort((a, b) => b.q - a.q); top.length = Math.min(4, top.length);
    }
  }
  let best = 0;
  for (const c of top) for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++)
    best = Math.max(best, score(t.samples, t.norm, c.dx + dx, c.dy + dy, c.scale));
  return best;
}
function gameHUD(read) {
  let green = -1, blue = -1;
  for (let y = 670; y < 716; y += 2) {
    let g = 0, b = 0, n = 0;
    for (let x = 480; x < 746; x += 4) {
      const [r, v, z] = read(x, y); n++;
      if (v > 70 && v > r * 1.25 && v > z * 1.1) g++;
      if (z > 65 && z > r * 1.3 && z > v * 1.05) b++;
    }
    if (g / n > 0.45) green = y;
    if (b / n > 0.45) blue = y;
  }
  let red = 0, greenMap = 0, n = 0;
  for (let y = 570; y < 712; y += 4) for (let x = 8; x < 160; x += 4) {
    const [r, g, b] = read(x, y); n++;
    if (r > 65 && r > g * 1.4 && r > b * 1.4) red++;
    if (g > 65 && g > r * 1.3 && g > b * 1.3) greenMap++;
  }
  return green >= 0 && blue > green && blue - green <= 22 && red / n > 0.004 && greenMap / n > 0.004;
}
function detect(img) {
  // Scan frames are too small to distinguish words. Unknown is never an end signal.
  if (img.w < 960 || img.h < 540) return { stage: "unknown" };
  const read = reader(img), scores = { drafting: 0, strategy: 0 }, header = new Uint8Array(640 * 72);
  for (let y = 40; y < 112; y++) for (let x = 320; x < 960; x++)
    header[(y - 40) * 640 + x - 320] = Math.max(0, Math.max(...read(x, y)) - 100);
  for (const t of templates) scores[t.stage] = Math.max(scores[t.stage], textScore(header, t));
  if (scores.drafting >= 0.70) return { stage: "drafting", scores };
  if (scores.strategy >= 0.78) return { stage: "strategy", scores };
  if (gameHUD(read)) return { stage: "game", scores };
  return { stage: "unknown", scores };
}
module.exports = { detect };
