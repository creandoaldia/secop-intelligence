# Spec: Freshness Metadata UI

## Requirement 1: Shared freshness badge
**Priority**: P0
**Description**: The UI MUST provide a shared `FreshnessBadge` that accepts a Date object, Unix timestamp (seconds), or ISO 8601 string and an optional label, displays relative freshness in Spanish, applies color coding by age, and exposes the absolute date in a tooltip. The component normalises all accepted types to epoch milliseconds for age calculation.

### Scenarios
- **Scenario 1.1**: Fresh data is shown as healthy
  - **Given** a valid timestamp less than 24 hours old (supplied as Date object, Unix seconds, or ISO 8601 string)
  - **When** the badge is rendered
  - **Then** it shows a relative label such as "hace 2h" with a green visual state

- **Scenario 1.2**: Stale data is highlighted
  - **Given** a valid timestamp older than 7 days
  - **When** the badge is rendered
  - **Then** it shows the relative age with a red visual state and a tooltip with the absolute date/time

### Acceptance Criteria
1. A timestamp under 24 hours renders as green; 24 hours to under 7 days renders as yellow; 7 days or more renders as red.
2. The badge supports an optional visible label prefix without hiding the relative time value.
3. Hover or focus reveals the absolute sync date in a locale-formatted tooltip.
4. The badge accepts `Date` objects (from Drizzle ORM), Unix seconds, and ISO 8601 strings — all normalised to epoch ms for comparison.
5. An optional `status` prop (`"healthy" | "degraded" | "down"`) overrides badge colour to red when status is `"down"`, regardless of timestamp age.
6. Timestamps in the future render as `"Sin datos"` to guard against clock skew.

---

## Requirement 2: Dashboard data freshness
**Priority**: P0
**Description**: The dashboard MUST show the latest SECOP sync freshness using the existing `sourceHealth.lastSuccessAt` value so authenticated users can assess data recency from the home page.

### Scenarios
- **Scenario 2.1**: Dashboard shows latest sync age
  - **Given** `sourceHealth.lastSuccessAt` exists for the SECOP source
  - **When** an authenticated user opens the dashboard
  - **Then** the page shows a freshness badge with text equivalent to "Datos sincronizados: hace X"

- **Scenario 2.2**: Dashboard handles missing freshness data
  - **Given** no successful sync timestamp is available
  - **When** the dashboard is rendered
  - **Then** the freshness area shows a clear unavailable state instead of an invalid relative time

### Acceptance Criteria
1. The dashboard renders exactly one freshness indicator sourced from the current SECOP sync metadata.
2. The indicator is visible without admin access.
3. Missing timestamps do not produce broken text, `NaN`, or empty badge content.

---

## Requirement 3: Procesos list freshness visibility
**Priority**: P0
**Description**: The procesos listing MUST expose freshness metadata already returned by `/api/procesos`, allowing users to understand how recent the listed data is from the listing surface.

### Scenarios
- **Scenario 3.1**: List shows API freshness metadata
  - **Given** `/api/procesos` returns `ultima_sincronizacion`
  - **When** the procesos page renders results
  - **Then** the page shows a freshness badge in the listing header or table context using that timestamp

- **Scenario 3.2**: List preserves empty-state behavior
  - **Given** the API returns zero procesos and a valid `ultima_sincronizacion`
  - **When** the table renders the empty state
  - **Then** the empty-state message remains visible and the freshness indicator still shows the sync age

### Acceptance Criteria
1. The procesos page consumes `ultima_sincronizacion` from the existing API response without requiring API changes.
2. The freshness indicator remains visible for populated and empty result sets.
3. Existing sorting, pagination, and row navigation behavior remain unchanged.

---

## Requirement 4: Proceso detail freshness metadata
**Priority**: P1
**Description**: The proceso detail view MUST show the latest SECOP source synchronisation time as part of its metadata so users can validate data recency while reviewing a single process. The timestamp comes from `sourceHealth` (global per source, not per record) — the label clarifies this is source-level freshness, not record-level.

### Scenarios
- **Scenario 4.1**: Detail page shows last sync row
  - **Given** a proceso exists and SECOP source freshness metadata is available
  - **When** the user opens the proceso detail page
  - **Then** the detail metadata includes a row labeled "Última sincronización de datos" with the shared freshness badge

- **Scenario 4.2**: Detail page handles unavailable freshness
  - **Given** the proceso exists but no sync timestamp is available
  - **When** the detail page is rendered
  - **Then** the "Última sincronización de datos" row shows a clear unavailable state

### Acceptance Criteria
1. The detail page displays freshness inside the metadata section, not as a separate admin-only control.
2. The row label is exactly "Última sincronización de datos" — reflecting it is global source freshness, not per-record.
3. Missing freshness data does not block proceso detail rendering.

---

## Requirement 5: Global header freshness indicator
**Priority**: P2
**Description**: The application header MAY show a global SECOP freshness indicator for non-admin users when space and layout constraints allow it.

### Scenarios
- **Scenario 5.1**: Non-admin user sees header freshness
  - **Given** a non-admin authenticated user and available freshness metadata
  - **When** the shared header is rendered
  - **Then** the header shows a compact freshness badge without removing existing account controls

- **Scenario 5.2**: Header omits indicator when not applicable
  - **Given** the indicator is unavailable or intentionally not enabled
  - **When** the header renders
  - **Then** the rest of the header layout continues to function without empty placeholder content

### Acceptance Criteria
1. The header indicator is optional and MUST NOT block delivery of Requirements 1 through 4.
2. If shown, it is visible to non-admin users and does not replace sign-out or plan controls.
3. If omitted, no layout regression is introduced in desktop or mobile header states.
