import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function failureDetails(report) {
  const lines=[];
  function visit(suites) {
    for(const suite of suites??[]) {
      for(const spec of suite.specs??[]) for(const test of spec.tests??[]) {
        if(test.status!=='unexpected') continue;
        const last=test.results?.at(-1);
        const message=last?.error?.message??last?.errors?.map(error=>error.message).join('\n')??'No error detail was recorded';
        lines.push(`[${test.projectName}] ${spec.file}:${spec.line} ${spec.title}\n${message.slice(0,2500)}`);
      }
      visit(suite.suites);
    }
  }
  visit(report.suites);
  for(const error of report.errors??[]) lines.push(String(error.message??error).slice(0,2500));
  return lines.join('\n\n').replace(/\u001b\[[0-9;]*m/g,'');
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const report=JSON.parse(readFileSync(new URL('../apps/dashboard/test-results/e2e-report.json',import.meta.url),'utf8'));
  let message=failureDetails(report);
  const envFile=process.env.QARAR_E2E_ENV_FILE;
  if(envFile) {
    const {parseEnv}=await import('./prepare-e2e-supabase-env.mjs');
    for(const [key,value] of Object.entries(parseEnv(readFileSync(envFile,'utf8')))) {
      if(value && /SECRET|PASS|KEY|TOKEN/.test(key)) message=message.replaceAll(value,'[REDACTED]');
    }
  }
  if(!message) message='No unexpected test errors were recorded. Inspect the JSON report for setup or interruption details.';
  const escaped=message.slice(0,60000).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
  // One annotation preserves final causes for all scenarios instead of filling
  // the step's error-annotation allowance with the first test's retries.
  console.log(`::notice title=Final E2E failure details::${escaped}`);
}
