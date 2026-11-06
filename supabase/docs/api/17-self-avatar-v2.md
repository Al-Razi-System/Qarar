# Self-service avatar (api_v2)

Authenticated active users manage only their own image. No target user or
organization argument exists, and IAM administration is not required. Temporary
password-gated accounts cannot use these contracts. Direct table access is denied.

`get_my_avatar_v2(p_include_content boolean = false)` returns
`{revision, has_image, content_base64}`. The last field is null unless explicitly
requested. An account without a stored avatar returns revision zero. No image
is added to the existing access-context or account response.

`set_my_avatar_v2(p_content_base64 text, p_expected_revision integer, p_request_id uuid)`
returns `{saved: true, revision, has_image}`. Null content removes the image while
retaining its revision. A stale revision or a changed replay payload returns
`PT409`/HTTP 409. Repeating the latest identical request safely returns its receipt.
Writes lock the current user's row and save an actor-bound audit event atomically.
Audit events contain revision/request metadata, never image content.

The dashboard accepts genuine PNG/JPEG up to 2MiB, decodes with bounded dimensions,
removes metadata and re-encodes a square 512×512 JPEG before this RPC. The database
limits stored JPEG bytes to 512KiB. Originals and client filenames are not retained.

`/api/account/avatar`: GET streams the current user's JPEG with `private, no-store`
and `nosniff`; no image returns 204. GET `?metadata=1` returns only revision and
has_image. POST/DELETE take multipart `revision` and generated `request_id`; POST
also takes `file`. A supplied `user_id` is rejected. Writes enforce trusted origin,
session/MFA and actual request size. UI mutations stop after an uncertain result
until metadata is read again. No public URL or service-role image access exists.
