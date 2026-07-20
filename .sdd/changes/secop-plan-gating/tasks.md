# Tasks: Plan Gating

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~190-210 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Phase 1: Foundation

- [ ] 1.1 **Add "alertas" to `featureAccess`** — extend the feature union with `"alertas"` and add `alertas: ["basic", "pro", "premium"]` to `featureAccess` in `apps/web/lib/auth.ts:108-115`
- [ ] 1.2 **JWT plan refresh** — **Already implemented.** `lib/auth.ts:81-86` re-reads `users.plan` from DB on token refresh. Verify on review; no changes needed.

## Phase 2: API Gating

- [ ] 2.1 **LinkedIn auth gating** — import `canUseFeature` in `apps/web/app/api/linkedin/auth/route.ts`; guard GET and POST after auth with `!canUseFeature(session.user.plan ?? "free", "linkedin")` → JSON 403 before rate limiting / OAuth exchange
- [ ] 2.2 **LinkedIn callback gating** — import `canUseFeature` in `apps/web/app/api/linkedin/callback/route.ts:7`; guard GET after auth redirect with 403 before rate limiting or reading OAuth params
- [ ] 2.3 **SENA POST gating** — import `canUseFeature` in `apps/web/app/api/sena/profiles/route.ts:59`; add `sena_ilimitado` 403 guard after auth, before rate limiting / CSRF
- [ ] 2.4 **SENA DELETE gating** — import `canUseFeature` in `apps/web/app/api/sena/profiles/[id]/route.ts:15`; add `sena_ilimitado` 403 guard after auth, before rate limiting / CSRF
- [ ] 2.5 **Alertas POST gating** — import `canUseFeature` in `apps/web/app/api/alertas/route.ts:52`; add `alertas` 403 guard after auth, before rate limiting / CSRF
- [ ] 2.6 **Webhook plan upgrade** — **Already implemented.** `webhooks.ts:168-177` updates `users.plan` on `subscription_authorized` and `preapproval`. Verify on review; no changes needed.

## Phase 3: UI Gating & Pricing

- [ ] 3.1 **LinkedIn connect button** — accept `plan: string` in `ConnectButtonProps` in `apps/web/components/linkedin/connect-button.tsx`; hide connect CTA when `!canUseFeature(plan, "linkedin")`; keep disconnect visible for downgraded users; pass `user.plan` from `apps/web/app/(authenticated)/perfil/page.tsx:61`
- [ ] 3.2 **SENA upgrade prompt** — in `apps/web/app/(authenticated)/sena/page.tsx`, after session check, evaluate `canUseFeature(session.user.plan, "sena_ilimitado")`; for denied plans render a server-compatible `<a>` upgrade message to `/planes` instead of profile query/UI; keep existing branch for eligible plans
- [ ] 3.3 **Pricing card sync** — import `PLAN_PRICING` from `@/lib/mercadopago/types` in `apps/web/components/planes/pricing-cards.tsx`; replace literal amounts (49k/149k/399k) with `PLAN_PRICING[id].price` formatted in COP; free card retains `$0` (no "Alertas basicas" on free — already clean)

## Phase 4: Backfill

- [ ] 4.1 **Run backfill SQL** — execute once post-deploy: `UPDATE users SET plan = subscriptions.plan WHERE subscriptions.status = 'active' AND users.plan = 'free'`

## Phase 5: Testing

- [ ] 5.1 **Access matrix tests** — verify `canUseFeature(plan, "alertas")` returns `true` for `basic|pro|premium`, `false` for `free`
- [ ] 5.2 **API 403 tests** — each gated route returns 403 for free user with no DB writes, OAuth calls, or audit success logs (1 test per endpoint)
- [ ] 5.3 **Pricing card tests** — paid card COP values match `PLAN_PRICING` per tier
