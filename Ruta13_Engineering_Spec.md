# Ruta 13 — Work Schedule System (Sistema de Rol de Trabajo)
## Engineering Specification

> **Important:** The entire web application UI must be in **Spanish**. All labels, buttons, messages, errors, placeholders, and navigation must be in Spanish. Variable names, code comments, and this spec are in English.

---

## 1. Project Overview

An internal web application for Ruta 13 Tijuana that automates the daily generation of the **Rol de Trabajo** — the assignment of drivers to bus units with departure times, plus a standby list of relief drivers.

Every day at **6:30 PM**, the system automatically generates the next day's roster, exports it as an Excel file, and emails it to a configured list of supervisors and admins. Recipients can distribute the file to drivers as they see fit.

If changes are needed, a supervisor can open the web app, edit the draft, and re-publish — which triggers a new email with the updated Excel. A manual "Re-generar Rol" button is also available in the app.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| UI Components | shadcn/ui + Tailwind CSS |
| Backend / DB / Auth | PocketBase (extended in Go) |
| Database | SQLite (via PocketBase) |
| Language (backend logic) | Go |
| Export | Excel (.xlsx) generation |
| Hosting | Single VPS (PocketBase binary serves everything) |

### Project Structure

```
/
├── pb/                        # PocketBase + Go backend
│   ├── main.go                # Entry point, registers hooks and routes
│   ├── internal/
│   │   ├── assignments/
│   │   │   ├── service.go     # Assignment business logic
│   │   │   ├── repository.go  # DB queries
│   │   │   └── model.go       # Structs
│   │   ├── drivers/
│   │   │   ├── service.go
│   │   │   ├── repository.go
│   │   │   └── model.go
│   │   ├── units/
│   │   │   ├── service.go
│   │   │   ├── repository.go
│   │   │   └── model.go
│   │   ├── roster/
│   │   │   ├── service.go     # Core roster generation algorithm
│   │   │   ├── repository.go
│   │   │   ├── model.go
│   │   │   └── export.go      # Excel export logic
│   │   ├── rules/
│   │   │   └── standby_selection.go  # Equitable standby selection rule
│   │   └── scheduler/
│   │       └── scheduler.go          # Daily cron job — auto-generates roster at 18:30
│   └── pb_data/               # PocketBase data directory (gitignored)
│
└── frontend/                  # Vite + React app
    ├── src/
    │   ├── pages/
    │   │   ├── Dashboard.tsx
    │   │   ├── Conductores.tsx
    │   │   ├── Unidades.tsx
    │   │   ├── GeneradorRol.tsx
    │   │   └── HistorialRoles.tsx
    │   ├── components/
    │   ├── lib/
    │   │   └── pb.ts          # PocketBase JS client instance
    │   └── main.tsx
    └── vite.config.ts
```

---

## 3. Data Models

Define these collections in PocketBase. All field names are in English.

### 3.1 `drivers` collection

| Field | Type | Notes |
|---|---|---|
| `id` | Auto (PocketBase) | |
| `name` | Text, required | Full name |
| `type` | Select: `base`, `relief` | base = has assigned unit; relief = pool driver |
| `rest_day` | Select: `monday`…`sunday` | Required if type = base. The weekday this driver does NOT work. |
| `is_active` | Bool, default true | Set to false when driver leaves. Never delete records. |

### 3.2 `units` collection

| Field | Type | Notes |
|---|---|---|
| `id` | Auto (PocketBase) | |
| `number` | Text, required, unique | e.g. "400", "402" |
| `status` | Select: `operational`, `in_shop` | in_shop = excluded from roster |
| `base_driver` | Relation → drivers | The permanently assigned base driver. Can be empty. |
| `cycle_position` | Number, default 0 | Integer 0–(N-1). Current position in the departure time cycle. |

### 3.3 `daily_rosters` collection

| Field | Type | Notes |
|---|---|---|
| `id` | Auto (PocketBase) | |
| `date` | Date, required | The date this roster is for (the operating day) |
| `status` | Select: `draft`, `published` | |
| `published_at` | DateTime | Null until published |

### 3.4 `roster_entries` collection

One record per unit per roster.

| Field | Type | Notes |
|---|---|---|
| `id` | Auto (PocketBase) | |
| `roster` | Relation → daily_rosters | |
| `unit` | Relation → units | |
| `driver` | Relation → drivers | The driver actually operating this unit that day |
| `is_substitute` | Bool | true if the assigned driver is a relief (not the base driver) |
| `departure_time` | Text | Stored as "HH:MM", e.g. "05:00", "07:30" |

### 3.5 `standby_entries` collection

The 10 relief drivers who must show up.

| Field | Type | Notes |
|---|---|---|
| `id` | Auto (PocketBase) | |
| `roster` | Relation → daily_rosters | |
| `driver` | Relation → drivers | |
| `position` | Number | 1–10 |

### 3.6 `work_log` collection

One record per driver per day worked. Used for equitable standby selection.

| Field | Type | Notes |
|---|---|---|
| `id` | Auto (PocketBase) | |
| `driver` | Relation → drivers | |
| `date` | Date | The date worked |
| `roster` | Relation → daily_rosters | |

### 3.7 `unit_driver_history` collection

Tracks which driver was assigned to which unit over time.

| Field | Type | Notes |
|---|---|---|
| `id` | Auto (PocketBase) | |
| `unit` | Relation → units | |
| `driver` | Relation → drivers | |
| `assigned_at` | DateTime | When this assignment started |
| `unassigned_at` | DateTime | Null if current assignment |

### 3.8 `email_recipients` collection

Stores the list of email addresses that receive the auto-generated roster.

| Field | Type | Notes |
|---|---|---|
| `id` | Auto (PocketBase) | |
| `email` | Text, required, unique | Recipient email address |
| `name` | Text | Display name (optional) |
| `is_active` | Bool, default true | Inactive recipients are skipped |

Managed by admins only via the Configuración page.

---

## 4. Authentication & Roles

Use PocketBase's built-in auth. Create two roles via PocketBase admin:

| Role | Permissions |
|---|---|
| `admin` | Full access: create/edit/delete drivers, units, generate roster, publish, manage users |
| `supervisor` | Can view everything, edit roster draft before publishing, publish roster. Cannot manage drivers/units. |

The frontend checks the user's role on login and shows/hides actions accordingly.

---

## 5. Core Algorithm — Roster Generation

This is the most critical piece of logic. Lives in `pb/internal/roster/service.go`.

### Input
- `date`: the date to generate the roster for (tomorrow)

### Steps

```
func GenerateRoster(date time.Time) (*DailyRoster, error)
```

**Step 1 — Get active units**
```
activeUnits = query units WHERE status = "operational"
// result: up to 70 units
```

**Step 2 — Calculate departure times**

Distribute N active units evenly between 05:00 and 07:30 (150 minutes total):

```
for i, unit := range activeUnits (sorted by cycle_position):
    minutes := float64(unit.cycle_position) * 150.0 / float64(totalUnits - 1)
    departure = 05:00 + round(minutes) minutes
```

This guarantees:
- Position 0 always = 05:00
- Position (N-1) always = 07:30
- All others evenly distributed and rounded to nearest minute

**Step 3 — Advance cycle positions**

After calculating times, increment each active unit's `cycle_position` by 1:
```
if unit.cycle_position >= totalActiveUnits - 1:
    unit.cycle_position = 0
else:
    unit.cycle_position += 1
```

Units with status `in_shop` do NOT advance their cycle position.

**Step 4 — Build relief pool**

```
reliefPool = []

// Permanent relief drivers
reliefPool += query drivers WHERE type = "relief" AND is_active = true

// Base drivers whose unit is in shop
reliefPool += query drivers WHERE type = "base" 
                              AND is_active = true
                              AND their unit.status = "in_shop"

// Remove anyone whose rest_day matches today's weekday
reliefPool = filter(reliefPool, driver.rest_day != today.weekday)
```

**Step 5 — Assign drivers to units**

```
for each activeUnit:
    baseDriver = activeUnit.base_driver

    if baseDriver is null:
        // Unit has no designated driver — assign from pool, flag alert
        assignedDriver = reliefPool.pop()
        entry.is_substitute = true
        triggerAlert("unit_no_driver", activeUnit)

    else if baseDriver.rest_day == today.weekday:
        // Base driver is resting today
        assignedDriver = reliefPool.pop()
        entry.is_substitute = true

    else:
        // Normal day — base driver operates their unit
        assignedDriver = baseDriver
        entry.is_substitute = false

    create RosterEntry(roster, unit, assignedDriver, departureTime, is_substitute)
    
    // Remove assigned driver from relief pool
    reliefPool.remove(assignedDriver)
```

**Step 6 — Select 10 standby drivers**

From remaining `reliefPool` (drivers not assigned to any unit):

```
// Get days worked in last 60 days for each driver in pool
for driver in reliefPool:
    driver.recentDaysWorked = count(work_log WHERE driver = driver AND date >= today - 60 days)

// Sort ascending by recentDaysWorked (fewest days = highest priority)
// Tiebreaker: alphabetical by name
reliefPool.sortBy(recentDaysWorked ASC, name ASC)

standbyList = reliefPool[:10]  // Take first 10
```

**Step 7 — Create roster records**

```
roster = create DailyRoster(date, status="draft")

for each rosterEntry: create RosterEntry
for i, driver in standbyList: create StandbyEntry(roster, driver, position=i+1)
```

**Step 8 — Return draft roster**

Do NOT publish yet. The supervisor reviews first.

---

## 6. API Endpoints

PocketBase auto-generates REST endpoints for all collections. Add these **custom Go routes** on top:

### POST `/api/roster/generate`
Triggers the roster generation algorithm for a given date. If a draft already exists for that date, it is deleted and regenerated from scratch.

**Request body:**
```json
{ "date": "2025-06-15" }
```

**Response:**
```json
{ "roster_id": "abc123", "status": "draft" }
```

**Guards:** Only callable by `admin` or `supervisor`. Also called internally by the scheduler.

---

### POST `/api/roster/:id/publish`
Publishes the roster. Sets `status = published`, sets `published_at`, writes `work_log` entries for all assigned drivers, and sends the Excel to all active email recipients.

**Response:**
```json
{ "roster_id": "abc123", "published_at": "2025-06-14T19:00:00Z" }
```

---

### GET `/api/roster/:id/export`
Generates and returns an `.xlsx` file of the published roster.

**Excel format (two sheets):**

Sheet 1 — "Rol del Día":
| Unidad | Conductor | Hora de Salida | Relevo |
|---|---|---|---|
| 400 | Juan García | 05:00 | No |
| 402 | (Relevo) Pedro López | 05:02 | Sí |

Sheet 2 — "Relevos de Presentación":
| # | Conductor |
|---|---|
| 1 | Carlos Ruiz |
| 2 | ... |

---

### POST `/api/roster/:id/email`
Manually re-sends the Excel email for a published roster to all active recipients. Useful if a recipient didn't receive it.

**Guards:** Admin only.

---

### GET `/api/dashboard/alerts`
Returns current active alerts.

**Response:**
```json
{
  "alerts": [
    { "type": "unit_no_driver", "unit_number": "410" },
    { "type": "roster_not_generated", "for_date": "2025-06-15" }
  ]
}
```

Alert types:
- `unit_no_driver` — operational unit with no base driver assigned
- `roster_not_sent` — it's after 7:00 PM and tomorrow's roster still hasn't been auto-generated and emailed (scheduler may have failed)

---

## 7. Scheduler — Automated Daily Generation

Lives in `pb/internal/scheduler/scheduler.go`. Starts as a goroutine when the PocketBase app boots.

```go
func StartScheduler(app *pocketbase.PocketBase) {
    go func() {
        for {
            now := time.Now().In(tijuanaLocation)
            
            // Target: 18:30 Tijuana time every day
            next := time.Date(now.Year(), now.Month(), now.Day(), 18, 30, 0, 0, tijuanaLocation)
            if now.After(next) {
                next = next.Add(24 * time.Hour)
            }
            
            time.Sleep(time.Until(next))
            
            tomorrow := time.Now().In(tijuanaLocation).AddDate(0, 0, 1)
            err := roster.GenerateAndEmail(app, tomorrow)
            if err != nil {
                // log error — do not crash
            }
        }
    }()
}
```

`roster.GenerateAndEmail()` does the following:
1. Calls `GenerateRoster(tomorrow)` — creates the draft
2. Calls `PublishRoster(rosterID)` — publishes it and writes work_log entries
3. Calls `SendRosterEmail(rosterID)` — generates Excel and emails to all active recipients

**Email format:**
- **Subject:** `Rol de Trabajo — [date, e.g. "Lunes 16 de Junio 2025"]`
- **Body:** Short message in Spanish, e.g. *"Se adjunta el Rol de Trabajo para el día de mañana. Si necesita hacer cambios, puede acceder al sistema en [URL]."*
- **Attachment:** `Rol_[date].xlsx`

**SMTP configuration** — set via environment variables or PocketBase settings:
```
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM_ADDRESS
```

PocketBase has built-in SMTP support — configure it in the PocketBase admin panel under Settings → Mail.

---

## 8. Frontend Pages

All text, labels, and UI copy must be in **Spanish**.

### 7.1 Login
- Email + password form
- Uses PocketBase auth
- On success: redirect to Dashboard
- Show error in Spanish if credentials are wrong

### 7.2 Dashboard (`/`)
- Summary cards: total active drivers, total operational units, units in shop
- Alert banner — shows active alerts from `/api/dashboard/alerts`
- Status card for tomorrow's roster: shows whether it has been auto-generated and/or emailed
- Link to tomorrow's draft roster (if generated) so supervisor can review or edit
- Link to today's published roster if it exists

### 7.3 Conductores (`/conductores`)
- Table: Name, Type (Base/Relevo), Rest Day, Status (Active/Inactive)
- Search by name
- Filter by type and status
- "Nuevo Conductor" button → opens modal/drawer with form
- Click row → opens edit modal
- Edit modal fields: Nombre, Tipo, Día de Descanso (only shown if type = Base), Estado
- Deactivate button (never deletes, sets is_active = false)
- Confirmation dialog before deactivating

### 7.4 Unidades (`/unidades`)
- Table: Unit Number, Assigned Driver, Status
- Filter by status
- "Nueva Unidad" button → opens modal
- Click row → opens edit modal
- Edit modal fields:
  - Número de Unidad
  - Estado (Operacional / En Taller) — toggle
  - Conductor Designado — searchable dropdown showing only active base drivers not already assigned to another unit
- When conductor designado changes: write to `unit_driver_history`
- Alert icon on rows where unit has no assigned driver

### 7.5 Generador de Rol (`/rol`)
- If no draft for tomorrow exists: show "Re-generar Rol" button (manual trigger, same endpoint)
- If draft exists (auto-generated at 18:30 or manually triggered): show draft immediately
- On generate/re-generate: call `POST /api/roster/generate`, show loading state, then show draft
- Note: re-generating deletes the existing draft and creates a fresh one
- Draft view — editable table:

| Unidad | Conductor | Hora de Salida | Tipo |
|---|---|---|---|
| 400 | Juan García | 05:00 | Base |
| 402 | Pedro López | 05:02 | Relevo ⚠️ |

  - Each row's Conductor is a dropdown — can be changed by supervisor
  - Rows where is_substitute = true are highlighted (e.g. light yellow background)
  - Rows where unit has no base driver show a warning icon

- Standby section below the table:
  - List of 10 standby drivers with their position
  - Each can be swapped via dropdown

- "Publicar Rol" button — confirmation dialog, then calls `POST /api/roster/:id/publish`
- After publish: show download Excel button → calls `GET /api/roster/:id/export`
- Publishing also triggers an email to all active recipients (same as the automated send)

### 7.6 Historial de Roles (`/historial`)
- Table: Date, Published At, Actions
- Click row → read-only view of that roster
- Download Excel button per row

### 7.7 Configuración (`/configuracion`) — Admin only
- Section: **Destinatarios del Correo**
  - Table of current email recipients (name, email, active status)
  - "Agregar Destinatario" button → modal with name + email fields
  - Toggle active/inactive per recipient
  - Delete recipient (with confirmation)
- This list is used by the scheduler and by manual re-publish to know who gets the Excel

---

## 9. Business Rules Summary

The agent must enforce these rules. Most live in `roster/service.go` and `rules/standby_selection.go`.

1. **Base driver works 6 of 7 days.** The day matching `driver.rest_day` (weekday name) is their day off. On that day they do not appear in any unit assignment.

2. **Unit in shop is excluded from the roster.** Its `cycle_position` does not advance while in shop.

3. **Base driver of an in-shop unit joins the relief pool automatically.** They are treated as available relief for that day (unless it's also their rest day).

4. **Departure times always span 05:00–07:30.** First unit always at 05:00, last always at 07:30, others distributed evenly. If only 1 unit is active, it departs at 05:00.

5. **Cycle position advances daily.** After generating a roster, each active unit moves forward one position. When it reaches the last position, it wraps back to 0.

6. **Standby selection is equitable.** Priority goes to drivers with the fewest days worked in the last 60 days. Tiebreaker is alphabetical. The goal is equal distribution of standby duty over time.

7. **A base driver can only be designated to one unit at a time.** The system must reject attempts to assign the same base driver to two units simultaneously.

8. **Deactivating a driver does not delete data.** Historical roster entries and work logs are preserved. The driver simply stops appearing in dropdowns and pools.

9. **Only one roster per date.** If a roster already exists for the requested date (regardless of status), it is deleted and regenerated from scratch. There is no hard lock on published rosters — supervisors can always re-generate and re-send.

10. **Published status is informational, not a lock.** Published simply means the roster has been sent. Supervisors can re-generate or edit at any time — the roster is not considered truly final until the supervisors distribute it to drivers, which happens at their discretion outside the system.

---

## 10. Alerts Logic

Check and return alerts from `GET /api/dashboard/alerts`. Evaluate at request time (no scheduled jobs needed):

```go
func GetAlerts() []Alert {
    alerts := []Alert{}

    // Alert 1: Any operational unit with no base_driver assigned
    unitsWithNoDriver := query units WHERE status = "operational" AND base_driver IS NULL
    for each unit: alerts.append({ type: "unit_no_driver", unit_number: unit.number })

    // Alert 2: Tomorrow's roster not generated/sent yet and it's past 19:00 (scheduler should have run at 18:30)
    if time.Now().Hour() >= 19:
        tomorrow = today + 1 day
        exists = query daily_rosters WHERE date = tomorrow
        if not exists:
            alerts.append({ type: "roster_not_sent", for_date: tomorrow })

    return alerts
}
```

---

## 11. Edge Cases to Handle

| Scenario | Expected behavior |
|---|---|
| Only 1 active unit | Departs at 05:00. No cycle math needed. |
| Relief pool has fewer than 10 drivers after assignments | Create standby list with however many are available. Show alert on dashboard. |
| All base drivers available (no substitutions needed) | Roster generates normally, is_substitute = false on all entries |
| Unit goes from in_shop to operational | Its cycle_position resumes from where it was. Its base driver leaves the relief pool. |
| Base driver is deactivated mid-week | Their unit shows the "no driver" alert. A relief covers until admin assigns a new base driver. |
| Supervisor changes a driver in the draft | Update the roster_entry record. Log who changed it and when (use PocketBase's built-in updated field). |
| Generate called when roster already exists | Delete existing roster (any status) and regenerate from scratch. No hard locks — supervisors can always re-generate. |
| Scheduler fails (server down at 18:30) | Alert fires after 19:00. Supervisor can manually trigger re-generate from the web app. |
| Email sending fails | Log the error. Roster is still published. Supervisor can use "Re-enviar correo" button from the Historial page. |

---

## 12. Seed Data

On first run, seed the following for development/testing:

- 10 base drivers with different rest days
- 5 relief drivers
- 8 units (6 operational, 2 in shop)
- Assign base drivers to operational units
- Set varied cycle_positions (0 through 5)
- 30 days of work_log entries to test standby selection ordering

Seed file: `pb/cmd/seed.go`

---

## 13. Development Notes

- The PocketBase admin UI (`/_/`) is available in development for inspecting collections and records directly. Do not expose in production without a strong password.
- The frontend communicates with PocketBase directly for standard CRUD (using the PocketBase JS SDK), and with the custom Go routes for roster generation, publishing, and export.
- PocketBase JS SDK: `pocketbase` npm package. Initialize once in `src/lib/pb.ts` and import everywhere. This is a browser-side client — it has nothing to do with the Go extension. Go runs on the server and handles business logic. The JS SDK runs in the browser and handles auth sessions, CRUD calls, and realtime subscriptions from React. Both are needed and do not conflict.
- All dates in the database are stored in UTC. The frontend displays them in local time (Mexico/Tijuana timezone: `America/Tijuana`).
- The Excel export uses the `excelize` Go library.
- SMTP is configured via PocketBase's built-in mail settings (Settings → Mail in the admin panel). No external email library needed.
- The scheduler runs as a goroutine — it is started in `main.go` after PocketBase boots. Use `time.Sleep` loop (not a cron library) to keep dependencies minimal.
- Tijuana timezone: `America/Tijuana` (UTC-8, no DST). Always use this timezone when calculating "today" and "tomorrow" in the scheduler and alerts.
- For the departure time cycle, `cycle_position` is stored on the unit and is the single source of truth. Never recalculate from scratch — just read and increment.
