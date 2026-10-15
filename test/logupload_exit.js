"use strict";
const assert=require("assert/strict"),fs=require("fs"),path=require("path"),os=require("os");
const U=require("../logupload"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"ad-upload-exit-"));
const prev=path.join(dir,"ad_20261009_010000.log"),current=path.join(dir,"ad_20261009_020000.log");fs.writeFileSync(current,"current");
for(const tail of ["[01:00:00.000] stop    退出", "[01:00:00.000] stop    退出(更新重启)","[01:00:00.000] update  重启插件"]){fs.writeFileSync(prev,tail);assert.equal(U.findPrevUnclean(dir,current),null);}
fs.writeFileSync(prev,"[01:00:00.000] engine  在运行");assert(U.findPrevUnclean(dir,current));
fs.writeFileSync(path.join(dir,"diag_main_20261009_010000.jsonl"),"{\"event\":\"job-start\"}\n");const picked=U.pickPrev(dir,U.findPrevUnclean(dir,current));assert(picked.some(x=>x.name.endsWith(".jsonl")));
fs.rmSync(dir,{recursive:true,force:true});console.log("通过：更新重启/正常退出不报闪退，异常退出保留检测，诊断日志进入补传包。");
