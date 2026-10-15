'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.resolve(__dirname,'../main.js'),'utf8');
const actions=[],ctx=vm.createContext({cfg:{hidden:true,paused:false},liveWaiting:false,stoppingRecognition:null,quitting:false,
 worker:{postMessage:m=>actions.push(m.type)},needFull:false,recoveryNotice:'',log(){},sendPanel(){},
 setHidden(v,source){ctx.cfg.hidden=v;actions.push(source);},sync(){actions.push('sync');}});
vm.runInContext(src.slice(src.indexOf('function draftAction('),src.indexOf('function startWorker()')),ctx);
assert(vm.runInContext('draftAction("recover","hotkey")',ctx));assert.deepEqual(actions,['recover','hotkey','sync']);assert.equal(ctx.cfg.hidden,false);assert(ctx.needFull);
for(const key of ['paused','waiting','stopping','missing','quitting','closed-port']){
 actions.length=0;ctx.cfg.hidden=true;ctx.cfg.paused=key==='paused';ctx.liveWaiting=key==='waiting';ctx.stoppingRecognition=key==='stopping'?{}:null;ctx.quitting=key==='quitting';
 ctx.worker=key==='missing'?null:{postMessage:m=>{if(key==='closed-port')throw Error('closed');actions.push(m.type);}};
 assert.equal(vm.runInContext('draftAction("recover","panel")',ctx),false,key);assert.equal(actions.length,0);assert.equal(ctx.cfg.hidden,true);assert(ctx.recoveryNotice);
}
assert(src.includes('() => draftAction("recover", "hotkey"), "恢复本局"'));
assert(src.includes('draftAction("relock", "面板")'));assert(src.includes('name === "recover" || name === "auto-end"'));
console.log('PASS main recovery: F10/panel/menu routing; explicit unhide; paused/waiting/draining/missing worker/shutdown/closed-port guards');
