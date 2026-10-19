import assert from "node:assert/strict";
import test from "node:test";
import { normalizeE164, runDispatchBatch, templateFor } from "../src/dispatcher.mjs";

test("maps business events without provider knowledge",()=>{
  assert.equal(templateFor({event_type:"meeting.invitation.requested",payload:{}}),"meeting_invitation");
  assert.equal(templateFor({event_type:"execution.task.created",payload:{recipient_role:"follower"}}),"task_created_follower");
  assert.equal(templateFor({event_type:"unknown",payload:{}}),null);
  assert.equal(normalizeE164("+967 77 123 4567"),"+967771234567");
  assert.equal(normalizeE164("0771234567"),null);
});

test("materializes a valid recipient and skips a missing number",async()=>{
  const calls=[];
  const events=[{id:"e1",lock_token:"l1"},{id:"e2",lock_token:"l2"}];
  const client={
    claimEvents:async()=>events,
    getDispatchContext:async id=>id==="e1"?{event_type:"execution.task.created",recipient_active:true,mobile:"+967771234567",payload:{recipient_role:"assignee",action_no:"TSK-1",title_ar:"مهمة"}}:{event_type:"execution.task.created",recipient_active:true,mobile:null,payload:{recipient_role:"follower"}},
    materializeDelivery:async(...args)=>calls.push(["materialize",...args]),
    skipDelivery:async(...args)=>calls.push(["skip",...args]),
    failEvent:async(...args)=>calls.push(["fail",...args])
  };
  const result=await runDispatchBatch({client,workerId:"w"});
  assert.deepEqual(result.map(x=>x.status),["queued","skipped"]);
  assert.equal(calls[0][0],"materialize");
  assert.equal(calls[0][3],"task_created_assignee");
  assert.equal(calls[1][0],"skip");
  assert.equal(calls.some(x=>x[0]==="fail"),false);
});
