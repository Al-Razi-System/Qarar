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

`p_decision` is `accept` or `reject`. Rejection requires at least five characters. For a legacy
topic without a governed workflow, acceptance atomically moves `topics.current_unit_id`. For a
governed topic, the referral is a temporary consultation: acceptance records the response but keeps
the topic with its active workflow step and council. Both outcomes store responder, response
reason/time, `route_effect`, and an audit event.

## Return and Resubmission Across Councils

`get_topic_return_option` evaluates a topic in a draft/scheduled meeting and exposes the return
action only to the contextual chair. `return_topic_to_previous_council` requires a reason of at
least ten characters, an idempotency key, and the current step version. It preserves the completed
cycle and opens a new cycle at the previous council; returning from the first council blocks the
workflow and returns the topic to its submitter.

The submitter then reads `get_topic_resubmission_option`. When available,
`resubmit_returned_topic` validates mandatory requirements, opens a new first-council cycle, and
returns the topic to that council's proposal queue. Other users receive no enabled action and
cannot invoke the mutation.

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
