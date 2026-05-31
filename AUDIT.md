# Audit Report — Ruta 13

**Overall assessment:** The core algorithm is faithful to the spec and the system would work correctly for its stated purpose. There are no blocking bugs, but several security and correctness issues worth addressing.

---

## Security

**S1 — Hardcoded credentials pre-filled in Login form** (`frontend/src/main.tsx:65`)
The `useState` defaults are `'admin@ruta13.local'` and `'Ruta13Admin123!'`. In production, every user who visits the login page sees the admin credentials pre-filled. These should be empty strings, with the seed credentials documented separately.

**S2 — Auth token exposed in URL** (`frontend/src/lib/api.ts:8`, `internal/roster/routes.go:47-50`)
`rosterExportUrl()` appends the JWT as `?token=...`. Tokens in URLs end up in server access logs, browser history, and `Referer` headers. The export endpoint was purpose-built to accept this pattern. A better approach for file downloads is a short-lived signed token or a `POST` endpoint that returns a blob.

**S3 — `seedDev` defaults to `true`** (`main.go:26`)
If you deploy the binary without `--seedDev=false`, `ensureUsers` runs and creates `admin@ruta13.local` / `Ruta13Admin123!` if those accounts don't yet exist. The flag default should be `false`, or the seed should only run when an explicit env var is set.

---

## Algorithm & Correctness

**A1 — No unique constraint on `cycle_position`** (`migrations/20260528123000_ruta13.go:28`)
The departure time formula uses each unit's `cycle_position` directly. If two units share a position (e.g., after a bad manual edit or a seeding error), they'll receive the same departure time. The migration adds no uniqueness index on `units.cycle_position`. Since the algorithm itself maintains uniqueness (advancing by 1 each day, wrapping to 0), the only risk is external data mutation, but the DB doesn't protect against it.

**A2 — Relief pool assignment order is undefined by spec**
`reliefPool()` sorts the pool alphabetically, then `popFirstDriver` picks alphabetically. This is deterministic and consistent, but the spec says nothing about the selection order for unit assignment (it only specifies the standby selection ordering). Worth documenting as an intentional implementation choice so future maintainers don't change it and break the behavior.

**A3 — Work logs for standby drivers are never written**
`PublishRoster` iterates `roster_entries` and writes a work log for each assigned driver. Standby drivers who show up but aren't assigned to a unit never get a `work_log` entry. The spec says "writes `work_log` entries for all assigned drivers" (referring to unit assignments), so this is technically correct — but it means standby duty doesn't count toward the equitable distribution count. That could compound over time if the same drivers end up on standby repeatedly.

**A4 — `daily_rosters` unique index may not behave as expected**
The migration adds `idx_daily_rosters_date` as unique on `date`. PocketBase stores `DateField` values with time components. `dayStart()` normalizes dates to midnight Tijuana time, then `dayRange()` converts to UTC for queries. As long as every roster is created via `GenerateRoster` (which calls `dayStart`), the normalization is consistent and the constraint works. But a direct API insert with a slightly different time would bypass it.

---

## Configuration & Ops

**C1 — `applySMTPEnv` mutates in-memory settings** (`internal/roster/service.go:230-239`)
It reads env vars and writes them into `s.app.Settings()` without calling `app.Save(settings)`. This works for the duration of the process but means the PocketBase admin panel will never reflect the actual SMTP configuration being used. It's intentional (env-var-driven config), but operators checking the admin panel will be confused — worth a comment explaining why settings aren't persisted.

**C2 — Scheduler generates AND publishes without human review**
The spec says `GenerateAndEmail` should auto-publish. The scheduler does `GenerateRoster → PublishRoster` with no human review step. The spec confirms this is intentional (§7), but the consequence is: if the scheduler's state is unusual (e.g., a unit entered in_shop between 18:29 and 18:30), the published roster will reflect that without any supervisor review. This is a business logic risk, not a code bug.

---

## Structure vs. Spec

**ST1 — Directory structure deviates from spec**
The spec defines `pb/internal/assignments/`, `drivers/`, `units/`, `roster/`, `rules/`, `scheduler/`. The implementation collapses everything into a single `internal/roster` package with no separate domain packages. For 15 drivers and 70 units, this is fine pragmatically. But `service.go` is already 480 lines and growing, and the `popFirstDriver` helper, `reliefPool`, `Alerts`, and `ExportRoster` are all in the same file. If the spec was intended as a target structure, this is worth revisiting before the codebase grows.

**ST2 — `unit_driver_history` uses `DateField` not `DateTime`**
The migration declares `assigned_at` and `unassigned_at` as `DateField`. The hook stores `time.Now().UTC()`. PocketBase `DateField` stores dates (day precision), not timestamps — so if two driver changes happen on the same day, `assigned_at` won't distinguish them. The spec says `DateTime`. This should be `core.DateTimeField`.

---

## Frontend

**F1 — Silent error handling throughout** (`frontend/src/main.tsx` throughout)
All async functions use `try/finally` with no `catch`. If `generateRoster()` or `publishRoster()` fails, the loading spinner stops but no error message is shown. There are at least three places where an API error would be silently swallowed.

**F2 — `updateEntry` allows assigning a driver to multiple units** (`frontend/src/main.tsx:122`)
There's client-side duplicate detection (the `duplicate` warning), but it's advisory — the supervisor can still save a roster where one driver appears on two units. The backend doesn't validate uniqueness of driver assignments within a roster either. This could silently produce an invalid roster.

**F3 — All pages live in a single file**
The spec calls for separate page files. The current file is dense enough that the `Roster` component alone spans a line with ~20 chained hooks and async functions. Readability degrades quickly if this grows.

---

## What's Done Well

- `GenerateRoster` is wrapped in a single transaction — if any step fails, nothing is committed.
- `sync.Once` in the scheduler prevents double-start on bootstrap.
- `deleteRosterForDate` runs inside the same transaction as creation, so you can't end up with two rosters for the same date.
- `drivers.DeleteRule = "__never__"` is enforced at the DB level, not just the frontend.
- The four algorithm test cases cover the critical edge cases (one unit, wrap-to-zero, standby ordering).
- `reliefPool` correctly handles base drivers whose unit is in_shop AND filters out rest-day drivers.
- Work log is idempotent: re-publishing deletes and recreates logs for the same roster.

---

## Priority Order for Fixes

| Priority | Item | Risk |
|---|---|---|
| 1 | S1 — Credentials pre-filled in login form | Security |
| 2 | S3 — `seedDev` defaults to `true` | Security |
| 3 | F1 — Silent error handling | UX / operability |
| 4 | ST2 — `DateField` instead of `DateTimeField` on history | Data loss |
| 5 | S2 — Auth token in URL | Security |
| 6 | A3 — Standby duty not counted in work log | Fairness drift |
| 7 | F2 — Duplicate driver assignments not blocked | Data integrity |
