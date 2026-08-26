# Qarar Current Local State Snapshot

This folder contains a portable snapshot of the local development state captured on 2026-08-26.

## Included

- Demo Auth users and identities needed to log in locally.
- Qarar application data: governance units, IAM, topics, meetings, attendance, voting, decisions, minutes, signatures, audit, and workflow data.
- The current meeting state where the approved University Council topics are available for the Board of Trustees agenda.

## Excluded

- Live Auth sessions, refresh tokens, MFA challenges, and transient one-time tokens.
- Local HTTPS certificates and machine-specific cache/build folders.
- Docker database volume files.

## Restore On Another Device

Run these commands from the repository root after cloning this branch:

```powershell
npm install
Copy-Item supabase/docker/.env.example supabase/docker/.env
npm run docker:start
npm run docker:status
```

After the database container is healthy and migrations finish, restore the captured state:

```powershell
Get-Content supabase/snapshots/qarar-current-local-state-20260826.sql |
  docker exec -i qarar-supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
```

Then run the dashboard:

```powershell
cd apps/dashboard
npm install --prefer-offline
npm run dev
```

For LAN camera/QR testing over HTTPS:

```powershell
cd apps/dashboard
npm run dev:https
```

The HTTPS script generates local certificates on the target machine. Browser security warnings are expected for this local certificate.
