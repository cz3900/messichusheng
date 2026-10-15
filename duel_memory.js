'use strict';

// Nearby positions inherit actions and kit ideas, never another position's
// win estimates. Exact-node statistics remain in Planner.tree.
class SearchMemory {
  constructor(){this.ideas=new Map();}
  observe(step,rows,plans){
    const tested=rows.filter(r=>r.n>=4&&r.win!==null).sort((a,b)=>b.win-a.win);
    if(!tested.length)return;
    for(const row of tested){
      const id=row.key,old=this.ideas.get(id);
      const found=[...(plans.get(id)||new Map()).entries()].filter(([,p])=>p.n>=2&&p.sum/p.n>.05)
        .sort((a,b)=>b[1].n-a[1].n||b[1].sum/b[1].n-a[1].sum/a[1].n).slice(0,2)
        .map(([key,p])=>({key,support:p.n,strength:p.sum/p.n}));
      const merged=new Map((old?.companions||[]).map(p=>[p.key,p]));
      for(const p of found)if(p.support>=(merged.get(p.key)?.support||0))merged.set(p.key,p);
      const companions=[...merged.values()].sort((a,b)=>b.support-a.support||b.strength-a.strength).slice(0,2);
      this.ideas.set(id,{key:id,step:Math.min(old?.step??step,step),lastStep:step,rank:tested.indexOf(row),evidence:row.n,companions,
        discoveries:(old?.discoveries||0)+(old?.lastStep===step?0:1)});
    }
  }
  priorities(sim,own,legal){
    const seat=sim.order[sim.step],items=new Map(sim.items.map((x,i)=>[x.key,i])),out=new Map();
    const offer=(key,weight)=>{if(legal.has(key))out.set(key,Math.max(out.get(key)||0,weight));};
    for(const idea of this.ideas.values()){
      if(idea.step>=sim.step)continue;
      const i=items.get(idea.key);if(i===undefined)continue;
      const weight=1/(1+idea.rank)+Math.min(idea.discoveries,4)*.05;
      if(!sim.taken[i]){
        // A discovered kit remains possible if at least one companion is
        // available or already belongs to this player.
        const viable=!idea.companions.length||idea.companions.some(p=>{
          const j=items.get(p.key);return j!==undefined&&(!sim.taken[j]||own[j]===seat);
        });
        if(viable)offer(idea.key,weight);
      }else if(own[i]===seat){
        for(const p of idea.companions){const j=items.get(p.key);if(j!==undefined&&!sim.taken[j])offer(p.key,weight+.5);}
      }
    }
    return [...out].sort((a,b)=>b[1]-a[1]).map(([key])=>key);
  }
  advance(taken){
    const selected=new Set(taken);
    // Keep selected anchors: they can still remind their owner to complete
    // a kit. Remove an idea only after all its known pieces are gone.
    for(const[key,p]of this.ideas)if(selected.has(key)&&p.companions.every(c=>selected.has(c.key)))this.ideas.delete(key);
  }
}
module.exports={SearchMemory};
