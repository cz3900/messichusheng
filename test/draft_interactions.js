'use strict';
const assert=require('assert/strict'),{DraftLifecycle}=require('../draft_lifecycle');
const skills=Array.from({length:40},(_,i)=>({key:'s'+i,ultslot:i%4===3}));
const panels=Array.from({length:10},(_,i)=>({side:i<5?'L':'R',idx:i%5,hero:'h'+i,skills:skills.slice(i*4,i*4+4)}));
const states={normal:{S:{panels:[],skills:[]},count:41},full:{S:{panels,skills},count:50},bad:{S:{panels,skills},count:52},covered:{S:{panels,skills,offScreen:true},count:50}};
function seed(mode){const l=new DraftLifecycle();if(mode==='review')l.review('test');
  if(mode==='full')for(let i=0;i<3;i++)l.observeState(states.full.S,50,i*1000);
  if(mode==='strategy'||mode==='away')for(let i=0;i<3;i++)l.observeScene({stage:mode==='away'?'game':'strategy'},i*1000,i);
  assert.equal(l.mode,mode);return l;}
let cases=0;
for(const initial of ['drafting','review','full','strategy','away'])for(const cue of ['unknown','drafting','strategy','game'])for(const [kind,state] of Object.entries(states)){
  const l=seed(initial);for(let i=0;i<3;i++){l.observeScene({stage:cue},10000+i*1000,100+i);l.observeState(state.S,state.count,10000+i*1000);}
  let expected;
  if(cue==='game')expected='away';else if(cue==='strategy')expected='strategy';
  else if(cue==='unknown'&&['strategy','away'].includes(initial))expected=initial;
  else if(kind==='bad'||kind==='covered')expected='review';
  else if(kind==='full'&&cue!=='drafting')expected=initial==='review'?'drafting':'full';
  else expected='drafting';
  assert.equal(l.mode,expected,JSON.stringify({initial,cue,kind}));cases++;
}
// A partial transition cannot accumulate evidence across an unknown frame.
const l=seed('drafting');for(const [stage,t,id] of [['game',1000,1],['game',2000,2],['unknown',3000,3],['game',4000,4],['game',5000,5]])l.observeScene({stage},t,id);
assert.equal(l.mode,'drafting');l.observeScene({stage:'game'},6000,6);assert.equal(l.mode,'away');
const s=seed('strategy');s.observeScene({stage:'unknown'},10000,20);assert.equal(s.mode,'strategy');
s.observeScene({stage:'drafting'},11000,21);s.observeState(states.bad.S,52,11000);assert.equal(s.mode,'review','choice prompt revokes strategy but does not override an illegal count');
const {detect}=require('../draft_scene'),{partsOf,render}=require('./draft_robustness');
const fixtures=require('./fixtures/draft_scenes.json'),hud=fixtures.find(x=>x.id==='D21');
for(const [id,profile,expected] of [['D79','original','drafting'],['D79','dim55','drafting'],['D28','original','strategy']]){
  const header=fixtures.find(x=>x.id===id).regions[0],combined={...hud,regions:[...hud.regions.slice(1),header]};
  assert.equal(detect(render(partsOf(combined),1280,profile)).stage,expected,'explicit text has priority over conflicting HUD pixels');
}
console.log(`PASS: ${cases} mode × scene × state combinations; interrupted votes, contradictory cues and 3 real-pixel conflicts`);
