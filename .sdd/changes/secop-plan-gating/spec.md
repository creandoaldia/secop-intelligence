# Spec: Plan Gating

## Requirement 1: Alertas feature key
**Priority**: P0
**Description**: Authorization helpers MUST recognize `"alertas"` as a valid feature key so alertas routes can apply the same plan-based gating model used by other premium features.

### Scenarios
- **Scenario 1.1**:
  - **Given** a route checks `canUseFeature(user.plan, "alertas")`
  - **When** the user plan is `basic`, `pro`, or `premium`
  - **Then** the helper returns `true`

- **Scenario 1.2**:
  - **Given** a route checks `canUseFeature(user.plan, "alertas")`
  - **When** the user plan is `free`
  - **Then** the helper returns `false`

### Acceptance Criteria
1. `alertas` is an allowed feature key in the shared authorization helper.
2. The access matrix for `alertas` matches the paid tiers and excludes `free`.

---

## Requirement 2: LinkedIn API gating
**Priority**: P0
**Description**: LinkedIn auth and callback endpoints MUST deny free-tier users with HTTP 403 before any OAuth exchange, token storage, or profile sync occurs.

### Scenarios
- **Scenario 2.1**:
  - **Given** an authenticated free user calls the LinkedIn auth or callback endpoint
  - **When** the request is processed
  - **Then** the endpoint responds with HTTP 403 and no LinkedIn side effects occur

- **Scenario 2.2**:
  - **Given** an authenticated `pro` or `premium` user calls the same endpoint with otherwise valid input
  - **When** the request is processed
  - **Then** the existing OAuth flow continues normally

### Acceptance Criteria
1. Free users receive HTTP 403 from both LinkedIn protected endpoints.
2. Denied requests do not exchange authorization codes, persist tokens, or write audit success events.

---

## Requirement 3: SENA API gating
**Priority**: P0
**Description**: SENA write operations MUST deny free-tier users while preserving existing authenticated read access and existing validation behavior for eligible plans.

### Scenarios
- **Scenario 3.1**:
  - **Given** an authenticated free user submits `POST /api/sena/profiles` or `DELETE /api/sena/profiles/[id]`
  - **When** the request is evaluated
  - **Then** the API responds with HTTP 403 and no profile mutation occurs

- **Scenario 3.2**:
  - **Given** an authenticated `pro` or `premium` user submits the same request with valid input
  - **When** the request is evaluated
  - **Then** the existing create or delete behavior still applies

### Acceptance Criteria
1. Only the listed SENA mutation endpoints are gated in this change.
2. GET listing behavior remains unchanged for authenticated users.

---

## Requirement 4: Alertas API gating
**Priority**: P0
**Description**: Alertas creation MUST be restricted to paid plans by returning HTTP 403 for free-tier users before the alert is validated or inserted.

### Scenarios
- **Scenario 4.1**:
  - **Given** an authenticated free user sends `POST /api/alertas`
  - **When** the request is processed
  - **Then** the API responds with HTTP 403 and no alert is created

- **Scenario 4.2**:
  - **Given** an authenticated paid user sends a valid alert payload
  - **When** the request is processed
  - **Then** the API preserves the current success path and returns the created alert

### Acceptance Criteria
1. `POST /api/alertas` is the only alertas endpoint gated by this change.
2. Denied requests do not create rows or success audit entries.

---

## Requirement 5: LinkedIn connect button UI gating
**Priority**: P1
**Description**: The LinkedIn connect control MUST be hidden from free-tier users so the UI does not advertise an unavailable integration.

### Scenarios
- **Scenario 5.1**:
  - **Given** a free user opens a screen that renders the LinkedIn connect component
  - **When** the component loads
  - **Then** no connect button is shown

- **Scenario 5.2**:
  - **Given** a `pro` or `premium` user opens the same screen
  - **When** the component loads
  - **Then** the current connect or disconnect control remains visible

### Acceptance Criteria
1. Free users do not see a LinkedIn connect CTA.
2. Existing connected-state and disconnect UI remain available for eligible plans.

---

## Requirement 6: SENA page upgrade prompt
**Priority**: P1
**Description**: The SENA page MUST show an upgrade prompt instead of profile management tools for free-tier users, while keeping the current page experience for eligible plans.

### Scenarios
- **Scenario 6.1**:
  - **Given** an authenticated free user visits `/sena`
  - **When** the page is rendered
  - **Then** the user sees an upgrade prompt instead of the profile form and profile list

- **Scenario 6.2**:
  - **Given** an authenticated `pro` or `premium` user visits `/sena`
  - **When** the page is rendered
  - **Then** the current profile management UI remains available

### Acceptance Criteria
1. The free-tier page clearly communicates that SENA profiles require an upgrade.
2. Eligible plans keep the existing data loading and profile actions.

---

## Requirement 7: Webhook plan upgrade
**Priority**: P0
**Description**: Subscription authorization webhooks MUST update `users.plan` to the subscribed tier when a matching local subscription is activated, alongside the existing renewal updates.

### Scenarios
- **Scenario 7.1**:
  - **Given** a stored subscription exists for a user and MercadoPago sends `subscription_authorized`
  - **When** the webhook activates the subscription
  - **Then** the subscription becomes active, the user's pages reset, and `users.plan` matches the subscription plan

- **Scenario 7.2**:
  - **Given** no local subscription matches the MercadoPago subscription id
  - **When** the webhook is processed
  - **Then** no user plan is changed

### Acceptance Criteria
1. Plan upgrade happens during successful subscription authorization handling.
2. Cancellation behavior that downgrades users to `free` remains intact.

---

## Requirement 8: Pricing card sync
**Priority**: P1
**Description**: Pricing cards MUST display paid-plan prices that exactly match `PLAN_PRICING`, preventing divergence between checkout data and plan marketing UI.

### Scenarios
- **Scenario 8.1**:
  - **Given** the pricing page renders Basic, Pro, and Premium cards
  - **When** the prices are shown
  - **Then** each card matches the corresponding `PLAN_PRICING` amount and currency formatting

- **Scenario 8.2**:
  - **Given** `PLAN_PRICING` values change in the future
  - **When** the pricing cards are updated for release
  - **Then** no paid card ships with a stale amount that differs from the pricing constant

### Acceptance Criteria
1. Basic shows 29,000 COP, Pro shows 79,000 COP, and Premium shows 199,000 COP.
2. The displayed paid-plan prices are consistent with the MercadoPago pricing source of truth.

---

## Requirement 9: Active subscription backfill
**Priority**: P0
**Description**: Existing active subscriptions whose `users.plan` was never upgraded (because the webhook fix is new) must be backfilled so those users are not incorrectly gated.

### Scenarios
- **Scenario 9.1**:
  - **Given** a user has an active subscription with status `active` and `plan = basic|pro|premium`
  - **When** the backfill runs
  - **Then** `users.plan` is set to match `subscriptions.plan`

- **Scenario 9.2**:
  - **Given** a user has a cancelled/expired subscription
  - **When** the backfill runs
  - **Then** `users.plan` is not changed

### Acceptance Criteria
1. The backfill SQL is run once after deployment.
2. Only users with `subscriptions.status = 'active'` AND `users.plan = 'free'` are updated.
