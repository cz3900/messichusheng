"use strict";
const assert=require("assert/strict"),{Worker}=require("worker_threads"),path=require("path");
const w=new Worker(path.resolve(__dirname,"../combo_worker.js"),{workerData:{model:"",prefer:"cpu",combo:path.resolve(__dirname,"_combo_stub.js"),duel:path.resolve(__dirname,"_duel_stub.js")}});
const pending=new Map();let id=0;
w.on("message",m=>{if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
const st={pool:{heroKeys:Array.from({length:12},(_,i)=>"h"+i),basics:Array.from({length:36},(_,i)=>"b"+i),ults:Array.from({length:12},(_,i)=>"u"+i)}};
function send(type,extra={}){const key=++id;const p=new Promise(resolve=>pending.set(key,resolve));w.postMessage({id:key,type,st,mode:"duel-fast",bfix:128,budget:900,o:{},...extra});return p;}
(async()=>{
 let a=send("duelbg"),b=send("duel");let [x,y]=await Promise.all([a,b]);assert(x.cancelled);assert(!y.cancelled);
 a=send("duel");b=send("duelbg");[x,y]=await Promise.all([a,b]);assert(!x.cancelled);assert(!y.cancelled);
 a=send("duel");b=send("duelbg");w.postMessage({type:"cancel"});[x,y]=await Promise.all([a,b]);assert(x.cancelled&&y.cancelled);
 a=send('duelbg',{budget:0,o:{continuous:true}}); await new Promise(resolve=>setTimeout(resolve,160)); b=send('duel'); [x,y]=await Promise.all([a,b]); assert(x.cancelled&&x.r.rounds>=10&&!y.cancelled);
 console.log('通过：双方推演前台抢占后台、后台不打断前台、持续维护直到取消、全部取消。');
 await w.terminate();
})().catch(async e=>{console.error(e);await w.terminate();process.exitCode=1;});
