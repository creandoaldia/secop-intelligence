# Spec: Fix 3 Pre-existing Bugs

## Requirement 1: LinkedIn OAuth state persistence
**Priority**: P0
**Description**: The LinkedIn OAuth start endpoint MUST persist the generated `state` in an httpOnly cookie, and the callback endpoint MUST accept the OAuth redirect only when the cookie value matches the `state` query parameter.

### Scenarios
- **Scenario 1.1**:
  - **Given** an eligible authenticated user starts the LinkedIn OAuth flow
  - **When** the auth endpoint returns the authorization URL
  - **Then** the response includes a short-lived httpOnly state cookie and the URL includes the same `state` value

- **Scenario 1.2**:
  - **Given** the callback receives a `code` and `state` query parameter plus a matching state cookie
  - **When** the callback validates the request
  - **Then** the OAuth exchange continues and the state cookie is cleared before the flow completes

- **Scenario 1.3**:
  - **Given** the callback receives a missing or mismatched state cookie
  - **When** the callback validates the request
  - **Then** it responds with HTTP 401 and no token exchange, profile sync, or success audit occurs

### Acceptance Criteria
1. The OAuth start response sets an httpOnly, Secure, SameSite=Lax cookie scoped to the callback path.
2. Successful callbacks require query `state` and cookie `state` equality.
3. The callback clears the state cookie after validation, whether the request succeeds or is rejected.

---

## Requirement 2: MercadoPago signature canonical template
**Priority**: P0
**Description**: MercadoPago webhook signature verification MUST validate against canonical manifest string `[id:{data.id};][request-id:{x-request-id};]ts:{ts};` — `id:` and `request-id:` parts are omitted when their values are falsy, matching the mercadopago SDK behavior.

### Scenarios
- **Scenario 2.1**:
  - **Given** a webhook request includes `x-signature`, `x-request-id`, `ts`, and `data.id`
  - **When** the signature matches the canonical manifest string
  - **Then** the webhook is accepted for processing

- **Scenario 2.2**:
  - **Given** a webhook request uses a signature computed from any non-canonical template
  - **When** signature verification runs
  - **Then** the request is rejected as invalid

### Acceptance Criteria
1. Signature verification uses `data.id`, `x-request-id`, and `ts` in the exact canonical order.
2. Request body text alone is not sufficient to produce a valid signature.

---

## Requirement 3: Webhook dedup deterministic fallback key
**Priority**: P0
**Description**: Webhook deduplication MUST derive its fallback event key from stable event fields and MUST NOT depend on the current clock.

### Scenarios
- **Scenario 3.1**:
  - **Given** two retries of the same webhook share the same `type`, `data.id`, and `action`
  - **When** no explicit webhook event id is present
  - **Then** both requests resolve to the same fallback event key and the second delivery is treated as a duplicate

- **Scenario 3.2**:
  - **Given** two webhook events share `type` and `data.id` but have different `action` values
  - **When** fallback event keys are derived
  - **Then** the resulting keys are different

### Acceptance Criteria
1. The fallback dedup key is deterministic for identical retries.
2. No fallback key includes `Date.now()` or any other runtime timestamp source.

---

## Requirement 4: Webhook signature test coverage
**Priority**: P1
**Description**: Automated webhook signature tests MUST assert the canonical MercadoPago signing template so regressions in verification logic are detected before release.

### Scenarios
- **Scenario 4.1**:
  - **Given** the signature test suite builds a valid MercadoPago signature fixture
  - **When** the fixture is verified
  - **Then** it uses the canonical manifest string and passes

- **Scenario 4.2**:
  - **Given** a fixture omits or alters canonical template fields
  - **When** the verifier runs
  - **Then** the test asserts rejection

### Acceptance Criteria
1. Positive tests use the canonical `id/request-id/ts` template.
2. Negative tests cover malformed or incomplete signature inputs.
