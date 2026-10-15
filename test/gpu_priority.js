'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../gpuprio.js'),'utf8');
function run(output,error=null,options={},platform='win32') {
  let call=null,result='missing',logs=[];const module={exports:{}};
  const c=vm.createContext({module,process:{platform},require(name){assert.equal(name,'child_process');return {
    execFile(exe,args,opt,done){call={exe,script:args.at(-1),opt};done(error,output);}};}});
  vm.runInContext(source,c);module.exports.configure(123,(_,m)=>logs.push(m),r=>result=r,options);
  return {call,result,logs};
}
let r=run('before 2 status 00000000\nset 3 status 00000000\nafter 3 status 00000000');
assert(r.result.verified&&r.result.applied);assert.equal(r.result.previous,2);assert.equal(r.result.level,3);
assert(r.call.script.includes('SetProcessSchedulingPriorityClass($h,3)'));
assert(!r.call.script.includes('SetProcessSchedulingPriorityClass($h,5)'));
assert.equal(r.call.opt.timeout,10000);
r=run('before 3 status 00000000\nset 2 status 00000000\nafter 2 status 00000000',null,{target:2});
assert(r.result.applied);assert.equal(r.result.target,2);
r=run('before 2 status 00000000\nset 3 status C0000022\nafter 2 status 00000000');
assert(r.result.verified&&!r.result.applied);assert.equal(r.result.level,2);assert.equal(r.result.setStatus,'C0000022');
r=run('before 0 status C0000001\nafter 0 status C0000001');
assert.equal(r.result.level,null);assert(!r.result.verified&&!r.result.applied);
r=run('',new Error('timeout'));assert.equal(r.result.level,null);assert(!r.result.verified);assert(r.logs[0].includes('timeout'));
r=run('',null,{},'linux');assert.equal(r.result,null);assert.equal(r.call,null);
console.log('通过：较高/普通实验档、实际读回、设置失败与读取失败均如实报告；非Windows不调用。');
