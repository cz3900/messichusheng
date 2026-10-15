'use strict';
process.env.AD_COMBO_FAKE='1';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const app=path.resolve(__dirname,'..'),live=path.resolve(__dirname,'../../research/bug_analysis_20261010/live_1482');
const D=require('../engine/server/draft'),{DuelController}=require('../duel_controller'),input=require('../../research/rubick_full_draft_20261008/input.json');
function load(name,search){const m=new Module(path.join(app,name+'.before.js'),module);m.filename=path.join(app,name+'.before.js');m.paths=Module._nodeModulePaths(app);const original=m.require.bind(m);m.require=n=>n==='./duel_search'&&search?search:original(n);m._compile(fs.readFileSync(path.join(live,name+'.js'),'utf8'),m.filename);return m.exports;}
(async()=>{
 if(!fs.existsSync(live))throw Error('Actual published1.48.2 sources are required for comparison');
 const before=load('duel_controller',load('duel_search')).DuelController;
 const state=D.newState(input.pool);state.order=input.order;while(state.step<41)assert(D.pick(state,D.autoPick(state,()=>0)).ok);
 const a=await new before().decide(state,{mode:'duel',budgetMs:5000}),b=await new DuelController({remember:false}).decide(state,{mode:'duel',budgetMs:5000});
 const scored=r=>r.rows.map(({key,n,win})=>({key,n,win}));assert(a.complete&&b.complete);assert.deepEqual(scored(a),scored(b),'Ordinary128-sample policy must remain exactly equal to released1.48.2');
 const opening=D.newState(input.pool);opening.order=input.order;while(opening.step<3)assert(D.pick(opening,D.autoPick(opening,()=>0)).ok);
 const oldFast=new before(),newFast=new DuelController();const old=await oldFast.decide(opening,{mode:'duel-fast',budgetMs:5000}),fresh=await newFast.decide(opening,{mode:'duel-fast',budgetMs:5000}),again=await newFast.decide(opening,{mode:'duel-fast',budgetMs:5000});
 assert(fresh.complete&&fresh.requestedSamples===128&&fresh.rows.length===8);assert.equal(again.newSamples,0);assert.equal(again.reusedSamples,128);
 fs.writeFileSync(path.join(live,'parity_test.json'),JSON.stringify({network:'AD_COMBO_FAKE; verifies computation policy, not recommendation accuracy',normal:{samples:b.requestedSamples,candidates:b.rows.length,same:true},oldFast:{samples:old.requestedSamples,totalNewSamples:old.totalNewSamples,screenSamples:old.screen?.requestedSamples,candidates:old.rows.length},fixedFast:{samples:fresh.requestedSamples,candidates:fresh.rows.length,repeatedStateNewSamples:again.newSamples}},null,2));
 console.log(`通过：实际发布版普通128条结果逐项一致；旧优化版开局粗筛${old.screen?.requestedSamples}→精算${old.rows.length}候选，新版8候选128条、重复局面复用。`);
})().catch(e=>{console.error(e);process.exitCode=1;});
