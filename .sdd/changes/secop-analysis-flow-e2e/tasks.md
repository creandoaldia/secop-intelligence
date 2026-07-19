# Tasks: SECOP Analysis Flow E2E

## Task 1: Shared constants and environment template
**Priority**: P0
**Files**: `apps/web/lib/constants.ts`, `apps/web/.env.example`
**Depends on**: none
**Description**: Derive `ANALYSIS_POLL_INTERVAL_MS` from env var `ANALYSIS_POLL_INTERVAL` with 10,000ms fallback (currently hardcoded). Add validated `ANALYSIS_RETENTION_DAYS` (default 30) and `CLEANUP_INTERVAL_MS` (6 hours in ms). Add defensive fallback for invalid/missing values — zero or NaN must not crash. Document `DOC2MD_SERVICE_URL`, `LLM_MODEL`, `ANALYSIS_POLL_INTERVAL`, and `ANALYSIS_RETENTION_DAYS` in `.env.example` with descriptive comments.
**Acceptance**:
- `ANALYSIS_POLL_INTERVAL_MS` defaults to 10_000 when env var is missing, NaN, or non-positive
- `ANALYSIS_RETENTION_DAYS` defaults to 30 when env var is missing, NaN, or non-positive
- `CLEANUP_INTERVAL_MS` is a hardcoded 6-hour constant (not env-derived)
- `.env.example` contains all 4 analysis env vars with accurate descriptions
- Existing `constants.test.ts` suite passes without changes

---

## Task 2: Worker model selection from environment
**Priority**: P0
**Files**: `apps/web/lib/analysis/worker.ts`
**Depends on**: none
**Description**: Define `LLM_MODEL` as a module-scoped constant reading `process.env.LLM_MODEL ?? "deepseek/deepseek-v4-flash"`. Replace the hardcoded `"deepseek-v4-flash"` strings at lines 167-168 in the `analysisResults` insert with this constant. The default matches the existing extractor and verifier defaults plus the `.env.example` OpenRouter identifier.
**Acceptance**:
- Worker reads `LLM_MODEL` from env at module load time
- Default is `"deepseek/deepseek-v4-flash"` when env var is absent
- Both `modeloExtraccion` and `modeloVerificacion` in the DB insert use the env-derived value
- Zero changes needed in `extractor.ts` or `verifier.ts`

---

## Task 3: Worker pagesTotal persistence after OCR
**Priority**: P0
**Files**: `apps/web/lib/analysis/worker.ts`
**Depends on**: Task 2
**Description**: Extend `updateJobStatus`'s `extra` type to accept `pagesTotal: number`. When `extra.pagesTotal` is provided, write `paginas_total` in the same atomic UPDATE call. After the successful `ocrResult` at line 113, merge `pagesTotal` into the existing progress update — call `updateJobStatus(jobId, "ocr", { progress: 35, pagesTotal: Math.max(1, ocrResult.pages) })`. This avoids a yield point where the UI could briefly see `paginasTotal=N` with `paginasProcesadas=0`. The placeholder `paginas_total=1` (set at job creation) survives until OCR resolves.
**Acceptance**:
- `updateJobStatus` type accepts `extra.pagesTotal` and writes `analysis_jobs.paginas_total` when provided
- After OCR succeeds, the DB row has the real page count from OcrResult.pages
- Normalized to minimum 1 (never stores zero or negative)
- Spec scenario 1.1 (multi-page) and 1.2 (fallback to 1) are satisfied
- Existing `updateJobStatus` callers without pagesTotal continue to work unchanged

---

## Task 4: Worker retention cleanup loop
**Priority**: P1
**Files**: `apps/web/lib/analysis/worker.ts`
**Depends on**: Task 1, Task 2
**Description**: Implement exported `cleanupOldJobs()` that deletes terminal jobs (`completed`, `failed`) older than `ANALYSIS_RETENTION_DAYS`. Use raw SQL via `db.run(sql\`DELETE FROM analysis_jobs WHERE estado IN ('completed','failed') AND created_at < unixepoch('now', '-' || ${ANALYSIS_RETENTION_DAYS} || ' days')\`)` — `unixepoch()` is required because `createdAt` stores epoch seconds (not text dates). In `startWorker()`, run `cleanupOldJobs()` once immediately, then store a separate cleanup interval reference. In `stopWorker()`, clear both the worker interval and the cleanup interval. Keep `cleanupStaleJobs()` unchanged.
**Acceptance**:
- `cleanupOldJobs()` deletes only terminal (`completed`, `failed`) jobs past the retention window
- Active/processing/pending jobs are never deleted
- Default retention is 30 days when env var absent
- Cleanup runs once on `startWorker()` call and then every 6 hours
- `stopWorker()` clears both intervals; no timer leaks after stop
- Job `createdAt` uses epoch seconds — comparison uses `unixepoch()`, never `datetime()`

---

## Task 5: Tracker error boundaries and terminal notifications
**Status**: ✅ Implemented
**Priority**: P0
**Files**: `apps/web/components/analysis/analysis-tracker.tsx`, `apps/web/lib/analysis/types.ts`
**Depends on**: none
**Description**: Three changes in the tracker component:
1. **401 handling**: In `poll()`, branch on `res.status === 401` to set an `authError` state discriminator and return a terminal outcome. Render a login CTA (`/login`) instead of the retry button when `authError` is true. The error block already exists — add a sub-branch.
2. **404 handling**: In `poll()`, branch on `res.status === 404` (currently falls through to generic error at line 58). Set a `notFound` terminal state and render a "deleted or expired" message with a back-to-search link.
3. **Terminal toasts**: Import `toast` from `sonner` (already in dependencies). Add a `useRef<AnalysisJobStatus | null>` for `previousStatus`. On each poll response that returns a job state, detect a **non-terminal→terminal** transition: if `previousStatus.current` is in `PROCESSING_STATES` and the new status is `completed` or `failed`, emit exactly one `toast.success()` / `toast.error()`. Skip toast emission on first mount (when `previousStatus.current` is null) or when transitioning between two non-terminal states. Update `previousStatus.current` after the check. Clear polling on any terminal outcome (auth, not_found, completed, failed).
**Acceptance**:
- 401 response renders login CTA within one poll cycle; retry button is NOT shown
- 404 response renders "El análisis fue eliminado o expiró" with a back-to-search link; retry is NOT shown
- Exactly one toast per job transition to `completed` (toast.success) or `failed` (toast.error)
- Reloading a page with an already-terminal job fires zero toasts
- Polling `setInterval` is cleared immediately on any terminal outcome
- All existing render paths (initial loading, processing StatusCard, completed ResultsDisplay, failed retry) remain visually unchanged

---

## Task 6: Test infrastructure — dependencies, configuration, and fixtures
**Priority**: P1
**Files**: `apps/web/package.json`, `apps/web/vitest.config.ts`, `apps/web/__tests__/fixtures/analysis.ts`
**Depends on**: none
**Description**: Add `msw`, `nock`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` as dev dependencies in `package.json`. Update `vitest.config.ts` — add `jsdom` as an additional environment option (per-file via `// @vitest-environment jsdom`), include `**/*.test.tsx` in the test file pattern, and add a `setupFiles` entry for jest-dom matchers. Create `__tests__/fixtures/analysis.ts` with factory functions that produce `AnalysisJob` and `AnalysisResult` objects matching the actual DB schema and API response shapes. Export helpers for every job status, configurable page counts, and error states.
**Acceptance**:
- `npm install` succeeds with all new dev dependencies
- Fixtures produce valid typed objects for all 7 job statuses
- A minimal smoke test renders under jsdom without crashing
- Fixture factories are individually importable for all 3 test files

---

## Task 7: Worker lifecycle tests
**Priority**: P1
**Files**: `apps/web/__tests__/analysis-worker.test.ts`
**Depends on**: Task 6
**Description**: Test the worker processing pipeline with mocked external dependencies:
- **Stage progression**: Mock `downloadPliegoToTemp` → `analyzeDocumentFromUrl` (nock) → `extractFromDocument` → `verifyExtraction`. Verify the job transitions through all 6 stages: `pending` → `downloading` → `ocr` → `extracting` → `verifying` → `completed`.
- **PagesTotal persistence**: Mock OCR returning `{ pages: 12, content: "..." }`. Verify `paginas_total` is updated to 12 after OCR and that progress is calculated against 12.
- **PagesTotal fallback**: Mock OCR returning `{ pages: 0, content: "..." }`. Verify `paginas_total` becomes 1 (Math.max guard).
- **Failure with retry**: Make extraction throw, verify job resets to `pending` with retry counter; after max retries, verify terminal `failed`.
- **Cleanup**: Insert old terminal jobs directly via test DB, call `cleanupOldJobs()`, verify only eligible rows are deleted.
- **Stale cleanup**: Call `cleanupStaleJobs()`, verify timed-out processing jobs are marked `failed`.
Use `beforeEach`/`afterEach` to reset all mocks, timers, and module state. Export `cleanupOldJobs` from worker if not already exported. No external network calls during tests.
**Acceptance**:
- All 6 worker stages are verified under mocked dependencies
- PagesTotal is tested for both multi-page (12) and fallback (1) scenarios
- Retry logic is exercised: at least one retry attempt and terminal failure after exhaustion
- `cleanupOldJobs` only deletes terminal jobs past retention
- `cleanupStaleJobs` only marks timed-out processing jobs
- Test isolation: no leaks between test cases

---

## Task 8: API route tests
**Priority**: P1
**Files**: `apps/web/__tests__/analysis-routes.test.ts`
**Depends on**: Task 6
**Description**: Test `POST /api/analysis/start` and `GET /api/analysis/[id]` using MSW handlers for auth session, DB mock for job/results, and the factory fixtures. Cover these status codes and bodies:
- **201**: Successful `POST /api/analysis/start` returns `{ jobId }`
- **400**: `POST` with invalid body returns validation error
- **401**: Both endpoints without session return `{ error: "Unauthorized" }`
- **403**: `POST` when user's plan lacks access or pages exhausted
- **404**: `GET` with non-existent or wrong-owner job ID
- **429**: Both endpoints after rate limit threshold
- **200**: `GET` with valid authenticated job returns `{ job, result }`
**Acceptance**:
- All 9 status-code scenarios assert exact HTTP status and response body shape
- 403 tests cover both "plan not available" and "pages limit exceeded" paths
- Rate limit test triggers `RL_STRICT` or `RL_STANDARD` threshold and asserts `429`
- MSW handlers are scoped per test case; no handler leakage between tests
- Real fetch is used; MSW intercepts at the network level

---

## Task 9: Tracker polling tests
**Priority**: P1
**Files**: `apps/web/__tests__/analysis-tracker.test.tsx`
**Depends on**: Task 6
**Description**: Render `AnalysisTracker` under jsdom (`// @vitest-environment jsdom`) with mocked `fetch` (MSW or global mock). Use Vitest fake timers for interval control. Test:
- **401 response**: Mock 401 from `GET /api/analysis/[id]` → assert login CTA is rendered, no retry button
- **404 response**: Mock 404 → assert "deleted or expired" message with back-to-search link
- **Generic error**: Mock network failure → assert error state with retry button
- **Processing state**: Mock 200 with `estado: "downloading"` → assert `StatusCard` is rendered with correct status
- **Completed result**: Mock 200 with `estado: "completed"` and result data → assert `ResultsDisplay` renders
- **Toast on transition**: Start mock returning `estado: "downloading"`, then switch to `"completed"` → assert exactly one `toast.success` call and polling stops
- **Toast on mount of completed job**: Mock first response as `"completed"` → assert zero toast calls, `ResultsDisplay` renders
Use `afterEach` to reset fake timers, MSW handlers, and module-level mocks. Assert toast calls by spying on the `sonner` module or mocking the `toast` import.
**Acceptance**:
- All 7 tracker scenarios pass
- One toast per terminal transition, zero toasts on mount of already-terminal job
- No polling interval remains active after any terminal outcome
- All auth/error/loading/result visual states render correctly under jsdom
