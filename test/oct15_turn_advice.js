'use strict';
// Actual worker scheduling with anonymous observations from the Oct 15 trace.
// Replace expensive advice computation only; the turn/clear decisions stay real.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),realRequire=require('module').createRequire(path.join(root,'worker.js'));
const events=[],calls=[],context=vm.createContext({Buffer,Uint8Array,Int8Array,Float32Array,Float64Array,Int32Array,Uint32Array,Uint16Array,
  console,setTimeout,clearTimeout,setImmediate,clearImmediate,__dirname:root,process:{env:{...process.env,AD_THREADS:'0'}},calls,
  require(name){if(name==='worker_threads')return {parentPort:{on(){},postMessage:m=>events.push(m)}};return realRequire(name);}});
vm.runInContext(fs.readFileSync(path.join(root,'worker.js'),'utf8'),context);
let checks=0;
const run=code=>vm.runInContext(code,context),check=(name,f)=>{try{f();checks++;}catch(e){e.message=name+': '+e.message;throw e;}};
run('advise=(S,j)=>calls.push(j);');
context.S=require('./fixtures/oct15_late_count.json').state;
check('reported count50 cannot clear a still-open last turn',()=>{
  run('chooseAdvice(S,49,false,null)');
  assert(!events.some(e=>e.type==='clear'));assert.deepEqual(calls,[49]);
});
// R5 acts twice at 10/11 and 30/31. L1 acts twice at 20/21 and 40/41.
// The same highlight and ±1 global counting noise must not switch those turns.
for(const [seat,first,before] of [[9,9,0],[9,29,2],[0,19,1],[0,39,3]]){
  const point={side:seat<5?'L':'R',idx:seat%5};
  for(let done=0;done<=2;done++){
    const count=before+done;
    context.pair={current:point,me:point,panels:[{...point,hero:count?'hero':null,skills:Array.from({length:Math.max(0,count-1)},(_,i)=>({key:'s'+i}))}]};
    for(const drift of [-1,0,1])for(const picked of [false,true]){
      const n=first+done+drift;
      check(`seat${seat} pair${first+1}/${first+2}, own${count}, total${n}, fastPick${picked}`,()=>
        assert.equal(run(`startIdxOf(pair,${picked},${n})`),first+done));
    }
  }
}
// Missing panel evidence retains the existing global-order fallback.
context.pair={current:{side:'R',idx:4},me:{side:'R',idx:4},panels:[]};
assert.equal(run('startIdxOf(pair,false,29)'),29);
// Highlight outside our seat still follows normal observed ordering.
context.pair={current:{side:'L',idx:4},me:{side:'R',idx:4},panels:[]};
assert.equal(run('startIdxOf(pair,false,28)'),28);
console.log(`PASS: recorded count50 retained; ${checks-1} consecutive-turn cases, missing-panel fallback and other-seat ordering`);
