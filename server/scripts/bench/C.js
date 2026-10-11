import { context, runSection, models, ok, parallel, ms, waitFor, sleep, summarize, counts } from './common.js';
await runSection('C',['C1','C2','C3','C4','C5'],async test=>{
 const ctx=await context({realRedis:true,delay:300});
 try {
   await ctx.api();const teacher=await ctx.register('teacher'),problem=await ctx.problem(teacher);let worker;
   const startWorker=async(overrides,waitReady=true)=>{worker=ctx.spawn('worker',overrides);if(waitReady)await waitFor('worker readiness',()=>ctx.logs.some(l=>l.includes('Workers ready')),150000);return worker;};
   const stopWorker=async()=>{await ctx.stop(worker);worker=null;ctx.logs=[];};
   const submitBatch=async(n,concurrency=10)=>{
     const actors=await parallel(Array.from({length:Math.ceil(n/2)}),10,()=>ctx.register());
     const markers=Array.from({length:n},(_,i)=>`c-${Date.now()}-${i}`);const start=ms();
     const responses=await parallel(markers,concurrency,(marker,i)=>ctx.submit(actors[Math.floor(i/2)],problem,marker));
     return {ids:responses.filter(r=>r.status===202).map(r=>r.data.submissionId),responses,markers,actors,start};
   };
   const drain=async ids=>waitFor('all graded',async()=>await models.Submission.countDocuments({_id:{$in:ids},status:'graded'})===ids.length,240000);
   const reportBatch=async batch=>{const rows=await models.Submission.find({_id:{$in:batch.ids}}).lean();const calls=ctx.calls.filter(c=>batch.markers.includes(c.marker));const perMarker=counts(calls.map(c=>c.marker));return {accepted:batch.ids.length,statuses:counts(batch.responses.map(r=>r.status)),graded:rows.filter(r=>r.status==='graded').length,error:rows.filter(r=>r.status==='error').length,lost:rows.filter(r=>!['graded','error'].includes(r.status)).length,mockCalls:calls.length,duplicateCalls:Object.values(perMarker).reduce((n,c)=>n+Math.max(0,c-1),0),callsPerSubmission:perMarker};};
   await test('C1',async()=>{await startWorker();const b=await submitBatch(100);try{await drain(b.ids);}catch{}const m={...await reportBatch(b),requested:100,users:b.actors.length,wallMs:ms()-b.start};return ok(m,m.accepted===100&&m.graded===100,'Real API, MongoDB, hosted Redis, separate unmodified worker; local mock Judge0, mock LLM. Registration excluded from drain timing.');});
   await test('C2',async()=>{
     if(!worker)await startWorker();const b=await submitBatch(100);const atKill=await models.Submission.countDocuments({_id:{$in:b.ids},status:'graded'});
     const exit=worker.exitCode===null?new Promise(r=>worker.once('exit',r)):Promise.resolve();worker.kill('SIGKILL');await exit;worker=null;const pauseStart=ms();await sleep(10000);const pauseMs=ms()-pauseStart;ctx.logs=[];
     const restart=ms();await startWorker(undefined,false);try{await drain(b.ids);}catch{}const m={...await reportBatch(b),requested:100,users:b.actors.length,gradedAtKill:atKill,actualPauseMs:pauseMs,restartToGradedMs:ms()-restart};return ok(m,m.accepted===100&&m.graded===100&&atKill<100,'SIGKILL of only our worker. In-flight external calls may replay; duplicates reported, not hidden. Restart readiness is judged by actual graded documents, not an early startup-log deadline.');
   });
   await test('C3',async()=>{
     await stopWorker();worker=ctx.spawn('worker',{REDIS_URL:'redis://127.0.0.1:1'});const b=await submitBatch(100);const during=await models.Submission.countDocuments({_id:{$in:b.ids},status:'graded'});
     await stopWorker();const restored=ms();await startWorker(undefined,false);try{await drain(b.ids);}catch{}const m={...await reportBatch(b),requested:100,users:b.actors.length,gradedDuringOutage:during,restoreToGradedMs:ms()-restored};return ok(m,m.accepted===100&&m.graded===100&&during===0,'Worker-only closed-port Redis fault; API Redis remains reachable. Restoration uses a fresh worker process.');
   });
   await test('C4',async()=>{await stopWorker();const profiles=[];for(const concurrency of [10,50]){const b=await submitBatch(100,concurrency);const summary=summarize(b.responses.map(r=>r.durationMs),ms()-b.start,b.responses.map(r=>r.status));profiles.push({concurrency,users:b.actors.length,...summary});}return ok({workerDown:true,profiles},profiles.every(p=>p.statuses[202]===100),'Acceptance path only. Real Redis-backed auth/limits still run. Registration excluded. No Judge0 or queue dispatch.');});
   await test('C5',async()=>{
     // Existing C4 pending jobs drain first; delete fresh records after worker startup reconciliation.
     ctx.logs=[];await startWorker();await waitFor('old grading backlog',async()=>await models.Submission.countDocuments({status:{$in:['queued','running']}})===0,240000);
     const actor=await ctx.register();const a=await ctx.submit(actor,problem,'recovery-a'),b=await ctx.submit(actor,problem,'recovery-b');const ids=[a.data.submissionId,b.data.submissionId];
     const deleted=await models.WorkItem.deleteMany({key:{$in:ids.map(id=>`grading-${id}`)}});const start=ms();
     await waitFor('missing outbox restored',async()=>await models.WorkItem.countDocuments({key:{$in:ids.map(id=>`grading-${id}`)}})===ids.length,75000);
     const recoveryMs=ms()-start;await drain(ids);return ok({deletedRecords:deleted.deletedCount,recreated:await models.WorkItem.countDocuments({key:{$in:ids.map(id=>`grading-${id}`)}}),recoveryMs,graded:await models.Submission.countDocuments({_id:{$in:ids},status:'graded'})},deleted.deletedCount===2&&recoveryMs<=60000,'Live scheduled recovery; no direct recoverDomainWork call. Polling resolution is 250 ms.');
   });
 }finally{await ctx.close();}
});
