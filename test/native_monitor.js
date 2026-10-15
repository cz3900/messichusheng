'use strict';
const assert=require('assert/strict'),{create}=require('../native_monitor');
(async()=>{
 let time=0;const rows=[],m=create({now:()=>time});m.setHook((event,details)=>rows.push({event,details}));let finish;
 const p=m.call('infer',{batch:128},()=>new Promise(r=>finish=r));time=300;assert.equal(m.snapshot().active[0].elapsedMs,300);finish('ok');assert.equal(await p,'ok');
 assert.equal(m.snapshot().calls,1);assert.equal(m.snapshot().activeCount,0);assert.equal(m.snapshot().runMs,300);
 await assert.rejects(m.call('session-create',{model:'netS300.onnx'},()=>{throw Error('driver-fault');}),/driver-fault/);
 assert(rows.some(r=>r.event==='native-error'&&r.details.kind==='session-create'));assert.equal(m.snapshot().errors,1);
 const n=rows.length;for(let i=0;i<100;i++)await m.call('infer',{},async()=>0);assert.equal(rows.length,n,'Fast inference events are rate limited');
 m.setHook(()=>{throw Error('disk fault');});await m.call('session-release',{},async()=>0);
 console.log('通过：原生调用在途状态/耗时/异常阶段保留；高频推理限频；诊断失败不影响推理。');
})().catch(e=>{console.error(e);process.exitCode=1;});
