"use strict";
const assert=require("assert/strict"),path=require("path");
const C=require("./combo_local"),F=require("./engine/server/mcts_fast"),baseAI=require("./engine/server/ai");
const W=F.loadModel(path.join(__dirname,"engine","public"));
const hero=Object.fromEntries(W.AD_HEROES.map(h=>[h.key,"hero:"+h.id]));
const AI={_simFrom(state){const sim=baseAI._simFrom(state);sim.z=W.ADScore.evaluate(state.seats.map(s=>[s.hero,...s.basics,s.ult].filter(Boolean).map(k=>hero[k]||k))).logit;return sim;}};
function setShareMode(mode){W.ADScore.setShareMode(mode);F.setShareMode(mode);}
async function policiesRaw(entries){
  const buf=C.mkBuf(entries.length);
  entries.forEach((e,j)=>C.encodeRange([e.sim],[e.own],e.sim.step,buf,j));
  const logits=await C.logits(buf,entries.length);
  return entries.map((e,j)=>{
    const legal=[];for(let i=0;i<60;i++)if(buf.legal[j*60+i])legal.push(i);if(!legal.length)return [];
    const max=Math.max(...legal.map(i=>logits[j*60+i]));
    const rows=legal.map(i=>({i,p:Math.exp(logits[j*60+i]-max),n:0,sum:0,pending:0}));
    const sum=rows.reduce((a,r)=>a+r.p,0);rows.forEach(r=>r.p/=sum);return rows.sort((a,b)=>b.p-a.p);
  });
}
async function candidates(states,K){
  const entries=states.map(state=>{const sim=AI._simFrom(state);return {sim,own:C.ownerOf(state,sim,state.order[state.step])};});
  const raw=await policiesRaw(entries);
  return entries.map((entry,j)=>{
    const rows=raw[j].map(r=>({i:r.i,key:entry.sim.items[r.i].key,p:r.p*(F.depBlocked(entry.sim,r.i)?Math.exp(-4):1)})).sort((a,b)=>b.p-a.p);
    const sum=rows.reduce((a,r)=>a+r.p,0);
    return {...entry,rows:rows.slice(0,K).map(r=>({...r,net:r.p/sum}))};
  });
}
module.exports={base:__dirname,C,F,AI,scoreModel:W,policiesRaw,candidates,setShareMode};
