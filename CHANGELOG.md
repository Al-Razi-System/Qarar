# Changelog

## 2026-08-26 - Release 1 meeting flow stabilization

### Added

- Added the cleaned dashboard application source under `apps/dashboard` so the latest working UI and API fixes are tracked outside the ignored local runtime folder.
- Added local HTTPS development support for the dashboard, including LAN camera/QR testing scripts without committing local certificates.
- Added meeting minutes PDF generation with Al-Razi University branding, Arabic font support, structured minutes content, decisions, attendance, and embedded approval signatures.
- Added agenda discussion flow support for secretary summaries, voting steps, final decision drafting, and minutes approval workflow.
- Added database migrations for agenda workflow voting context, voting notes, live vote totals, trusted transition guards, tie-break persistence, decision creation locking, minutes grants, and approved signature exposure.
- Added a portable local-state snapshot under `supabase/snapshots` so another device can restore the latest tested meeting data, demo users, minutes, decisions, votes, and signatures.
- Added generated database schema reference documentation for safer field naming during migrations and API work.

### Changed

- Improved attendance portal and QR verification handling for member check-in workflows.
- Improved voting lifecycle handling: open voting, live anonymous totals for leadership, optional voter notes, close voting, final result calculation, and chairman tie-break handling when all votes are tied.
- Improved topic cards during live meetings with collapsible cards, clearer state badges, better active-item emphasis, and identity-aligned action colors.
- Improved final minutes workspace behavior after save, approval, signature collection, and final PDF download.
- Improved PDF layout alignment for attendees, agenda items, minutes text, decision sections, and full signature rendering.
- Improved transferred agenda topic cards to show the source council, source meeting, decision number, decision text, and minutes approval status.
- Updated root project scripts and documentation links for regulation bundle operations and database schema reference generation.

### Fixed

- Fixed API/runtime failures around manual attendance, verification approval, voting close, decision creation, and minutes finalization.
- Fixed stale PDF downloads by disabling cache for the minutes PDF endpoint and versioning download URLs.
- Fixed permission/grant issues that caused `403 Forbidden` and server errors in meeting workflow operations.
- Fixed vote result status labels so closed voting no longer appears as still available.
- Fixed final signatures display so all attending members' approvals are included in the PDF.
- Fixed approved agenda topics remaining stuck as `listed` after final minutes approval, which prevented them from appearing in the next council's agenda.
- Fixed the local HTTPS startup script to read `supabase/docker/.env` from the current repository before legacy fallback paths.

### Cleanup

- Kept generated files, logs, local HTTPS certificates, runtime caches, and PDF render scratch output out of Git.
- Added ignore rules for `tmp/`, `output/`, `temp_*.md`, logs, and temporary files.
