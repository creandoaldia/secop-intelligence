# Proposal: Freshness Metadata UI

## Intent

Show users when SECOP data was last synced so they can assess data freshness without admin access, replacing blind trust in potentially stale data.

## Scope

### In Scope

- Dashboard freshness badge reading `sourceHealth.lastSuccessAt` directly
- Procesos list table column consuming existing `ultima_sincronizacion` from `/api/procesos`
- Proceso detail page showing freshness via `sourceHealth` join and `DetailRow` component
- Header global freshness indicator visible to all users (non-admin)

### Out of Scope

- Historical sync logs or sync frequency charts
- Manual sync trigger from UI
- Email/push notifications for stale data
- Backend changes — API and DB already carry the data

## Capabilities

### New Capabilities

- `freshness-indicator`: Shared badge/component showing relative time ("synced 2h ago") with color-coded staleness threshold

### Modified Capabilities

- None — no spec-level behavior changes

## Approach

Consume existing `ultima_sincronizacion` from `/api/procesos` and `sourceHealth` table across four UI surfaces. Build a shared `FreshnessBadge` component with relative-time formatting (e.g., `intl-relative-time` or manual calculation) and configurable color threshold. No backend or schema changes — pure UI consumption of already-available data.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `components/freshness-badge.tsx` | New | Shared freshness indicator component |
| `app/page.tsx` | Modified | Add freshness badge from `sourceHealth` query |
| `procesos/page.tsx` | Modified | Consume `ultima_sincronizacion` from API |
| `procesos/procesos-table.tsx` | Modified | Add freshness column |
| `procesos/[id]/page.tsx` | Modified | Join `sourceHealth` |
| `procesos/[id]/proceso-detail.tsx` | Modified | Add freshness `DetailRow` |
| `components/header.tsx` | Modified | Add global freshness indicator |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Relative time formatting drifts over long stale periods | Low | Absolute date fallback for >30d |
| `sourceHealth` query adds latency to dashboard | Low | Single-row query, indexed by `id` |
| Header indicator duplicates API calls | Med | Batch with existing layout query or stale-while-revalidate |

## Rollback Plan

Remove `FreshnessBadge` imports and revert modified component files. No data model or schema changes — rollback is pure UI revert.

## Dependencies

None — all required data exists in `sourceHealth` table and `/api/procesos` response.

## Success Criteria

1. Dashboard shows "Synced X ago" badge reflecting `sourceHealth.lastSuccessAt`
2. Procesos list table shows per-row freshness matching `ultima_sincronizacion`
3. Proceso detail page shows freshness in metadata section via `sourceHealth` join
4. Header shows global freshness indicator visible to non-admin users
