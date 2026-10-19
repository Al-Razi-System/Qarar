import { randomUUID } from "node:crypto";

export function templateFor(context) {
  const role = context.payload?.recipient_role;
  switch (context.event_type) {
    case "meeting.invitation.requested": return "meeting_invitation";
    case "meeting.reminder.due": return "meeting_reminder";
    case "meeting.cycle.due_soon": return "meeting_cycle_due_soon";
    case "meeting.cycle.overdue": return "meeting_cycle_overdue";
    case "execution.task.created": return role === "follower" ? "task_created_follower" : "task_created_assignee";
    case "execution.task.due_soon": return "task_due_soon";
    case "execution.task.overdue": return "task_overdue";
    case "execution.task.submitted": return "task_submitted";
    case "execution.task.returned": return "task_returned";
    case "execution.task.completed": return "task_completed";
    default: return null;
  }
}

export function normalizeE164(value) {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/[\s()-]/g, "");
  return /^\+[1-9][0-9]{7,14}$/.test(compact) ? compact : null;
}

export async function runDispatchBatch({ client, workerId = randomUUID(), limit = 10 }) {
  const lockToken = randomUUID();
  const events = await client.claimEvents(workerId, lockToken, limit);
  const results = [];
  for (const event of events) {
    try {
      const context = await client.getDispatchContext(event.id, event.lock_token);
      const templateCode = templateFor(context);
      if (!templateCode) {
        await client.failEvent(event.id, event.lock_token, `UNSUPPORTED_EVENT:${context.event_type}`);
        results.push({ id: event.id, status: "unsupported" });
        continue;
      }
      const destination = normalizeE164(context.mobile);
      if (!context.recipient_active || !destination) {
        await client.skipDelivery(event.id, event.lock_token, templateCode, context.recipient_active ? "DESTINATION_INVALID" : "RECIPIENT_INACTIVE");
        results.push({ id: event.id, status: "skipped" });
        continue;
      }
      await client.materializeDelivery(event.id, event.lock_token, templateCode, destination, context.payload);
      results.push({ id: event.id, status: "queued" });
    } catch (error) {
      await client.failEvent(event.id, event.lock_token, "DISPATCH_FAILED");
      results.push({ id: event.id, status: "failed" });
    }
  }
  return results;
}
