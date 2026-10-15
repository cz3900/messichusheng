'use strict';
// Feed full historical PNGs through the actual recognition worker, with search
// disabled by the normal visibility IPC. No recognizer or lifecycle is mocked.
const fs=require('fs'),path=require('path'),{Worker}=require('worker_threads'),{PNG}=require('pngjs');
async function exercise(file){const image=PNG.sync.read(fs.readFileSync(file)),events=[],pending=[];
  const w=new Worker(path.resolve(__dirname,'../../worker.js'),{env:{...process.env,AD_THREADS:'0',AD_TRACE:'0'}});
  const wait=type=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Timed out: '+type)),30000);pending.push({type,resolve:x=>{clearTimeout(timer);resolve(x);},reject});});
  w.on('message',m=>{events.push(m);for(let i=pending.length-1;i>=0;i--)if(pending[i].type===m.type){const p=pending.splice(i,1)[0];p.resolve(m);}});
  w.on('error',e=>{for(const p of pending.splice(0))p.reject(e);});
  let stamp=100000,last;
  try {await wait('ready');w.postMessage({type:'display',w:image.width,h:image.height});w.postMessage({type:'visibility',hidden:true});
    async function send(factor){const data=Buffer.from(image.data);for(let i=0;i<data.length;i+=4){data[i]=Math.min(255,Math.round(data[i]*factor));data[i+1]=Math.min(255,Math.round(data[i+1]*factor));data[i+2]=Math.min(255,Math.round(data[i+2]*factor));}
      stamp+=1000;data.writeUInt32LE(stamp,0);const next=wait('state');w.postMessage({type:'frame',w:image.width,h:image.height,buf:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),full:true,captureId:stamp,capturedAt:stamp});return next;}
    for(let i=0;i<3;i++)last=await send(1);
    const locked=events.some(m=>m.type==='state'&&m.phase==='active'&&!m.idle);
    if(!locked)return {file:path.basename(file),width:image.width,height:image.height,locked:false,lastPhase:last.phase,logs:events.filter(m=>m.type==='log'&&m.tag==='pool').map(x=>x.msg).slice(-3)};
    const boundary=events.length;
    for(const factor of [.55,.55,.55,1.5,1.5,1.5,1,1,1])last=await send(factor);
    const later=events.slice(boundary),hidden=later.filter(m=>m.type==='state'&&(m.phase!=='active'||m.idle)),errors=later.filter(m=>m.type==='error');
    return {file:path.basename(file),width:image.width,height:image.height,locked,frames:12,hidden: hidden.length,clears:later.filter(m=>m.type==='clear').length,errors:errors.map(x=>x.msg),lastStage:last.draftStage,lastTaken:last.taken};
  }finally{await w.terminate();}
}
(async()=>{if(process.argv.length<3)throw Error('Usage: node tools/debug_draft/real_pixel_worker.js /absolute/path/to/image.png [...]');let failed=false;for(const file of process.argv.slice(2)){const r=await exercise(file);console.log(JSON.stringify(r));if(!r.locked||r.hidden||r.clears||r.errors?.length)failed=true;}if(failed)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
