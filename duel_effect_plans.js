'use strict';
const assert=require('assert/strict'),T=require('./duel_runtime');
const {C,AI}=T,N=T,D=require(T.base+'/engine/server/draft');
const clone=s=>JSON.parse(JSON.stringify(s));
function stateKey(s){const sim=AI._simFrom(s);return C.ownKey(C.ownerOf(s,sim,s.order[s.step]),sim.step);}
function advance(s,key){const next=clone(s);assert(D.pick(next,key).ok);return next;}
function values(profile){return new Map(profile.rows.map(r=>[r.key,r.win]));}
function best(profile){return Math.max(...profile.rows.map(r=>r.win));}
function legal(profile,key){return profile.legalKeys?profile.legalKeys.includes(key):values(profile).has(key);}
// Compare action advantages, not absolute team strength: a harmless opposing
// pick may shift all utilities without changing which action we should take.
function effectDistance(a,b){
  const av=values(a),bv=values(b),common=[...av.keys()].filter(k=>bv.has(k));
  if(common.length<Math.min(3,a.rows.length,b.rows.length))return Infinity;
  return Math.max(0,...common.map(k=>Math.abs((av.get(k)-best(a))-(bv.get(k)-best(b)))));
}
// A shared priority rule must work for EVERY sampled member. "X if legal,
// otherwise Y" falls out of this construction; no fixed number of plans.
function priorityRule(members,tolerance){
  let pending=members.slice();const priority=[];
  while(pending.length){
    const keys=[...new Set(pending.flatMap(p=>p.rows.map(r=>r.key)))];let winner=null;
    for(const key of keys){
      const available=pending.filter(p=>legal(p,key));
      if(!available.length||available.some(p=>!values(p).has(key)||best(p)-values(p).get(key)>tolerance+1e-12))continue;
      const loss=available.reduce((sum,p)=>sum+best(p)-values(p).get(key),0);
      const meanLoss=loss/available.length;
      if(!winner||meanLoss<winner.meanLoss-1e-12||(Math.abs(meanLoss-winner.meanLoss)<=1e-12&&available.length>winner.covered))winner={key,covered:available.length,loss,meanLoss};
    }
    if(!winner)return null;
    priority.push(winner.key);pending=pending.filter(p=>!legal(p,winner.key));
  }
  return priority;
}
function clusterEffects(profiles,{regretTolerance=.01,distanceTolerance=Infinity}={}){
  const groups=[];
  for(const p of profiles){
    assert(p.rows.length&&p.rows.every(r=>Number.isFinite(r.win)));
    let selected=null;
    if(!p.protected)for(const g of groups){
      if(g.protected||(Number.isFinite(distanceTolerance)&&g.members.some(q=>effectDistance(p,q)>distanceTolerance)))continue;
      const rule=priorityRule([...g.members,p],regretTolerance);if(!rule)continue;
      if(!selected||g.members.length>selected.group.members.length)selected={group:g,rule};
    }
    if(selected){selected.group.members.push(p);selected.group.priority=selected.rule;}
    else groups.push({id:groups.length,protected:!!p.protected,members:[p],priority:priorityRule([p],regretTolerance)});
  }
  for(const g of groups)for(const p of g.members){const chosen=g.priority.find(k=>legal(p,k));assert(chosen&&values(p).has(chosen));assert(best(p)-values(p).get(chosen)<=regretTolerance+1e-12);}
  return groups;
}
class EffectPlans{
  constructor(planner,{screenSamples=16,chunkSize=8,protectedMass=.9,regretTolerance=.01,distanceTolerance=Infinity}={}){
    this.planner=planner;this.options={screenSamples,chunkSize,protectedMass,regretTolerance,distanceTolerance};this.before=null;this.profiles=[];this.groups=[];this.byMove=new Map();
  }
  async prepare(before,{budgetMs=6000,cancelled=()=>false}={}){
    const start=performance.now(),stop=()=>cancelled()||performance.now()-start>=budgetMs;
    assert(before.step+1<before.order.length);this.before=clone(before);this.profiles=[];this.groups=[];this.byMove.clear();
    const candidates=(await N.candidates([before],60))[0].rows,protectedKeys=new Set();let mass=0;
    for(const r of candidates){if(mass>=this.options.protectedMass)break;protectedKeys.add(r.key);mass+=r.net;}
    let newSamples=0,calls=0;
    for(let at=0;at<candidates.length&&!stop();at+=this.options.chunkSize){
      const moves=candidates.slice(at,at+this.options.chunkSize),states=moves.map(r=>advance(before,r.key));
      const result=await this.planner.decideMany(states,{samples:this.options.screenSamples,batch:this.options.screenSamples,cancelled:stop});calls+=result.calls;
      for(let j=0;j<result.results.length;j++){
        const r=result.results[j];newSamples+=r.newSamples;
        if(r.complete){const key=stateKey(states[j]),sim=AI._simFrom(states[j]),node=this.planner.tree.get(key);this.profiles.push({move:moves[j].key,probability:moves[j].net,protected:protectedKeys.has(moves[j].key),stateKey:key,legalKeys:node.legalKeys??node.rows.map(row=>sim.items[row.i].key),rows:r.rows,samples:r.requestedSamples});}
      }
    }
    this.groups=clusterEffects(this.profiles,this.options);
    for(const g of this.groups)for(const p of g.members)this.byMove.set(p.move,g);
    const elapsedMs=performance.now()-start;
    return {elapsedMs,legalChoices:candidates.length,profiledChoices:this.profiles.length,coverageMass:this.profiles.reduce((sum,p)=>sum+p.probability,0),newSamples,calls,deadlineOverrunMs:Math.max(0,elapsedMs-budgetMs),groups:this.groups.map(g=>({id:g.id,protected:g.protected,moves:g.members.map(p=>p.move),priority:g.priority,samples:g.members.map(p=>p.samples)}))};
  }
  resolve(actual,move){
    const start=performance.now(),g=this.byMove.get(move);
    if(!this.before||!g)return {hit:false,reason:'not-profiled'};
    if(JSON.stringify([actual.pool,actual.order])!==JSON.stringify([this.before.pool,this.before.order]))return {hit:false,reason:'different-game'};
    if(stateKey(actual)!==stateKey(advance(this.before,move)))return {hit:false,reason:'different-prefix'};
    const key=g.priority.find(k=>D.pick(clone(actual),k).ok);
    if(!key)return {hit:false,reason:'no-legal-action'};
    return {hit:true,approximate:true,key,group:g.id,groupSize:g.members.length,priority:g.priority.slice(),ms:performance.now()-start};
  }
  async decide(actual,move,{samples=128,onProposal=null,...options}={}){
    const proposal=this.resolve(actual,move);if(proposal.hit&&onProposal)onProposal(proposal);
    this.planner.advance(actual);
    // Group estimates NEVER become exact-state visits. Only samples actually
    // generated for this accurate prefix are reused for final confirmation.
    const result=await this.planner.decide(actual,{samples,...options});
    return {...result,proposal};
  }
}
module.exports={EffectPlans,clusterEffects,priorityRule,effectDistance};
