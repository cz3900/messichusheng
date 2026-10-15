'use strict';process.env.AD_COMBO_FAKE='1';
const assert=require('assert/strict'),{DuelController}=require('../duel_controller'),D=require('../engine/server/draft');
const input=require('../../research/rubick_full_draft_20261008/input.json'),clone=s=>JSON.parse(JSON.stringify(s));
(async()=>{
 const state=D.newState(input.pool);state.order=input.order;while(state.step<41)assert(D.pick(state,D.autoPick(state,()=>0)).ok);
 const a=new DuelController(),b=new DuelController();a.setShareMode('optimalBoth');b.setShareMode('optimalBoth');
 const old=await a.decide(state,{mode:'duel',budgetMs:5000}),fast=await b.decide(state,{mode:'duel-fast',budgetMs:5000});
 assert(old.complete&&fast.complete);assert.deepEqual(fast.rows,old.rows,'Cold search keeps128, all candidates and32-sample feedback waves');
 assert.equal(fast.requestedSamples,old.requestedSamples);assert.equal(fast.newSamples,old.newSamples);
 const controller=new DuelController();controller.setShareMode('optimalBoth');const started=performance.now();
 let ready=0; const progress=await controller.maintain(state,{onReady:r=>{assert(r.complete);ready++;},mode:'duel-fast',targetSeat:state.order[state.step],cancelled:()=>performance.now()-started>150});
 assert.equal(ready,1); assert(progress.rounds>0);assert(progress.newSamples>128,'Keeps calculating after original128 finishes');
 assert([...controller.planner.tree.values()].every(n=>n.pending===0&&n.rows.every(r=>r.pending===0)));
 const before=new Map([...controller.planner.tree].filter(([,n])=>n.candidateKeys).map(([k,n])=>[k,n.n]));
 const reused=await controller.decide(state,{mode:'duel-fast',budgetMs:5000});assert(reused.complete&&reused.newSamples===0&&reused.reusedSamples===reused.requestedSamples);
 for(const [key,n]of before)assert(controller.planner.tree.get(key).n>=n,'Never clears completed statistics');
 console.log('通过：原版与优化版冷搜索逐项一致，128次与8候选保留，后台持续追加，取消回滚，已有统计复用。');
})().catch(e=>{console.error(e);process.exitCode=1;});
