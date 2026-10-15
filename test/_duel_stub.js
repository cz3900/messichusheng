"use strict";
class DuelController {
  reset(){}
  setShareMode(){}
  async background(st,o){await new Promise(r=>setTimeout(r,120));return {name:"duelbg",cancelled:o.cancelled(),rows:[]};}
  async decide(st,o){await new Promise(r=>setTimeout(r,120));return {name:"duel",cancelled:o.cancelled(),rows:[]};}
  async maintain(st,o){let rounds=0;while(!o.cancelled()){await new Promise(r=>setTimeout(r,10));rounds++;}return {name:"duelbg",rounds,cancelled:true,rows:[]};}
}
module.exports={DuelController};
