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
