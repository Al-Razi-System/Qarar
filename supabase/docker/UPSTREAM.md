# Supabase Docker Upstream

The files in this directory were vendored from the official Supabase repository at commit:

`2c72847fa68d72629c5d3b325d9c1c84fa0cfaef`

Qarar services and the official stack are consolidated in the single `docker-compose.yml`; the
migration-runner script is kept under `qarar/`. When updating, compare the official `docker/`
directory first, preserve pinned image tags, reapply Qarar service settings, run
`docker compose config`, then validate a clean database startup and all database tests.
