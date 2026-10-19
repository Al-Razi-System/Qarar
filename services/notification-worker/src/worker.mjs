import { randomUUID } from "node:crypto";
import { ProviderError } from "./provider.mjs";
import { renderTemplate } from "./templates.mjs";

export async function runDeliveryBatch({ client, provider, workerId = randomUUID(), limit = 10 }) {
  const lockToken = randomUUID();
  const deliveries = await client.claimDeliveries(workerId, lockToken, limit);
  const results = [];
  for (const delivery of deliveries) {
    try {
      const text = renderTemplate(delivery.template_code, delivery.variables);
      const accepted = await provider.send({
        deliveryId: delivery.id,
        destinationDigits: delivery.destination.replace(/^\+/, ""),
        text
      });
      await client.completeDelivery(delivery.id, delivery.lock_token, accepted.providerCode, accepted.providerMessageId);
      results.push({ id: delivery.id, status: "accepted" });
    } catch (error) {
      const known = error instanceof ProviderError;
      await client.failDelivery(delivery.id, delivery.lock_token, known ? error.code : "WORKER_UNEXPECTED", provider.code, known ? error.httpStatus : null);
      results.push({ id: delivery.id, status: "failed", retryable: known && error.retryable, ambiguous: known && error.ambiguous });
    }
  }
  return results;
}
