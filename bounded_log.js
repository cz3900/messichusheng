"use strict";
// Normal writes are asynchronous and serialized. Diagnostic failure must never
// throw into the capture/UI path. Limits include UTF-8 bytes, not characters.
const fs = require("fs");
function create(file, opt = {}) {
  const io = opt.io || fs, cap = opt.fileCap || 8 * 1024 * 1024;
  const bufferCap = opt.bufferCap || 64 * 1024, lineCap = 4096;
  let queue = [], queued = 0, written = 0, pending = null, disabled = false;
  let dropped = 0, second = -1, count = 0, timer = null;
  try { written = io.statSync(file).size; } catch (_) {}
  function write(tag, msg) {
    if (disabled || written >= cap) { dropped++; return false; }
    const now = Date.now(), sec = Math.floor(now / 1000);
    if (sec !== second) { second = sec; count = 0; }
    if (++count > 100) { dropped++; return false; }
    const d = new Date(now), t = d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
    let b = Buffer.from(`[${t}] ${String(tag).slice(0, 16).padEnd(7)} ${String(msg).slice(0, 4096)}\n`);
    if (b.length > lineCap) b = Buffer.concat([b.subarray(0, lineCap - 16), Buffer.from(" [truncated]\n")]);
    if (queued + b.length > bufferCap || written + queued + b.length > cap) { dropped++; return false; }
    queue.push(b); queued += b.length;
    if (!timer) { timer = setTimeout(() => { timer = null; flush(); }, 2000); timer.unref?.(); }
    return true;
  }
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending) return pending;
    if (disabled || !queued) return Promise.resolve();
    const batch = Buffer.concat(queue, queued); queue = []; queued = 0;
    written += batch.length;
    pending = new Promise(resolve => {
      try { io.appendFile(file, batch, err => { if (err) { disabled = true; queue = []; queued = 0; } resolve(); }); }
      catch (_) { disabled = true; queue = []; queued = 0; resolve(); }
    }).then(() => { pending = null; });
    return pending;
  }
  // Only shutdown/crash uses a bounded synchronous tail; a pending normal write
  // may complete after it, so timestamp ordering is authoritative.
  function flushSync() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (disabled || !queued) return;
    const b = Buffer.concat(queue, queued); queue = []; queued = 0; written += b.length;
    try { io.appendFileSync(file, b); } catch (_) { disabled = true; }
  }
  return { write, flush, flushSync, stats: () => ({ queued, written, dropped, disabled, pending: !!pending }) };
}
module.exports = { create };
