"use strict";
/* combo_queue.js 用的桩: 每个任务真等 120ms(让后到的消息有机会插进来), 结束时报告自己有没有被取消。 */
const wait = ms => new Promise(r => setTimeout(r, ms));
const job = name => async (...args) => { const o = args[args.length - 1] || {}; const t0 = Date.now(); await wait(o.ms || 120); return { name, ms: Date.now() - t0, cancelled: !!(o.cancelled && o.cancelled()), rows: [] }; };
module.exports = { init: async () => ({ ep: "stub", dev: null, med: 1, bfix: 128, detail: "stub" }), screen: job("screen"), final: job("final"), refine: job("refine"), fate: job("fate"), plan: job("plan"), planFinal: job("planfinal"), decide: job("job") };
