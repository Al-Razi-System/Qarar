# Notification Outbox Operations

`qarar_governance.notification_outbox` is the durable boundary between a
governed state change and an external notification. Producers insert the event
in their original transaction; the dispatcher delivers it later through the
service-only `api_v1` contracts.

## Delivery contract

Delivery is **at least once**, never exactly once. Every webhook receiver must
deduplicate on either `event_id` or `deduplication_key`; both are sent in the
JSON envelope and in the `X-Qarar-Delivery-Id` and
`X-Qarar-Deduplication-Key` headers. A successful HTTP `2xx` is acknowledged
only after the receiver responds. A timeout after a receiver accepts a request
may cause a safe replay.

The dispatcher does not send notification content itself. Its HTTPS webhook is
an operator-provided internal adapter responsible for channel selection,
recipient policy, templates, and provider credentials. The Qarar database and
worker must never contain an SMTP/provider credential for that adapter.

## Required production configuration

The production Compose overlay forces both of the following values to `true`:

- `QARAR_OUTBOX_DISPATCHER_ENABLED`
- `QARAR_OUTBOX_REQUIRED`

`QARAR_OUTBOX_WEBHOOK_URL` must be HTTPS and
`QARAR_OUTBOX_WEBHOOK_TOKEN` must be a unique secret of at least 32 characters.
`node scripts/validate-production-env.mjs <env-file>` rejects a production
release that omits, weakens, or disables these values. The worker does not claim
an event until all of its required configuration is valid, so a configuration
mistake leaves events pending rather than pretending they were sent.

## State machine and recovery

1. `pending` / `failed`: eligible for a service-role worker claim.
2. `processing`: a worker holds a time-limited lease and opaque lock token.
3. `processed`: the receiver returned `2xx` and the matching lease was
   acknowledged.
4. `failed`: delivery failed; retry delay is exponential from 30 seconds and
   capped at one hour.
5. `dead_letter`: the eighth failed claim, or an exhausted lease, requires
   operator review. It is never retried automatically.

The worker cannot requeue a dead letter. After investigating the receiver and
recording an incident reference, a database operator may execute:

```powershell
docker exec -it qarar-supabase-db psql -X -U supabase_admin -d postgres `
  -c "select qarar_governance.requeue_notification_outbox('<event-uuid>', 'INC-1234: receiver fixed and replay approved');"
```

Do not update the table directly. The procedure resets only a reviewed
dead-letter event and retains the operator reason on the event record.

## Readiness and monitoring

Before promotion, run the runtime gate against the target database:

```powershell
$env:QARAR_OUTBOX_REQUIRED = "true"
$env:OUTBOX_REQUIRE_CRON = "true"
npm run prod:outbox-preflight
```

The gate fails for a missing/mismatched `pg_cron` schedule, stale lease, old
pending backlog, or any dead letter when notification delivery is required. It
writes `.production-reports/outbox-operations.json` for incident evidence.
The dispatcher container also becomes unhealthy when its configuration is
invalid, RPC calls fail, or its most recent delivery batch contains a transport
failure.

`pg_cron` runs these reviewed maintenance commands:

| Job | Schedule | Purpose |
|---|---|---|
| `qarar-expire-access-delegations` | every minute | Expires ended access delegations. |
| `qarar-expire-governance-exceptions` | every minute | Expires temporary governance routes. |
| `qarar-recover-notification-outbox` | every five minutes | Releases abandoned delivery leases or dead-letters exhausted events. |

Development installations without `pg_cron` remain usable for schema work; the
production preflight is the intentional release blocker.

## Backup and restore

The logical database dump excludes `pg_cron` because jobs are bound to the
maintenance database. Backups are encrypted **before** they leave the database
container. There is no plaintext-backup mode, including for a production
restore drill.

The backup runner requires PowerShell 7.2+ (PowerShell 7+ on Windows) and exactly one injected key source:

- `QARAR_BACKUP_ENCRYPTION_KEY_FILE`: an owner-only secret file containing
  canonical base64 for exactly 32 random bytes; or
- `QARAR_BACKUP_ENCRYPTION_KEY`: the same value injected directly by the
  secret manager into the backup process environment.

Never place the key in a command-line argument, a Compose file, a committed
environment file, an incident ticket, or shell history. A file source must not
be a symlink and is rejected if group or other principals can read it (use
Unix mode `0600`). Generate it in the secret system, or on a controlled runner without
printing it:

```powershell
$key = [byte[]]::new(32)
try {
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($key)
  [IO.File]::WriteAllText('D:\Qarar-secrets\backup-aes256.key', [Convert]::ToBase64String($key), [Text.UTF8Encoding]::new($false))
} finally {
  [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($key)
}
```

Restrict the resulting secret file to the backup service identity before use.
For example, a scheduled task should mount or inject it from the platform
secret store, then run:

```powershell
npm run prod:backup -- -EncryptionKeyFile D:\Qarar-secrets\backup-aes256.key
```

One backup is an inseparable artifact set. Retain, replicate, and delete all
of these files together:

| Artifact | Purpose |
|---|---|
| `<backup>.dump.enc` | AES-256-GCM chunked ciphertext; every chunk has a unique nonce derivation and authentication tag. |
| `<backup>.dump.enc.sha256` | Ciphertext SHA-256 sidecar. |
| `<backup>.dump.enc.manifest.json` and `.sha256` | Authenticated metadata binding the ciphertext hash/size, nonce, tags, encrypted format, database, and cron-manifest hash. |
| `<backup>.dump.enc.cron.json` and `.sha256` | The existing `pg_cron` schedule manifest, now hashed and bound into the authenticated backup manifest. |

`scripts/verify-backup-restore.ps1` accepts only `.dump.enc` artifacts. It
verifies the manifest, ciphertext, and cron-manifest hashes before decrypting;
then verifies the AES-GCM manifest tag and every ciphertext chunk tag. The
temporary plaintext is written only beneath a dedicated owner-restricted
`.qarar-restore-work` directory beside the backup by default (or inside
`QARAR_RESTORE_TEMP_ROOT`) and is removed in `finally`, together with the
isolated restore database and container copy. The old unencrypted `.dump`
format is intentionally rejected.

Run a drill with the same injected secret source used for backup, for example:

```powershell
npm run prod:restore-drill -- -EncryptionKeyFile D:\Qarar-secrets\backup-aes256.key
```

If a key is missing/malformed, a file has an unexpected hash, the manifest is
not authenticated, or cleanup cannot be performed, treat the drill as failed.
Do not attempt a manual decrypt or bypass the checks. The CI drill creates an
ephemeral key only in its process environment and never writes it to a
repository template or log.

The restore drill also rejects a cron manifest that lacks the three Qarar jobs.
After restoring the real maintenance database, run:

```powershell
./scripts/reconcile-qarar-cron.ps1
```

Then rerun `npm run prod:outbox-preflight` before returning the platform to
service.
