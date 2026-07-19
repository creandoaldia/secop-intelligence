# Proposal: secop-analysis-flow-e2e

## Intent

Analysis pipeline (worker + UI + API) works at ~85% but 7 gaps block production E2E: progress stuck at "Page 1 of 1", expired sessions freeze UI, no completion signal, hardcoded model names, undocumented doc2md URL, unbounded job accumulation. Close them for a complete, observable, resilient flow.

## Scope

### In Scope

1. **Real page progress** — replace `paginasEstimadas: 1` with actual SECOP page count, wire through worker stages
2. **401 error boundary** — detect expired session in AnalysisTracker, show login CTA instead of hanging
3. **Completion toast** — sonner notification on job `completed`/`failed`
4. **Document env vars** — `DOC2MD_SERVICE_URL`, `LLM_MODEL`, `ANALYSIS_POLL_INTERVAL`, `ANALYSIS_RETENTION_DAYS` to `.env.example`
5. **Model from env** — `worker.ts` reads `LLM_MODEL` instead of hardcoded `"deepseek-v4-flash"`, with backward-compat default
6. **Cleanup TTL** — scheduled pass deletes jobs older than configurable retention (default 30d)
7. **Test critical paths** — worker lifecycle, API routes, AnalysisTracker polling

### Out of Scope

- Analysis history view, feedback mechanism, pages auto-reset cron, worker concurrency, SSE/WebSocket

## Approach

Ordered by risk. 1-2 are safe config changes. 3-4 are UI fixes. 5 touches data flow. 6 adds infra. 7 validates.

1. **Env vars** — append to `.env.example`. Zero risk.
2. **Model name** — `const model = process.env.LLM_MODEL || "deepseek-v4-flash"` in `worker.ts`. No breakage.
3. **Real progress** — pass page count from SECOP download step (already available). Update `AnalysisTracker` range.
4. **401 boundary** — `if (res.status === 401)` check in polling → error state with login link.
5. **Toast** — import sonner `toast` (already installed). Fire on terminal status transition in tracker.
6. **Cleanup** — `cleanupOldJobs()` in `worker.ts` every 6h. `DELETE ... WHERE created_at < datetime('now', '-30 days') AND estado IN ('completed','failed')`.
7. **Tests** — Vitest + MSW (API), factory fixtures (DB), nock (worker externals). Tiered: unit logic → integration with mock clients → dev smoke.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Page count unavailable before download | Medium | Fallback to hardcoded 1 |
| Cleanup deletes jobs still viewed | Low | 24h grace after terminal status |
| Tests brittle from mocking 3 services | Medium | Tiered: unit logic in isolation, orchestrator with mocks, dev smoke |

## Success Criteria

1. Progress bar shows real page count for multi-page docs (not "Page 1 of 1")
2. Expired session shows login error within 1 poll cycle
3. Toast fires within 3s of job completion/failure
4. All 4 env vars documented in `.env.example`
5. Worker reads `LLM_MODEL` from env; existing deployments work unmodified
6. Jobs > 30d retain deleted within one cleanup cycle
7. Worker lifecycle tests cover all 6 stages (mocked)
8. API route tests cover 200, 401, 403, 404, 429
9. Zero test regressions
