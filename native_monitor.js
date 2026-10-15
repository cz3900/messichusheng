'use strict';
// Native faults cannot run JS catch handlers. Persist boundaries and retain
// the in-flight operation in heartbeat context, without writing every GPU call.
function create({now=()=>Date.now()}={}){
 let hook=null,lastInferenceLog=-Infinity,next=0;const active=new Map(),waiters=new Set();
 const stats={calls:0,runMs:0,maxMs:0,errors:0};
 const emit=(event,details,critical=false)=>{try{hook?.(event,details,critical);}catch(_){}};
 async function call(kind,details,operation){
  const op={id:++next,kind,startedAt:now(),...details};active.set(op.id,op);
  const logged=kind!=='infer'||op.startedAt-lastInferenceLog>=1000;
  if(logged){if(kind==='infer')lastInferenceLog=op.startedAt;emit('native-start',op);}
  try{const result=await operation();const ms=now()-op.startedAt;
   if(kind==='infer'){stats.calls++;stats.runMs+=ms;stats.maxMs=Math.max(stats.maxMs,ms);}
   if(logged||ms>=250)emit('native-end',{...op,ms});return result;
  }catch(e){stats.errors++;emit('native-error',{...op,ms:now()-op.startedAt,stack:String(e?.stack||e)},true);throw e;}
  finally{active.delete(op.id);if(!active.size){for(const resolve of waiters)resolve();waiters.clear();}}
 }
 return {call,waitIdle(){return active.size?new Promise(resolve=>waiters.add(resolve)):Promise.resolve();},setHook(fn){hook=fn;},snapshot(){return {activeCount:active.size,active:[...active.values()].slice(0,8).map(op=>({...op,elapsedMs:now()-op.startedAt})),...stats};}};
}
module.exports={create};
