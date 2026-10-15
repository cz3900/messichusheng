'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'../worker.js'),'utf8');
const start=src.indexOf('  if (m.type === "visibility")'),end=src.indexOf('\n',start);
let cancels=0,full=0,posts=0;
const c=vm.createContext({suppressAdvice:true,pendingNext:false,lastQuick:[1],cachedState:{},completedFrames:0,diff:0,
 cancelComputations(){cancels++;},want(v){assert.equal(v,true);full++;},log(){},parentPort:{postMessage(){posts++;}}});
const update=hidden=>vm.runInContext('(function(m){'+src.slice(start,end)+'})({type:"visibility",hidden:'+hidden+'})',c);
update(false);assert.equal(c.suppressAdvice,false);assert.equal(c.pendingNext,true);assert.equal(c.lastQuick,null);assert.equal(full,1);assert.equal(cancels,1);
const gate=src.indexOf('    if (diff < 10 && cachedState');
assert.equal(vm.runInContext('(function(){'+src.slice(gate,src.indexOf('\n',gate))+';return "recognize";})()',c),'recognize');
assert.equal(posts,0);update(false);assert.equal(full,1);assert.equal(cancels,1);
update(true);assert.equal(c.suppressAdvice,true);assert.equal(full,1);assert.equal(cancels,2);
console.log('通过：恢复要求完整复核；静止画面不跳过；重复显示消息不重复取消；隐藏仍停算。');
