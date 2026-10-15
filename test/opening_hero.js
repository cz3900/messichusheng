"use strict";
const assert = require('assert/strict');
const R = require('./_env.js').init();
// 10-07 火枪/衰退局开局幽鬼卡实测：暗而有色，不能当已选。
const hero = 'npc_dota_hero_spectre', box = [0,0,80,80]; box.cell = 43;
const pool = { skills: [], heroBoxes: [{ hero, cell: 43, box }] };
for (const [label,stats,taken] of [
 ['幽鬼暗色原画',{mean:12.4,max:38.5,sat:0.783},false],
 ['低亮度灰色已选卡',{mean:18,max:32,sat:0.12},true],
 ['纯黑卡颜色噪声',{mean:4,max:8,sat:0.6},true],
 ['有反光的已选卡',{mean:65,max:100,sat:0.05},true],
]) {
 R.setSource({cellStats:()=>stats});
 try { const ref=R.refBrightness(null,pool);assert.equal(ref.preTaken.includes('hero:'+hero),taken,label);
   if(!taken){assert.equal(ref.refB[43],12.4);assert.equal(R.cellState(null,box,ref.refB[43],ref.refS[43],true),'N');}
 } finally { R.setSource(null); }
 console.log('✓ '+label);
}
// 中途打开时首帧已有英雄，只计一手；不应先计数再把英雄推给右一。
const t=new R.Tracker(); t.fullOrder=[0,5,1,6,2,7,3,8,4,9]; t.pool={poolHeroes:[hero]};t.frameNo=1;
const panels=t.fullOrder.map(x=>({side:x<5?'L':'R',idx:x%5,filled:0}));
const before=process.env.AD_NONAME;process.env.AD_NONAME='1';
try { t.attribute(null,{current:['R',0],panels,taken:{},takenHeroes:[hero]},q=>q[0]+(q[1]+1),(a,b)=>a[0]===b[0]&&a[1]===b[1]); }
finally { if(before===undefined) delete process.env.AD_NONAME; else process.env.AD_NONAME=before; }
assert.deepEqual(t.heroOf[hero],['L',0]);assert.equal(t.turn,1);
console.log('✓ 首帧已选英雄只计一次，归左一而不是凭空挪到右一');
// 同一局首轮轮到左二时，应选择当前第 3 手，不能跳到右二再预估下一轮。
const fs=require('fs'),path=require('path'),vm=require('vm');
const worker=fs.readFileSync(path.join(__dirname,'../worker.js'),'utf8');
const context=vm.createContext({});
vm.runInContext(worker.slice(worker.indexOf('const seatIdx ='),worker.indexOf('function buildState')),context);
vm.runInContext(worker.slice(worker.indexOf('function startIdxOf('),worker.indexOf('/* v1.38 我的回合账本')),context);
context.state={current:{side:'L',idx:1},me:{side:'L',idx:1},panels:[{side:'L',idx:1,hero:null,skills:[]}]};
assert.equal(vm.runInContext('startIdxOf(state,false,2)',context),2);
// 旧错误局面：额外的英雄被记到本人名下，正是跳过当前手的触发条件。
context.state.panels[0].hero='npc_dota_hero_nevermore';
assert.equal(vm.runInContext('startIdxOf(state,false,3)',context),3);
console.log('✓ 修复后的首轮局面不再跳过本人，旧假英雄局面可复现跳手');
