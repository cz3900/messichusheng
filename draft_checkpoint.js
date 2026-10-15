'use strict';
// Only used during manual recovery. Never clone full-resolution reference pixels.
// Roll back partial recognition writes, keeping the original pool and ledger objects.
function checkpoint(tracker) {
  const skip=new Set(['ref','pool']), entries=new Map();
  for(const key of Object.keys(tracker)) if(!skip.has(key)&&typeof tracker[key]!=='function')
    entries.set(key,{original:tracker[key],copy:structuredClone(tracker[key])});
  const heroes=(tracker.pool.heroBoxes||[]).map(h=>({...h}));
  return () => {
    for(const key of Object.keys(tracker)) if(!skip.has(key)&&typeof tracker[key]!=='function'&&!entries.has(key))delete tracker[key];
    for(const [key,{original,copy}] of entries){
      if(original instanceof Set){original.clear();for(const x of copy)original.add(x);}
      else if(Array.isArray(original)){original.length=0;original.push(...copy);}
      else if(original&&Object.getPrototypeOf(original)===Object.prototype){for(const k of Object.keys(original))delete original[k];Object.assign(original,copy);}
      else {tracker[key]=copy;continue;}
      tracker[key]=original;
    }
    (tracker.pool.heroBoxes||[]).forEach((h,i)=>{for(const k of Object.keys(h))delete h[k];Object.assign(h,heroes[i]);});
  };
}
module.exports={checkpoint};
