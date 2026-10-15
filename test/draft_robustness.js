'use strict';
// Pixel perturbations for regression testing, not additional real screenshots.
// External manifests reference the same region JSON schema as draft_scenes.json.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const {Worker,isMainThread,workerData,parentPort} = require('worker_threads');
const {detect} = require('../draft_scene');
const profiles = {
  original:v=>v, dim55:v=>v*.55, dim75:v=>v*.75,
  bright125:v=>v*1.25, bright150:v=>v*1.5,
  offsetMinus30:v=>v-30, offsetPlus30:v=>v+30,
  gamma145:v=>255*Math.pow(v/255,1.45), gamma065:v=>255*Math.pow(v/255,.65)
};
const tables=Object.fromEntries(Object.entries(profiles).map(([name,fn])=>[name,Uint8Array.from({length:256},(_,v)=>Math.max(0,Math.min(255,Math.round(fn(v)))))]));
function partsOf(item) {
  const source=item.regionsPath?JSON.parse(fs.readFileSync(item.regionsPath)):item;
  return {w:source.w||1280,h:source.h||720,parts:source.regions.map(p=>({...p,bytes:zlib.inflateSync(Buffer.from(p.rgb||p.luma,'base64'))}))};
}
function render(source,width,profile='original') {
  const sx=width/source.w,height=Math.round(source.h*sx),sy=height/source.h;
  const data=Buffer.alloc(width*height*4),lut=tables[profile];
  // Aspect-preserving nearest-neighbour resize is a deliberately alias-prone stress case.
  for(const part of source.parts){const [x,y,w,h]=part.box,b=part.bytes,channels=part.luma?1:3;
    const left=Math.max(0,Math.floor(x*sx)),top=Math.max(0,Math.floor(y*sy));
    const right=Math.min(width,Math.ceil((x+w)*sx)),bottom=Math.min(height,Math.ceil((y+h)*sy));
    for(let yy=top;yy<bottom;yy++){const j=Math.max(0,Math.min(h-1,Math.round(yy/sy)-y));
      for(let xx=left;xx<right;xx++){const i=Math.max(0,Math.min(w-1,Math.round(xx/sx)-x)),a=(j*w+i)*channels,k=(yy*width+xx)*4;
        data[k]=lut[b[a]];data[k+1]=lut[b[a+(channels===1?0:1)]];data[k+2]=lut[b[a+(channels===1?0:2)]];data[k+3]=255;
      }
    }
  }
  return {w:width,h:height,data};
}
function plans(item,source,baseline) {
  const cases=[{width:source.w,profile:'original',group:'native'}];if(baseline)return cases;
  for(const profile of Object.keys(profiles).filter(x=>x!=='original'))cases.push({width:source.w,profile,group:'brightness'});
  for(const width of [960,1280,1920,2560])if(width!==source.w)cases.push({width,profile:'original',group:'resolution'});
  // Deterministic cross-products, including every strategy example and a broad sample.
  if(item.cross ?? (item.label==='strategy'||item.expected==='strategy'||parseInt((item.sha256||'0').slice(0,8),16)%16===0))
    for(const width of [960,1280,1920,2560])for(const profile of ['dim55','dim75','bright150','gamma145'])
      if(width!==source.w)cases.push({width,profile,group:'cross'});
  return cases;
}
function run(items,baseline){const rows=[];for(const item of items){const source=partsOf(item),label=item.label||item.expected||null;
  for(const c of plans(item,source,baseline)){const img=render(source,c.width,c.profile),r=detect(img);
    rows.push({id:item.id,label,group:c.group,w:img.w,h:img.h,profile:c.profile,stage:r.stage,scores:r.scores});
  }}return rows;}
function endError(r){return (r.label==='drafting'||r.label==='unknown'||r.label==='other')&&['strategy','game'].includes(r.stage)||r.label==='strategy'&&r.stage==='game';}
function summarize(rows){const groups={};for(const r of rows){const key=r.group+':'+r.profile;const s=groups[key]||={cases:0,labeled:0,correct:0,unknown:0,wrongStage:0,endErrors:0,detected:{}};
  s.cases++;s.detected[r.stage]=(s.detected[r.stage]||0)+1;if(r.label){s.labeled++;if(r.stage===r.label)s.correct++;else if(r.stage==='unknown')s.unknown++;else s.wrongStage++;}if(endError(r))s.endErrors++;}
  return {cases:rows.length,labeled:rows.filter(r=>r.label).length,endErrors:rows.filter(endError),groups};}
if(!isMainThread){parentPort.postMessage(run(workerData.items,workerData.baseline));}
else if(require.main===module){(async()=>{const args=process.argv.slice(2),input=args.find(x=>!x.startsWith('--'));
  const items=input?JSON.parse(fs.readFileSync(input)):[...require('./fixtures/draft_scenes.json'),...require('./fixtures/draft_scenes_history.json')],baseline=args.includes('--baseline');
  const workers=Math.max(1,Math.min(4,items.length)),start=Date.now(),results=await Promise.all(Array.from({length:workers},(_,i)=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{items:items.filter((_,j)=>j%workers===i),baseline}});worker.on('message',resolve);worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error('worker exit '+code));});
  })));
  const rows=results.flat(),summary=summarize(rows),result={...summary,images:items.length,seconds:(Date.now()-start)/1000,rows};
  const out=args.find(x=>x.startsWith('--out='));if(out)fs.writeFileSync(out.slice(6),JSON.stringify(result));
  console.log(JSON.stringify({...summary,endErrors:summary.endErrors.slice(0,15),endErrorCount:summary.endErrors.length,images:items.length,seconds:result.seconds},null,2));
  if(summary.endErrors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={partsOf,render,run,summarize};
