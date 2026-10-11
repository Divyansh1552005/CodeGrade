import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import dotenv from 'dotenv';
const folder=new URL('./',import.meta.url),report=JSON.parse(await readFile(new URL('results.json',folder),'utf8')),guide=await readFile(new URL('TESTING_GUIDE.md',folder),'utf8');
const literalPattern=/(?<![A-Za-z0-9_])\d+(?:\.\d+)?(?![A-Za-z0-9_])/g;
const supported=new Set(JSON.stringify(report).match(literalPattern)||[]),numbers=guide.match(literalPattern)||[];
const unsupported=[...new Set(numbers.filter(n=>!supported.has(n)))];
assert.deepEqual(unsupported,[],`Guide numbers absent from results.json: ${unsupported.join(', ')}`);
let copied=0;
for(const line of guide.split('\n')){
 const fields=line.split('|').map(x=>x.trim());
 if(!/^[A-J]\d+(?:[ab])?$/.test(fields[1]||'')||!fields[2]||!/^[\d.]+$/.test(fields[3]||''))continue;
 const source=fields[2].split('.').reduce((v,k)=>v?.[k],report.tests[fields[1]]?.measurements);
 assert.notEqual(source,undefined,`Missing numeric path ${fields[1]}.${fields[2]}`);
 assert.equal(String(source),fields[3],`Mismatched numeric copy ${fields[1]}.${fields[2]}`);copied++;
}
assert.equal(copied,report.documentation.numericCheatSheetRows);
for(const[id,t]of Object.entries(report.tests)){assert(guide.includes(`#### ${id}\n`),`Missing guide explanation ${id}`);assert(guide.includes(t.command),`Missing rerun command ${id}`);}
assert(report.providerUsage.realJudge0HttpRequests<=report.providerUsage.judge0Limit);
assert(report.providerUsage.realLLMInvocations<=report.providerUsage.llmLimit);
const config=dotenv.parse(await readFile(new URL('../../.env',folder)).catch(()=>''));
const forbidden=Object.entries(config).filter(([k,v])=>/KEY|SECRET|PASSWORD|TOKEN|URI|URL/.test(k)&&v&&v.length>8).map(([,v])=>v);
for(const file of ['results.json','RESULTS.md','TESTING_GUIDE.md','README.md']){const text=await readFile(new URL(file,folder),'utf8');for(const value of forbidden)assert(!text.includes(value),`Secret appeared in ${file}`);}
report.documentation.crossCheck={passed:true,copiedMeasurementNumbers:copied,numericLiteralOccurrences:numbers.length,unsupportedNumbers:unsupported.length,allTestCommandsPresent:true,providerBudgetsWithinLimits:true,secretsScanPassed:true};
await writeFile(new URL('results.json',folder),JSON.stringify(report,null,2));
console.log(JSON.stringify(report.documentation.crossCheck,null,2));
