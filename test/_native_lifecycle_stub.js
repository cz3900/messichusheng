'use strict';
const assert=require('assert/strict');let active=0,initialized=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function init(model,prefer,bfix){assert.equal(active,0,'Session initialization overlaps inference');active++;await wait(25);active--;initialized=true;return {ep:'stub',med:1,bfix};}
async function final(){assert(initialized);assert.equal(active,0);active++;await wait(50);active--;return {rows:[],ms:50};}
async function dispose(){assert.equal(active,0,'Session release overlaps inference');initialized=false;}
module.exports={init,final,dispose};
