'use strict';
// Wait for the GPU thread to finish native work before terminating its owner.
function stop(w,{reason,log=()=>{},record=()=>{},warnMs=10000}={}){
 return new Promise(resolve=>{
  let complete=false,terminating=false;const t0=Date.now();
  const done=code=>{if(complete)return;complete=true;clearTimeout(timer);w.off('message',message);w.off('exit',done);record('recognition-stop-end',{reason,code,elapsedMs:Date.now()-t0},true);resolve();};
  const message=m=>{
   if(m.type==='log'){log(m.tag,m.msg);return;}
   if(m.type==='shutdown-error'){record('recognition-stop-error',{reason,message:m.msg},true);return;}
   if(m.type!=='shutdown-ready'||terminating)return;terminating=true;
   record('recognition-native-drained',{reason,elapsedMs:Date.now()-t0},true);
   w.terminate().then(done,e=>{log('error','识别线程停止失败 '+String(e));done('termination-error');});
  };
  const timer=setTimeout(()=>{record('recognition-stop-slow',{reason,elapsedMs:Date.now()-t0},true);log('crash','停止线程超过 '+warnMs+'ms，等待原生调用结束，避免强杀GPU线程');w.unref?.();},warnMs);timer.unref?.();
  w.on('message',message);w.once('exit',done);record('recognition-stop-start',{reason},true);
  try{w.postMessage({type:'shutdown',reason});}catch(e){log('error','请求识别线程停止失败 '+String(e));done('post-error');}
 });
}
module.exports={stop};
