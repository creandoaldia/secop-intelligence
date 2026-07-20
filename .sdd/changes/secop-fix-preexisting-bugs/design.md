# Design: Fix 3 Pre-existing Bugs

## Technical Approach

Persist and consume LinkedIn OAuth state at the HTTP boundary, delegate MercadoPago HMAC parsing and constant-time comparison to the installed SDK, and make the existing database dedup key deterministic. This implements Requirements 1–4 without schema changes or new dependencies.

## Architecture Decisions

| Decision | Choice | Alternative considered | Rationale |
|---|---|---|---|
| OAuth state storage | Secure, httpOnly, 5-minute cookie; compare before token exchange | Server-side state table | A short-lived cookie is scoped to the browser redirect and requires no persistence. |
| MP verification | `WebhookSignatureValidator.validate` from installed `mercadopago` 3.2 SDK | Manual HMAC implementation | The SDK builds the canonical manifest and performs constant-time comparison locally; it has no network dependency. |
| Dedup fallback | `type_data.id_action` | Timestamp fallback | Identical deliveries produce identical keys; different actions remain distinct. |

### Cookie-prefix compatibility (resolved)

The requested `__Host-linkedin-oauth-state` with `path=/api/linkedin/callback` is invalid per RFC 6265 (`__Host-` requires `Path=/`). Resolved by using `__Secure-linkedin-oauth-state` with `path=/api/linkedin/callback, maxAge=600` (10 min). `__Secure-` allows a specific path scope while maintaining https-only enforcement.

## Data Flow

```
GET /linkedin/auth -> generate state -> Set-Cookie -> LinkedIn authorization URL
LinkedIn redirect -> callback reads query + cookie -> equality check -> exchange/store/audit

MP POST -> parse JSON -> x-signature/x-request-id/data.id -> SDK validator
        -> processWebhookEvent -> stable eventId -> dedup table
```

## File Changes

| File | Action | Change (current line) | Why | Risk |
|---|---|---|---|---|
| `apps/web/app/api/linkedin/auth/route.ts` | Modify | L26–29: construct the JSON response after generating `state`, then set `__Secure-linkedin-oauth-state` with `httpOnly`, `secure`, `sameSite: "lax"`, `path=/api/linkedin/callback`, and `maxAge: 600` (10 min). L32–85 POST handler: after auth checks and CSRF validation, verify state cookie against query param. If the POST originates from the SPA (no state param), note that CSRF token is the protection — state cookie verification applies only when the POST carries a `state` param. | Binds the authorization request to the browser initiating it. | Missing or expired state cookie on POST with state param must return 401; if the SPA POST includes no state, CSRF alone is sufficient. |
| `apps/web/app/api/linkedin/callback/route.ts` | Modify | L16–100: read the state cookie and query `state`; before L58 token exchange, reject absent/mismatched values with 401. Clear the state cookie on ALL exit paths — early returns (unauthenticated request, rate limiting), validation failure, OAuth denial, and before success — to prevent stale cookies lingering. Deletion uses `maxAge: 0` with the same `__Secure-` name and callback path attributes. | Prevents CSRF and makes state single-use. Prevents stale-cookie reuse across sessions. | Clearing must use exactly the same name/path/secure attributes or stale state remains. |
| `apps/web/lib/mercadopago/webhooks.ts` | Modify | L33–72: remove body-plus-timestamp `verifySignature`; import/use SDK `WebhookSignatureValidator` in a thin boolean adapter accepting `xSignature`, `xRequestId`, and `dataId`. L85: change fallback to ``${rawEvent.type}_${rawEvent.data?.id}_${rawEvent.action}``. | Canonical validation no longer depends on raw body; dedup retries are stable. | SDK validation throws on malformed input, so the adapter must catch only validation failures and return false. Missing `action` intentionally produces `undefined`. |
| `apps/web/app/api/webhooks/mercadopago/route.ts` | Modify | L1–5: update import — replace `verifySignature` with `validateWebhookSignature` (the new SDK-backed adapter). L19–53: parse JSON before validating; extract `x-signature`, `x-request-id`, and string `event.data.id`; call the SDK-backed adapter with these values. Preserve existing production rejection for missing signatures and dev unsigned behavior. | Supplies all canonical-manifest inputs: `id:{dataId};request-id:{requestId};ts:{ts};`. | Parsing moves before signed validation; malformed JSON returns 400 without signature verification. |
| `apps/web/__tests__/webhook-signature.test.ts` | Modify | L8–86: replace body-based fixtures and calls to removed `verifySignature` with the adapter’s three inputs. Build positive HMAC from `id:123;request-id:req-123;ts:1712345678;`; retain rejection cases for invalid, missing `ts`, missing `v1`, missing header, malformed header, altered hash, and absent secret. | Locks the canonical template into regression coverage. | Tests must reset module state because the secret is read at import time. |

## Interfaces / Contracts

```ts
validateWebhookSignature(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
): boolean
```

The adapter passes `{ xSignature, xRequestId, dataId, secret: MP_WEBHOOK_SECRET }` to `WebhookSignatureValidator.validate`. No public webhook response contract or database schema changes. `MPWebhookEvent.data.id` is already the required string source; its optional runtime counterpart remains guarded at the route boundary.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Canonical MP signature accepted; all malformed/incomplete inputs rejected. Negative tests: missing `x-request-id` header, missing `data.id` in body, absent `x-signature` header. | Update `webhook-signature.test.ts` with deterministic HMAC fixtures. |
| Route integration | LinkedIn matching state continues; missing/mismatched state returns 401, clears cookie, and does not exchange/audit | Add mocked callback route tests. |
| Unit/integration | Same type/id/action produces the same fallback key; changed action differs | Mock DB around `processWebhookEvent`. |
| Manual | LinkedIn top-level OAuth redirect and real MP delivery | Verify browser cookie acceptance after resolving prefix/path choice, then verify accepted MP delivery. |

## Threat Matrix

N/A — although HTTP routes change, this change has no documentation-path execution, shell/subprocess, VCS, PR automation, executable-file classification, or process-integration boundary covered by the required matrix.

## Migration / Rollout

No migration required. Existing timestamp-based keys remain stored; only future fallback keys change. Deploy the OAuth cookie correction and MP validator together with tests, then monitor 401 responses and duplicate-skipped events.

**Pre/post-deploy dedup note**: Events processed before deployment used timestamp-based fallback keys. After deployment, the same retried event will generate a different (deterministic) key and be processed again. This is acceptable because each event is processed at most twice, and the second processing is idempotent: subscription updates are idempotent, and page resets are harmless.

## Open Questions

None — resolved: `__Secure-` prefix with callback path scope.
