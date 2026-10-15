'use strict';
const assert = require('assert/strict'), path = require('path'), fs = require('fs');
const F = require('../engine/server/mcts_fast'), C = require('../combo_local');
const win = F.loadModel(path.resolve(__dirname, '../engine/public')), G = F.buildEngine(win);
const keys = Object.keys(win.AD_MODEL.index).sort((a,b)=>win.AD_MODEL.index[a]-win.AD_MODEL.index[b]);
const toKeys = seats => seats.map(row=>row.filter(p=>p>=0).map(p=>keys[p]));
const fixtures = require('./fixtures/f21_scores.json');
let fullError=0, fastError=0, deltaError=0, extError=0, logitError=0, valueError=0;
for(const c of fixtures){
 const actual=win.ADScore.evaluate(toKeys(c.seats)).logit;
 fullError=Math.max(fullError,Math.abs(actual-c.expected_logit));
 const entries=c.seats.flatMap((row,s)=>row.filter(p=>p>=0).map(p=>({p,s,kind:0})));
 for(const seq of [entries,entries.slice().reverse()]){
  const sim=F.makeSim(G,seq,seq.map(x=>x.s));
  seq.forEach((_,i)=>F.applySim(sim,i));fastError=Math.max(fastError,Math.abs(sim.z-actual));
 }
 const swap=c.seats.slice(5).concat(c.seats.slice(0,5));
 assert(Math.abs(win.ADScore.evaluate(toKeys(swap)).logit+actual)<1e-8);
}
assert(fullError<4e-5,`full score ${fullError}`);assert(fastError<1e-7,`incremental ${fastError}`);
const b=fs.readFileSync(path.resolve(__dirname,'../data/pairP.bin'));C._setPair(new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)),640);
const net=require('../netinfer').create(path.resolve(__dirname,'../data/netS_f21_60'));
for(const c of require('./fixtures/netS_f21_60_cases.json')){
 const items=c.ids.map((p,i)=>({p,kind:i<12?0:i<48?1:2})),sim=F.makeSim(G,items,[c.seat]);
 c.seats.forEach((row,s)=>row.filter(p=>p>=0).sort((a,b)=>(keys[a].startsWith('hero:')?-1:1)-(keys[b].startsWith('hero:')?-1:1)).forEach(p=>F.seedItem(sim,s,p)));
 c.owner.forEach((s,i)=>{if(s>=0){sim.taken[i]=1;sim.slot[s*3+items[i].kind]++;}});
 sim.z=win.ADScore.evaluate(toKeys(c.seats)).logit;
 for(let i=0;i<60;i++)if(c.legal[i]){
  const d=(c.seat<5?1:-1)*F.deltaOf(sim,i);deltaError=Math.max(deltaError,Math.abs(d-c.dl[i]));
  const clone=F.cloneSim(sim);F.applySim(clone,i);const after=c.seats.map(r=>r.filter(p=>p>=0));after[c.seat].push(items[i].p);
  assert(Math.abs(clone.z-win.ADScore.evaluate(toKeys(after)).logit)<1e-7);
  const parts=new Float64Array(6);F.deltaParts(sim,i,parts);assert(Math.abs(parts.reduce((a,b)=>a+b,0)-F.deltaOf(sim,i))<1e-8);
 }
 const buf={legal:c.legal,ext:new Float32Array(180)};C.extFill(sim,c.owner,c.seat,buf,0);
 c.ext.flat().forEach((v,i)=>extError=Math.max(extError,Math.abs(v-buf.ext[i])));
 const r=net.forward(c.ids,c.code,c.dl,c.legal,c.t,c.seat,c.slot,buf.ext);
 c.logits.forEach((v,i)=>{if(v!==null)logitError=Math.max(logitError,Math.abs(v-r.logits[i]));});valueError=Math.max(valueError,Math.abs(c.v-r.v));
}
assert(deltaError<4e-5,`delta ${deltaError}`);assert(extError<2e-6,`ext ${extError}`);
assert(logitError<1e-4,`CPU logits ${logitError}`);assert(valueError<1e-4,`CPU value ${valueError}`);
// Check every intermediate move around Alchemist readiness and dead-skill picks.
for (const c of fixtures.filter(c=>c.seats.some(r=>r.includes(G.at('hero:73')) || r.includes(G.at('hero:94')))).slice(0,12)) {
 const seq=c.seats.flatMap((r,s)=>r.filter(p=>p>=0).map(p=>({p,s,kind:0}))).reverse();
 const sim=F.makeSim(G,seq,seq.map(x=>x.s)),raw=Array.from({length:10},()=>[]);
 for(let i=0;i<seq.length;i++){F.applySim(sim,i);raw[seq[i].s].push(seq[i].p);assert(Math.abs(sim.z-win.ADScore.evaluate(toKeys(raw)).logit)<1e-7);}
}
// Exercise the actual worker CPU path, including ownership, ext and fallback wiring.
const app=path.resolve(__dirname,'..'),req=require('module').createRequire(path.join(app,'worker.js'));
const source=fs.readFileSync(path.join(app,'worker.js'),'utf8'),body=source.slice(source.indexOf('let NETM = null;'),source.indexOf('function arriveNote('));
let encoded;
const wrapRequire=name=>name.endsWith('/netinfer.js')?{create:()=>({forward:(...args)=>{encoded=args;return net.forward(...args);}})}:req(name);
const netProbs=new Function('require','path','D','E','AI','log',body+';return netProbs;')(wrapRequire,path,path.join(app,'data'),path.join(app,'engine/server'),req('./engine/server/ai'),()=>{});
const heroKeys=Object.fromEntries(win.AD_HEROES.map(h=>['hero:'+h.id,h.key]));
for(const c of require('./fixtures/netS_f21_60_cases.json').filter((_,i)=>i===5||i===19)){
 const ks=c.ids.map(p=>heroKeys[keys[p]]||keys[p]);
 const st={pool:{heroKeys:ks.slice(0,12),basics:ks.slice(12,48),ults:ks.slice(48)},seats:Array.from({length:10},()=>({hero:null,basics:[],ult:null})),order:[c.seat],step:0};
 c.owner.forEach((s,i)=>{if(s>=0){if(i<12)st.seats[s].hero=ks[i];else if(i<48)st.seats[s].basics.push(ks[i]);else st.seats[s].ult=ks[i];}});
 const probs=netProbs(st,c.seat,c.t);assert(Math.abs(Object.values(probs).reduce((a,b)=>a+b,0)-1)<1e-8);
 assert.deepEqual(encoded[0],c.ids);assert.deepEqual(encoded[1],c.code);
 encoded[2].forEach((v,i)=>assert(Math.abs(v-c.dl[i])<4e-5));
 encoded[7].forEach((v,i)=>assert(Math.abs(v-c.ext.flat()[i])<2e-6));
}
console.log(JSON.stringify({fixtures:fixtures.length,fullError,fastError,deltaError,extError,logitError,valueError}));
