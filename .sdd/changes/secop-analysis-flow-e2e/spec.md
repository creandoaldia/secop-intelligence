# Spec: secop-analysis-flow-e2e

## Requirement 1: Real document page progress
**Priority**: P0
**Description**: The analysis flow MUST replace placeholder page totals with the real page count returned for the SECOP document as soon as that metadata is available. All subsequent job progress updates and tracker rendering MUST use the same persisted total so multi-page analyses no longer appear as "Page 1 of 1".

### Scenarios
- **Scenario 1.1**: Multi-page document updates total
  - **Given** an analysis job starts with an estimated page count and the OCR/download pipeline resolves a 12-page document
  - **When** the worker advances the job through downloading, OCR, extraction, and verification
  - **Then** the stored and returned `paginasTotal` value must become 12 and progress must be calculated against 12 pages

- **Scenario 1.2**: Page count unavailable fallback
  - **Given** an analysis job cannot obtain real page metadata from the document source
  - **When** the worker continues processing the document
  - **Then** the job must remain trackable with a minimum page total of 1 and must not fail only because page metadata is missing

### Acceptance Criteria
1. For multi-page documents, the tracker no longer renders a terminal or in-progress state with `paginasTotal = 1` unless the source actually has one page.
2. The same real page total is persisted on the job and returned by `GET /api/analysis/[id]` during all downstream states.

---

## Requirement 2: Resilient tracker terminal and auth handling
**Priority**: P0
**Description**: The AnalysisTracker MUST stop hanging on expired sessions or terminal job states. It MUST surface recoverable UI feedback for polling failures and MUST emit a single completion notification when a job reaches a terminal state.

### Scenarios
- **Scenario 2.1**: Expired session during polling
  - **Given** the tracker is polling an existing analysis job and the API responds with HTTP 401
  - **When** the next poll cycle completes
  - **Then** the tracker must show an authentication error state with a login link and stop silent indefinite polling

- **Scenario 2.2**: Completed analysis triggers notification
  - **Given** the tracker is polling a job that transitions from a processing state to `completed`
  - **When** the terminal status is received
  - **Then** the tracker must render the result, stop polling, and fire one success toast

- **Scenario 2.3**: Failed analysis triggers notification
  - **Given** the tracker is polling a job that transitions from a processing state to `failed`
  - **When** the terminal status is received
  - **Then** the tracker must render the failure state, stop polling, and fire one error toast

### Acceptance Criteria
1. A 401 response is surfaced to the user within one poll cycle with a visible login CTA.
2. Exactly one toast is emitted per job transition to `completed` or `failed`, and no additional polling continues after the terminal state is shown.

---

## Requirement 3: Configurable worker runtime and retention
**Priority**: P1
**Description**: The worker MUST read its model and retention behavior from documented environment configuration while preserving backward compatibility for current deployments. Terminal analysis jobs MUST be removed automatically after the configured retention window without deleting active jobs.

### Scenarios
- **Scenario 3.1**: Model selection from environment
  - **Given** `LLM_MODEL` is defined in the runtime environment
  - **When** the worker performs extraction and verification for a job
   - **Then** it must use that configured model value, and if the variable is absent it must fall back to `deepseek/deepseek-v4-flash` (matching the default in `extractor.ts` and `verifier.ts`)

- **Scenario 3.2**: Scheduled cleanup respects retention policy
  - **Given** completed or failed jobs exist that are older than the configured retention window
  - **When** the worker executes its periodic cleanup cycle every 6 hours
  - **Then** only terminal jobs older than `ANALYSIS_RETENTION_DAYS` must be deleted, using a default of 30 days when the variable is unset

- **Scenario 3.3**: Environment template documents analysis settings
  - **Given** a developer reviews the example environment file
  - **When** they inspect analysis-related variables
  - **Then** `DOC2MD_SERVICE_URL`, `LLM_MODEL`, `ANALYSIS_POLL_INTERVAL`, and `ANALYSIS_RETENTION_DAYS` must be present with descriptive comments

### Acceptance Criteria
1. Existing deployments without `LLM_MODEL` or `ANALYSIS_RETENTION_DAYS` continue to run with the documented defaults.
2. Cleanup never deletes jobs in non-terminal states and removes eligible terminal jobs within one 6-hour cleanup cycle.

---

## Requirement 4: Critical-path automated coverage
**Priority**: P1
**Description**: The change MUST add automated coverage for the analysis lifecycle paths that are required for reliable E2E behavior. Tests MUST verify worker progression, API authorization and ownership rules, and tracker polling outcomes.

### Scenarios
- **Scenario 4.1**: Worker lifecycle coverage
  - **Given** mocked dependencies for download/OCR/extraction/verification
  - **When** the worker processes analysis jobs through normal and failing paths
  - **Then** tests must cover the six lifecycle stages `pending`, `downloading`, `ocr`, `extracting`, `verifying`, and terminal completion/failure behavior

- **Scenario 4.2**: API route coverage
  - **Given** authenticated, unauthenticated, unauthorized, missing, and rate-limited requests to analysis routes
  - **When** the route handlers are exercised
   - **Then** tests must assert HTTP responses for 200/201 success and 400/401/403/404/429 error paths

- **Scenario 4.3**: Tracker polling coverage
  - **Given** mocked polling responses for success, timeout or generic error, and HTTP 401
  - **When** the tracker runs its polling loop
  - **Then** tests must verify success rendering, error handling, auth boundary rendering, and polling termination rules

### Acceptance Criteria
1. Automated tests cover worker lifecycle progression, API route status codes 200/201/400/401/403/404/429, and tracker polling success/timeout/error/401.
2. The new test suite passes without regressing existing tests for the analysis flow.
