import assert from "node:assert/strict";
import test from "node:test";
import { QararClient } from "../src/qarar-client.mjs";

test("claims only the WhatsApp-specific notification outbox contract",async()=>{
  const calls=[];
  const client=new QararClient({
    baseUrl:"https://qarar.test",
    serviceRoleKey:"service-key",
    fetchImpl:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body)});
      return new Response("[]",{status:200,headers:{"content-type":"application/json"}});
    }
  });
  await client.claimEvents("11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222",15);
  assert.match(calls[0].url,/service_claim_whatsapp_notification_outbox$/);
  assert.equal(calls[0].body.p_limit,15);
});
