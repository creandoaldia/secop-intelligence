# Proposal: Plan Gating

## Intent

Free users can access LinkedIn, SENA, and Alertas features without plan checks — analysis is the only gated surface. Close all gaps to enforce feature gating by plan tier.

## Scope

### In Scope

1. **Add `"alertas"` key to `canUseFeature`** — `lib/auth.ts` so route handlers can gate alertas endpoints
2. **LinkedIn API gating** — `api/linkedin/auth/route.ts` and `api/linkedin/callback/route.ts` reject free-tier requests
3. **SENA API gating** — `api/sena/profiles/route.ts` (POST) and `api/sena/profiles/[id]/route.ts` (DELETE) reject free-tier
4. **Alertas API gating** — `api/alertas/route.ts` (POST) rejects free-tier
5. **LinkedIn connect button UI gating** — `components/linkedin/connect-button.tsx` hides behind plan check
6. **SENA profiles page UI gating** — `app/(authenticated)/sena/page.tsx` shows upgrade prompt for free users
7. **MercadoPago webhook plan upgrade** — `lib/mercadopago/webhooks.ts` actually updates `users.plan` on payment success
8. **Pricing card price sync** — `pricing-cards.tsx` matches prices to `PLAN_PRICING` constant
9. **Backfill existing active subscriptions** — one-time SQL: `UPDATE users SET plan = subscriptions.plan WHERE subscriptions.status = 'active' AND users.plan = 'free'`

### Out of Scope

- Gating for future features (pending/entregas, etc.)
- Granular per-endpoint gating beyond the 5 API routes listed
- UI gating for alertas (no page exists yet)
- Stripe/webhook refactor or idempotency keys

## Approach

Straightforward: each affected API route wraps its handler with `canUseFeature(user, "featureKey")` returning 403 if denied. UI components use the same check client-side to hide or redirect. The webhook fix is a one-line update. The pricing sync is a data-only change.

Ordered by dependency:
1. **Add `"alertas"` key** in `PLAN_FEATURES` — prerequisite for alertas gating
2. **Pricing card sync** — standalone data fix
3. **Webhook plan upgrade** — standalone backend fix
4. **API gating** — 5 routes, same pattern
5. **UI gating** — 2 components, same pattern

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Free users lose access mid-session | Low | UI gating is client-side; API gating is server-enforced. Existing sessions re-check on next call. |
| Webhook fix breaks active payments | Low | Only changes the upgrade assignment; idempotent for already-upgraded users |
| Pricing mismatch overlooked in one card | Low | Single source of truth: `PLAN_PRICING`; card UI reads from it |

## Success Criteria

1. `Authorize({ feature: "alertas" })` works in route handlers
2. Free user receives 403 on `POST /api/linkedin/auth`, `POST /api/linkedin/callback`, `POST /api/sena/profiles`, `DELETE /api/sena/profiles/[id]`, `POST /api/alertas`
3. Free user sees no LinkedIn connect button; Professional+ user sees it
4. Free user on `/sena` sees upgrade prompt instead of profiles
5. MercadoPago webhook sets `users.plan` on payment approval; manual update is no longer needed
6. Pricing cards display prices identical to `PLAN_PRICING` for all 3 tiers
