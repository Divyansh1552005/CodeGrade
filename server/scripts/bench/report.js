import { writeFile } from 'node:fs/promises';
const clean = x => String(x).replaceAll('|','\\|').replaceAll('\n',' ');
export async function renderResults(report) {
  let out = '# CodeGrade measured results\n\nThese are observations from the original benchmark and the explicitly authorized follow-up fixes. A mock result is never evidence of provider capacity or general security. See `results.json` for attempt history and the exact application changes.\n\n## Environment\n\n```json\n'+JSON.stringify(report.environment,null,2)+'\n```\n\n## Tests\n\n| ID | Outcome | Raw result (see results.json for per-request data) | Limits |\n|---|---|---|---|\n';
  for (const [id,t] of Object.entries(report.tests)) {
    const data = { ...(t.measurements || {} ) }; for (const k of ['latenciesMs','rows','pairs','cases','payloads','samples','chunks','probes']) if (data[k]) data[k] = `Full ${k} in results.json`;
    out += `| ${id} | ${t.status} | ${clean(t.reason || JSON.stringify(data))} | ${clean(t.limits || '')} |\n`;
  }
  out += '\n## Candidate resume claims\n\nPending completion of all sections; no claims have been inferred from missing measurements.\n\n## Bugs found\n\n';
  for (const [id,t] of Object.entries(report.tests)) if (['fail','error'].includes(t.status)) out += `- **${id}**: ${t.reason || JSON.stringify(t.measurements)}. Reproduce: \`${t.command}\`.\n`;
  out += '\n## Do NOT claim\n\n- General security, an availability percentage, or exactly-once external execution.\n- Mock throughput as production throughput.\n- A blocked/skipped check as a successful check.\n- Percentile precision beyond the sample size, hardware, and test conditions.\n';
  await writeFile(new URL('./RESULTS.md',import.meta.url),out);
}
