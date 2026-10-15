"use strict";
// Run the actual main-process capture/lifecycle functions with controlled Electron IPC and clocks.
const assert = require("assert/strict"), fs = require("fs"), vm = require("vm"), path = require("path");
const source = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
function fixture(live = true) {
  let now = 100000, query = async () => [], handler;
  const calls = [], timers = new Map(), events = {}, windows = []; let nextTimer = 0;
  class Window {
    constructor() { this.dead = false; this.webContents = { send() {} }; windows.push(this); }
    loadFile() {} isDestroyed() { return this.dead; } destroy() { this.dead = true; }
  }
  const ctx = vm.createContext({
    settings: { allowCapture: live }, liveWaiting: live, liveEpoch: 0, liveChecking: false,
    recognitionNotice: false, visibilityNoticeUntil: 0, quitting: false, worker: null, phase: "idle", boardSeen: false, needFull: true,
    overlay: { isDestroyed: () => false, setContentProtection() {} }, cfg: { paused: false },
    path, __dirname: path.resolve(__dirname, ".."), BrowserWindow: Window,
    desktopCapturer: { getSources(opt) { calls.push(opt); return query(opt); } },
    session: { defaultSession: { setDisplayMediaRequestHandler(fn) { handler = fn; } } },
    ipcMain: { on(ch, fn) { assert(!events[ch], `duplicate IPC handler ${ch}`); events[ch] = fn; } },
    screen: { getPrimaryDisplay: () => ({ id: 1, bounds: { width: 1920, height: 1080 }, scaleFactor: 1 }) },
    uploader: { onPhase() {} }, crashDiag:{record(){}}, require(name){assert.equal(name,'./worker_lifecycle');return {stop:w=>w.terminate()};}, log() {}, send() {}, sendCfg() {}, setVisible() {},
    Date: { now: () => now }, Uint8Array, Buffer,
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() { return ++nextTimer; }, clearInterval() {},
    startWorker() { ctx.worker = { postMessage() { ctx.frames++; }, terminate: async () => { ctx.terminated++; } }; ctx.started++; },
    frames: 0, terminated: 0, started: 0,
  });
  vm.runInContext(source.slice(source.indexOf("let capWin ="), source.indexOf("let workerRestarts =")), ctx);
  vm.runInContext(source.slice(source.indexOf("let inflight ="), source.indexOf("/* 选技中 500ms")), ctx);
  const run = code => vm.runInContext(code, ctx);
  run("installCaptureHandlers()");
  return { ctx, run, calls, events, windows, timers, advance(ms) { now += ms; }, query(fn) { query = fn; }, handler: (...args) => handler(...args) };
}
const game = { id: "window:42:0", name: "Dota 2" };
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
(async () => {
  const f = fixture();
  await f.run("pollLive()");
  assert.equal(f.windows.length, 0); assert.equal(f.ctx.started, 0);
  assert.equal(await f.run("grab(false)"), null);
  assert.equal(await f.run("grabLegacy(false)"), null);
  assert(f.calls.every(o => o.types[0] === "window" && o.thumbnailSize.width === 0 && o.thumbnailSize.height === 0));
  f.query(async () => [{ name: "Dota 2 - Twitch", id: "browser" }]);
  await f.run("pollLive()"); assert.equal(f.windows.length, 0);
  console.log("✓ 未开游戏/仅有直播网页：只查询窗口，无截图、捕获窗或识别线程");

  f.query(async () => [game]); await f.run("pollLive()");
  assert.equal(f.ctx.liveWaiting, false); assert.equal(f.windows.length, 1); assert.equal(f.ctx.started, 1);
  let picked; await f.handler({}, r => picked = r); assert.equal(picked.video.id, game.id);
  const first = f.windows[0];
  f.events["cap-ready"]({ sender: first.webContents }, { w: 1920, h: 1080 });
  assert.equal(f.run("capMode"), "window");
  console.log("✓ 游戏出现自动恢复，成功接通窗口流后才放开覆盖层防捕获");

  const pending = f.run("grabStream(320, 180)");
  f.query(async () => []); await f.run("pollLive()");assert(!first.dead,'Single missing enumeration cannot stop capture');
  f.query(async () => [game]);await f.run("pollLive()");assert(!first.dead,'Recovery retains GPU session');
  f.query(async () => []);await f.run("pollLive()");f.advance(3000);await f.run("pollLive()");f.advance(3000);await f.run("pollLive()");
  assert.equal(await pending, null); assert(first.dead); assert.equal(f.ctx.liveWaiting, true);
  assert.equal(f.ctx.terminated, 1); assert.equal(f.run("capWait.size"), 0);
  f.events["cap-ready"]({ sender: first.webContents }, { w: 1920, h: 1080 });
  assert.equal(f.run("capReady"), false);
  await f.run("loop()"); assert.equal(f.ctx.frames, 0);
  console.log("✓ 游戏退出释放捕获窗/识别线程，待取帧取消，迟到 IPC 不会复活捕获");

  f.advance(60000); f.query(async () => [game]); await f.run("pollLive()");
  const second = f.windows[1];
  f.events["cap-ready"]({ sender: second.webContents }, { w: 1920, h: 1080 });
  f.events["cap-fail"]({ sender: second.webContents }, { msg: "ended" });
  assert(second.dead); assert.equal(f.ctx.liveWaiting, true);
  assert.equal(await f.run("grab(false)"), null);
  assert(f.calls.every(o => o.types[0] === "window"));
  console.log("✓ 游戏重启能恢复；主播模式断流不回退桌面");

  f.advance(60000); await f.run("pollLive()");
  const third = f.windows[2]; f.events["cap-ready"]({ sender: third.webContents }, { w: 1920, h: 1080 });
  f.run('for (let i = 0; i < 40; i++) liveBlackCheck({buf: new Uint8Array(256).buffer})');
  assert(third.dead); assert.equal(f.run("liveBlocked"), true);
  f.advance(60000); await f.run("pollLive()"); assert.equal(f.windows.length, 3);
  console.log("✓ 持续黑屏停止捕获，不循环重建、不回退桌面");

  const g = fixture(); let resolveQuery;
  g.query(() => new Promise(r => { resolveQuery = r; }));
  const p1 = g.run("findGameWindow()").catch(e => e), p2 = g.run("findGameWindow()").catch(e => e);
  assert.equal(g.calls.length, 1);
  for (const t of [...g.timers.values()]) if (t.ms === 3000) t.fn();
  await Promise.all([p1, p2]);
  const p3 = g.run("findGameWindow()"); assert.equal(g.calls.length, 1);
  resolveQuery([game]); assert.equal((await p3).id, game.id);
  console.log("✓ 原生窗口查询超时仍不堆叠新查询");

  const h = fixture(); let resolveLate;
  h.query(() => new Promise(r => { resolveLate = r; }));
  const poll = h.run("pollLive()");
  h.ctx.settings.allowCapture = false; h.run('applyLive("关直播")');
  resolveLate([game]); await poll;
  assert.equal(h.run("capMode"), "waiting"); assert.equal(h.windows.length, 0);
  h.query(async () => [game]); await h.run("pollLive()");
  assert.equal(h.windows.length, 1);
  const screenSource = { id: "screen:1:0", display_id: "1", thumbnail: { getSize: () => ({ width: 1, height: 1 }), toBitmap: () => Buffer.alloc(4) } };
  h.query(async () => [screenSource]);
  assert(await h.run("grabLegacy(false)")); assert.equal(h.calls.at(-1).types[0], "screen");
  console.log("✓ 关闭主播模式使旧查询失效，普通模式保留屏幕捕获");

  const j = fixture(); j.query(async () => [game]); await j.run("pollLive()");
  j.events["cap-ready"]({ sender: j.windows[0].webContents }, { w: 1920, h: 1080 });
  const taking = j.run("loop()");
  j.run('suspendLive("退出")'); await taking;
  assert.equal(j.ctx.frames, 0);
  for (const t of [...j.timers.values()]) if (t.ms === 8000) t.fn();
  assert.equal(j.run("capDead"), false);
  console.log("✓ 取帧途中退出不再向识别线程送帧，旧启动超时不污染休眠状态");
  const normal = fixture(false); normal.ctx.liveWaiting = true;
  await normal.run("pollLive()"); assert.equal(normal.windows.length, 0);
  normal.query(async () => [game]); await normal.run("pollLive()"); assert.equal(normal.windows.length, 1);
  normal.query(async () => []); await normal.run("pollLive()");assert.equal(normal.ctx.liveWaiting,false);normal.advance(3000);await normal.run("pollLive()");normal.advance(3000);await normal.run("pollLive()"); assert.equal(normal.ctx.liveWaiting, true); assert(normal.windows[0].dead);
  normal.ctx.cfg.paused = true; normal.advance(60000); normal.query(async () => [game]); await normal.run("pollLive()"); assert.equal(normal.windows.length, 1);
  normal.ctx.cfg.paused = false; await normal.run("pollLive()"); assert.equal(normal.windows.length, 2);
  console.log("✓ 普通模式退出游戏释放资源；暂停期间不恢复；继续后自动恢复");
  console.log("全部通过");
})().catch(e => { console.error(e); process.exitCode = 1; });
