'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {collect}=require('../native_evidence');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ad-native-evidence-')),dump=path.join(dir,'crashes');fs.mkdirSync(dump);fs.mkdirSync(path.join(dump,'reports'));
 const t=new Date(),z=n=>String(n).padStart(2,'0');const name=`ad_${t.getFullYear()}${z(t.getMonth()+1)}${z(t.getDate())}_${z(t.getHours())}${z(t.getMinutes())}${z(t.getSeconds())}.log`;
 const body=Buffer.from('MDMP diagnostic bytes');fs.writeFileSync(path.join(dump,'reports','test.dmp'),body);
 fs.writeFileSync(path.join(dump,'reports','unrelated.dmp'),'old');const old=new Date(Date.now()-7*86400e3);fs.utimesSync(path.join(dump,'reports','unrelated.dmp'),old,old);
 let commands=0;const files=await collect({logdir:dir,previous:{f:name,st:{mtimeMs:Date.now()}},crashDir:dump,platform:'win32',execFile(file,args,opts,cb){commands++;assert.equal(file,'powershell.exe');assert(args.at(-1).includes('ADAssistant'));cb(null,JSON.stringify({id:1000,message:'faulting module DirectML.dll',time:'now'}));}});
 assert.equal(commands,1);const rows=files[0].data.toString().trim().split('\n').map(JSON.parse);
 const d=rows.find(r=>r.event==='native-dump');assert.equal(Buffer.from(d.data,'base64').toString(),body.toString());assert.equal(d.fileName,'test.dmp');assert.equal(rows.at(-1).matchingDumps,1);
 assert(rows.find(r=>r.event==='windows-application-faults').events[0].message.includes('DirectML.dll'));
 assert(/^[A-Za-z0-9_.-]{1,80}\.jsonl$/.test(files[0].name),'Compatible with deployed collector filename allowlist');
 fs.rmSync(dir,{recursive:true,force:true});console.log('通过：同会话minidump完整可恢复、旧转储排除、Windows故障模块记录、服务器格式兼容。');
})().catch(e=>{console.error(e);process.exitCode=1;});
