# Design: Plan Gating

## Current Architecture

`canUseFeature` in `apps/web/lib/auth.ts` owns a small plan-to-feature access map, but it has no `alertas` entry. The analysis flow is the only existing API consumer of that helper. LinkedIn, SENA mutations, and alert creation authenticate users but do not check plans; their pages also expose the relevant controls without a plan decision.

MercadoPago subscription authorization activates the local subscription and resets page usage, but does not copy `subscriptions.plan` to `users.plan`. Pricing cards duplicate paid prices rather than consume `PLAN_PRICING`.

## Proposed Architecture

Use `canUseFeature` as the single policy decision point. Server handlers check it immediately after authentication and before rate limiting, CSRF validation, request parsing, OAuth calls, database writes, or audit success logs. UI gates mirror the same helper only for discoverability; API gates remain authoritative.

```text
session.user.plan ──> canUseFeature ──> UI visibility / HTTP 403
MercadoPago subscription_authorized ──> subscriptions.plan ──> users.plan
PLAN_PRICING ──> pricing-card display
```

No schema, migration, route shape, or new endpoint is required. Existing GET access for SENA and Alertas remains unchanged.

## Component Changes

### 1. Alertas feature key
**File**: `apps/web/lib/auth.ts:100-110`
**Change**: Extend the `feature` union with `"alertas"` and add `alertas: ["basic", "pro", "premium"]` to `featureAccess`.
**Why**: Makes alert creation use the established access helper and excludes `free`.
**Risk**: Low; unknown feature keys still deny access by default.

### 2. LinkedIn API gating
**File**: `apps/web/app/api/linkedin/auth/route.ts:2, 12-16, 28-32`; `apps/web/app/api/linkedin/callback/route.ts:7, 16-24`
**Change**: Import `canUseFeature`; after the existing authenticated-session guard in GET and POST auth handlers, and after the callback's authenticated-session redirect guard, return the existing-style JSON 403 response when `!canUseFeature(session.user.plan ?? "free", "linkedin")`. The callback must return 403 before rate limiting and before reading OAuth parameters or exchanging a code.
**Why**: Blocks free-tier access before OAuth, token persistence, profile sync, or audit logging.
**Risk**: Low; a user upgraded while holding a JWT with an old plan claim remains denied until the session claim refreshes.

### 3. SENA API gating
**File**: `apps/web/app/api/sena/profiles/route.ts:2, 59-63`; `apps/web/app/api/sena/profiles/[id]/route.ts:2, 15-22`
**Change**: Import `canUseFeature` and insert the `sena_ilimitado` 403 guard immediately after authentication in POST and DELETE only. Leave `GET /api/sena/profiles` unchanged.
**Why**: Prevents profile creation/deletion before CSRF, payload/parameter validation, database mutations, and audits while retaining reads.
**Risk**: Low; paid plans preserve their current execution paths.

### 4. Alertas API gating
**File**: `apps/web/app/api/alertas/route.ts:2, 52-56`
**Change**: Import `canUseFeature` and add the `alertas` 403 guard after authentication and before rate limiting, CSRF validation, payload parsing, insertion, and audit logging. Do not change GET.
**Why**: Enforces the new paid-only Alertas policy with no creation side effects for free users.
**Risk**: Low; depends on change 1 for type-safe feature selection.

### 5. LinkedIn connect-button UI gating
**File**: `apps/web/components/linkedin/connect-button.tsx:18-24`; `apps/web/app/(authenticated)/perfil/page.tsx:1-8, 61`
**Change**: Accept `plan: string` in `ConnectButtonProps` (instead of `PlanType`) so `'free'` passes through without type mapping. Import `canUseFeature` and use it to control visibility:

- **Hide connect CTA** when `!canUseFeature(plan ?? "free", "linkedin")` — free users should not see a button to start connecting.
- **Keep disconnect button** visible when user has LinkedIn connected AND is on a free plan — downgraded users can still remove their existing connection.
- Both variants return `null` only when the respective action is not applicable.

Pass the session plan at the sole render site.
**Why**: `PlanType` is `'basic' | 'pro' | 'premium'` — it excludes `'free'`, which would require fragile mapping at each call site. Accepting `string` lets `canUseFeature` handle unknown values (returns `false` by default). Separating connect from disconnect prevents downgraded users from being stranded without a way to unlink their account.
**Risk**: Low; this is presentation-only and cannot replace the API gate.

### 6. SENA page upgrade prompt
**File**: `apps/web/app/(authenticated)/sena/page.tsx:1-9, 16-37`
**Change**: Import `canUseFeature` and the existing `EmptyState` (plus the minimal existing UI primitives needed for a `/planes` upgrade action). After session validation, evaluate `sena_ilimitado`; for denied plans, render the page header and an upgrade empty state instead of querying profiles or rendering `ProfileForm`/`ProfileList`. Keep the current query and UI branch intact for eligible plans.

**Design clarification**: The SENA page is a server component. `EmptyState` is a client component (it uses `useRouter`). To avoid nesting a client component directly in a server component, either: (a) wrap the upgrade branch in a thin client component shell, or (b) use a simple server-compatible upgrade message (`<div>` with `<a>` link to `/planes`) instead of `EmptyState`. Option (b) is preferred for simplicity.

**Why**: Gives free users a clear upgrade path and avoids loading management data they cannot mutate.
**Risk**: Low; session-plan freshness has the same JWT limitation as API gating.

### 7. Webhook plan upgrade
**File**: `apps/web/lib/mercadopago/webhooks.ts:138-180`
**Change**: Use `_rawEvent.type` in `handleSubscriptionEvent`; only for `subscription_authorized`, update the matched user's `plan` to `sub.plan` in addition to the existing subscription activation and page reset. Keep unmatched-subscription early return and cancellation downgrade unchanged.
**Why**: Aligns the user authorization plan with the activated local subscription without promoting users for other synchronization event types.
**Risk**: Low; `sub.plan` is constrained by the subscriptions schema to `basic`, `pro`, or `premium`.

### 8. Pricing card sync
**File**: `apps/web/components/planes/pricing-cards.tsx:16, 17-83, 145-150`
**Change**: Import `PLAN_PRICING`; replace each paid card's literal amount with its matching constant and format the numeric COP value at render time. Retain the free `$0` presentation and all feature metadata.
**Why**: The checkout source of truth controls displayed paid prices, eliminating the current 49k/149k/399k divergence.
**Risk**: **Business implication**: This is a price change, not just a sync. Current UI shows 49k/149k/399k while `PLAN_PRICING` has 29k/79k/199k — a ~41% difference. Confirm that `PLAN_PRICING` values are the intended checkout amounts. If so, the UI has been overstating prices by ~2x. Client-safe static constants preserve the current card behavior.

## Testing Strategy

Add focused tests for the access matrix, denied route paths (403 and no mocked external/database/audit calls), paid-path preservation, callback denial before OAuth exchange, webhook authorization plan update and unmatched no-op, and paid card values derived from `PLAN_PRICING`. Existing `plan-pricing.test.ts` and `webhook-signature.test.ts` are the closest test locations; route/UI tests may be added alongside current `apps/web/__tests__` conventions.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is changed.

## Migration / Rollout

No schema migration required, but a one-time backfill is needed for existing active subscriptions:

```sql
UPDATE users SET plan = subscriptions.plan
WHERE subscriptions.status = 'active'
  AND users.plan = 'free';
```

This ensures users who subscribed before the webhook plan-upgrade fix was deployed have the correct plan in `users.plan`. Deploy the shared feature key before or with its Alertas route consumer; no feature flag is needed.
