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

const ARABIC_DIGITS = new Map([
  ["٠","0"],["١","1"],["٢","2"],["٣","3"],["٤","4"],
  ["٥","5"],["٦","6"],["٧","7"],["٨","8"],["٩","9"],
  ["۰","0"],["۱","1"],["۲","2"],["۳","3"],["۴","4"],
  ["۵","5"],["۶","6"],["۷","7"],["۸","8"],["۹","9"]
]);

export function normalizeE164(value) {
  if (typeof value !== "string") return null;
  let compact = [...value.trim()].map(character=>ARABIC_DIGITS.get(character)??character).join("").replace(/[\s().-]/g, "");
  if (compact.startsWith("00")) compact=`+${compact.slice(2)}`;
  if (/^9677[0-9]{8}$/.test(compact)) compact=`+${compact}`;
  if (/^07[0-9]{8}$/.test(compact)) compact=`+967${compact.slice(1)}`;
  if (/^7[0-9]{8}$/.test(compact)) compact=`+967${compact}`;
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
      if (context.channel_enabled === false || context.event_enabled === false) {
        await client.skipDelivery(event.id, event.lock_token, templateCode, context.channel_enabled === false ? "CHANNEL_DISABLED" : "EVENT_DISABLED");
        results.push({ id: event.id, status: "disabled" });
        continue;
      }
      const destination = normalizeE164(context.mobile);
      if (!context.recipient_active || !destination) {
        await client.skipDelivery(event.id, event.lock_token, templateCode, context.recipient_active ? "DESTINATION_INVALID" : "RECIPIENT_INACTIVE");
        results.push({ id: event.id, status: "skipped" });
        continue;
      }
      await client.materializeDelivery(event.id, event.lock_token, templateCode, destination, {
        ...context.payload,
        recipient_name_ar: context.recipient_name_ar,
        custom_intro: context.custom_intro,
        custom_action: context.custom_action
      });
      results.push({ id: event.id, status: "queued" });
    } catch (error) {
      await client.failEvent(event.id, event.lock_token, "DISPATCH_FAILED");
      results.push({ id: event.id, status: "failed" });
    }
  }
  return results;
}
