import {test} from 'node:test';
import assert from 'node:assert/strict';
import {failureDetails} from './report-e2e-failures.mjs';
test('reports final errors for every project without duplicating retries or leaking passed results',()=>{
  const testResult=(projectName)=>({projectName,status:'unexpected',results:[{error:{message:'old retry'}},{error:{message:'final real cause'}}]});
  const text=failureDetails({
    suites:[{specs:[{
      file:'journey.ts',line:10,title:'create',
      tests:[testResult('desktop'),testResult('mobile'),{status:'expected',results:[{error:{message:'not a failure'}}]}],
    }]}],
    errors:[{message:'setup cause'}],
  });
  assert.match(text,/desktop/);assert.match(text,/mobile/);assert.match(text,/final real cause/);assert.match(text,/setup cause/);
  assert.doesNotMatch(text,/old retry|not a failure/);
});
