import assert from "node:assert/strict";
import test from "node:test";
import { normalizeE164, runDispatchBatch, templateFor } from "../src/dispatcher.mjs";

test("maps business events without provider knowledge",()=>{
  assert.equal(templateFor({event_type:"meeting.invitation.requested",payload:{}}),"meeting_invitation");
  assert.equal(templateFor({event_type:"execution.task.created",payload:{recipient_role:"follower"}}),"task_created_follower");
  assert.equal(templateFor({event_type:"meeting.cycle.overdue",payload:{}}),"meeting_cycle_overdue");
  assert.equal(templateFor({event_type:"meeting.postponed",payload:{}}),"meeting_postponed");
  assert.equal(templateFor({event_type:"meeting.cancelled",payload:{}}),"meeting_cancelled");
  assert.equal(templateFor({event_type:"meeting.invitation.updated",payload:{}}),"meeting_invitation_updated");
  assert.equal(templateFor({event_type:"execution.task.submitted",payload:{}}),"task_submitted");
  assert.equal(templateFor({event_type:"unknown",payload:{}}),null);
  assert.equal(normalizeE164("+967 77 123 4567"),"+967771234567");
  assert.equal(normalizeE164("776464178"),"+967776464178");
  assert.equal(normalizeE164("0776464178"),"+967776464178");
  assert.equal(normalizeE164("771234567"),"+967771234567");
  assert.equal(normalizeE164("14155552671"),null);
  assert.equal(normalizeE164(null),null);
});

test("continues past missing recipients and normalizes local Yemeni mobiles",async()=>{
  const calls=[];
  const events=[{id:"missing",lock_token:"l1"},{id:"local",lock_token:"l2"}];
  const client={
    claimEvents:async()=>events,
    getDispatchContext:async id=>id==="missing"
      ?{event_type:"meeting.invitation.requested",recipient_active:true,mobile:null,payload:{meeting_no:"MTG-1"}}
      :{event_type:"meeting.invitation.requested",recipient_active:true,mobile:"776464178",payload:{meeting_no:"MTG-1"}},
    materializeDelivery:async(...args)=>calls.push(["materialize",...args]),
    skipDelivery:async(...args)=>calls.push(["skip",...args]),
    failEvent:async(...args)=>calls.push(["fail",...args])
  };
  const result=await runDispatchBatch({client,workerId:"w"});
  assert.deepEqual(result.map(x=>x.status),["skipped","queued"]);
  assert.equal(calls[0][0],"skip");
  assert.equal(calls[0][4],"DESTINATION_INVALID");
  assert.equal(calls[1][0],"materialize");
  assert.equal(calls[1][4],"+967776464178");
  assert.equal(calls.some(x=>x[0]==="fail"),false);
});

test("materializes a valid recipient and skips a missing number",async()=>{
  const calls=[];
  const events=[{id:"e1",lock_token:"l1"},{id:"e2",lock_token:"l2"}];
  const client={
    claimEvents:async()=>events,
    getDispatchContext:async id=>id==="e1"?{event_type:"execution.task.created",recipient_active:true,recipient_name_ar:"أحمد علي",mobile:"+967771234567",payload:{recipient_role:"assignee",action_no:"TSK-1",title_ar:"مهمة"}}:{event_type:"execution.task.created",recipient_active:true,mobile:null,payload:{recipient_role:"follower"}},
    materializeDelivery:async(...args)=>calls.push(["materialize",...args]),
    skipDelivery:async(...args)=>calls.push(["skip",...args]),
    failEvent:async(...args)=>calls.push(["fail",...args])
  };
  const result=await runDispatchBatch({client,workerId:"w",appBaseUrl:"https://devqarar.prideidea.com"});
  assert.deepEqual(result.map(x=>x.status),["queued","skipped"]);
  assert.equal(calls[0][0],"materialize");
  assert.equal(calls[0][3],"task_created_assignee");
  assert.equal(calls[0][5].recipient_name_ar,"أحمد علي");
  assert.equal(calls[0][5].task_url,undefined);
  assert.equal(calls[1][0],"skip");
  assert.equal(calls.some(x=>x[0]==="fail"),false);
});

test("builds login-protected meeting and task links only from the configured application origin", async () => {
  const variables=[];
  const client={
    claimEvents:async()=>[
      {id:"meeting",lock_token:"l1"},
      {id:"task",lock_token:"l2"}
    ],
    getDispatchContext:async id=>id==="meeting"
      ? {event_type:"meeting.invitation.requested",recipient_active:true,mobile:"+967771234567",payload:{meeting_id:"11111111-1111-4111-8111-111111111111",meeting_url:"https://evil.example/leak"}}
      : {event_type:"execution.task.created",recipient_active:true,mobile:"+967771234567",payload:{recipient_role:"assignee",action_item_id:"22222222-2222-4222-8222-222222222222"}},
    materializeDelivery:async(_id,_lock,_code,_destination,value)=>variables.push(value),
    skipDelivery:async()=>{},failEvent:async()=>{}
  };
  await runDispatchBatch({client,appBaseUrl:"https://devqarar.prideidea.com/"});
  assert.equal(variables[0].meeting_url,"https://devqarar.prideidea.com/admin/meetings/11111111-1111-4111-8111-111111111111");
  assert.equal(variables[1].task_url,"https://devqarar.prideidea.com/admin/tasks?task=22222222-2222-4222-8222-222222222222");
});

test("skips a disabled channel before materializing",async()=>{
  const calls=[];
  const client={claimEvents:async()=>[{id:"e1",lock_token:"l1"}],getDispatchContext:async()=>({event_type:"meeting.invitation.requested",payload:{},recipient_active:true,mobile:"+967771234567",channel_enabled:false,event_enabled:true}),skipDelivery:async(...args)=>calls.push(args),failEvent:async()=>{throw new Error("unexpected")}};
  const result=await runDispatchBatch({client});
  assert.equal(result[0].status,"disabled");
  assert.equal(calls[0][3],"CHANNEL_DISABLED");
});
