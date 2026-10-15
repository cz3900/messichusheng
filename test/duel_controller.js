"use strict";
process.env.AD_COMBO_FAKE="1";
const assert=require("assert/strict"),D=require("../engine/server/draft"),{DuelController}=require("../duel_controller");
const {T}=require("../duel_search"),modes=require("../ai_modes");
const input=require("../../research/rubick_full_draft_20261008/input.json");
const clone=s=>JSON.parse(JSON.stringify(s));
function advance(s){assert(D.pick(s,D.autoPick(s,()=>0)).ok);}
(async()=>{
  assert.equal(modes.MODES.length,6);
  assert.equal(modes.migrate({aimode:"combo"}).aimode,"combo-team");
  assert.equal(modes.migrate({aimode:"combo",aiModeSchema:6}).aimode,"combo");
  assert.equal(modes.normalize("bad"),"mcts");
  const state=D.newState(input.pool);state.order=input.order;while(state.step<41)advance(state);
  const controller=new DuelController();controller.setShareMode("optimalBoth");
  const prep=await controller.background(clone(state),{mode:"duel-fast",targetSeat:state.order[state.step+1],budgetMs:2000});
  assert(prep.profiledChoices>0);
  const actual=clone(state);const move=controller.planner.effectPlans.profiles[0].move;assert(D.pick(actual,move).ok);
  const fast=await controller.decide(actual,{mode:"duel-fast",budgetMs:2000});assert(D.pick(clone(actual),fast.chosen).ok);assert(fast.proposal?.hit);
  assert.equal(controller.planner.effectPlans.before.step,41,'Absolute draft step preserved');
  const tree=controller.planner,normal=await controller.decide(actual,{mode:"duel",budgetMs:3000});
  assert.notEqual(controller.planner,tree,'Switch mode clears values and priors');assert(normal.complete);assert(D.pick(clone(actual),normal.chosen).ok);
  assert([...controller.planner.tree.values()].every(n=>n.pending===0&&n.rows.every(r=>r.pending===0)));
  const stopped=await controller.decide(actual,{mode:"duel-fast",cancelled:()=>true});assert(stopped.partial);
  assert([...controller.planner.tree.values()].every(n=>n.pending===0&&n.rows.every(r=>r.pending===0)));
  const cached=controller.planner;controller.setShareMode("expect");assert.notEqual(controller.planner,cached);
  assert.equal(T.base,require("path").resolve(__dirname,".."),'Runtime is packaged app, not research files');
  console.log('通过：六版本迁移、独立运行模块、绝对手数、条件计划命中、切换清缓存、取消回滚、份额切换。');
})().catch(e=>{console.error(e);process.exitCode=1;});
