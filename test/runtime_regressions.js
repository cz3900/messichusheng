'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const F=require('../engine/server/mcts_fast.js');
const sim={step:0,order:[0,5],taken:new Uint8Array(60),slot:new Uint8Array(30),z:1.23};
F.passSim(sim); assert.equal(sim.step,1);assert.equal(sim.z,1.23);assert.equal(sim.taken.reduce((a,b)=>a+b),0);
F.passSim(sim);F.passSim(sim);assert.equal(sim.step,2);assert(F.simDone(sim));
console.log('✓ 无合法候选跳步，保持分数与槽位，终止后不越界');
const R=require('./_env').init(),T=require('../trace');
const img={w:64,h:64,data:Buffer.alloc(64*64*4,100)};
const key='axe_berserkers_call',expected=R.matchSkill(img,[0,0,64,64],[key]);
const frame=new T.Frame({scores:{s:{pv:[],g:[]}},boxes4:{s:[0,0,64,64]}},{img,poolKeys:[]});
R.setSource(frame);
try { const got=frame.match('s',[key]);assert.equal(got.key,expected.key);assert.equal(got.s1,expected.s1);assert.equal(frame.rec.scores.s.g[0][0],key); }
finally {R.setSource(null);}
console.log('✓ 轨迹缺少候选分数时回到真实像素匹配，不递归');
const worker=fs.readFileSync(path.join(__dirname,'../worker.js'),'utf8');
const ctx=vm.createContext({CB:null, R:{cn:x=>x},boxes:[],cellOf:{}});
vm.runInContext(worker.slice(worker.indexOf('  const cbRows ='),worker.indexOf('  const pubCB =')),ctx);
assert.equal(vm.runInContext('cbRows().length',ctx),0);
console.log('✓ 空 GPU 结果不再触发 Object.entries(null)');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');let visible=false,throttled=false;
const m=vm.createContext({crashDiag:{record(){}},liveWaiting:false,recognitionNotice:false,visibilityNoticeUntil:0,cfg:{paused:false,hidden:false},phase:'idle',ovPingAt:0,Date,
 overlay:{isDestroyed:()=>false,hide:()=>visible=false,showInactive:()=>visible=true,isVisible:()=>visible,setAlwaysOnTop(){},webContents:{setBackgroundThrottling:v=>throttled=v}},send(){}});
vm.runInContext(main.slice(main.indexOf('function overlayWanted()'),main.indexOf('/* ---- 截屏')),m);
vm.runInContext('setVisible(false)',m);assert(!visible&&throttled);
m.phase='active';vm.runInContext('setVisible(true)',m);assert(visible&&!throttled);
m.cfg.hidden=true;vm.runInContext('setVisible(true)',m);assert(!visible&&throttled);
m.cfg.hidden=false;m.liveWaiting=true;vm.runInContext('setVisible(true)',m);assert(!visible&&throttled);
m.liveWaiting=false;m.phase='idle';m.recognitionNotice=true;vm.runInContext('setVisible(false)',m);assert(visible&&!throttled);
m.recognitionNotice=false;vm.runInContext('setVisible(false)',m);assert(!visible&&throttled);
m.cfg.hidden=true;m.visibilityNoticeUntil=Date.now()+2000;vm.runInContext('setVisible(false)',m);assert(visible&&!throttled);
m.visibilityNoticeUntil=0;vm.runInContext('setVisible(false)',m);assert(!visible&&throttled);
console.log('✓ 空闲、手动隐藏、游戏退出均隐藏覆盖窗，选技恢复显示');
// Completion needs ten unique heroes and forty unique known skills with one ultimate per seat.
const completion=worker.slice(worker.indexOf('    const ultimateKeys ='),worker.indexOf('    completedFrames = confirmedFull'));
const panels=Array.from({length:10},(_,i)=>({hero:'hero'+i,skills:Array.from({length:4},(_,j)=>({key:`s${i*4+j}`}))}));
const skills=Array.from({length:40},(_,i)=>({key:'s'+i,ultslot:i%4===3}));
const complete=S=>vm.runInNewContext(completion+'\nconfirmedFull',{S});
assert(complete({panels,skills}));assert(!complete({panels:panels.slice(1),skills}));
const bad=structuredClone(panels);bad[0].skills[0].key='?pick';assert(!complete({panels:bad,skills}));
const dup=structuredClone(panels);dup[1].hero=dup[0].hero;assert(!complete({panels:dup,skills}));
console.log('✓ 仅十人合法完整阵容进入结束态，缺格、占位、重复英雄不提前结束');
const idleBranch=worker.slice(worker.indexOf('    if (phase === "idle" || forceReset) {'),worker.indexOf('    /* 托盘手动指定的本人座位'));
function wake(completed,oldSig,newSig,evidence=true,lockOK=true){
 let locks=0;
 const c=vm.createContext({phase:'idle',forceReset:false,tracker:{boxesNow:[],lastBoardSig:oldSig},draftComplete:completed,
  R:{boardSig:()=>newSig,sigDiff:(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i]))),draftBoardEvidence:()=>evidence},
  img:{},pres:{},retryAt:0,presentRun:2,lastNd:0,lastQuick:null,pendingNext:false,
  Date,parentPort:{postMessage(){}},log(){},trStop(){},want(){},tryLock(){locks++;if(lockOK){c.phase='active';c.draftComplete=false;}}});
 vm.runInContext('(function(){'+idleBranch+'})()',c);return {phase:c.phase,locks};
}
assert.deepEqual(wake(true,Array(60).fill(10),Array(60).fill(10)),{phase:'idle',locks:0});
assert.deepEqual(wake(true,Array(60).fill(10),Array(60).fill(100)),{phase:'active',locks:1});
assert.deepEqual(wake(false,Array(60).fill(100),Array(60).fill(20)),{phase:'active',locks:0});
assert.deepEqual(wake(true,Array(60).fill(100),Array(60).fill(20)),{phase:'active',locks:1});
assert.deepEqual(wake(true,Array(60).fill(10),Array(60).fill(100),false),{phase:'idle',locks:0});
assert.deepEqual(wake(true,Array(60).fill(10),Array(60).fill(100),true,false),{phase:'idle',locks:1});
console.log('✓ 结束后菜单不重锁；新棋盘才探测；失败保持结束态；未结束的遮挡恢复保留原局');
