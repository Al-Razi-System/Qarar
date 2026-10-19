import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { OpenWAProvider } from "../src/openwa-provider.mjs";
import { ProviderError } from "../src/provider.mjs";

let server; let baseUrl; let mode = "ok"; let captured;
before(async () => {
  server = createServer(async (request, response) => {
    const chunks=[]; for await (const chunk of request) chunks.push(chunk);
    captured={url:request.url,headers:request.headers,body:chunks.length?JSON.parse(Buffer.concat(chunks)):null};
    if(mode==="slow") return;
    const status=mode==="unauthorized"?401:mode==="rate"?429:mode==="server"?503:201;
    response.writeHead(status,{"content-type":"application/json"});
    response.end(status===201?JSON.stringify({messageId:"wa-message-1",timestamp:1}):JSON.stringify({message:"failed"}));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});
after(()=>new Promise(resolve=>server.close(resolve)));

const request={deliveryId:"11111111-1111-4111-8111-111111111111",destinationDigits:"967771234567",text:"رسالة اختبار"};
test("sends the exact OpenWA contract without leaking configuration into the body",async()=>{
  mode="ok"; const provider=new OpenWAProvider({baseUrl,sessionId:"qarar-test",apiKey:"secret"});
  const result=await provider.send(request);
  assert.equal(result.providerMessageId,"wa-message-1");
  assert.equal(captured.url,"/api/sessions/qarar-test/messages/send-text");
  assert.equal(captured.headers["x-api-key"],"secret");
  assert.equal(captured.headers["x-qarar-delivery-id"],request.deliveryId);
  assert.deepEqual(captured.body,{chatId:"967771234567@c.us",text:"رسالة اختبار"});
});
test("authentication failure is terminal",async()=>{
  mode="unauthorized"; const provider=new OpenWAProvider({baseUrl,sessionId:"s",apiKey:"bad"});
  await assert.rejects(provider.send(request),error=>error instanceof ProviderError&&error.code==="OPENWA_HTTP_401"&&!error.retryable);
});
test("rate limit and server failures are retryable",async()=>{
  const provider=new OpenWAProvider({baseUrl,sessionId:"s",apiKey:"key"});
  mode="rate"; await assert.rejects(provider.send(request),error=>error.code==="OPENWA_HTTP_429"&&error.retryable);
  mode="server"; await assert.rejects(provider.send(request),error=>error.code==="OPENWA_HTTP_503"&&error.retryable);
});
test("timeout is retryable but marked ambiguous",async()=>{
  mode="slow"; const provider=new OpenWAProvider({baseUrl,sessionId:"s",apiKey:"key",timeoutMs:20});
  await assert.rejects(provider.send(request),error=>error.code==="OPENWA_TIMEOUT"&&error.retryable&&error.ambiguous);
});
