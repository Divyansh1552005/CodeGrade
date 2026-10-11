import { context, runSection, models, ok, parallel, ms, waitFor, counts } from './common.js';
await runSection('I',['I1'],async test=>{
 const ctx=await context({realRedis:true,delay:300});
 try{await ctx.api();const teacher=await ctx.register('teacher'),problem=await ctx.problem(teacher);
 await test('I1',async()=>{const rows=[];for(const workerProcesses of [1,2]){
   if(workerProcesses===2){
     // Both runs begin with no earlier grading/completion backlog. These are only this temporary database's collections.
     await Promise.all(['Submission','WorkItem','UserStats','StudentStats','GamificationEvent','UserBadge','Badge','Notification'].map(name=>models[name].deleteMany({})));
     let cursor='0';do{const page=await ctx.redis.scan(cursor,'MATCH',`${ctx.prefix}:*`,'COUNT',500);cursor=page[0];if(page[1].length)await ctx.redis.del(...page[1]);}while(cursor!=='0');
   }
   const actors=await parallel(Array.from({length:100}),10,()=>ctx.register());const markers=Array.from({length:200},(_,i)=>`i-${workerProcesses}-${i}`),responses=await parallel(markers,10,(marker,i)=>ctx.submit(actors[Math.floor(i/2)],problem,marker)),ids=responses.filter(r=>r.status===202).map(r=>r.data.submissionId);ctx.logs=[];const start=ms();const workers=Array.from({length:workerProcesses},()=>ctx.spawn('worker'));
   try{await waitFor('drain 200 submissions',async()=>await models.Submission.countDocuments({_id:{$in:ids},status:'graded'})===200,300000);}catch{}const drainMs=ms()-start;const graded=await models.Submission.countDocuments({_id:{$in:ids},status:'graded'});const workerHealth=workers.map(w=>({exitCode:w.exitCode,signalCode:w.signalCode}));const errorLogs=ctx.logs.filter(l=>/error|failed|stalled|exhaust/i.test(l)).slice(-30);for(const worker of workers)await ctx.stop(worker);
   const calls=ctx.calls.filter(c=>markers.includes(c.marker)),perMarker=counts(calls.map(c=>c.marker)),errors=await models.Submission.countDocuments({_id:{$in:ids},status:'error'});rows.push({workerProcesses,concurrencyPerWorker:2,users:actors.length,requested:200,accepted:ids.length,graded,error:errors,lost:ids.length-graded-errors,drainMs,submissionsPerMinute:graded/(drainMs/60000),mockCalls:calls.length,duplicateCalls:Object.values(perMarker).reduce((n,v)=>n+Math.max(0,v-1),0),mockDelayMs:300,workerHealth,errorLogs,callsPerSubmission:perMarker});
 }return ok({sameQueuePrefix:true,resetBetweenRuns:true,rows,timing:'Worker process launch to polling observation of all graded; startup/recovery/dispatcher included'},rows.every(r=>r.accepted===200&&r.graded===200&&r.duplicateCalls===0),'Real separate worker processes and real Redis/BullMQ; one machine; one mock case per submission. Completion/feedback jobs run concurrently. Not Judge0 production capacity. Own submission/job/projection data and Redis keys cleared between runs; Mongo process/cache remains warm.');});
 }finally{await ctx.close();}
});
