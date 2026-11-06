export class QararClient {
  constructor({ baseUrl, serviceRoleKey, fetchImpl = fetch }) {
    this.baseUrl = new URL(baseUrl).toString().replace(/\/$/, "");
    if (!serviceRoleKey) throw new TypeError("Supabase service role key is required");
    this.serviceRoleKey = serviceRoleKey;
    this.fetchImpl = fetchImpl;
  }

  async rpc(name, body) {
    const response = await this.fetchImpl(`${this.baseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: this.serviceRoleKey, authorization: `Bearer ${this.serviceRoleKey}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`QARAR_RPC_${name}_${response.status}`);
    return response.json();
  }

  claimEvents(workerId, lockToken, limit = 10) {
    return this.rpc("service_claim_whatsapp_notification_outbox", { p_worker_id: workerId, p_lock_token: lockToken, p_limit: limit, p_lease_seconds: 60 });
  }
  getDispatchContext(eventId, lockToken) {
    return this.rpc("service_get_notification_dispatch_context", { p_event_id: eventId, p_lock_token: lockToken });
  }
  materializeDelivery(eventId, lockToken, templateCode, destination, variables) {
    return this.rpc("service_materialize_notification_delivery", { p_event_id: eventId, p_lock_token: lockToken, p_channel: "whatsapp", p_template_code: templateCode, p_template_version: "v1", p_destination: destination, p_variables: variables });
  }
  skipDelivery(eventId, lockToken, templateCode, reasonCode) {
    return this.rpc("service_skip_notification_delivery", { p_event_id: eventId, p_lock_token: lockToken, p_channel: "whatsapp", p_template_code: templateCode, p_template_version: "v1", p_reason_code: reasonCode });
  }
  failEvent(eventId, lockToken, errorCode) {
    return this.rpc("service_fail_notification_outbox", { p_event_id: eventId, p_lock_token: lockToken, p_error: errorCode });
  }

  claimDeliveries(workerId, lockToken, limit = 10) {
    return this.rpc("service_claim_notification_deliveries", { p_worker_id: workerId, p_lock_token: lockToken, p_channel: "whatsapp", p_limit: limit, p_lease_seconds: 60 });
  }
  completeDelivery(deliveryId, lockToken, providerCode, providerMessageId) {
    return this.rpc("service_complete_notification_delivery", { p_delivery_id: deliveryId, p_lock_token: lockToken, p_provider_code: providerCode, p_provider_message_id: providerMessageId });
  }
  failDelivery(deliveryId, lockToken, errorCode, providerCode, httpStatus) {
    return this.rpc("service_fail_notification_delivery", { p_delivery_id: deliveryId, p_lock_token: lockToken, p_error_code: errorCode, p_provider_code: providerCode, p_http_status: httpStatus });
  }
  markDeliveryAmbiguous(deliveryId, lockToken, errorCode, providerCode) {
    return this.rpc("service_mark_notification_delivery_ambiguous", { p_delivery_id: deliveryId, p_lock_token: lockToken, p_error_code: errorCode, p_provider_code: providerCode });
  }
}
