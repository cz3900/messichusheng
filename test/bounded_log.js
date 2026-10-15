"use strict";
const assert = require('assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const {create} = require('../bounded_log');
(async () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-log-test-'));
 const file = path.join(dir, 'session.log'), log = create(file);
 for (let i=0;i<10000;i++) log.write('error','界'.repeat(5000));
 assert(log.stats().queued <= 65536); assert(log.stats().dropped > 9900);
 await log.flush(); assert(fs.statSync(file).size <= 65536);
 assert(fs.readFileSync(file,'utf8').includes('[truncated]'));
 const limitedFile=path.join(dir,'limited.log'), limited=create(limitedFile,{fileCap:1024});
 for(let i=0;i<50;i++){ limited.write('test','x'.repeat(100)); await limited.flush(); }
 assert(fs.statSync(limitedFile).size <=1024); assert(limited.stats().dropped>0);
 const broken=create(path.join(dir,'missing','log')); broken.write('test','failure'); await broken.flush();
 assert(broken.stats().disabled); assert.equal(broken.write('test','again'),false);
 let callback, calls=0;
 const slow=create('fake',{io:{statSync(){throw Error();},appendFile(f,b,cb){calls++; callback=cb;},appendFileSync(){}}});
 slow.write('test','first'); const pending=slow.flush();
 for(let i=0;i<10000;i++){slow.write('test','x'.repeat(4096));slow.flush();}
 assert.equal(calls,1); assert(slow.stats().queued<=65536);
 callback(null);await pending; const tail=slow.flush();assert.equal(calls,2);callback(null);await tail;
 const stopped=create(path.join(dir,'stop.log'));stopped.write('stop','退出');stopped.flushSync();assert(fs.readFileSync(path.join(dir,'stop.log'),'utf8').includes('退出'));
 console.log('PASS: log flood / UTF-8 line limit / file cap / disk failure / stalled serialized writer / shutdown tail');
})().catch(e=>{console.error(e);process.exitCode=1});
