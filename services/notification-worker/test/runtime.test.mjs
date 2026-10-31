import assert from "node:assert/strict";
import test from "node:test";
import { runWorkerLoop } from "../src/runtime.mjs";

test("keeps polling and waits between worker cycles",async()=>{
  let cycles=0;
  const waits=[];
  const controller=new AbortController();
  await runWorkerLoop({
    runOnce:async()=>{
      cycles+=1;
      if(cycles===3) controller.abort();
      return {dispatched:[],delivered:[]};
    },
    intervalMs:2500,
    signal:controller.signal,
    sleep:async milliseconds=>waits.push(milliseconds)
  });
  assert.equal(cycles,3);
  assert.deepEqual(waits,[2500,2500]);
});

test("does not spin when a cycle fails",async()=>{
  let cycles=0;
  const waits=[];
  const controller=new AbortController();
  await runWorkerLoop({
    runOnce:async()=>{
      cycles+=1;
      if(cycles===1) throw new Error("temporary database failure");
      controller.abort();
      return {dispatched:[],delivered:[]};
    },
    intervalMs:1000,
    signal:controller.signal,
    sleep:async milliseconds=>waits.push(milliseconds),
    onError:()=>{}
  });
  assert.equal(cycles,2);
  assert.deepEqual(waits,[1000]);
});
