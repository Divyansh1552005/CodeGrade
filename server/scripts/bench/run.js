import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile, readFile, appendFile } from 'node:fs/promises';
import dotenv from 'dotenv';
const benchDir=new URL('./',import.meta.url).pathname,repoDir=new URL('../../../',import.meta.url).pathname;
const config={...dotenv.parse(await readFile(new URL('../../.env',import.meta.url)).catch(()=>'')),...process.env};
function sanitize(input){let text=String(input);for(const[key,value]of Object.entries(config))if(value&&/KEY|SECRET|TOKEN|URL|URI|PASSWORD/i.test(key))text=text.split(String(value)).join('[redacted]');return text;}
const first=process.argv[2] || 'A';const letters='ABCDEFGHIJ'.slice('ABCDEFGHIJ'.indexOf(first));
if(!'ABCDEFGHIJ'.includes(first))throw new Error('Expected a section letter A through J');
const corrective=process.argv.includes('--corrective');
for(const letter of letters){console.log(`Starting section ${letter}`);await appendFile(`${benchDir}runtime/order.ndjson`,JSON.stringify({letter,corrective,event:'start',at:new Date().toISOString()})+'\n');const child=spawn(process.execPath,[`${benchDir}${letter}.js`],{cwd:repoDir,env:{...process.env,...(corrective?{BENCH_RETAIN_D3B:'1'}:{})},stdio:['ignore','pipe','pipe']});let logs='';for(const s of [child.stdout,child.stderr])s.on('data',b=>{const text=sanitize(b.toString());logs+=text;process.stdout.write(text);});let timeout=false;const timer=setTimeout(()=>{timeout=true;child.kill('SIGTERM');},900000);const [code]=await once(child,'exit');clearTimeout(timer);await writeFile(`${benchDir}runtime/section-${letter}${corrective?'-corrective':''}.log`,logs);console.log(`Section ${letter} exited ${code}${timeout?' (15-minute outer deadline)':''}`);await appendFile(`${benchDir}runtime/order.ndjson`,JSON.stringify({letter,corrective,event:'end',at:new Date().toISOString(),code,timeout})+'\n');}
