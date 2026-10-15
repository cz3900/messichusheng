'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
async function collect({logdir,previous,crashDir,platform=process.platform,execFile=require('child_process').execFile}){
 const end=previous.diagnosticEndMs||previous.st.mtimeMs,rows=[],files=[],since=end-48*3600e3,until=end+10*60e3;
 const date=/^ad_(\d{4})(\d\d)(\d\d)_(\d\d)(\d\d)(\d\d)\.log$/.exec(previous.f);
 const start=date?new Date(+date[1],+date[2]-1,+date[3],+date[4],+date[5],+date[6]).getTime()-120e3:since;
 if(platform==='win32'){
  const script=`[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $s=[DateTimeOffset]::FromUnixTimeMilliseconds(${Math.floor(start)}).LocalDateTime; $e=[DateTimeOffset]::FromUnixTimeMilliseconds(${Math.floor(until)}).LocalDateTime; Get-WinEvent -FilterHashtable @{LogName='Application';Id=1000,1001;StartTime=$s;EndTime=$e} -ErrorAction SilentlyContinue | Where-Object {$_.Message -match '(?i)ADAssistant\\.exe'} | Select-Object -First 4 | ForEach-Object { @{time=$_.TimeCreated.ToString('o');id=$_.Id;provider=$_.ProviderName;message=$_.Message.Substring(0,[Math]::Min(3000,$_.Message.Length))} } | ConvertTo-Json -Compress`;
  const result=await new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:10000,windowsHide:true,maxBuffer:64*1024},(err,out)=>resolve({error:err?String(err.message).slice(0,300):null,out:String(out||'').trim()})));
  let events=[];try{const parsed=JSON.parse(result.out||'[]');events=Array.isArray(parsed)?parsed:[parsed];}catch(_){result.error='Invalid Windows event JSON';}
  rows.push({event:'windows-application-faults',previous:previous.f,events,error:result.error});
 }
 const dumps=[];
 if(crashDir)for(const dir of [crashDir,...['reports','pending','completed','attachments'].map(n=>path.join(crashDir,n))]){
  try{for(const f of fs.readdirSync(dir)){if(!/\.dmp$/i.test(f))continue;const p=path.join(dir,f),st=fs.statSync(p);if(st.isFile()&&st.mtimeMs>=start&&st.mtimeMs<=until)dumps.push({p,f,st});}}catch(_){}
 }
 dumps.sort((a,b)=>b.st.mtimeMs-a.st.mtimeMs);
 for(const [i,d]of dumps.slice(0,4).entries()){
  const meta={event:'native-dump',previous:previous.f,fileName:d.f,mtime:d.st.mtimeMs,size:d.st.size};
  if(i<2&&d.st.size<=4*1024*1024){try{const b=fs.readFileSync(d.p);rows.push({...meta,encoding:'base64',sha256:crypto.createHash('sha256').update(b).digest('hex'),data:b.toString('base64')});}catch(e){rows.push({...meta,error:String(e.message)});}}
  else rows.push({...meta,skipped:'size-or-count-limit'});
 }
 rows.push({event:'native-evidence-summary',previous:previous.f,matchingDumps:dumps.length,crashDir:crashDir||null,platform});
 const name='diag_native_'+previous.f.replace(/^ad_|\.log$/g,'')+'.jsonl',data=Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
 try{fs.writeFileSync(path.join(logdir,name),data);}catch(_){}
 files.push({name,data});return files;
}
module.exports={collect};
