# Proposal: Fix 3 Pre-existing Bugs

## Intent

Three production bugs discovered during audit: LinkedIn OAuth CSRF (state generated but never validated), MercadoPago webhook signature (wrong HMAC template — 100% rejection in production), and webhook dedup (`Date.now()` fallback makes retries bypass dedup). Each fix is surgical with zero external dependencies.

## Scope

### In Scope

1. **LinkedIn OAuth CSRF** — Persist OAuth `state` in `__Host-linkedin-oauth-state` cookie (httpOnly, Secure, SameSite=Lax, path=/api/linkedin/callback, maxAge=300). Callback reads cookie, compares to `state` query param, deletes cookie after verification.
2. **MP Signature template** — Replace `body + ts` HMAC template with correct `id:{dataId};request-id:{xRequestId};ts:{ts};`. Preferred: use `WebhookSignatureValidator` from `mercadopago` SDK (vendor-tested, no deps).
3. **Webhook dedup** — Remove `Date.now()` from `eventId` fallback. Use deterministic `type + data.id + action`.
4. **Test updates** — Fix `webhook-signature.test.ts` to verify the correct template.

### Out of Scope

- Any other CSRF hardening (Origin/Referer check already exists for POST)
- OAuth flow refactor or migration to POST-only
- Stripe or other payment providers
- Webhook retry or backoff changes
- Feature work, plan gating, or UI changes

## Capabilities

### New Capabilities

None — bug fixes only, no new features introduced.

### Modified Capabilities

None — no spec-level behavior changes. Existing contracts are preserved.

## Approach

| Bug | Strategy | Files |
|-----|----------|-------|
| LinkedIn CSRF | Cookie persists `state`; callback reads + compares + deletes | `auth/route.ts`, `callback/route.ts` |
| MP Signature | Option A: `WebhookSignatureValidator` from SDK. Fallback: fix template manually. | `webhooks.ts`, `route.ts`, `webhook-signature.test.ts` |
| Webhook Dedup | Replace `Date.now()` with `action` in fallback key | `webhooks.ts` (L85) |

Bugs 2 & 3 share `webhooks.ts` — fix together to avoid merge conflicts.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cookie rejected on callback (origin mismatch) | Low | `__Host-` enforces Secure + exact path; SameSite=Lax allows top-level redirect. Test with real LinkedIn flow. |
| SDK validator has network dep | Very Low | Local HMAC only — no HTTP calls. Verified before shipping. |
| `action` absent in some event types | Low | Falls back to deterministic key with `undefined` — still deduplicable. |
| Old events in DB with `Date.now()` key format | Low | No migration needed — existing keys still unique; new events use new format. |

## Rollback Plan

Per bug: revert the affected files to the previous commit. No schema migrations, no data backfill. If MP signature fix breaks valid webhooks, rollback `webhooks.ts` and `route.ts` first, then investigate SDK compatibility.

## Success Criteria

- [ ] **Bug 1**: Automated test: valid state cookie + matching query param succeeds; mismatch returns 401. Manual: full LinkedIn OAuth flow completes end-to-end.
- [ ] **Bug 2**: Signature test uses correct template and passes. Production webhooks accepted (401 eliminated).
- [ ] **Bug 3**: Duplicate MP webhooks (same `type` + `data.id` + `action`) produce identical `eventId` and dedup correctly.
