# Ruta 13 Frontend Build Spec for v0

## Purpose

Build a production-quality Spanish-language frontend for the Ruta 13 internal work schedule system.

The backend already exists as a PocketBase app extended with Go. The frontend must be a React + TypeScript + Vite app using Tailwind CSS and shadcn/ui components. The generated frontend should replace the current custom CSS prototype and be easy to wire to the existing PocketBase backend.

This is an internal operations tool for supervisors and admins at Ruta 13 Tijuana. It should feel utilitarian, dense, reliable, and fast. Do not build a marketing page or landing page. The first screen after login is the working dashboard.

## Non-Negotiable Requirements

1. All visible UI text must be in Spanish.
2. Use React + TypeScript.
3. Use Tailwind CSS.
4. Use shadcn/ui components.
5. Use lucide-react icons.
6. Use PocketBase JS SDK for auth, collection CRUD, and custom API routes.
7. Build route-based pages, not a single-file prototype.
8. The UI must support two roles: `admin` and `supervisor`.
9. Admins can manage conductores, unidades, and email recipients.
10. Supervisors can view everything, generate/edit/publish rosters, but cannot manage conductores, unidades, or email recipients.
11. The app must be responsive, but desktop/tablet operations are the priority.
12. Avoid decorative hero sections, gradients, illustrations, and marketing copy.

## Existing Backend

PocketBase is served from the same origin as the frontend.

Frontend should initialize the client like this:

```ts
import PocketBase from "pocketbase"

export const pb = new PocketBase(window.location.origin)
```

Auth records live in the `users` collection and include:

```ts
type UserRole = "admin" | "supervisor"

type AuthUser = {
  id: string
  email: string
  role: UserRole
}
```

Development credentials:

```txt
admin@ruta13.local / Ruta13Admin123!
supervisor@ruta13.local / Ruta13Supervisor123!
```

## App Shell

Use a persistent operational shell after login.

Layout:

- Left sidebar on desktop.
- Top compact header on mobile.
- Main content area with route outlet.
- Sidebar should show current user email and role.
- Include logout action.

Navigation labels:

- `Panel`
- `Conductores`
- `Unidades`
- `Rol`
- `Historial`
- `Configuración` admin only

Recommended icons:

- Panel: `LayoutDashboard`
- Conductores: `Users`
- Unidades: `Bus`
- Rol: `CalendarDays`
- Historial: `Archive`
- Configuración: `Settings`
- Salir: `LogOut`

## Visual Design Direction

The system is for dispatch/supervisor operations. It should be quiet and practical.

Use:

- Neutral background.
- White panels.
- Clear data tables.
- Restrained borders.
- Small radius, 6px to 8px.
- Clear status badges.
- Compact controls.
- Obvious destructive confirmation states.

Avoid:

- Large hero sections.
- Decorative cards inside cards.
- Purple/blue gradient-heavy styling.
- Marketing sections.
- Excessive whitespace.
- In-app instructional text explaining obvious UI features.

Use shadcn components wherever possible:

- `Button`
- `Card`
- `Dialog`
- `AlertDialog`
- `Input`
- `Label`
- `Select`
- `Command`
- `Popover`
- `Badge`
- `Table`
- `Tabs`
- `DropdownMenu`
- `Alert`
- `Toast` or `Sonner`
- `Skeleton`
- `Separator`

## Data Models

The frontend talks to these PocketBase collections.

### `drivers`

```ts
type DriverType = "base" | "relief"
type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"

type Driver = {
  id: string
  name: string
  type: DriverType
  rest_day?: Weekday
  is_active: boolean
  created: string
  updated: string
}
```

Spanish labels:

```ts
const driverTypeLabels = {
  base: "Base",
  relief: "Relevo",
}

const weekdayLabels = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
}
```

Rules:

- `name` is required.
- `type` is required.
- `rest_day` is required when `type = "base"`.
- `rest_day` should be empty or hidden when `type = "relief"`.
- Drivers are never physically deleted from the UI.
- Deactivation sets `is_active = false`.

### `units`

```ts
type UnitStatus = "operational" | "in_shop"

type Unit = {
  id: string
  number: string
  status: UnitStatus
  base_driver?: string
  cycle_position: number
  created: string
  updated: string
  expand?: {
    base_driver?: Driver
  }
}
```

Spanish labels:

```ts
const unitStatusLabels = {
  operational: "Operacional",
  in_shop: "En taller",
}
```

Rules:

- `number` is required and unique.
- `status` is required.
- `base_driver` is optional.
- `cycle_position` is a non-negative integer.
- Only active base drivers may be selected as `base_driver`.
- A base driver can be assigned to only one unit.
- If a unit is `operational` and has no `base_driver`, show a warning indicator.

### `daily_rosters`

```ts
type RosterStatus = "draft" | "published"

type DailyRoster = {
  id: string
  date: string
  status: RosterStatus
  published_at?: string
  created: string
  updated: string
}
```

Spanish labels:

```ts
const rosterStatusLabels = {
  draft: "Borrador",
  published: "Publicado",
}
```

### `roster_entries`

```ts
type RosterEntry = {
  id: string
  roster: string
  unit: string
  driver?: string
  is_substitute: boolean
  departure_time: string
  created: string
  updated: string
  expand?: {
    unit?: Unit
    driver?: Driver
  }
}
```

Rules:

- Display sorted by `departure_time`.
- `driver` can be edited from the roster screen.
- Highlight rows where `is_substitute = true`.
- Show warning if expanded unit has no base driver.
- When driver changes, update `driver` and recompute `is_substitute` client-side:
  - `true` if selected driver is not the unit's base driver.
  - `false` if selected driver equals the unit's base driver.

### `standby_entries`

```ts
type StandbyEntry = {
  id: string
  roster: string
  driver: string
  position: number
  created: string
  updated: string
  expand?: {
    driver?: Driver
  }
}
```

Rules:

- Display sorted by `position`.
- Usually 10 entries, but there may be fewer if there are not enough available relief drivers.
- Driver can be changed by supervisor/admin.

### `email_recipients`

```ts
type EmailRecipient = {
  id: string
  email: string
  name?: string
  is_active: boolean
  created: string
  updated: string
}
```

Rules:

- Admin only.
- `email` is required and unique.
- `name` is optional.
- Can toggle active/inactive.
- Can delete with confirmation.

### `unit_driver_history`

This collection exists in the backend. The frontend does not need to write directly to it. The backend hook updates history when a unit's `base_driver` changes.

### `work_log`

This collection exists for roster generation fairness. The frontend only needs read access if a future analytics page is added. Do not build a work log management UI for this version.

## Custom API Routes

All custom API routes require an authenticated PocketBase user.

### Generate Roster

```http
POST /api/roster/generate
Content-Type: application/json
Authorization: Bearer <token>
```

Body:

```json
{ "date": "2026-05-29" }
```

Response:

```json
{ "roster_id": "abc123", "status": "draft" }
```

Use this when the user clicks `Re-generar rol`.

Important behavior:

- If a roster already exists for that date, the backend deletes it and creates a fresh one.
- Show a confirmation dialog before regenerating an existing roster.

### Publish Roster

```http
POST /api/roster/:id/publish
Authorization: Bearer <token>
```

Response:

```json
{
  "roster_id": "abc123",
  "published_at": "2026-05-29 02:30:00.000Z"
}
```

Use this when the user clicks `Publicar rol`.

Important behavior:

- Publishing writes work log entries.
- Publishing sends the Excel file to active email recipients.
- Published rosters are still editable/regenerable by business rule.

### Export Roster Excel

```http
GET /api/roster/:id/export?token=<auth-token>
```

The frontend should use a normal anchor/download link because this returns a binary `.xlsx` file.

Helper:

```ts
export function rosterExportUrl(rosterId: string) {
  return `/api/roster/${rosterId}/export?token=${encodeURIComponent(pb.authStore.token)}`
}
```

Button label: `Descargar Excel`

### Re-send Email

```http
POST /api/roster/:id/email
Authorization: Bearer <token>
```

Response:

```json
{ "ok": true }
```

Admin only.

Button label: `Re-enviar correo`

### Dashboard Alerts

```http
GET /api/dashboard/alerts
Authorization: Bearer <token>
```

Response:

```ts
type DashboardAlert =
  | { type: "unit_no_driver"; unit_number: string }
  | { type: "roster_not_sent"; for_date: string }
  | { type: "standby_shortage"; for_date: string; available: number }

type AlertsResponse = {
  alerts: DashboardAlert[]
}
```

Spanish alert copy:

- `unit_no_driver`: `La unidad {unit_number} no tiene conductor designado.`
- `roster_not_sent`: `El rol de {for_date} no se ha generado o enviado.`
- `standby_shortage`: `Solo hay {available} relevos de presentación disponibles para {for_date}.`

## Pages

### Login

Route: `/login`

Fields:

- `Correo`
- `Contraseña`

Actions:

- `Entrar`

Behavior:

- Use `pb.collection("users").authWithPassword(email, password)`.
- On success, redirect to `/`.
- On failure, show: `Correo o contraseña incorrectos.`
- If already authenticated, redirect to `/`.

Layout:

- Centered login card.
- Title: `Ruta 13`
- Subtitle: `Sistema de Rol de Trabajo`
- No marketing content.

### Dashboard

Route: `/`

Title: `Panel`

Data to load:

- Active driver count:
  `pb.collection("drivers").getList(1, 1, { filter: "is_active=true" })`
- Operational unit count:
  `pb.collection("units").getList(1, 1, { filter: 'status="operational"' })`
- Units in shop count:
  `pb.collection("units").getList(1, 1, { filter: 'status="in_shop"' })`
- Alerts:
  `pb.send("/api/dashboard/alerts")`
- Recent rosters:
  `pb.collection("daily_rosters").getFullList({ sort: "-date" })`

Cards:

- `Conductores activos`
- `Unidades operacionales`
- `Unidades en taller`

Sections:

- Alert list, if any.
- `Rol de mañana`
  - Show `No generado`, `Borrador`, or `Publicado`.
  - Button: `Abrir rol`
- `Rol de hoy`
  - Show whether there is a published roster today.
  - If published, show `Descargar Excel`.
- `Roles recientes`
  - Table with columns: `Fecha`, `Estado`, `Publicado`, `Acciones`.

Actions:

- `Actualizar`
- `Abrir rol`
- `Descargar Excel`

### Conductores

Route: `/conductores`

Title: `Conductores`

Admin actions:

- `Nuevo conductor`
- `Editar`
- `Desactivar`

Supervisor behavior:

- Can view list.
- Cannot see create/edit/deactivate buttons.

Data:

```ts
pb.collection("drivers").getFullList({ sort: "name" })
```

Filters:

- Search input placeholder: `Buscar conductor`
- Type select:
  - `Todos los tipos`
  - `Base`
  - `Relevo`
- Status select:
  - `Todos los estados`
  - `Activos`
  - `Inactivos`

Table columns:

- `Nombre`
- `Tipo`
- `Día de descanso`
- `Estado`
- `Acciones`

Status badges:

- Active: `Activo`
- Inactive: `Inactivo`

Create/edit dialog:

Title:

- New: `Nuevo conductor`
- Edit: `Editar conductor`

Fields:

- `Nombre`
- `Tipo`
- `Día de descanso` only when type is `Base`
- `Estado`

Buttons:

- `Guardar`
- `Cancelar`

Validation:

- Name required: `El nombre es obligatorio.`
- Rest day required for base drivers: `El día de descanso es obligatorio para conductores base.`

Deactivate confirmation:

- Title: `Desactivar conductor`
- Description: `El conductor dejará de aparecer en asignaciones nuevas, pero su historial se conservará.`
- Confirm: `Desactivar`
- Cancel: `Cancelar`

Important:

- Do not implement physical delete for drivers.

### Unidades

Route: `/unidades`

Title: `Unidades`

Admin actions:

- `Nueva unidad`
- `Editar`
- `Eliminar`

Supervisor behavior:

- Can view list.
- Cannot see create/edit/delete buttons.

Data:

```ts
pb.collection("units").getFullList({
  sort: "number",
  expand: "base_driver",
})
```

Also load available base drivers:

```ts
pb.collection("drivers").getFullList({
  filter: 'type="base" && is_active=true',
  sort: "name",
})
```

Filters:

- Status select:
  - `Todos los estados`
  - `Operacional`
  - `En taller`

Table columns:

- `Unidad`
- `Conductor designado`
- `Estado`
- `Posición de ciclo`
- `Acciones`

Rows:

- If status is `operational` and no base driver is assigned, show warning icon and badge `Sin conductor`.
- Show `En taller` as a muted/secondary badge.

Create/edit dialog:

Title:

- New: `Nueva unidad`
- Edit: `Editar unidad`

Fields:

- `Número de unidad`
- `Estado`
- `Conductor designado`
- `Posición de ciclo`

Controls:

- `Estado` may be a select or segmented control.
- `Conductor designado` should be a searchable combobox using shadcn `Command` + `Popover`.
- The combobox must include an option `Sin conductor`.
- Exclude base drivers already assigned to another unit, except the currently assigned driver when editing.

Validation:

- Unit number required: `El número de unidad es obligatorio.`
- Cycle position must be a non-negative integer: `La posición de ciclo debe ser un número entero mayor o igual a cero.`

Delete confirmation:

- Title: `Eliminar unidad`
- Description: `Esta acción eliminará la unidad. Los roles históricos conservarán sus registros existentes.`
- Confirm: `Eliminar`
- Cancel: `Cancelar`

### Rol

Route: `/rol`

Title: `Generador de rol`

Primary purpose:

- Generate, review, edit, publish, and export the daily work roster.

Default date:

- Tomorrow in the user's local date context.
- Display date input.

Top actions:

- `Cargar`
- `Re-generar rol`
- `Publicar rol`
- `Descargar Excel`

Data loading flow:

1. Load all active drivers:

```ts
pb.collection("drivers").getFullList({
  filter: "is_active=true",
  sort: "name",
})
```

2. Load roster for selected date:

```ts
pb.collection("daily_rosters").getFullList({
  filter: `date >= "${date} 00:00:00" && date <= "${date} 23:59:59"`,
  sort: "-date",
})
```

3. If roster found, load entries:

```ts
pb.collection("roster_entries").getFullList({
  filter: `roster="${roster.id}"`,
  sort: "departure_time",
  expand: "unit,driver",
})
```

4. Load standby entries:

```ts
pb.collection("standby_entries").getFullList({
  filter: `roster="${roster.id}"`,
  sort: "position",
  expand: "driver",
})
```

Empty state:

- Text: `No hay rol para esta fecha.`
- Button: `Generar rol`

Generate confirmation:

- If no roster exists, generate immediately or show a lightweight confirmation.
- If roster exists, show destructive confirmation:
  - Title: `Re-generar rol`
  - Description: `Esto eliminará el rol actual para esta fecha y creará uno nuevo.`
  - Confirm: `Re-generar`
  - Cancel: `Cancelar`

Roster status bar:

- `Estado: Borrador`
- `Estado: Publicado`
- If `published_at` exists, show: `Publicado: {formattedDateTime}`

Roster table columns:

- `Unidad`
- `Conductor`
- `Hora de salida`
- `Tipo`

Entry row behavior:

- `Unidad`: show unit number.
- If unit has no base driver, show warning icon.
- `Conductor`: editable searchable combobox or select of active drivers.
- `Hora de salida`: read-only text like `05:00`.
- `Tipo`: badge `Base` or `Relevo`.
- If `is_substitute = true`, highlight row with a subtle warning background and show `Relevo`.

Driver edit behavior:

On change:

```ts
await pb.collection("roster_entries").update(entry.id, {
  driver: selectedDriverId,
  is_substitute: selectedDriverId !== entry.expand?.unit?.base_driver,
})
```

Then reload entries.

Standby section:

Title: `Relevos de presentación`

Columns:

- `#`
- `Conductor`

Each standby driver is editable through a dropdown/combobox of active drivers.

On change:

```ts
await pb.collection("standby_entries").update(standby.id, {
  driver: selectedDriverId,
})
```

Publish confirmation:

- Title: `Publicar rol`
- Description: `Se publicará el rol y se enviará el Excel a los destinatarios activos.`
- Confirm: `Publicar`
- Cancel: `Cancelar`

After publish:

- Show toast: `Rol publicado y enviado.`
- Reload roster.

Download:

- Show `Descargar Excel` when a roster exists.
- It can be shown for draft and published rosters because the backend supports export for any valid roster visible to the user.

Important validation/UI warnings for this page:

- If the same driver appears more than once in roster entries or standby entries, show a non-blocking warning banner:
  `Hay conductores asignados más de una vez. Revisa el rol antes de publicarlo.`
- If any roster entry has no driver, show:
  `Hay unidades sin conductor asignado.`
- Do not block publishing client-side unless the backend rejects it, but make warnings obvious.

### Historial

Route: `/historial`

Title: `Historial de roles`

Data:

```ts
pb.collection("daily_rosters").getFullList({ sort: "-date" })
```

Table columns:

- `Fecha`
- `Estado`
- `Publicado`
- `Acciones`

Actions per row:

- `Ver`
- `Descargar Excel`
- `Re-enviar correo` admin only

View dialog:

Title: `Rol {fecha}`

Sections:

- `Rol del día`
- `Relevos de presentación`

The detail view is read-only.

Load detail entries:

```ts
pb.collection("roster_entries").getFullList({
  filter: `roster="${roster.id}"`,
  sort: "departure_time",
  expand: "unit,driver",
})
```

```ts
pb.collection("standby_entries").getFullList({
  filter: `roster="${roster.id}"`,
  sort: "position",
  expand: "driver",
})
```

Re-send email confirmation:

- Title: `Re-enviar correo`
- Description: `Se enviará nuevamente el Excel de este rol a los destinatarios activos.`
- Confirm: `Re-enviar`
- Cancel: `Cancelar`

Success toast:

- `Correo reenviado.`

### Configuración

Route: `/configuracion`

Admin only. Supervisors should not see this route in navigation. If a supervisor navigates directly, show an access denied page or redirect to `/`.

Title: `Configuración`

Section: `Destinatarios del correo`

Data:

```ts
pb.collection("email_recipients").getFullList({ sort: "email" })
```

Table columns:

- `Nombre`
- `Correo`
- `Estado`
- `Acciones`

Actions:

- `Agregar destinatario`
- `Editar`
- `Activar`
- `Desactivar`
- `Eliminar`

Create/edit dialog:

Fields:

- `Nombre`
- `Correo`
- `Estado`

Validation:

- Email required: `El correo es obligatorio.`
- Invalid email: `Ingresa un correo válido.`

Delete confirmation:

- Title: `Eliminar destinatario`
- Description: `Este destinatario dejará de recibir correos del rol.`
- Confirm: `Eliminar`
- Cancel: `Cancelar`

## Shared Components to Build

Build these reusable components:

- `AppShell`
- `SidebarNav`
- `PageHeader`
- `DataTable`
- `StatusBadge`
- `ConfirmDialog`
- `EmptyState`
- `LoadingState`
- `DriverCombobox`
- `UnitStatusBadge`
- `RosterStatusBadge`
- `RoleGate`
- `ErrorAlert`

Keep components simple. Do not over-abstract business logic into generic frameworks.

## Suggested File Structure

```txt
frontend/
  src/
    app/
      App.tsx
      routes.tsx
    components/
      app-shell.tsx
      confirm-dialog.tsx
      data-table.tsx
      empty-state.tsx
      error-alert.tsx
      loading-state.tsx
      page-header.tsx
      status-badge.tsx
      driver-combobox.tsx
    components/ui/
      ...shadcn generated components...
    lib/
      pb.ts
      dates.ts
      labels.ts
      api.ts
      auth.ts
      utils.ts
    pages/
      login.tsx
      dashboard.tsx
      drivers.tsx
      units.tsx
      roster.tsx
      history.tsx
      settings.tsx
    types/
      pocketbase.ts
    main.tsx
    index.css
```

## Date Handling

The backend stores PocketBase dates in UTC. The business timezone is `America/Tijuana`.

Frontend should:

- Use `YYYY-MM-DD` strings for date inputs.
- Display user-facing dates in Spanish.
- Avoid showing raw UTC timestamps.
- For date lookup filters, use a full-day range instead of exact equality.

Helpers:

```ts
export function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function tomorrowInputValue() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toDateInputValue(d)
}
```

For display, use `Intl.DateTimeFormat("es-MX", ...)`.

## Error Handling

Use toasts for successful actions and inline alerts for page-level errors.

Generic Spanish error messages:

- Load failure: `No se pudieron cargar los datos.`
- Save failure: `No se pudo guardar.`
- Delete failure: `No se pudo eliminar.`
- Generate failure: `No se pudo generar el rol.`
- Publish failure: `No se pudo publicar el rol.`
- Email failure: `No se pudo reenviar el correo.`
- Permission failure: `No tienes permisos para realizar esta acción.`

Always disable submit buttons while a mutation is in progress.

## Loading States

Use skeletons for page tables/cards and button-level loading states for mutations.

Examples:

- Dashboard cards: skeleton cards.
- Tables: skeleton rows.
- Dialog submit button: spinner + `Guardando...`
- Roster generation button: spinner + `Generando...`
- Publish button: spinner + `Publicando...`

## Role-Based UI

Use `pb.authStore.record?.role`.

Admin:

- Can see all nav items.
- Can create/edit/deactivate drivers.
- Can create/edit/delete units.
- Can manage email recipients.
- Can resend email.
- Can generate/edit/publish rosters.

Supervisor:

- Can see Panel, Conductores, Unidades, Rol, Historial.
- Can view drivers and units.
- Cannot create/edit/deactivate drivers.
- Cannot create/edit/delete units.
- Cannot access Configuración.
- Can generate/edit/publish rosters.
- Cannot resend email from Historial.

## Business Warnings to Surface

Dashboard:

- Operational units without base driver.
- Roster not sent after scheduler time.
- Fewer than 10 standby drivers available.

Units:

- Operational unit without conductor designado.

Roster:

- Substitute assignments.
- Units without assigned driver.
- Duplicate driver assignment.
- Standby list shorter than 10.

## Acceptance Criteria

The frontend is ready to wire up when:

1. Login works with PocketBase users.
2. Auth session survives refresh.
3. Logout clears auth and returns to login.
4. Admin sees all pages.
5. Supervisor does not see Configuración.
6. Supervisor cannot see driver/unit mutation controls.
7. Dashboard loads counts, alerts, and recent rosters.
8. Conductores supports search, filters, create, edit, and deactivate for admin.
9. Unidades supports filter, create, edit, delete for admin.
10. Unit base driver selector excludes drivers already assigned to another unit.
11. Rol page can load a date, generate a roster, edit entries, edit standby entries, publish, and download Excel.
12. Historial can list rosters, open read-only detail, download Excel, and allow admin to resend email.
13. Configuración can create/edit/toggle/delete email recipients.
14. All visible text is Spanish.
15. The UI uses shadcn/ui and Tailwind, not custom one-off CSS for basic components.
16. The app works at `http://127.0.0.1:8101` when served by PocketBase.
17. `npm run build` succeeds.

## Implementation Notes for v0

Build the frontend as if the backend exists, because it does. Do not mock the whole app as static-only screens.

It is acceptable to include small API wrapper functions and assume the PocketBase SDK is installed:

```ts
import PocketBase from "pocketbase"
```

Prefer real data loading hooks in each page over hardcoded mock arrays. Temporary empty states are fine, but the final generated code should call PocketBase.

Do not implement backend logic in the frontend. Roster generation, publishing, Excel export, email sending, cycle advancement, and unit-driver history are backend responsibilities.

