"use strict";
const assert=require("assert/strict"),fs=require("fs"),vm=require("vm"),path=require("path");
const src=fs.readFileSync(process.argv[2]||path.join(__dirname,"../worker.js"),"utf8"),start=src.indexOf("function syncShareMode(me)"),end=src.indexOf("const PLEVELS",start);
assert(start>=0&&end>start);
const events=[],ctx={SHARE_OPT:true,SHARE_MODE:"expect",cancelComputations:()=>events.push(["cancel"]),FS:{setShareMode:m=>events.push(["engine",m])},POOL:{cfg:o=>events.push(["pool",o.shareMode])},COMBO_W:{postMessage:o=>events.push(["combo",o.shareMode])},scorePlayers:{setShareMode:m=>events.push(["scores",m])},log:()=>{}};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
for(const seat of [{side:"L",idx:2},{side:"R",idx:2},"L3","R3",null,{idx:2}]){
 const expected="optimalBoth";
 events.length=0;const changed=ctx.SHARE_MODE!==expected;ctx.syncShareMode(seat);assert.equal(ctx.SHARE_MODE,expected);
 if(changed){assert.deepEqual(events.map(x=>x[0]),["cancel","engine","pool","combo","scores"]);assert(events.slice(1).every(x=>x[1]===expected));}else assert.equal(events.length,0);
}
ctx.SHARE_OPT=false;
for(const seat of [{side:"L",idx:2},{side:"R",idx:2},null]){ctx.syncShareMode(seat);assert.equal(ctx.SHARE_MODE,"expect");}
console.log("通过：团队分配对左右队和未知座位统一 optimalBoth，关闭统一 expect；切换清旧搜索并同步全部评分器，座位变化不重复取消计算。");
