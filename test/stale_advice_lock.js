'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const current=fs.readFileSync(path.join(__dirname,'../worker.js'),'utf8');
function retry(src,adviceStamp){
 const a=src.indexOf('  if (sigStr === lastSig) {'),b=src.indexOf('  lastSig = sigStr;',a);
 const c=vm.createContext({sigStr:'current',lastSig:'current',seq:20,lockInfo:{j:6},curCtx:{pre:false},turnLock:null,
  lastAdvice:{stamp:adviceStamp,stage:'done',rows:[{key:'already-picked'}]},pre:false});
 vm.runInContext('(function(){'+src.slice(a,b)+'})()',c);return c.turnLock;
}
const previous=path.resolve(__dirname,'../../research/bug_analysis_20261010/pre_fix/worker.js');
if(fs.existsSync(previous))assert(retry(fs.readFileSync(previous,'utf8'),19),'Before fix, old preview can lock the new job');
assert.equal(retry(current,19),null,'Old preview must never lock or cancel the current calculation');
assert(retry(current,20),'Current completed results still lock');
const a=current.indexOf('  fastPicks.set(k,'),b=current.indexOf('\n  pickedAtCur = true;',a);
let wants=0;const c=vm.createContext({fastPicks:new Map(),k:'dark',Date,S:{me:{side:'L',idx:0},current:{side:'L',idx:0}},seatIdx:p=>(p.side==='L'?0:5)+p.idx,lastS:null,log(){},want(){wants++;}});
assert.equal(vm.runInContext('(function(){'+current.slice(a,b)+';return false;})()',c),true);
assert.equal(wants,1);assert.equal(c.lastS,null,'A speculative dark cell must not replace the confirmed state');
const loopStart=current.indexOf('    for (const [k, fp] of [...fastPicks])'),loopEnd=current.indexOf('    const confirmedFull',loopStart);
const state={me:{side:'L',idx:0},current:{side:'L',idx:0},taken_heroes:[],skills:[{key:'phantom',taken:false}]};
const slow=vm.createContext({fastPicks:new Map([['phantom',{t:Date.now(),n:0}]]),S:state,tracker:{pool:{heroBoxes:[]}},rawNow:{phantom:'?'},Date,seatIdx:p=>(p.side==='L'?0:5)+p.idx});
vm.runInContext(current.slice(loopStart,loopEnd),slow);assert.equal(state.skills[0].taken,false,'Unconfirmed fast evidence cannot cancel the ongoing self-turn job');
console.log('通过：旧代码可复现旧预估锁住新任务；新代码拒绝旧stamp，保留当前结果锁；本人单格快扫等待完整帧。');
