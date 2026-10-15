'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
async function run(src){
 const start=src.indexOf('  if (AIModes.isDuel(AIMODE)'),end=src.indexOf('  } else if (scr)',start);assert(start>=0&&end>start);
 const jobs=[];let published=0;
 const c=vm.createContext({AIModes:{isDuel:()=>true},AIMODE:'duel-fast',gpuPool:true,COMBO_OFF:'',COMBO_CFG:{sec:2},ctx:{pre:false,resultFinal:false},S:{},startIdx:0,cur:0,stamp:2,seq:2,comboState:'',CB:null,lastPub:null,R:{cn:k=>k},treeState:()=>({step:0}),log(){},evMe(){},pubCB(){published++;},
  comboJob(type,payload,budget,onReady){jobs.push(type);if(type==='duel')return Promise.resolve({type:'done',r:{rows:[{key:'a',n:0,win:null}],reason:'budget',calls:4,suspendedSteps:10}});if(onReady)onReady({r:{complete:true,rows:[{key:'a',win:.6,n:16}]}});return Promise.resolve({type:'done',r:{}});}});
 vm.runInContext(src.slice(start,end)+'\n}',c);for(let i=0;i<5;i++)await Promise.resolve();return {jobs,published,final:c.ctx.resultFinal};
}
(async()=>{
 const before=path.resolve(__dirname,'../../research/bug_analysis_20261010/pre_fix/worker.js');if(fs.existsSync(before)){const old=await run(fs.readFileSync(before,'utf8'));assert.deepEqual(old.jobs,['duel']);assert.equal(old.published,0);}
 const fixed=await run(fs.readFileSync(path.resolve(__dirname,'../worker.js'),'utf8'));assert.deepEqual(fixed.jobs,['duel','duelbg']);assert.equal(fixed.published,1);assert(fixed.final);
 console.log('通过：旧版零完整结果直接退出；修复版启动后台续算，完成后真实发布最终结果。');
})().catch(e=>{console.error(e);process.exitCode=1;});
