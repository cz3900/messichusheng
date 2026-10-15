'use strict';
// Execute the actual worker message handler. Only capture, recognition observations
// and expensive search are replaced; lifecycle, image stage detection and IPC stay real.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const realRequire = require('module').createRequire(path.resolve(__dirname, '../worker.js'));
const R = require('./_env').init(), bad = require('./fixtures/draft_overcount.json');
const {decode} = require('./draft_scene'), scenes = require('./fixtures/draft_scenes.json');
const overlay = require('../overlay_state').create();
let handle, clock = 100000, calls = 0, adviceCalls = 0, presence = {bright:20,dark:40,gapDark:1};
let observation = structuredClone(bad), alignment = 19, evidence = false, candidate = null;
const events = [], errors = [];
const tracker = {pool:{poolHeroes:bad.pool_heroes,skills:bad.skills,heroBoxes:[]},boxesNow:[],log:[],prev:{rawState:{}},
  update(){calls++; return structuredClone(observation);}, snapshotLine:()=>'',meManual:null,meAuto:null};
const context = vm.createContext({Buffer, Uint8Array, Int8Array, Float32Array, Int32Array, Uint32Array, Uint16Array,
  console, setTimeout, clearTimeout, setImmediate, clearImmediate, __dirname:path.resolve(__dirname,'..'),
  process:{env:{...process.env,AD_THREADS:'0'}}, Date:class extends Date {static now(){return clock;}},
  testTracker:tracker, testCounters:()=>adviceCalls++, testScores:[{box:[0,0,100,176],total:7,skillCount:3}],
  require(name){
    if(name==='worker_threads') return {parentPort:{on:(ch,fn)=>{if(ch==='message')handle=fn;},postMessage:m=>{events.push(m);overlay.accept(m.type,m);if(m.type==='error')errors.push(m.msg);}}};
    if(name==='./recog.js') return {...R,init(){},quickPresence:()=>presence,quickSig:()=>Array(60).fill(100),sigDiff:()=>100,
      alignBoard:()=>({nd:alignment,boxes:[]}),draftBoardEvidence:()=>evidence,
      boardSig:()=>Array(60).fill(100),readPanels:()=>[],calibratePanels:()=>({}),Tracker:function(){assert(candidate);return candidate;}};
    if(name==='./player_scores.js') return {createPlayerScorer:()=>()=>context.testScores};
    return realRequire(name);
  }});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../worker.js'),'utf8'),context);
vm.runInContext("tracker=testTracker; phase='active'; DISP=[1280,720]; lastCal=1000000; lastGoodState={type:'state',phase:'active',taken:41,playerScores:testScores,current:{side:'R',idx:4},me:null}; chooseAdvice=()=>testCounters(); turnTick=()=>{};",context);
const get = code => vm.runInContext(code,context), state = () => events.filter(x=>x.type==='state').at(-1);
async function send(id, advance=1000, extra={}) {
  clock+=advance;const img=id?decode(scenes.find(x=>x.id===id)):{w:1280,h:720,data:Buffer.alloc(1280*720*4)};
  // Simulate live pixels changing outside the anonymized UI regions.
  if(!extra.staticImage)img.data.writeUInt32LE(clock>>>0,0);
  await handle({type:'frame',full:true,w:img.w,h:img.h,buf:img.data,capturedAt:clock,captureId:clock,...extra});
  assert.deepEqual(errors,[]);
}
(async()=>{
  if(process.argv[2]) {
    const trace=require('../trace'),samples=[];const {head}=trace.read(process.argv[2]);R.rescale(...head.res);
    const result=trace.replay(process.argv[2],(tr,f,S)=>samples.push({S:structuredClone(S),ms:f.ms}));
    assert.equal(result.miss,0,'replay must contain all recorded observations');
    let peak=0,reviews=0,previous=0;
    for(const sample of samples){observation=sample.S;peak=Math.max(peak,R.pickedCount(observation));
      await send(null,Math.max(1,sample.ms-previous));previous=sample.ms;
      assert.equal(state().phase,'active');assert.equal(get('tracker'),tracker);
      if(state().draftStage==='review')reviews++;
    }
    assert(!events.some(x=>x.type==='clear'),'trace observations alone must never hide the overlay');
    if(peak>50)assert(reviews>0);
    console.log(JSON.stringify({trace:path.basename(process.argv[2]),frames:samples.length,miss:result.miss,peak,reviews,phase:state().phase,clears:0}));
    return;
  }
  await send('D79');
  assert.equal(state().draftStage,'review');assert.equal(state().phase,'active');assert.equal(state().taken,41);
  assert.equal(state().playerScores[0].total,7);assert.equal(get('tracker'),tracker);assert.equal(adviceCalls,0);
  assert(!events.some(x=>x.type==='clear'),'52-count must not clear or hide the overlay');
  // No scan-frame shortcut may feed speculative recommendations while held.
  await send(null,250,{full:false});assert.equal(calls,1);assert.equal(state().advicePaused,true);
  const paired=new Set(bad.panels.flatMap(p=>p.skills.map(s=>s.key)));
  observation.skills.forEach(s=>{if(!paired.has(s.key))s.taken=false;});
  observation.align={nd:52};observation.suspects=[];observation.pending=false;
  assert.equal(R.pickedCount(observation),41);
  await send('D79');assert.equal(state().advicePaused,true);
  await send('D79');assert.equal(state().advicePaused,false);assert.equal(adviceCalls,1);assert.equal(get('tracker'),tracker);
  // A covered board keeps its pool, even with fewer than 40 detectable cells.
  presence={bright:0,dark:0,gapDark:0};await send();assert.equal(state().draftStage,'review');
  presence={bright:20,dark:40,gapDark:1};await send('D78');await send('D78');
  assert.equal(state().advicePaused,false);assert.equal(get('tracker'),tracker);
  const locksBefore=calls;
  await send('D28',1000,{staticImage:true});await send('D28',1000,{staticImage:true});
  assert.equal(state().advicePaused,false,'a frozen strategy image cannot confirm the transition');
  await send('D28');assert.equal(state().draftStage,'strategy');assert.equal(state().phase,'active');
  assert.equal(calls,locksBefore+2,'confirmed strategy pauses tracker mutation');
  assert.equal(state().playerScores[0].total,7);
  const adviceBefore=adviceCalls;await send();assert.equal(state().draftStage,'strategy');assert.equal(adviceCalls,adviceBefore);
  // Old results cannot reappear on a renderer reload while advice is held.
  overlay.accept('advice',{rows:[{key:'stale'}]});const replay=[];overlay.replay((ch)=>replay.push(ch));assert.deepEqual(replay,['state']);
  await send('D78');assert.equal(state().advicePaused,false);assert.equal(get('draftComplete'),false);
  assert.equal(get('tracker'),tracker,'contradictory choice text resumes the late board without locking');
  await send('D28');await send('D28');assert.equal(state().draftStage,'strategy');
  await send('D21');await send('D21');assert.equal(state().phase,'active');
  await send('D21');assert.equal(state().phase,'idle');assert.equal(get('tracker'),tracker);
  assert.equal(events.filter(x=>x.type==='clear').length,1,'only confirmed game HUD clears advice');
  // An actual candidate lock rejects nd=19; the previous pool survives the failure.
  presence={bright:60,dark:0,gapDark:1};evidence=true;await send('D78');
  assert.equal(state().draftStage,'review');assert.equal(state().phase,'active');assert.equal(get('tracker'),tracker);
  assert.equal(get('lastNd'),19);
  // Validate the real success boundary too: a stable board + twelve heroes + margin.
  candidate={...tracker,pool:{...tracker.pool,align:{}},reset:()=>({heroes:12,minMargin:.1,nd:60,darkCells:0,ratio:1}),updateMe(){}};
  alignment=60;get("lifecycle.manual=true");
  await handle({type:'reset'});await send('D78');assert.equal(get('tracker'),tracker,'one unstable lock sample cannot replace a pool');
  await handle({type:'reset'});await send('D78');assert.equal(get('tracker'),candidate);assert.equal(get('lifecycle.manual'),false,'accepted pool clears the manual override');
  assert.equal(get('draftComplete'),false);assert.equal(state().advicePaused,false);
  console.log('PASS: actual worker: 52-count retained, scan paused, two-frame recovery, occlusion recovery, strategy scoring, game-only hide, failed lock retains pool');
})().catch(e=>{console.error(e);process.exitCode=1;});
