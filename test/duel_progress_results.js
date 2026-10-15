'use strict';
process.env.AD_COMBO_FAKE='1';
const assert=require('assert/strict'),D=require('../engine/server/draft'),{DuelController}=require('../duel_controller'),input=require('../../research/rubick_full_draft_20261008/input.json');
(async()=>{
 const state=D.newState(input.pool);state.order=input.order;while(state.step<41)assert(D.pick(state,D.autoPick(state,()=>0)).ok);
 const waves=[],c=new DuelController(),r=await c.decide(state,{mode:'duel-fast',budgetMs:5000,onResult:x=>waves.push(x)});
 assert(r.complete);assert.equal(waves.length,4);assert.equal(waves[0].newSamples,32);assert(!waves[0].complete);assert(waves[0].rows.every(row=>row.n===4&&Number.isFinite(row.win)&&Number.isFinite(row.rolloutStd)));
 assert(waves.at(-1).complete&&waves.at(-1).newSamples===128);assert.deepEqual(waves.at(-1).rows,r.rows);
 const stopped=new DuelController(),shown=[];let cancel=false;const partial=await stopped.decide(state,{mode:'duel-fast',onResult:x=>{shown.push(x);cancel=true;},cancelled:()=>cancel});
 assert.equal(shown.length,1);assert.equal(partial.newSamples,32);assert(!partial.complete);
 assert([...stopped.planner.tree.values()].every(n=>n.pending===0&&n.rows.every(e=>e.pending===0)));
 console.log('通过：首批32条真实终局即显示阶段结果，持续算到128才标最终；取消不发布未完成推演。');
})().catch(e=>{console.error(e);process.exitCode=1;});
