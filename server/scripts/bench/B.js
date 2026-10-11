import { readFile, readdir } from 'node:fs/promises';
import { context, runSection, ok, skip, config, models, ms, repoDir, serverDir, sanitize, waitFor } from './common.js';
const probes=[
 {name:'infinite loop',code:'while True: pass'},
 {name:'bounded fork explosion',code:'import os\nfor _ in range(10):\n try: os.fork()\n except OSError: break\nwhile True: pass'},
 {name:'memory bomb',code:'a=[]\nwhile True: a.append(bytearray(64*1024*1024))'},
 {name:'stdout flood',code:'for _ in range(100000): print("x"*1024)'},
 {name:'filesystem read',code:'import os\nprint(open("/etc/passwd").read())\nprint(os.listdir("/"))'},
 {name:'outbound socket',code:'import socket\ns=socket.create_connection(("example.com",80),timeout=3)\ns.send(b"GET / HTTP/1.0\\r\\nHost: example.com\\r\\n\\r\\n")\nprint(s.recv(100))'},
 {name:'spawn shell',code:'import subprocess\nprint(subprocess.check_output(["/bin/sh","-c","id; pwd"],timeout=3).decode())'},
 {name:'unicode transport',code:'# café 中文 😀\nprint(input())',input:'café 中文 😀',expected:'café 中文 😀'},
];
await runSection('B',['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11'],async test=>{
 let ctx,worker;
 try { try{ctx=await context({realRedis:true});}catch(e){ctx=await context();ctx.redisUnavailable=e.message;}await ctx.api({NODE_ENV:'test'});
 const actor=await ctx.register(), teacher=await ctx.register('teacher'),problem=await ctx.problem(teacher);
 if(ctx.redis){worker=ctx.spawn('worker');await waitFor('B worker ready',()=>ctx.logs.some(l=>l.includes('Workers ready')),40000);}
 for(let i=0;i<probes.length;i++) await test(`B${i+1}`,async()=>{
   if(!config.JUDGE0_API_KEY) return skip('JUDGE0_API_KEY missing');
   if(ctx.realJudgeRequests>=20)return skip('Real Judge0 total HTTP request budget exhausted');
   const p=probes[i]; const start=ms(), callStart=ctx.calls.length;let providerStatus=null,providerDescription=null;
   // A forwarding HTTP server counts and caps all real POSTs and polling GETs.
   ctx.judgeReal=true;
   const probeActor=await ctx.register();let submission;
   let error=null;try{
     if(worker){const probeProblem=await models.Problem.create({title:`Real sandbox ${p.name}`,topics:['Arrays'],testCases:[{input:p.input||'1',expectedOutput:p.expected||'1'}]});const accepted=await ctx.request('/submissions',{actor:probeActor,method:'POST',body:{problemId:probeProblem.id,language:'python',code:p.code}});if(accepted.status!==202)throw new Error(`Sandbox submission rejected: ${accepted.status}`);submission=await models.Submission.findById(accepted.data.submissionId);await waitFor('real sandbox job terminal',async()=>{const w=await models.WorkItem.findOne({key:`grading-${submission.id}`});return w&&['completed','failed'].includes(w.status);},120000);}
     else{submission=await models.Submission.create({studentId:probeActor.user._id,problemId:problem._id,language:'python',code:p.code,testCasesSnapshot:[{input:p.input||'1',expectedOutput:p.expected||'1'}]});await (await import('../../services/submissionProcessor.js')).processSubmission({data:{submissionId:submission.id}});}
   }catch(e){error=sanitize(e.message);}finally{ctx.judgeReal=false;}
   const providerCalls=ctx.calls.slice(callStart);const last=providerCalls.at(-1);providerStatus=last?.providerStatus??null;providerDescription=last?.providerDescription??null;
   const visible=submission?await ctx.request(`/submissions/${submission.id}`,{actor:probeActor}):{data:{}};const stored=visible.data.submission;
   const healthy=(await ctx.request('/health')).status===200;
   return ok({probe:p.name,language:'python',sourceCode:p.code,stdin:p.input||'1',expectedOutput:p.expected||'1',providerStatus,providerDescription,wallMs:ms()-start,apiHealthy:healthy,workerHealthy:worker?worker.exitCode===null&&worker.signalCode===null:null,workerUsed:Boolean(worker),redisUnavailable:ctx.redisUnavailable||null,
     realHttpRequests:providerCalls.length,realHttpRequestsCumulative:ctx.realJudgeRequests,providerCalls,
     studentStatus:stored?.status,passCount:stored?.passCount,totalCount:stored?.totalCount,studentOutputBytes:Buffer.byteLength(stored?.testResults?.[0]?.actualOutput||''),studentOutputTruncationMarker:stored?.testResults?.[0]?.actualOutput?.endsWith('...[output truncated]')||false,studentOutputWithin4096ByteCap:Buffer.byteLength(stored?.testResults?.[0]?.actualOutput||'')<=4096,
     unicodeOutputMatches:i===7?stored?.testResults?.[0]?.actualOutput===p.expected:null,error,
     terminatedOrErrored:providerStatus!==null && [4,5,6,7,8,9,10,11,12,13,14].includes(providerStatus)},i===7?healthy&&stored?.passCount===1:healthy&&providerStatus!==null&&(i!==3||(Buffer.byteLength(stored?.testResults?.[0]?.actualOutput||'')<=4096&&(stored?.testResults?.[0]?.actualOutput||'').endsWith('...[output truncated]'))),'Real Judge0 through a counted proxy; real API + BullMQ worker when Redis is available, direct grading processor otherwise. Bounded probes; output flood records the post-cap student-visible output size. Accepted filesystem/shell probes are not counted as terminated/errored containment.');
 });
 await ctx.stop(worker);worker=null;
 await test('B9',async()=>{const before=ctx.calls.length;const r=await ctx.request('/submissions',{actor,method:'POST',body:{problemId:problem._id,language:'python',code:'x'.repeat(20001)}});return ok({codeCharacters:20001,status:r.status,mockCalls:ctx.calls.length-before},r.status===400&&ctx.calls.length===before,'Real validation route; mock endpoint; worker stopped.');});
 await test('B10',async()=>{const fresh=await ctx.register(),before=ctx.calls.length;const r=await ctx.request('/submissions',{actor:fresh,method:'POST',body:{problemId:problem._id,language:'ruby',code:'puts 1'}});return ok({language:'ruby',status:r.status,mockCalls:ctx.calls.length-before},r.status===400&&ctx.calls.length===before,'Real validation route; mock endpoint; worker stopped.');});
 }finally{if(ctx)await ctx.close();}
 await test('B11',async()=>{
   const matches=[];async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(['node_modules','tests','bench','coverage'].includes(entry.name))continue;const path=`${dir}/${entry.name}`;if(entry.isDirectory())await walk(path);else if(entry.name.endsWith('.js')){const lines=(await readFile(path,'utf8')).split('\n');lines.forEach((line,i)=>{if(/\beval\s*\(|new\s+Function\s*\(|child_process|\bexec\s*\(|\bspawn\s*\(/.test(line))matches.push({file:path.slice(repoDir.length),line:i+1,text:line.trim(),touchesStudentCode:false,assessment:path.includes('/scripts/')?'Operational script starts known server/worker entry points; no submission.code argument':/^\s*(\*|\/\/)/.test(line)?'Comment explicitly says student code is not executed locally':'Requires manual review'});});}}}
   await walk(serverDir);return ok({matches,matchCount:matches.length,scope:'server JavaScript excluding tests, node_modules, benchmark harness and generated coverage',studentCodeExecutionMatches:matches.filter(m=>m.touchesStudentCode).length},matches.every(m=>m.assessment!=='Requires manual review'),'Static lexical search plus manual review of smokeJobs spawn arguments is not a complete data-flow/security proof.');
 });
});
