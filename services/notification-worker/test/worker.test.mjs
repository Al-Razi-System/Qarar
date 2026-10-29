import assert from "node:assert/strict";
import test from "node:test";
import { runDeliveryBatch } from "../src/worker.mjs";
import { ProviderError } from "../src/provider.mjs";

test("worker renders, sends and acknowledges a delivery",async()=>{
  const calls=[];
  let claimed=false;
  const client={
    claimDeliveries:async()=>claimed?[]:(claimed=true,[{id:"11111111-1111-4111-8111-111111111111",destination:"+967771234567",template_code:"task_due_soon",variables:{action_no:"TSK-1",title_ar:"إعداد التقرير",due_date:"2026-10-22"},lock_token:"22222222-2222-4222-8222-222222222222"}]),
    completeDelivery:async(...args)=>{calls.push(["complete",...args]);return{accepted:true};}, failDelivery:async(...args)=>calls.push(["fail",...args])
  };
  const provider={code:"fake",send:async request=>{calls.push(["send",request]);return{providerCode:"fake",providerMessageId:"m1"};}};
  const result=await runDeliveryBatch({client,provider,workerId:"33333333-3333-4333-8333-333333333333"});
  assert.equal(result[0].status,"accepted");
  assert.match(calls[0][1].text,/TSK-1/);
  assert.equal(calls[1][0],"complete");
  assert.equal(calls.some(call=>call[0]==="fail"),false);
});

test("worker renders official media only for meeting invitations and preserves text fallback",async()=>{
  const calls=[];
  let claimed=false;
  const client={
    claimDeliveries:async()=>claimed?[]:(claimed=true,[{id:"11111111-1111-4111-8111-111111111111",destination:"+967771234567",template_code:"meeting_invitation",variables:{title_ar:"اجتماع مجلس الجامعة",scheduled_date:"2026-10-30",start_time:"09:00",meeting_url:"https://devqarar.example/admin/meetings/m1"},lock_token:"22222222-2222-4222-8222-222222222222"}]),
    completeDelivery:async(...args)=>{calls.push(["complete",...args]);return{accepted:true};},
    failDelivery:async(...args)=>calls.push(["fail",...args])
  };
  const mediaRenderer=async variables=>{calls.push(["render",variables]);return{base64:"png-data",mimetype:"image/png",filename:"invitation.png"};};
  const provider={code:"openwa",send:async value=>{calls.push(["send",value]);return{providerCode:"openwa-text-fallback-415",providerMessageId:"text-1"};}};
  const result=await runDeliveryBatch({client,provider,mediaRenderer});
  assert.equal(result[0].status,"accepted");
  assert.equal(calls[0][0],"render");
  assert.equal(calls[1][1].media.base64,"png-data");
  assert.match(calls[1][1].text,/اجتماع مجلس الجامعة/);
  assert.equal(calls[2][3],"openwa-text-fallback-415");
});

test("worker quarantines an ambiguous provider result instead of retrying a possibly delivered message",async()=>{
  const calls=[];
  let claimed=false;
  const client={
    claimDeliveries:async()=>claimed?[]:(claimed=true,[{id:"11111111-1111-4111-8111-111111111111",destination:"+967771234567",template_code:"task_due_soon",variables:{action_no:"TSK-1",title_ar:"إعداد التقرير",due_date:"2026-10-22"},lock_token:"22222222-2222-4222-8222-222222222222"}]),
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

test("worker quarantines a delivered message when its database receipt cannot be recorded",async()=>{
  const calls=[];
  let claimed=false;
  const client={
    claimDeliveries:async()=>claimed?[]:(claimed=true,[{id:"11111111-1111-4111-8111-111111111111",destination:"+967771234567",template_code:"task_completed",variables:{action_no:"TSK-1",title_ar:"إعداد التقرير"},lock_token:"22222222-2222-4222-8222-222222222222"}]),
    completeDelivery:async()=>({accepted:false,reason:"lease_not_current"}),
    failDelivery:async(...args)=>calls.push(["fail",...args]),
    markDeliveryAmbiguous:async(...args)=>{calls.push(["ambiguous",...args]);return{accepted:true};}
  };
  const provider={code:"openwa",send:async()=>({providerCode:"openwa",providerMessageId:"already-sent"})};
  const result=await runDeliveryBatch({client,provider});
  assert.equal(result[0].status,"ambiguous");
  assert.equal(calls.filter(call=>call[0]==="ambiguous").length,1);
  assert.equal(calls.some(call=>call[0]==="fail"),false);
});
