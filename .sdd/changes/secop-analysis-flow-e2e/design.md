# Design: SECOP Analysis Flow E2E

## Current Architecture

`POST /api/analysis/start` creates an `analysis_jobs` row with the client-supplied placeholder `paginasEstimadas` (both callers send `1`) and reserves that many plan pages. `instrumentation.ts` starts the in-process worker, which claims `pending` jobs, optionally downloads a pliego to a temporary path, runs the OCR facade, extracts and verifies with the LLM, saves a result, and exposes the row unchanged through `GET /api/analysis/[id]`.

The actual page metadata does not come from `download-client.ts`: `downloadPliegoToTemp()` returns only a path (line 497). It is already returned by OCR: doc2md maps `metadata.pages` at `lib/ocr/doc2md-client.ts:64-68`, Azure maps `parsed.pages.length` at `lib/ocr/client.ts:163-167`, and local OCR returns `1`. The worker currently discards it at `worker.ts:113-114`. The tracker polls every three seconds, but treats 401 as a generic error and has no terminal notification guard.

## Proposed Architecture

Persist the resolved OCR `pages` immediately after OCR succeeds, normalized to `Math.max(1, pages)`. Thus the placeholder remains valid until metadata exists, then every later progress calculation (`updateJobStatus` line 54), API response, and `StatusCard` uses the same database value. No schema migration is required: `analysis_jobs.paginas_total` already exists.

Add a distinct tracker authentication state when polling receives 401. It renders an inline error boundary with a login link and does not offer a retry that will fail again. Keep generic polling errors on the existing retry boundary. A ref keyed by `analysisId` records whether the terminal toast was emitted; completion/failure both clear polling before calling one Sonner toast.

Make runtime defaults explicit at worker module scope: `LLM_MODEL = process.env.LLM_MODEL ?? "deepseek/deepseek-v4-flash"`, matching the existing extractor/verifier and `.env.example` OpenRouter identifier. Use it at `worker.ts:167-168` so persisted model metadata matches the model those services already select. Parse poll/retention settings defensively in `constants.ts`; retain existing defaults when unset/invalid. Run terminal-job retention once on startup and then at a separate six-hour interval, independent of the faster pending-job poll.

```
AnalyzeButton/Tracker -> start route -> analysis_jobs (total=1)
                                      |
instrumentation -> worker -> download path -> OCR OcrResult.pages
                                      |          |
                                      +-> UPDATE paginas_total -> GET /[id] -> StatusCard
                                      |
                              extraction / verification -> result + terminal state
```

## Component Changes

### 1. Analysis worker and retention loop
**File**: `apps/web/lib/analysis/worker.ts`
**Change**: After `ocrResult` at lines 113-114, call `updateJobStatus(jobId, "ocr", { progress: 35, pagesTotal })` merging both the progress update and pagesTotal into a SINGLE atomic call. Extend `updateJobStatus`'s `extra` type (`Partial<{ error: string; progress: number; pagesProcessed: number; pagesTotal: number }>`) and add a `paginas_total` write inside the function when `extra.pagesTotal` is provided. Define `LLM_MODEL` near imports and replace result literals at lines 167-168. Add exported `cleanupOldJobs()` beside `cleanupStaleJobs()`; use raw SQL `DELETE FROM analysis_jobs WHERE estado IN ('completed','failed') AND created_at < unixepoch('now', '-' || ${retentionDays} || ' days')` (compatible with SQLite epoch-second storage). `startWorker()` runs it once, stores the cleanup interval reference alongside `workerInterval`, and `stopWorker()` clears both.
**Why**: OCR is the first reliable page-count source; cleanup protects storage without touching active jobs. Merging pagesTotal into the existing update avoids a yield point where a UI poll could briefly see pagesTotal=N with pagesProcessed=0.
**Risk**: `createdAt` stores epoch seconds in SQLite; use `unixepoch('now', '-N days')` for comparison, never `datetime()` text format. The cleanup interval reference must be stored separately from `workerInterval` and cleared in `stopWorker()`. Retention is keyed on `createdAt` (not `completedAt`) since `completedAt` is not currently populated — jobs created long ago but completed recently may be purged on the next cycle; document this as acceptable given analysis results are independently stored.

### 2. Shared constants and environment template
**File**: `apps/web/lib/constants.ts`, `apps/web/.env.example`
**Change**: Derive `ANALYSIS_POLL_INTERVAL_MS` from `ANALYSIS_POLL_INTERVAL` with the existing 10,000-ms default (worker-side only; the client tracker retains its independent 3000ms hardcoded interval — wiring both is out of scope). Add validated `ANALYSIS_RETENTION_DAYS` (30) and a six-hour cleanup constant. Document `DOC2MD_SERVICE_URL`, `LLM_MODEL`, poll interval units, and retention days.
**Why**: Configuration is discoverable and backward compatible.
**Risk**: Invalid environment text must fall back, never produce zero/NaN intervals or retention.

### 3. Start API accounting
**File**: `apps/web/app/api/analysis/start/route.ts`, `apps/web/components/analysis/analyze-button.tsx`
**Change**: Keep the initial total of one for compatibility; name it as an estimate in request/audit semantics. Do not change the response contract. Future actual count is written only by the worker.
**Why**: Avoids blocking creation on SECOP/OCR availability.
**Risk**: Actual pages can exceed the initial reservation; this change intentionally preserves existing quota behavior rather than introducing an unrequested billing policy.

### 4. Polling error boundary and terminal toasts
**File**: `apps/web/components/analysis/analysis-tracker.tsx`
**Change**: At `poll()` line 58, branch on `res.status === 401`, set an auth error discriminator, and return a terminal polling outcome. Render a login CTA (`/login`) rather than `handleRetry`. Import `toast` from `sonner`; use a `useRef` reset on `analysisId` to emit `toast.success`/`toast.error` exactly once when lines 64-66 first receive a terminal state.
**Why**: Session expiry is recoverable and terminal status must be observable.
**Risk**: React rerenders and overlapping initial/interval polls can duplicate notifications; the ref is set before emitting and polling is cleared for every terminal outcome. The toast guard must use a NON-terminal→terminal transition detector, not just a state check — first mount of an already-completed job must NOT emit a toast. Track `previousStatus` in a ref and only emit when transitioning from a processing state (`pending|downloading|ocr|extracting|verifying`) to a terminal state (`completed|failed`), not on initial state load.

### 5. API read contract + 404 tracker handling
**File**: `apps/web/app/api/analysis/[id]/route.ts`, `apps/web/lib/analysis/types.ts`, `apps/web/components/analysis/analysis-tracker.tsx`
**Change**: Preserve the existing `{ job, result }` response and ownership filter; align tracker-facing types with nullable/default page fields only if required by the test fixture. In the tracker's `poll()` at line 57-59, add explicit 404 handling: set a terminal "not_found" state and render a "deleted or expired" message with a back-to-search link. This prevents infinite spinner when retention cleanup removes a job the user is viewing.
**Why**: Cleanup (Req 3) can delete jobs while the tracker is mid-poll. The tracker must handle 404 as a terminal outcome, not a transient error.
**Risk**: Preserve 401/404/429 ordering and current JSON shape for API route. The 404 tracker state is read-only and needs no auth check.

### 6. Automated critical-path coverage
**File**: `apps/web/package.json`, `apps/web/vitest.config.ts`, `apps/web/__tests__/analysis-worker.test.ts`, `apps/web/__tests__/analysis-routes.test.ts`, `apps/web/__tests__/analysis-tracker.test.tsx`, `apps/web/__tests__/fixtures/analysis.ts`
**Change**: Keep the project-wide `__tests__` convention. Add MSW for route fetches, factory fixtures for in-memory SQLite/Drizzle rows, and nock for doc2md/OpenRouter/OCR external calls. Add jsdom plus React Testing Library dependencies/configuration for the tracker (Vitest is installed; MSW/nock/RTL are not declared). Test all six worker states, page fallback/update, cleanup, API 200/201/401/403/404/429, and tracker 401/generic error/one-toast/stop-polling paths.
**Why**: Each requirement is independently executable without SECOP or LLM access.
**Risk**: Global worker intervals and mocked modules can leak between tests; export cleanup/stop hooks and reset timers, handlers, and modules in `afterEach`.
