'use strict';
process.env.AD_COMBO_FAKE='1';
const assert=require('assert/strict'),D=require('../engine/server/draft'),{Planner,T}=require('../duel_search');
const input=require('../../research/rubick_full_draft_20261008/input.json');
const state=D.newState(input.pool);state.order=input.order;while(state.step<30)assert(D.pick(state,D.autoPick(state,()=>0)).ok);
(async()=>{
 const expected=await new Planner().decide(state,{samples:128,batch:32});
 const p=new Planner();let calls=0;const logits=T.C.logits;T.C.logits=async(...args)=>{calls++;return logits(...args);};
 try{
  let r,rounds=0,resumed=false;
  do{const first=calls;r=await p.decide(state,{samples:128,batch:32,budgetExpired:()=>calls-first>=4});rounds++;resumed||=r.resumedSteps>0;
   assert([...p.tree.values()].every(n=>n.pending===0&&n.rows.every(e=>e.pending===0)),'Soft budget leaves no live pending counts');
   assert(r.rows.every(x=>x.n>0||x.win===null),'Incomplete trajectories cannot produce fake estimates');
  }while(!r.complete&&rounds<100);
  assert(r.complete&&rounds>1&&resumed);assert.deepEqual(r.rows,expected.rows,'Resuming must preserve all 128 samples and exact search policy');
  const paused=new Planner();let n=0;await paused.decide(state,{budgetExpired:()=>++n>3});assert(paused.suspended);
  await paused.decide(state,{cancelled:()=>true});assert.equal(paused.suspended,null,'Actual cancellation discards stale trajectories');
  console.log(`通过：${rounds}次短预算最终完整128条，逐项等于不中断结果；未完成路径续算、pending归零、真正取消清除。`);
 }finally{T.C.logits=logits;}
})().catch(e=>{console.error(e);process.exitCode=1;});
