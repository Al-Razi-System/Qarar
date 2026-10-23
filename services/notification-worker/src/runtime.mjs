import { runDeliveryBatch } from "./worker.mjs";
import { runDispatchBatch } from "./dispatcher.mjs";

export async function runWorkerCycle({client,provider,limit=25}) {
  const dispatched=await runDispatchBatch({client,limit});
  const delivered=await runDeliveryBatch({client,provider,limit});
  return {dispatched,delivered};
}

function wait(milliseconds,signal) {
  return new Promise(resolve=>{
    if(signal?.aborted) return resolve();
    const timeout=setTimeout(done,milliseconds);
    function done(){
      clearTimeout(timeout);
      signal?.removeEventListener("abort",done);
      resolve();
    }
    signal?.addEventListener("abort",done,{once:true});
  });
}

export async function runWorkerLoop({runOnce,intervalMs,signal,sleep=wait,onResult=console.log,onError=console.error}) {
  while(!signal?.aborted) {
    try {
      const result=await runOnce();
      onResult?.(JSON.stringify({at:new Date().toISOString(),...result}));
    } catch(error) {
      onError?.(error);
    }
    if(signal?.aborted) break;
    await sleep(intervalMs,signal);
  }
}
