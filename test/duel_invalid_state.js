'use strict';
process.env.AD_COMBO_FAKE='1';
const assert=require('assert/strict'),D=require('../engine/server/draft'),{Planner,T}=require('../duel_search');
const input=require('../../research/rubick_full_draft_20261008/input.json');
(async()=>{
 const state=D.newState(input.pool);state.order=input.order;while(state.step<41)assert(D.pick(state,D.autoPick(state,()=>0)).ok);
 const encode=T.C.encodeRange,raw=T.C.logits;
 let forceRoot=false;
 T.C.encodeRange=function(sims,owners,step,buf,j){encode(sims,owners,step,buf,j);if(forceRoot||step>state.step)buf.legal.fill(0,j*60,(j+1)*60);};
 try{
  const p=new Planner(),r=await p.decide(state,{samples:128,batch:32});
  assert.equal(r.reason,'no-legal-continuation');assert.equal(r.complete,false);assert.equal(r.newSamples,0);
  assert(r.rows.every(x=>x.n===0&&x.win===null),'Invalid trajectories must never count as terminal wins');
  assert([...p.tree.values()].every(n=>n.pending===0&&n.rows.every(e=>e.pending===0)),'All pending paths rolled back');
  forceRoot=true;const root=await new Planner().decide(state);assert.equal(root.reason,'no-legal-root');assert.equal(root.complete,false);assert.equal(root.rows.length,0);
 }finally{T.C.encodeRange=encode;T.C.logits=raw;}
 console.log('通过：无合法后续不报错、不伪造胜率、回滚全部pending；空根返回未完成状态。');
})().catch(e=>{console.error(e);process.exitCode=1;});
