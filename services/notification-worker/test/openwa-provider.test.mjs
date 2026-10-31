import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { OpenWAProvider } from "../src/openwa-provider.mjs";
import { ProviderError } from "../src/provider.mjs";

let server; let baseUrl; let mode = "ok"; let captured; let requests;
before(async () => {
  server = createServer(async (request, response) => {
    const chunks=[]; for await (const chunk of request) chunks.push(chunk);
    captured={url:request.url,headers:request.headers,body:chunks.length?JSON.parse(Buffer.concat(chunks)):null};
    requests.push(captured);
    if (request.method === "GET" && request.url === "/api/sessions") {
      response.writeHead(200,{"content-type":"application/json"});
      response.end(JSON.stringify([{id:"78086dde-0d9f-4feb-9296-7325c78cc2c0",name:"qarar-test",status:"ready"}]));
      return;
    }
    if(mode==="slow") return;
    const status=mode==="unauthorized"?401:mode==="rate"?429:mode==="server"?503:(mode==="media-rejected"&&request.url?.endsWith("/send-image"))?415:201;
    response.writeHead(status,{"content-type":"application/json"});
    response.end(status===201?JSON.stringify({messageId:"wa-message-1",timestamp:1}):JSON.stringify({message:"failed"}));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});
after(()=>new Promise(resolve=>server.close(resolve)));

const request={deliveryId:"11111111-1111-4111-8111-111111111111",destinationDigits:"967771234567",text:"رسالة اختبار"};
test("sends the exact OpenWA contract without leaking configuration into the body",async()=>{
  mode="ok"; requests=[]; const provider=new OpenWAProvider({baseUrl,sessionId:"qarar-test",apiKey:"secret"});
  const result=await provider.send(request);
  assert.equal(result.providerMessageId,"wa-message-1");
  assert.deepEqual(requests.map(item=>item.url),[
    "/api/sessions",
    "/api/sessions/78086dde-0d9f-4feb-9296-7325c78cc2c0/messages/send-text"
  ]);
  assert.equal(captured.headers["x-api-key"],"secret");
  assert.equal(captured.headers["x-qarar-delivery-id"],request.deliveryId);
  assert.deepEqual(captured.body,{chatId:"967771234567@c.us",text:"رسالة اختبار"});
});
test("sends an invitation image as base64 and falls back to the full text when media is rejected",async()=>{
  requests=[];
  const provider=new OpenWAProvider({baseUrl,sessionId:"qarar-test",apiKey:"secret"});
  const mediaRequest={...request,media:{base64:"iVBORw0KGgo=",mimetype:"image/png",filename:"meeting-invitation.png"}};
  mode="ok";
  const imageResult=await provider.send(mediaRequest);
  assert.equal(imageResult.providerCode,"openwa");
  assert.equal(requests[1].url,"/api/sessions/78086dde-0d9f-4feb-9296-7325c78cc2c0/messages/send-image");
  assert.deepEqual(requests[1].body,{chatId:"967771234567@c.us",base64:"iVBORw0KGgo=",mimetype:"image/png",filename:"meeting-invitation.png",caption:"رسالة اختبار"});

  requests=[]; mode="media-rejected";
  const fallback=await provider.send(mediaRequest);
  assert.match(fallback.providerCode,/^openwa-text-fallback-/);
  assert.deepEqual(requests.map(item=>item.url),[
    "/api/sessions/78086dde-0d9f-4feb-9296-7325c78cc2c0/messages/send-image",
    "/api/sessions/78086dde-0d9f-4feb-9296-7325c78cc2c0/messages/send-text"
  ]);
});
test("fails safely when the configured session name does not exist",async()=>{
  requests=[];
  const provider=new OpenWAProvider({baseUrl,sessionId:"missing-session",apiKey:"secret"});
  await assert.rejects(
    provider.send(request),
    error=>error instanceof ProviderError&&error.code==="OPENWA_SESSION_NOT_FOUND"&&!error.retryable
  );
  assert.deepEqual(requests.map(item=>item.url),["/api/sessions"]);
});
test("authentication failure is terminal",async()=>{
  mode="unauthorized"; requests=[]; const provider=new OpenWAProvider({baseUrl,sessionId:"qarar-test",apiKey:"bad"});
  await assert.rejects(provider.send(request),error=>error instanceof ProviderError&&error.code==="OPENWA_HTTP_401"&&!error.retryable);
});
test("rate limit and server failures are retryable",async()=>{
  requests=[]; const provider=new OpenWAProvider({baseUrl,sessionId:"qarar-test",apiKey:"key"});
  mode="rate"; await assert.rejects(provider.send(request),error=>error.code==="OPENWA_HTTP_429"&&error.retryable);
  mode="server"; await assert.rejects(provider.send(request),error=>error.code==="OPENWA_HTTP_503"&&error.retryable);
});
test("timeout is retryable but marked ambiguous",async()=>{
  mode="slow"; requests=[]; const provider=new OpenWAProvider({baseUrl,sessionId:"qarar-test",apiKey:"key",timeoutMs:20});
  await assert.rejects(provider.send(request),error=>error.code==="OPENWA_TIMEOUT"&&error.retryable&&error.ambiguous);
});
