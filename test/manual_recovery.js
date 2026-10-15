'use strict';
// Run the real worker IPC handler with deterministic recognition/search failures.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const realRequire=require('module').createRequire(path.resolve(__dirname,'../worker.js'));
const R=require('./_env').init(),bad=require('./fixtures/draft_overcount.json');
const {decode}=require('./draft_scene'),scenes=require('./fixtures/draft_scenes.json');
function harness({scoreCreate=false}={}){
 let handle,clock=100000,updates=0,advice=0,failUpdate=false,failScene=false,failScore=false;
 let boardEvidence=true;let presence={bright:20,dark:40,gapDark:1};const events=[];
 const observation=structuredClone(bad),paired=new Set(bad.panels.flatMap(p=>p.skills.map(s=>s.key)));
 observation.skills.forEach(s=>{if(!paired.has(s.key))s.taken=false;});
 observation.align={nd:19};observation.suspects=[];observation.pending=false;
 const tracker={pool:{poolHeroes:bad.pool_heroes,skills:bad.skills,heroBoxes:[]},boxesNow:[],log:[],prev:{rawState:{}},
  owner:{skill:['L',0]},heroOf:{hero:['R',1]},known:new Set(['skill']),meManual:null,meAuto:null,
  update(){updates++;if(failUpdate){this.owner.skill=['R',4];this.known.add('corrupted');throw Error('injected recognizer failure');}return structuredClone(observation);},snapshotLine:()=>''};
 const ctx=vm.createContext({Buffer,Uint8Array,Int8Array,Float32Array,Int32Array,Uint32Array,Uint16Array,structuredClone,
  console,setTimeout,clearTimeout,setImmediate,clearImmediate,__dirname:path.resolve(__dirname,'..'),process:{env:{...process.env,AD_THREADS:'0'}},
  Date:class extends Date{static now(){return clock;}},testTracker:tracker,countAdvice:()=>advice++,testScores:[{total:7}],
  require(name){if(name==='worker_threads')return {parentPort:{on:(ch,fn)=>{if(ch==='message')handle=fn;},postMessage:m=>events.push(m)}};
   if(name==='./recog.js')return {...R,init(){},quickPresence:()=>presence,quickSig:()=>Array(60).fill(100),sigDiff:()=>100,
    recoveryEvidence:()=>boardEvidence,alignBoard(){throw Error('manual recovery must not relock');},boardSig:()=>Array(60).fill(100),readPanels:()=>[],calibratePanels:()=>({})};
   if(name==='./draft_scene.js')return {detect(img){if(failScene)throw Error('injected scene failure');return realRequire(name).detect(img);}};
   if(name==='./player_scores.js')return {createPlayerScorer:()=>{if(scoreCreate)throw Error('injected scorer startup failure');return ()=>{if(failScore)throw Error('injected scorer failure');return ctx.testScores;};}};
   return realRequire(name);}});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../worker.js'),'utf8'),ctx);
 const get=code=>vm.runInContext(code,ctx);
 get("tracker=testTracker;phase='active';DISP=[1280,720];lastCal=1000000;lastGoodState={type:'state',phase:'active',taken:41,playerScores:testScores,current:{side:'R',idx:4},me:null};actualChooseAdvice=chooseAdvice;chooseAdvice=()=>countAdvice();turnTick=()=>{};");
 return {tracker,observation,events,get,handle:m=>handle(m),state:()=>events.filter(x=>x.type==='state').at(-1),get updates(){return updates;},get advice(){return advice;},
  fail(kind,value=true){if(kind==='board')boardEvidence=!value;if(kind==='update')failUpdate=value;if(kind==='scene')failScene=value;if(kind==='score')failScore=value;},presence(v){presence=v;},
  async frame(id=null,extra={}){clock+=1000;const img=id?decode(scenes.find(x=>x.id===id)):{w:1280,h:720,data:Buffer.alloc(1280*720*4)};img.data.writeUInt32LE(clock,0);await handle({type:'frame',full:true,w:img.w,h:img.h,buf:img.data,captureId:clock,capturedAt:clock,...extra});}
 };
}
(async()=>{
 if(process.argv[2]) {
  const samples=[],T=require('../trace'),result=T.replay(process.argv[2],(tracker,frame,S)=>samples.push(structuredClone(S)));
  assert.equal(result.miss,0);const h=harness();h.get("lifecycle.mode='away';draftComplete=true;phase='idle';");await h.handle({type:'recover'});
  let reviews=0,peak=0;for(const S of samples){Object.keys(h.observation).forEach(k=>delete h.observation[k]);Object.assign(h.observation,S);
   await h.frame();assert.equal(h.state().phase,'active');assert.equal(h.state().manualRecovery,true);assert.equal(h.get('tracker'),h.tracker);
   const n=R.pickedCount(S);peak=Math.max(peak,n);if(n>50)assert(h.state().advicePaused);if(h.state().advicePaused)reviews++;
  }
  assert(!h.events.some(x=>x.type==='error'));console.log(JSON.stringify({trace:path.basename(process.argv[2]),manualRecovery:true,frames:samples.length,peak,reviews,miss:result.miss,hidden:0}));return;
 }
 for(const ended of ['strategy','away','full','review']){
  const h=harness(),pool=h.tracker.pool,owner=h.tracker.owner,known=h.tracker.known;
  h.get(`lifecycle.mode='${ended}';draftComplete=true;phase='${ended==='away'?'idle':'active'}';`);
  await h.handle({type:'recover'});
  assert.equal(h.state()?.phase,'active',`${ended}: manual action must immediately show retained state`);
  assert.equal(h.state().manualRecovery,true);assert.equal(h.state().advicePaused,true);
  await h.frame();assert.equal(h.state().advicePaused,true);
  await h.frame();assert.equal(h.state().advicePaused,false,JSON.stringify(h.events.filter(x=>x.type==='error')));
  for(let i=0;i<6;i++)await h.frame(i%2?'D21':'D28');
  assert.equal(h.state().phase,'active');assert.equal(h.state().manualRecovery,true);assert.equal(h.state().advicePaused,false);
  assert.equal(h.tracker.pool,pool);assert.equal(h.tracker.owner,owner);assert.equal(h.tracker.known,known);
  assert.equal(h.get('tracker'),h.tracker);assert(h.updates>=8);assert(!h.events.some(x=>x.type==='error'));
  // Scan, frozen, duplicate and malformed frames cannot confirm recovery.
  const before=h.updates,seq=h.get('seq');for(let i=0;i<100;i++)await h.handle({type:'recover'});assert.equal(h.get('seq'),seq);assert.equal(h.state().advicePaused,false);assert.equal(h.updates,before);
  h.get("lifecycle.review('test full review');holdDraft('review',lifecycle.reason);");
  await h.frame(null,{full:false});assert(h.state().advicePaused);
  await h.frame(null,{frozenFrames:8});assert(h.state().advicePaused);
  await h.frame(null,{captureId:42});assert(h.state().advicePaused);
  await h.frame(null,{captureId:42});assert(h.state().advicePaused);
  await h.frame(null,{capturedAt:0});assert(h.state().advicePaused);
  await h.frame();assert.equal(h.state().advicePaused,false);
  await h.handle({type:'auto-end'});assert.equal(h.get('lifecycle.manual'),false);
  await h.frame('D21');await h.frame('D21');await h.frame('D21');assert.equal(h.state().phase,'idle');
 }
 console.log('PASS manual recovery: all end modes; original pool/ownership retained; persistent false cues; fresh full-frame review; auto-end release');
 const h=harness();await h.handle({type:'recover'});
 h.fail('board');await h.frame('D21');assert(h.state().advicePaused);assert.equal(h.updates,0);h.fail('board',false);
 h.fail('update');await h.frame();assert(h.state().advicePaused);assert.deepEqual(h.tracker.owner,{skill:['L',0]});assert.deepEqual([...h.tracker.known],['skill']);assert.equal(h.get('busy'),false);
 h.fail('update',false);h.presence({bright:3,dark:57,gapDark:0});await h.frame();await h.frame();assert.equal(h.state().advicePaused,false);
 await h.frame(null,{w:-1});assert(h.state().advicePaused);assert.equal(h.get('tracker'),h.tracker);
 await h.frame(null,{w:1920,h:1080,buf:Buffer.alloc(1920*1080*4)});assert.equal(h.get('tracker'),h.tracker);assert(h.state().advicePaused);
 await h.frame();await h.frame();assert.equal(h.state().advicePaused,false);
 h.fail('scene');await h.frame();assert(h.state().advicePaused,'classifier failure must pause, not reuse an unverified observation');
 h.fail('scene',false);h.fail('score');await h.frame();await h.frame();assert.equal(h.state().advicePaused,false);assert.equal(h.state().playerScores.length,0);
 h.observation.skills=structuredClone(bad.skills);await h.frame();assert(h.state().advicePaused);assert.equal(h.state().taken,41);
 h.fail('board');h.presence({bright:0,dark:0,gapDark:0});await h.frame();assert(h.state().advicePaused);assert.equal(h.get('tracker'),h.tracker);
 // Broken child ports must not make a recovery control message escape as an exception.
 h.get("lifecycle.manual=false;POOL={cancel(){throw Error('closed pool')}};COMBO_W={postMessage(){throw Error('closed child')},once(){},on(){},terminate(){throw Error('must not terminate')}};");
 await h.handle({type:'recover'});assert(h.state().advicePaused);assert.equal(h.get('comboWorker()'),null);
 assert.equal(h.get('busy'),false);
 await h.handle({type:'shutdown',reason:'injected-closed-port'});assert(h.events.some(x=>x.type==='shutdown-error'));assert(!h.events.some(x=>x.type==='shutdown-ready'));
 const legacy=harness();legacy.get("lifecycle.mode='away';draftComplete=true;phase='idle'");await legacy.handle({type:'reset'});assert(legacy.state().manualRecovery);
 const finished=harness();finished.get('chooseAdvice=actualChooseAdvice');
 const heroes=bad.pool_heroes.slice(0,10),skills=Array.from({length:40},(_,i)=>({key:'s'+i,taken:true,ultslot:i%4===3}));
 Object.assign(finished.observation,{skills,taken_heroes:heroes,panels:heroes.map((hero,i)=>({side:i<5?'L':'R',idx:i%5,hero,skills:skills.slice(i*4,i*4+4)}))});
 await finished.handle({type:'recover'});await finished.frame();await finished.frame();
 assert.equal(finished.state().phase,'active');assert.equal(finished.get('lifecycle.mode'),'drafting');assert.equal(finished.get('lastSig'),'finished');
 assert(!finished.events.some(x=>x.type==='computing'));assert(finished.events.some(x=>x.type==='clear'));
 const startup=harness({scoreCreate:true});await startup.handle({type:'recover'});await startup.frame();await startup.frame();assert.equal(startup.state().playerScores.length,0);assert.equal(startup.state().phase,'active');
 const empty=harness();empty.get('tracker=null');await empty.handle({type:'recover'});assert.equal(empty.get('forceReset'),true);
 console.log('PASS manual recovery failures: partial mutation rollback; malformed/resized frame; recognition/classifier/scorer failure; count52; occlusion; closed compute ports; missing pool');
})().catch(e=>{console.error(e);process.exitCode=1;});
