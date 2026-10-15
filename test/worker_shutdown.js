'use strict';
const assert=require('assert/strict'),{Worker}=require('worker_threads'),{EventEmitter}=require('events'),path=require('path');
const {stop}=require('../worker_lifecycle');
(async()=>{
 const fake=new EventEmitter();let terminated=0,request;
 fake.postMessage=m=>request=m;fake.terminate=async()=>{terminated++;return 1;};fake.unref=()=>{};
 const events=[],p=stop(fake,{reason:'game-closed',warnMs:5,record:(kind,data)=>events.push({kind,data})});
 assert.equal(request.type,'shutdown');await new Promise(r=>setTimeout(r,12));assert.equal(terminated,0,'Timeout must not force-kill a native inference');
 assert(events.some(e=>e.kind==='recognition-stop-slow'));fake.emit('message',{type:'shutdown-ready'});await p;assert.equal(terminated,1);
 const w=new Worker(path.resolve(__dirname,'../combo_worker.js'),{workerData:{model:'',combo:path.resolve(__dirname,'_combo_stub.js')}});
 let done,closed;const result=new Promise(r=>done=r),drained=new Promise(r=>closed=r);
 w.on('message',m=>{if(m.type==='done')done(m);if(m.type==='shutdown-ready')closed(m);});
 const pool={heroKeys:Array.from({length:12},(_,i)=>'h'+i),basics:Array.from({length:36},(_,i)=>'b'+i),ults:Array.from({length:12},(_,i)=>'u'+i)};
 w.postMessage({type:'final',id:1,st:{pool},keys:[],bfix:128});w.postMessage({type:'shutdown',reason:'game-closed'});
 const r=await result;assert(r.cancelled);assert.equal(r.cancelReason,'shutdown');await drained;await w.terminate();
 console.log('通过：停止期间任务取消并排空；原生释放确认前不terminate；等待超时只记现场。');
})().catch(e=>{console.error(e);process.exitCode=1;});
