# Topic Referrals API

All calls are authenticated RPC requests. Direct writes to `topic_referrals` are revoked.

## Request Referral

Permission: `topics.refer` on the topic's current unit.

`POST /rest/v1/rpc/refer_topic`

```json
{
  "p_topic_id": "<uuid>",
  "p_to_unit_id": "<uuid>",
  "p_reason": "سبب الإحالة إلى الوحدة المستهدفة",
  "p_expected_updated_at": "<topic.updated_at>"
}
```

The destination must be an active unit in the same organization and differ from the current unit.
Only one pending referral per topic is allowed. The topic does not move until acceptance.

## Accept or Reject

Permission: `topics.refer` on the destination unit.

`POST /rest/v1/rpc/respond_topic_referral`

```json
{
  "p_referral_id": "<uuid>",
  "p_decision": "accept",
  "p_reason": "تمت المراجعة والقبول"
}
```

`p_decision` is `accept` or `reject`. Rejection requires at least five characters. Acceptance
atomically moves `topics.current_unit_id`; both outcomes store responder, response reason/time, and
an audit event.

## Route History

`POST /rest/v1/rpc/get_topic_route_history`

```json
{"p_topic_id":"<uuid>"}
```

Returns a chronological array with source/destination unit names, request reason and author,
decision status, response reason/user/time, and timestamps. Access is available to the submitter,
system administrators, and users with referral/read permission in the relevant route context.

## Errors

| Message/state | Client action |
|---|---|
| SQLSTATE `40001` | Reload topic before retrying referral |
| SQLSTATE `42501` | Do not expose the operation |
| Pending referral already exists | Show the pending request instead of creating another |
| Topic route changed | Reload topic and referral |
| Pending referral not found | The request was already answered or is inaccessible |
