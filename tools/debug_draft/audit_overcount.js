"use strict";
// Replay captured observations through the actual tracker and explain count overflow.
// --assert-valid is intentionally red on a trace that still exceeds 50; this is a
// diagnostic tool, not a claim that the recognition bug has already been fixed.
const path=require("path");
if(process.env.OVERCOUNT_RECOG_REF){
  const Module=require("module"),filename=path.resolve(__dirname,"../../recog.js"),historical=new Module(filename,module);
  historical.filename=filename;historical.paths=Module._nodeModulePaths(path.dirname(filename));
  historical._compile(require("child_process").execFileSync("git",["show",`${process.env.OVERCOUNT_RECOG_REF}:recog.js`],{cwd:path.dirname(filename),encoding:"utf8"}),filename);
  require.cache[filename]=historical;
}
const R=require("../../test/_env").init(),TR=require("../../trace");
const files=process.argv.slice(2).filter(x=>!x.startsWith("--"));
if(!files.length)throw Error("Usage: node tools/debug_draft/audit_overcount.js TRACE... [--assert-valid]");
let invalid=false;
for(const file of files){
  const {head}=TR.read(file);R.rescale(...head.res);
  let peak=0,overFrames=0,first=null;const suspectKeys=new Set();
  const result=TR.replay(file,(tr,f,S,src)=>{
    const total=R.pickedCount(S);peak=Math.max(peak,total);if(total<=50)return;
    overFrames++;
    const known=new Set(S.panels.flatMap(p=>p.skills.filter(s=>s.key!=="?pick").map(s=>s.key)));
    const unassigned=S.skills.filter(s=>s.taken&&!known.has(s.key)).map(s=>{
      suspectKeys.add(s.key);const r=tr.pool.skills.find(x=>x.key===s.key);
      return {key:s.key,paired:!!tr.owner[s.key],pending:!!tr.pend[s.key],suspect:!!tr.suspect[s.key],
        solidDark:tr.solidDark(s.key),darkRun:tr.darkRun[s.key]||0,firstT:tr.firstT[s.key],lockFrame:tr.lockFrame,
        raw:tr.prev.rawState?.[s.key],cell:r.cell,refMean:tr.refB[r.cell],refSat:tr.refS[r.cell],stats:src.cellStats(r.cell)};
    });
    if(!first)first={ms:f.ms,frame:tr.frameNo,total,selectedSkills:S.skills.filter(s=>s.taken).length,
      selectedHeroes:S.taken_heroes.length,pairedSkills:known.size,pairedHeroes:Object.keys(tr.heroOf).length,
      unknownSlots:S.panels.flatMap(p=>p.skills).filter(s=>s.key==="?pick").length,
      extraPicks:S.extraPicks,unassigned,orphanHeroes:Object.keys(tr.orphan).filter(k=>k.startsWith("hero:")),
      openPanels:S.panels.filter(p=>!p.hero||p.skills.length<4).map(p=>({seat:p.side+(p.idx+1),hero:!!p.hero,skills:p.skills.length}))};
  });
  console.log(JSON.stringify({trace:path.basename(file),frames:result.frames.length,miss:result.miss,peak,overFrames,first,unassignedAcrossOverflow:[...suspectKeys],
    finalPairedSkills:Object.keys(result.tracker.owner).length,finalPairedHeroes:Object.keys(result.tracker.heroOf).length},null,2));
  invalid ||= overFrames>0||result.miss>0;
}
if(process.argv.includes("--assert-valid")&&invalid)process.exitCode=1;
