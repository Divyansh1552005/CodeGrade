import { context, runSection, ok, skip, counts, ms, models } from './common.js';
await runSection('A',['A1','A2','A3','A4','A5','A6'],async test => {
  let ctx;
  try { ctx = await context({realRedis:true}); await ctx.api(); }
  catch (e) {
    for (const id of ['A1','A2','A3','A4','A6']) await test(id,async () => skip(e.message));
  }
  if (ctx) try {
    const teacher = await ctx.register('teacher'), problem = await ctx.problem(teacher);
    await test('A1', async () => {
      const actor = await ctx.register(); const samples = [];
      for (let i=0;i<10;i++) { const r = await ctx.submit(actor,problem); samples.push({status:r.status,retryAfter:r.headers.get('retry-after'),durationMs:r.durationMs}); }
      const counterExists = await ctx.redis.exists(`${ctx.prefix}:rl:submit:min:${actor.user._id}`);
      return ok({requests:10,statuses:counts(samples.map(x=>x.status)),samples,redisMinuteKeyExists:counterExists},samples.filter(x=>x.status===202).length===2 && samples.filter(x=>x.status===429).length===8 && samples.filter(x=>x.status===429).every(x=>Number(x.retryAfter)>0 && Number(x.retryAfter)<=60) && counterExists===1,'Real API and Redis; worker stopped; mock Judge0 not called.');
    });
    await test('A2',async () => {
      const actor = await ctx.register(); const responses = await Promise.all(Array.from({length:20},()=>ctx.submit(actor,problem)));
      const accepted = responses.filter(r=>r.status===202).length;
      return ok({concurrentRequests:20,accepted,rejected:responses.filter(r=>r.status===429).length,statuses:counts(responses.map(r=>r.status)),retryAfter:responses.map(r=>r.headers.get('retry-after')),redisMinuteKeyExists:await ctx.redis.exists(`${ctx.prefix}:rl:submit:min:${actor.user._id}`)},accepted===2,'Real Redis-backed middleware race, one API process.');
    });
    await test('A3',async () => {
      const actors = [await ctx.register(),await ctx.register()]; const statuses=[];
      for (const actor of actors) for(let i=0;i<2;i++) statuses.push((await ctx.submit(actor,problem)).status);
      return ok({users:2,requestsPerUser:2,statuses,accepted:statuses.filter(x=>x===202).length},statuses.every(x=>x===202),'Real API/Redis.');
    });
    await test('A4',async () => {
      const actor=await ctx.register(), ordering=await ctx.register(); const statuses=[];
      const key=`${ctx.prefix}:rl:submit:min:${actor.user._id}`;
      for(let i=0;i<20;i++) { if(i%2===0) await ctx.redis.del(key); statuses.push((await ctx.submit(actor,problem)).status); }
      await ctx.redis.del(key); const twentyFirst=(await ctx.submit(actor,problem)).status;
      for(let i=0;i<2;i++) await ctx.submit(ordering,problem);
      const dayKey=`${ctx.prefix}:rl:submit:day:${ordering.user._id}`;
      const before=await ctx.redis.get(dayKey); const cooldown=(await ctx.submit(ordering,problem)).status; const after=await ctx.redis.get(dayKey);
      return ok({label:'Limiter-level accelerated quota test: deleted only our minute key before each pair',accepted:statuses.filter(x=>x===202).length,twentyFirstStatus:twentyFirst,cooldownStatus:cooldown,dailyCounterBefore:before,dailyCounterAfter:after,dailyCounterUnchanged:before===after,dailyTtlMs:await ctx.redis.pttl(`${ctx.prefix}:rl:submit:day:${actor.user._id}`)},statuses.every(x=>x===202)&&twentyFirst===429&&cooldown===429&&before===after,'Not an end-to-end rolling-day expiry test. Real daily limiter; own minute-key resets only.');
    });
    await test('A6',async () => {
      const actor=await ctx.register(),samples=[]; const start=ms();
      for(let i=0;i<130;i++) { const r=await ctx.request('/auth/me',{actor}); samples.push({status:r.status,retryAfter:r.headers.get('retry-after')}); }
      const elapsedMs=ms()-start, statuses=counts(samples.map(x=>x.status));
      return ok({requests:130,statuses,elapsedMs,samples,redisGeneralKeyExists:await ctx.redis.exists(`${ctx.prefix}:rl:general:${actor.user._id}`)},statuses[200]===120&&statuses[429]===10&&elapsedMs<60000,'Real authenticated middleware and Redis; fresh user.');
    });
  } finally { await ctx.close(); }
  await test('A5',async () => {
    const isolated=await context();
    try {
      await isolated.api({REDIS_URL:'redis://127.0.0.1:1',NODE_ENV:'development'});
      const problem=await models.Problem.create({title:'Fail-open echo',topics:['Arrays'],testCases:[{input:'1',expectedOutput:'1'}]}),actor=await isolated.register(),samples=[];
      for(let i=0;i<4;i++) {try{const r=await isolated.submit(actor,problem,undefined,{timeout:10000});samples.push({status:r.status,durationMs:r.durationMs,retryAfter:r.headers.get('retry-after')});}catch(e){samples.push({status:'timeout',error:e.name});break;}}
      const statuses=counts(samples.map(x=>x.status));
      const maxRequestLatencyMs=5000;
      return ok({requested:4,attempted:samples.length,statuses,samples,closedPort:1,redisErrorsObserved:isolated.logs.filter(x=>x.includes('Redis error')).length,requestDeadlineMs:10000,maxRequestLatencyMs},statuses[202]===2&&statuses[429]===2&&samples.every(x=>x.status!=='timeout'&&x.durationMs<=maxRequestLatencyMs),'Second real development API; Redis at a closed port; insurance limiter with bounded Redis connect/command timeouts. This tests one API process and does not prove multi-process outage coordination.');
    } finally {await isolated.close();}
  });
});
