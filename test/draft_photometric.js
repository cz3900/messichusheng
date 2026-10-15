'use strict';
const assert=require('assert/strict'),{detect}=require('../draft_scene');
const {partsOf,render}=require('./draft_robustness');
const items=[...require('./fixtures/draft_scenes.json'),...require('./fixtures/draft_scenes_history.json')];
const failures=[];let cases=0,conservativeGameWaits=0;
for(const item of items){const source=partsOf(item);
  for(const profile of ['original','dim55','dim75','bright125','bright150','offsetMinus30','offsetPlus30','gamma145','gamma065']){
    cases++;const result=detect(render(source,source.w,profile));
    // HUD colour thresholds deliberately remain conservative. Measure dim-game
    // misses separately; they delay hiding and must never become false stage cues.
    if(item.expected==='game'&&profile!=='original'&&result.stage==='unknown')conservativeGameWaits++;
    else if(result.stage!==item.expected)failures.push({id:item.id,profile,expected:item.expected,actual:result.stage});
  }
}
console.log(JSON.stringify({cases,failures:failures.length,conservativeGameWaits,examples:failures.slice(0,12)}));
assert.equal(failures.length,0,'choice/strategy text must survive brightness changes without conflicting stage cues');
