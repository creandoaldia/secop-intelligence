# Design: Freshness Metadata UI

## Current Architecture

`source_health.last_success_at` already stores the Socrata success timestamp as Unix seconds. The procesos API reads that single `sourceHealth` row alongside its list query and returns it as `ultima_sincronizacion`; the listing page currently discards it. Dashboard and detail pages query the database directly, but neither reads source health. `Header` is a client component rendered by the authenticated layout and currently receives only the user.

## Proposed Architecture

Add one client-side shared badge and pass the existing timestamp down from each server boundary. No schema migration, sync change, or modification to `/api/procesos` is required. The authenticated layout will provide header data directly, avoiding an extra client fetch and a new endpoint.

```
source_health (socrata.last_success_at)
       ├─ Dashboard server page ──────────> FreshnessBadge
       ├─ /api/procesos ─> procesos page ─> ProcesosTable ─> FreshnessBadge
       ├─ detail left join ────────────────> ProcesoDetail ─> FreshnessBadge
       └─ authenticated layout ────────────> Header ────────> FreshnessBadge
```

| Decision | Choice | Rationale |
|---|---|---|
| Relative-time rendering | Client component, refresh every minute | Keeps displayed age current during an open session; server pages only supply serializable Unix seconds. |
| Absolute-date tooltip | Accessible CSS tooltip owned by the badge | Supports hover and keyboard focus without introducing a missing shared tooltip primitive. |
| Header data source | Query in authenticated layout and pass a prop | Preserves the proposal's UI-only scope and avoids a duplicate fetch/API endpoint. |
| List placement | Table-context header above `<Table>` | Remains visible for both results and the existing empty state; no row or sorting changes. |

## Component Changes

### 1. Shared `FreshnessBadge`
**File**: `apps/web/components/freshness-badge.tsx` (new)
**Change**: Create a `"use client"` component with `timestamp: Date | number | null | undefined`, optional `label`, and optional `status?: "healthy" | "degraded" | "down"`. Normalise input: if `timestamp` is a `Date` convert via `.getTime()`; if string parse as ISO; if number treat as Unix seconds; then compute age in ms. Calculate age on mount and every 60 seconds. Render `hace Nh` with green classes for `<24h`, `hace Nd` with yellow/amber classes for `<7d`, and red/destructive classes otherwise. **When `status` is `"down"` the badge shows red regardless of timestamp age.** Future timestamps render `"Sin datos"` (clock-skew protection). For absent or invalid timestamps render `Sin datos`. Add an absolute `es-CO` date/time tooltip, shown on hover and focus, plus an accessible label. The optional prefix precedes—not replaces—the relative value. Server renders a non-empty placeholder (e.g., `"—"` or the absolute time) to avoid a blank flash before hydration; client replaces with relative time after mount.
**Why**: Satisfies Requirements 1–4 with one consistent, dynamic and accessible presentation.
**Risk**: Browser/server time boundaries can change color after hydration. Calculate only after client mount and refresh at minute granularity; keep the missing-value branch explicit to prevent `NaN`.

### 2. Dashboard freshness
**File**: `apps/web/app/page.tsx` (imports at lines 1–10; query before line 40; render after line 42)
**Change**: Import `eq`, `sourceHealth`, and `FreshnessBadge`. Read the `socrata` row with the existing exported `db` (equivalent to `db.select().from(sourceHealth).where(eq(sourceHealth.source, "socrata"))`) and extract `lastSuccessAt`. Render exactly one `<FreshnessBadge label="Datos sincronizados:" ... />` immediately below `WelcomeBanner`.
**Why**: Places the system-level recency signal above dashboard content without changing `StatsCards` contracts.
**Risk**: One extra primary-key lookup. Use a selected single row (`.get()` under the current better-sqlite3 pattern); a missing row passes `null` and does not fail the dashboard.

### 3. Procesos list freshness
**File**: `apps/web/app/(authenticated)/procesos/page.tsx` (response type at line 48; table props at lines 82–90)
**Change**: Extend the local response shape with `ultima_sincronizacion: number | null` and pass it to `ProcesosTable` as `lastSuccessAt`.
**Why**: Consumes the existing API contract with no route change.
**Risk**: Older/malformed responses could omit the field; make it optional at the boundary and normalize to `null`.

**File**: `apps/web/components/procesos/procesos-table.tsx` (props at lines 31–39; table wrapper at line 114)
**Change**: Add `lastSuccessAt` to props, import `FreshnessBadge`, and render it in a small table-context header before `<Table>` with label `Datos sincronizados:`.
**Why**: It stays visible when `data.length === 0` while preserving five columns, sorting, pagination, and row navigation.
**Risk**: The client table receives one extra primitive prop only; no query-string or interaction logic changes.

### 4. Proceso detail freshness
**File**: `apps/web/app/(authenticated)/procesos/[id]/page.tsx` (imports at lines 4–6; `getProceso` at lines 20–23; render at line 82)
**Change**: Import `sourceHealth`; replace the direct process select with a `leftJoin(sourceHealth, eq(sourceHealth.source, "socrata"))`, selecting the process plus `lastSuccessAt`. Preserve `notFound` when no process exists and pass the timestamp separately to `ProcesoDetail`.
**Why**: Requirement 4 needs the current source metadata without coupling it to a process record.
**Risk**: A missing health row must not hide a valid process. The left join yields `null`, which the badge handles.

**File**: `apps/web/components/procesos/proceso-detail.tsx` (imports at lines 1–9; props at line 72; metadata rows before line 112)
**Change**: Accept `lastSuccessAt` and add `DetailRow label="Última sincronización"` containing `FreshnessBadge` in the existing General Information card.
**Why**: Keeps freshness in the required metadata context.
**Risk**: None beyond the nullable prop; no existing `Proceso` fields change.

### 5. Global header indicator
**File**: `apps/web/app/(authenticated)/layout.tsx` (imports at lines 1–4; before render at line 14; Header at line 18)
**Change**: Query the Socrata health row server-side and pass `lastSuccessAt` to `Header` only when `session.user.role !== "admin"`; pass `null` for admins.
**Why**: Avoids adding `/api/source-health`, client loading states, and duplicate requests.
**Risk**: The shell has one extra primary-key read; pass `null` on an absent row.

**File**: `apps/web/components/layout/header.tsx` (HeaderProps at lines 26–33; header content between lines 77–80)
**Change**: Add optional `lastSuccessAt` to props and render a compact `FreshnessBadge` before the user dropdown only when a timestamp exists. Hide it below the small-screen breakpoint so account controls retain space.
**Why**: Delivers optional P2 visibility to authenticated non-admin users without a mobile layout regression.
**Risk**: Omission is intentional when unavailable; no empty placeholder is rendered.

## Interfaces / Contracts

```ts
type FreshnessBadgeProps = {
  timestamp: Date | number | null | undefined // Date (Drizzle ORM), Unix seconds, or null
  label?: string
  status?: "healthy" | "degraded" | "down"   // overrides badge colour when "down"
}
```

The component normalises input: `Date` → `.getTime()`, `string` (ISO 8601) → `Date.parse()`, `number` → treat as Unix seconds × 1000. Future timestamps render as `"Sin datos"` (clock-skew protection). The server renders a non-empty placeholder to avoid a hydration flash; the client swaps in the relative age after mount.

`/api/procesos` remains unchanged: `ultima_sincronizacion` is consumed as an optional nullable Unix-second value.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit | Hour/day thresholds, label, missing data, absolute tooltip | Add `__tests__/freshness-badge.test.tsx` with jsdom and fake time. |
| Component | List empty state retains freshness; detail row receives null/value | Render components with test props; mock navigation hooks where needed. |
| Integration | Dashboard/layout/detail read the Socrata row | Extend an existing DB-backed test or add focused route/page query tests without changing API behavior. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. Roll back by removing the new component imports/props and the direct read-only queries.

## Open Questions

None.
