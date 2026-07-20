# Tasks: Fix 3 Pre-existing Bugs

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~140 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Phase 1: Foundation — Webhooks Library

- [ ] 1.1 `apps/web/lib/mercadopago/webhooks.ts` — Add `validateWebhookSignature(xSignature, xRequestId, dataId)` using SDK `WebhookSignatureValidator.validate`; keep old `verifySignature` for backward compat. Fix dedup fallback (L85): `Date.now()` → `${rawEvent.type}_${rawEvent.data?.id}_${rawEvent.action}`.

## Phase 2: LinkedIn OAuth CSRF

- [ ] 2.1 `apps/web/app/api/linkedin/auth/route.ts` — GET handler: after generating `state` (L26), set `__Secure-linkedin-oauth-state` cookie (httpOnly, Secure, SameSite=Lax, path=/api/linkedin/callback, maxAge=600) before returning response.
- [ ] 2.2 `apps/web/app/api/linkedin/auth/route.ts` — POST handler: when body includes `state`, verify against cookie; reject with 401 on mismatch. CSRF alone suffices when no state param (SPA flow).
- [ ] 2.3 `apps/web/app/api/linkedin/callback/route.ts` — Read state cookie and query `state` before token exchange (L58). Reject mismatch with 401 and redirect. Clear cookie (`maxAge:0`, same name/path/attributes) on ALL exit paths: unauthenticated, plan denied, rate-limited, OAuth error, missing params, exchange error, and success.

## Phase 3: MP Route Integration

- [ ] 3.1 `apps/web/app/api/webhooks/mercadopago/route.ts` — Import `validateWebhookSignature` instead of `verifySignature`. Parse JSON body before signature validation. Extract `x-signature`, `x-request-id`, and `event.data.id`. Call new adapter with these three values. Preserve dev unsigned behavior and production rejection for missing signatures.
- [ ] 3.2 `apps/web/lib/mercadopago/webhooks.ts` — Remove dead `verifySignature` function now that no code references it.

## Phase 4: Testing

- [ ] 4.1 `apps/web/__tests__/webhook-signature.test.ts` — Replace all `verifySignature` tests with `validateWebhookSignature` tests using canonical template `id:{dataId};request-id:{xRequestId};ts:{ts};`. Positive: valid HMAC passes. Negatives: missing `ts`, missing `v1`, invalid header, missing header, malformed header, altered hash, absent secret, missing `x-request-id`, missing `data.id`.
