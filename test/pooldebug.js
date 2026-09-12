const fs=require("fs"),path=require("path");const {PNG}=require("pngjs");
const R=require("../recog.js"); const D=require("path").join(__dirname,"..","data");
const rd=f=>{const b=fs.readFileSync(f);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
R.init({lib:{keys:JSON.parse(fs.readFileSync(D+"/lib_keys.json")),q:new Int8Array(rd(D+"/lib_i8.bin")),scale:new Float32Array(rd(D+"/lib_scale.bin"))},
 names:{tpl:JSON.parse(fs.readFileSync(D+"/names.json")),bin:new Uint8Array(fs.readFileSync(D+"/names.bin"))},
 meta:JSON.parse(fs.readFileSync(D+"/meta.json")),layout:JSON.parse(fs.readFileSync(D+"/layout_2560x1440.json")),
 bright:JSON.parse(fs.readFileSync(D+"/lib_bright.json")),heroBright:JSON.parse(fs.readFileSync(D+"/hero_bright.json"))});
const p=PNG.sync.read(fs.readFileSync(process.argv[2])); let img={w:p.width,h:p.height,data:p.data};
const target=+process.argv[3]||img.w;
if(target!==img.w){ // 面积平均缩到 target 宽
  const W=target,H=Math.round(img.h*target/img.w),o=new Uint8Array(W*H*4),sx=img.w/W,sy=img.h/H;
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){const x0=Math.floor(i*sx),x1=Math.max(x0+1,Math.floor((i+1)*sx)),y0=Math.floor(j*sy),y1=Math.max(y0+1,Math.floor((j+1)*sy));let r=0,g=0,b=0,n=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const q=(y*img.w+x)*4;r+=img.data[q];g+=img.data[q+1];b+=img.data[q+2];n++;}const q=(j*W+i)*4;o[q]=r/n;o[q+1]=g/n;o[q+2]=b/n;o[q+3]=255;}
  img={w:W,h:H,data:o}; }
R.rescale(img.w,img.h); const t0=Date.now(); const P=R.readPool(img);
console.log(`帧 ${img.w}x${img.h} 检出格 ${P.align.nd} 用时 ${Date.now()-t0}ms`);
const by={}; for(const s of P.skills){const h=s.hero||R.OWNER()[s.key]||"(无主)";(by[h]=by[h]||[]).push(R.cn(s.key)+(s.ultslot?"(大)":"")+(s.filler?"*补位":"")+" "+s.s1.toFixed(2));} if(by["(无主)"]) console.log("   无主格:",by["(无主)"].join(" | "));
for(const h of P.poolHeroes) console.log("  ",R.cn(h).padEnd(8),by[h].join(" | "));
/* 每个"未知"格子 / 低分格子:在整个图标库里的前三名 */
{ const { boxes } = R.alignBoard(img, false); const keys = JSON.parse(fs.readFileSync(D + "/lib_keys.json"));
  const vec = b => { const m = Math.floor(Math.min(b[2], b[3]) * 0.06); return b; };
  for (const s of P.skills) if (s.unknown || s.s1 < 0.5) {
    const sc = R._scoreCell(img, boxes[s.cell]); const top = [...sc].map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3);
    console.log(`  格 ${s.cell}${s.ultslot ? "(大招区)" : ""} 现判=${R.cn(s.key)} ${s.s1.toFixed(2)} | 全库前三: ${top.map(([v, i]) => `${R.cn(keys[i])}(${R.cn(R.OWNER()[keys[i]] || "")}) ${v.toFixed(2)}`).join(" / ")}`); } }
