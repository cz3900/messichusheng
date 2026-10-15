'use strict';
const assert=require('assert/strict'),{Worker}=require('worker_threads'),path=require('path'),fs=require('fs'),vm=require('vm');
(async()=>{
 let creates=0,releases=0,active=0;const fake={Tensor:class{constructor(type,data,dims){this.data=data;this.dims=dims;}},InferenceSession:{async create(){assert.equal(active,0);creates++;return {inputNames:[],async run(feeds){active++;await new Promise(r=>setTimeout(r,1));active--;return {logits:{data:new Float32Array(feeds.ids.dims[0]*60)}};},async release(){assert.equal(active,0);releases++;}};}}};
 const c=vm.createContext({module:{exports:{}},__dirname:path.resolve(__dirname,'..'),Buffer,Float32Array,Float64Array,Int32Array,Int8Array,Uint8Array,SharedArrayBuffer,Date,process:{...process,env:{AD_NO_FP16:'1'}},require(name){if(name==='onnxruntime-node')return fake;if(name==='./native_monitor')return require('../native_monitor');return require(name);}});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../combo_local.js'),'utf8'),c);
 const C=c.module.exports;await C.init('one.onnx','cpu',128);await C.init('one.onnx','cpu',128);assert.equal(creates,1);
 await C.init('two.onnx','cpu',128);assert.equal(creates,2,'Changing model with same batch must create a new session');assert.equal(releases,1);await C.dispose();assert.equal(releases,2);
 const w=new Worker(path.resolve(__dirname,'../combo_worker.js'),{workerData:{model:'',combo:path.resolve(__dirname,'_native_lifecycle_stub.js')}});
 const messages=[];let wake;w.on('message',m=>{messages.push(m);wake?.();});
 const until=async predicate=>{const deadline=Date.now()+3000;while(!predicate()){assert(Date.now()<deadline,'Worker response timeout');await new Promise(r=>{wake=r;setTimeout(r,20);});}};
 w.postMessage({type:'warm',bfix:128});
 const pool={heroKeys:Array.from({length:12},(_,i)=>'h'+i),basics:Array.from({length:36},(_,i)=>'b'+i),ults:Array.from({length:12},(_,i)=>'u'+i)};
 w.postMessage({type:'final',id:1,st:{pool},bfix:128,keys:[]});await until(()=>messages.some(m=>m.type==='warm'));
 await new Promise(r=>setTimeout(r,10));w.postMessage({type:'warm',bfix:256});await until(()=>messages.filter(m=>m.type==='warm').length===2);
 assert.equal(messages.find(m=>m.id===1).type,'done');assert(messages.findIndex(m=>m.id===1)<messages.findLastIndex(m=>m.type==='warm'),'Warmup cannot release a model in the middle of a running job');
 w.postMessage({type:'shutdown'});await until(()=>messages.some(m=>m.type==='shutdown-ready'));await w.terminate();
 console.log('通过：同批大小换模型不误用旧网络；预热/计算/释放串行，无原生调用在途时才停止。');
})().catch(e=>{console.error(e);process.exitCode=1;});
