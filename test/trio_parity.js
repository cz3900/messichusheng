"use strict";
/* Trio table plus approved mechanism additions: static and incremental parity. */
const assert = require("assert"), fs = require("fs"), path = require("path");
const F = require("../engine/server/mcts_fast.js");
const pub = path.join(__dirname, "..", "engine", "public");
const win = F.loadModel(pub), G = F.buildEngine(win);
const bare = {}, atob = s => Buffer.from(s, "base64").toString("binary");
for (const f of ["ad_data.js", "ad_model.js", "ad_score.js"])
  new Function("window", "atob", fs.readFileSync(path.join(pub, f), "utf8"))(bare, atob);
assert(win.ADScore.ready() && bare.ADScore.ready());
assert(win.AD_TRIO.trios.length === 98);
const pairMap = new Map(), tripleMap = new Map();
const sortedKey = xs => xs.slice().sort().join('|');
for (const [a,b,c,pair,triple] of win.AD_TRIO.trios) {
  pairMap.set(sortedKey([a,b]), pair);
  tripleMap.set(sortedKey([a,b,c]), triple);
}
const correctionOf = ks => {
  let value=0;
  for(let i=0;i<ks.length;i++) for(let j=i+1;j<ks.length;j++) {
    value+=pairMap.get(sortedKey([ks[i],ks[j]]))||0;
    for(let q=j+1;q<ks.length;q++) value+=tripleMap.get(sortedKey([ks[i],ks[j],ks[q]]))||0;
  }
  return value;
};

const empty = () => Array.from({ length: 10 }, () => []);
let checks = 0, worst = 0;
for (const [a, b, c, pair, triple] of win.AD_TRIO.trios) {
  for (const seat of [0, 5]) {
    const sign = seat < 5 ? 1 : -1;
    for (const order of [[a,b,c], [a,c,b], [b,a,c], [b,c,a], [c,a,b], [c,b,a]]) {
      const items = order.map(key => ({ key, skey: key, kind: key.startsWith("hero:") ? 0 : 1, p: G.at(key) }));
      const sim = F.makeSim(G, items, [seat, seat, seat]);
      const seats = empty();
      for (let step = 0; step < 3; step++) {
        F.applySim(sim, step);
        seats[seat].push(order[step]);
        const actual = win.ADScore.evaluate(seats).logit;
        worst = Math.max(worst, Math.abs(actual - sim.z));
        const base = bare.ADScore.evaluate(seats).logit;
        const correction = correctionOf(seats[seat]);
        assert(Math.abs((actual - base) - sign * correction) < 1e-6,
               `wrong correction ${a} ${b} ${c} step ${step}`);
        checks++;
      }
    }
  }
}
assert(worst < 1e-5, `incremental mismatch ${worst}`);
console.log(`trio parity ${checks} steps, max |incremental-static| ${worst.toExponential(2)}`);
