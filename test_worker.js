const { Worker } = require("worker_threads"); const fs = require("fs"), { PNG } = require("pngjs");
const w = new Worker("./worker.js"); const files = process.argv.slice(2); let i = 0;
const send = () => { if (i >= files.length) return setTimeout(() => process.exit(0), 12000); const p = PNG.sync.read(fs.readFileSync(files[i++])); const buf = Buffer.from(p.data).buffer; w.postMessage({ type: "frame", w: p.width, h: p.height, buf, bgra: false, all: true }, [buf]); };
w.on("message", m => { if (m.type === "ready") return send(); if (m.type === "state") { console.log("state", JSON.stringify(m)); return send(); }
  if (m.type === "advice") console.log(`advice ${m.stage} ${m.n}/${m.N} ${m.side}方 ${(100*m.base).toFixed(1)}% 前三 ${m.rows.slice(0,3).map(r=>r.name+" "+(100*r.p).toFixed(1)+"% box="+(r.box?r.box.join(","):"?")).join(" | ")}`);
  if (m.type === "error") console.log("ERROR", m.msg); });
