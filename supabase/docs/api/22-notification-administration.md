# Notification administration

The dashboard notification workspace uses four authenticated contracts, all restricted
to the current organization's system administrator:

- `admin_get_notification_workspace` reads channel state, reminder policy, templates,
  connection metadata, and the bounded delivery log.
- `admin_save_notification_settings` saves the enabled state, reminder intervals, and
  templates with an expected version. Provider secrets are never returned.
- `admin_begin_notification_test` creates an auditable WhatsApp test delivery before
  the external provider is called.
- `admin_finish_notification_test` records the single accepted or failed provider
  result. Repeated or cross-tenant completion is rejected.

Provider linking, unlinking, QR display, and direct test transport run through the
dashboard server route; browser clients do not receive OpenWA credentials or the
service-role key. Meeting and task state never depends on WhatsApp availability.

## Oversight messages (2026-11-12)

Three WhatsApp messages carry council oversight: `oversight_violation` (to a council's chair and rapporteur),
`oversight_escalation` (to the next level of followers) and `oversight_digest` (one morning summary per follower,
07:05 Riyadh, job `qarar-oversight-digest`). Unlike the other templates they are **disabled until the administrator
enables them** here, so enabling oversight never sends unexpected messages; while disabled, their events are claimed
and skipped as `EVENT_DISABLED`. The event-to-template mapping lives in `qarar_governance.notification_template_code`
and the default in `qarar_governance.notification_template_enabled`. Links in these messages are built by the worker
from the configured application origin and the internal `/admin/...` path the database wrote; any other link is dropped.

