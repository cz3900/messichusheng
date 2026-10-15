'use strict';
const assert=require('assert/strict'),path=require('path'),D=require('../engine/server/draft'),F=require('../engine/server/mcts_fast');
const W=F.loadModel(path.resolve(__dirname,'../engine/public'));
const AI=require('../engine/server/ai');
const input=require('../../research/rubick_full_draft_20261008/input.json');
const heroes=Object.fromEntries(W.AD_HEROES.map(h=>[h.key,'hero:'+h.id]));
const state=D.newState(input.pool);state.order=input.order;
while(!D.done(state))assert(D.pick(state,D.autoPick(state,()=>0)).ok);
const builds=state.seats.map(s=>[s.hero,...s.basics,s.ult].map(k=>heroes[k]||k));
const swapped=builds.slice(5).concat(builds.slice(0,5));
for(const mode of ['expect','optimalBoth']){
 W.ADScore.setShareMode(mode);
 F.setShareMode(mode);
 const before=W.ADScore.evaluate(builds),after=W.ADScore.evaluate(swapped);
 assert(Math.abs(AI._simFrom(state).z-before.logit)<1e-9,'Root and incremental scoring must use the same economic mode');
 assert(Math.abs(before.logit+after.logit)<1e-9,'Swapping sides must reverse the same scoring criterion');
 assert(Math.abs(before.prob+after.prob-1)<1e-9);
 for(let i=0;i<10;i++)assert(Math.abs(before.seats[i].total-after.seats[(i+5)%10].total)<1e-9);
}
console.log('通过：双方自然/双方最优分配下，完整真实池阵容交换左右胜率互补、座位评分一致；根局面评分与增量引擎口径同步。');
