'use strict';
const assert=require('assert/strict'),zlib=require('zlib'),fs=require('fs');
const {detect}=require('../draft_scene');
function decode(item){const img={w:item.w||1280,h:item.h||720};img.data=Buffer.alloc(img.w*img.h*4);for(const part of item.regions){const [x,y,w,h]=part.box,b=zlib.inflateSync(Buffer.from(part.rgb||part.luma,'base64'));for(let j=0;j<h;j++)for(let i=0;i<w;i++){const a=(j*w+i)*(part.luma?1:3),k=((y+j)*img.w+x+i)*4;img.data[k]=b[a];img.data[k+1]=b[a+(part.luma?0:1)];img.data[k+2]=b[a+(part.luma?0:2)];img.data[k+3]=255;}}return img;}
if(require.main===module){const items=JSON.parse(fs.readFileSync(process.argv[2]||require.resolve('./fixtures/draft_scenes.json')));let bad=0;const t=Date.now();for(const item of items){const result=detect(decode(item));if(item.expected&&result.stage!==item.expected){bad++;console.log('FAIL',item.id,'expected',item.expected,JSON.stringify(result));}else if(process.argv[2])console.log(item.id,JSON.stringify(result));}console.log(`${items.length} screenshot regions, ${bad} failures, ${Date.now()-t}ms`);assert.equal(bad,0);}
module.exports={decode};
