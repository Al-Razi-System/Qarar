import assert from "node:assert/strict";
import test from "node:test";
import { runDeliveryBatch } from "../src/worker.mjs";
import { ProviderError } from "../src/provider.mjs";

test("worker renders, sends and acknowledges a delivery",async()=>{
  const calls=[];
  const client={
    claimDeliveries:async()=>[{id:"11111111-1111-4111-8111-111111111111",destination:"+967771234567",template_code:"task_due_soon",variables:{action_no:"TSK-1",title_ar:"إعداد التقرير",due_date:"2026-10-22"},lock_token:"22222222-2222-4222-8222-222222222222"}],
    completeDelivery:async(...args)=>calls.push(["complete",...args]), failDelivery:async(...args)=>calls.push(["fail",...args])
  };
  const provider={code:"fake",send:async request=>{calls.push(["send",request]);return{providerCode:"fake",providerMessageId:"m1"};}};
  const result=await runDeliveryBatch({client,provider,workerId:"33333333-3333-4333-8333-333333333333"});
  assert.equal(result[0].status,"accepted");
  assert.match(calls[0][1].text,/TSK-1/);
  assert.equal(calls[1][0],"complete");
  assert.equal(calls.some(call=>call[0]==="fail"),false);
});

test("worker quarantines an ambiguous provider result instead of retrying a possibly delivered message",async()=>{
  const calls=[];
  const client={
    claimDeliveries:async()=>[{id:"11111111-1111-4111-8111-111111111111",destination:"+967771234567",template_code:"task_due_soon",variables:{action_no:"TSK-1",title_ar:"إعداد التقرير",due_date:"2026-10-22"},lock_token:"22222222-2222-4222-8222-222222222222"}],
    completeDelivery:async(...args)=>calls.push(["complete",...args]),
    failDelivery:async(...args)=>calls.push(["fail",...args]),
    markDeliveryAmbiguous:async(...args)=>calls.push(["ambiguous",...args])
  };
  const provider={code:"openwa",send:async()=>{throw new ProviderError("OPENWA_TIMEOUT","timeout",{retryable:true,ambiguous:true});}};
  const result=await runDeliveryBatch({client,provider});
  assert.deepEqual(result,[{id:"11111111-1111-4111-8111-111111111111",status:"ambiguous",retryable:false,ambiguous:true}]);
  assert.equal(calls.filter(call=>call[0]==="ambiguous").length,1);
  assert.equal(calls.some(call=>call[0]==="fail"),false);
});
