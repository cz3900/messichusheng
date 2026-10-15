'use strict';
// Real recognition + real worker, using historical full PNGs supplied by a local
// manifest. Header substitution simulates an end-stage false positive; no tracker
// or matcher is mocked. Search is disabled through normal visibility IPC.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{Worker}=require('worker_threads'),{PNG}=require('pngjs');
const {decode}=require('../../test/draft_scene'),fixtures=require('../../test/fixtures/draft_scenes.json');
const R=require('../../test/_env').init();
function read(file){const p=PNG.sync.read(fs.readFileSync(file));return {w:p.width,h:p.height,data:p.data};}
function transform(img,factor=1,strategy=false){const data=Buffer.from(img.data);
 for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++)data[i+c]=Math.min(255,Math.round(data[i+c]*factor));
 if(strategy){const cue=decode(fixtures.find(x=>x.id==='D28')),s=img.h/720;
  for(let y=Math.round(40*s);y<Math.round(112*s);y++)for(let x=Math.round(img.w/2-320*s);x<Math.round(img.w/2+320*s);x++){
   const sx=Math.round(640+(x-img.w/2)/s),sy=Math.round(y/s),a=(y*img.w+x)*4,b=(sy*cue.w+sx)*4;for(let c=0;c<4;c++)data[a+c]=cue.data[b+c];}}
 return {...img,data};
}
async function exercise(item){const initial=read(item.initial),late=read(item.late||item.initial),events=[],pending=[];
 // Test board/panel proof independently over the original pool and late board.
 R.rescale(initial.w,initial.h);const t=new R.Tracker();t.reset(initial);
 R.calibratePanels(late,t.pool.skills.filter(x=>!x.unknown).map(x=>x.key));
 t.fullOrder=Array.from({length:50},(_,i)=>{const n=i%10,j=Math.floor(n/2),seat=n%2?j+5:j;return Math.floor(i/10)%2?9-seat:seat;});
 for(let i=0;i<8;i++)t.update(late);
 const evidence=[];for(const factor of [.55,1,1.5])evidence.push({factor,accepted:R.recoveryEvidence(transform(late,factor),t)});
 assert(evidence.every(x=>x.accepted),item.id+': original-pool evidence across brightness');
 assert.equal(R.recoveryEvidence({w:late.w,h:late.h,data:Buffer.alloc(late.w*late.h*4)},t),false);
 // Remove every central board cell: confirmed panels must suffice late in draft.
 let panelOnly=null;const realPanelMatches=[];
 for(const p of R.readPanels(late,t.pool.skills.map(x=>x.key)))for(const s of p.skills)if(s&&s.key!=='?'&&s.s>=.65){realPanelMatches.push(s.key);if(!t.owner[s.key])t.owner[s.key]=[p.side,p.idx];}
 if(Object.keys(t.owner).length>=3){const covered=transform(late);for(const b of Object.values(t.boxesNow))if(b)for(let y=Math.max(0,Math.floor(b[1]));y<Math.min(late.h,Math.ceil(b[1]+b[3]));y++)for(let x=Math.max(0,Math.floor(b[0]));x<Math.min(late.w,Math.ceil(b[0]+b[2]));x++){
  const k=(y*covered.w+x)*4;covered.data[k]=covered.data[k+1]=covered.data[k+2]=0;}
  panelOnly=R.recoveryEvidence(covered,t);assert(panelOnly,item.id+': confirmed panel route');}
 const w=new Worker(path.resolve(__dirname,'../../worker.js'),{env:{...process.env,AD_THREADS:'0',AD_TRACE:'0'}});
 const wait=type=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Timed out '+type)),30000);pending.push({type,resolve:m=>{clearTimeout(timer);resolve(m);},reject:e=>{clearTimeout(timer);reject(e);}});});
 w.on('message',m=>{events.push(m);for(let i=pending.length-1;i>=0;i--)if(pending[i].type===m.type){const p=pending.splice(i,1)[0];p.resolve(m);}});
 w.on('error',e=>{for(const p of pending.splice(0))p.reject(e);});
 let stamp=100000,frames=0;
 async function send(img,factor=1,strategy=false){const p=transform(img,factor,strategy);stamp+=1000;frames++;p.data.writeUInt32LE(stamp,0);const next=wait('state');w.postMessage({type:'frame',w:p.w,h:p.h,buf:p.data,full:true,captureId:stamp,capturedAt:stamp});return next;}
 async function control(type){const next=wait('state');w.postMessage({type});return next;}
 let last;
 try {await wait('ready');w.postMessage({type:'visibility',hidden:true});w.postMessage({type:'display',w:initial.w,h:initial.h});
  for(let i=0;i<3;i++)last=await send(initial);assert.equal(last.phase,'active',item.id+': initial pool lock');
  for(let i=0;i<5;i++)last=await send(late);
  for(let i=0;i<3;i++)last=await send(late,1,true);assert.equal(last.draftStage,'strategy',item.id+': injected false end');
  const boundary=events.length,locks=events.filter(x=>x.type==='log'&&x.tag==='pool'&&/锁定/.test(x.msg)).length;
  last=await control('recover');assert(last.advicePaused&&last.manualRecovery);
  for(let i=0;i<3;i++)last=await send(late,1,true);
  assert.equal(last.phase,'active');assert.equal(last.manualRecovery,true);
  // A genuine overcount stays paused by design; never fabricate advice to pass.
  assert(last.advicePaused===false||last.draftStage==='review');
  const normalPaused=last.advicePaused;
  for(const f of [.55,.55,.55,1.5,1.5,1.5,1,1,1])last=await send(late,f,true);
  assert.equal(last.phase,'active');assert(last.manualRecovery);
  assert.equal(events.filter(x=>x.type==='log'&&x.tag==='pool'&&/锁定/.test(x.msg)).length,locks,'recovery must not relock');
  const later=events.slice(boundary);assert(!later.some(x=>x.type==='error'),JSON.stringify(later.filter(x=>x.type==='error')));
  assert(!later.some(x=>x.type==='state'&&x.idle));
  // Blank/corrupt captures hold original data; real full frames can retry.
  last=await send({...late,data:Buffer.alloc(late.w*late.h*4)});assert(last.advicePaused&&last.manualRecovery);
  for(let i=0;i<3;i++)last=await send(late);assert(last.manualRecovery&&last.phase==='active');
  const done=wait('shutdown-ready');w.postMessage({type:'shutdown',reason:'recovery-test'});await done;
  return {id:item.id,w:late.w,h:late.h,frames,evidence,panelOnly,panelMatches:realPanelMatches.length,normalPaused,lastPaused:last.advicePaused,lastTaken:last.taken,workerErrors:0,relocks:0,hidden:0,shutdownDrained:true};
 }finally{await w.terminate();}
}
(async()=>{const cases=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));let failed=false;
 for(const item of cases)try{console.log(JSON.stringify(await exercise(item)));}catch(e){failed=true;console.log(JSON.stringify({id:item.id,failed:true,error:String(e.stack||e)}));}
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
