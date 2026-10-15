'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const R=require('./_env').init(),T=require('../trace'),S=require('./synth');
const root=path.resolve(__dirname,'../../research/crash_20261008');
function placeholder(unknown,unassigned){
 const t=new R.Tracker();t.pool={poolHeroes:[],skills:[{key:'known'},...Array.from({length:unassigned},(_,i)=>({key:'dark'+i}))]};
 t.owner={known:['L',0]};t.unknownBy=Array.from({length:unknown},()=>['R',0]);
 t.pickedKeys=()=>new Set(t.pool.skills.map(x=>x.key));
 return t.state({panels:[{side:'L',idx:0,filled:1},{side:'R',idx:0,filled:unknown}],current:['L',0],takenHeroes:[]});
}
assert.equal(placeholder(1,1).extraPicks,0);
assert.equal(placeholder(1,0).extraPicks,1);
assert.equal(placeholder(2,1).extraPicks,1);
assert.equal(placeholder(1,1).panels[1].skills[0].key,'?pick');
const fast=placeholder(1,0);fast.skills.push({key:'newDark',taken:true});
assert.equal(fast.extraPicks,1);assert.equal(R.pickedCount(fast),2);
console.log('✓ 未知占位与暗格不重复计数，尚无棋盘证据的占位仍计数并保留名额');
// Full panel-name evidence excludes a displaced false hero even if its card looks dark.
const t=new R.Tracker();const heroes=Array.from({length:10},(_,i)=>'hero'+i),panels=heroes.map((h,i)=>({side:i<5?'L':'R',idx:i%5,filled:0}));
t.pool={poolHeroes:[...heroes,'falseHero']};t.fullOrder=[0,5,1,6,2,7,3,8,4,9];t.pcInit=true;t.known=new Set();
for(let i=0;i<10;i++){const q=[i<5?'L':'R',i%5];t.heroOf[heroes[i]]=q;t.nameHero=t.nameHero||{};t.nameHero[q.join('')]=heroes[i];t.known.add('hero:'+heroes[i]);}
t.orphan={'hero:falseHero':true};t.known.add('hero:falseHero');
const previous=process.env.AD_NONAME;process.env.AD_NONAME='1';
try{t.attribute(null,{current:['L',0],panels,taken:{},takenHeroes:[...heroes,'falseHero'],rawDark:11},q=>q.join(''),(a,b)=>a[0]===b[0]&&a[1]===b[1]);}
finally{if(previous===undefined)delete process.env.AD_NONAME;else process.env.AD_NONAME=previous;}
assert(!t.orphan['hero:falseHero']);assert.equal(Object.keys(t.heroOf).length,10);
console.log('✓ 十个名字已确认时清理第十一个错误孤立英雄');
// Two title reads in the same frame cannot confirm the same hero twice.
const names=new R.Tracker();names.pool={poolHeroes:['heroA','heroB']};names.fullOrder=t.fullOrder;names.pcInit=true;
names.nameRun={L0:{h:'heroA',n:1,t:1},R0:{h:'heroA',n:1,t:1}};
R.setSource({heroName:(side,idx,cands)=>cands.includes('heroA')?[[0.9,'heroA'],[0.1,null]]:[[0.9,null],[0.1,'heroB']]});
try{names.attribute(null,{current:['L',0],panels,taken:{},takenHeroes:['heroA'],rawDark:1},q=>q.join(''),(a,b)=>a[0]===b[0]&&a[1]===b[1]);}
finally{R.setSource(null);}
assert.equal(names.nameHero.L0,'heroA');assert(!names.nameHero.R0);
console.log('✓ 同帧英雄名字确认立即排他，不会把同一个英雄锁给两个座位');
// Synthetic genuine boards and bright unrelated textures exercise the actual wake gate.
const genuine=S.render({heroes:S.pickHeroes(12,17),cur:['L',0],me:['R',2]});
assert(R.draftBoardEvidence(genuine));
const unrelated={w:2560,h:1440,data:Buffer.alloc(2560*1440*4,110)};
assert(!R.draftBoardEvidence(unrelated));
console.log('✓ 真棋盘可唤醒；亮度大幅变化的非棋盘画面保持休眠');
// Real data is optional for source-only distributions; present in the investigation workspace.
if(fs.existsSync(path.join(root,'audit_traces.json'))){
 const traces=JSON.parse(fs.readFileSync(path.join(root,'audit_traces.json')));
 for(const name of ['trace_20261008092129.jsonl','trace_20261008140526.jsonl']){
  const row=traces.find(x=>x.name===name);let max=0;
  const r=T.replay(row.file,(_,f,s)=>{if(s)max=Math.max(max,s.skills.filter(x=>x.taken).length+s.taken_heroes.length+s.extraPicks);});
  assert.equal(r.miss,0);assert.equal(max,50,name);
  assert.equal(Object.keys(r.tracker.owner).length,40,name);assert.equal(r.tracker.unknownBy.length,0,name);
 }
 const row=traces.find(x=>x.name==='trace_20261008140519.jsonl');const r=T.replay(row.file);
 assert.equal(Object.keys(r.tracker.heroOf).length,10);assert(!r.tracker.orphan['hero:npc_dota_hero_ursa']);
 const mid=traces.find(x=>x.name==='trace_20261008152120.jsonl');let checked=0;
 T.replay(mid.file,(tr,f,s)=>{if(!s)return;const p=s.panels.find(x=>x.hero==='npc_dota_hero_dragon_knight');if(p){assert.equal(p.side,'R');assert.equal(p.idx,4);checked++;}});
 assert(checked>0);
 console.log('✓ 昨天两条 51 手轨迹回到 50；旧第十一英雄清除；中途重开龙骑士归 R5');
}
