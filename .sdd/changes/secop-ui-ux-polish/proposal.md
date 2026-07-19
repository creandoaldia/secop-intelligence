# Proposal: secop-ui-ux-polish

## Change ID

`secop-ui-ux-polish`

## Intent

The app compiles but has several UX gaps, dead UI paths, and a critical runtime bug that makes LLM analysis permanently stuck in "pending." This change addresses the top 7 surface-level issues blocking a polished user experience.

## Scope

### Item A — Build fix (downlevelIteration)

**IN:**
- Add `"downlevelIteration": true` to `apps/web/tsconfig.json:19`

**OUT:**
- Any other tsconfig changes

### Item B — Toast system

**IN:**
- Add `sonner` to `package.json` dependencies
- Create `components/ui/sonner.tsx` (shadcn-style wrapper, `Toaster` component)
- Add `<Toaster />` to `app/layout.tsx` (root layout)
- Add `toaster.css` or use sonner's built-in styling via Tailwind

**OUT:**
- Custom toast implementation via @base-ui/react
- Replacing any existing feedback mechanism (form errors, inline errors stay as-is)
- Toasts for every action — only destructive/confirm actions initially

### Item C — AlertDialog + replace confirm()

**IN:**
- Create `components/ui/alert-dialog.tsx` using @base-ui/react primitives (AlertDialog has native `AlertDialog.Props` in @base-ui)
- Replace 4 `confirm()` calls:
  1. `subscription-manager.tsx:52` — cancel subscription
  2. `profile-list.tsx:34` — delete profile
  3. `alertas/page.tsx:68` — delete alert
  4. `connect-button.tsx:40` — disconnect LinkedIn
- Each replacement: open AlertDialog on click, confirm action on accept

**OUT:**
- Replacing any other native dialog usage (AlertForm, etc.)
- Adding AlertDialog to pages that don't already have destructive actions

### Item D — Loading skeletons (7 pages)

**IN:**
- Create `app/loading.tsx` — Dashboard loading (use `SkeletonBox`, `SkeletonCard` from shared)
- Create `app/(authenticated)/procesos/[id]/loading.tsx` — Proceso detail loading
- Create `app/(authenticated)/pac/loading.tsx` — PAC loading
- Create `app/(authenticated)/perfil/loading.tsx` — Perfil loading
- Create `app/(authenticated)/planes/loading.tsx` — Planes loading
- Create `app/(authenticated)/sena/loading.tsx` — SENA loading
- Create `app/(authenticated)/suscripcion/loading.tsx` — Suscripcion loading
- Each matches the page's layout shape (skeleton cards for grid pages, skeleton text for detail pages)

**OUT:**
- Skeleton components already exist in `components/shared/` — no new skeleton primitives
- Replacing existing `(authenticated)/loading.tsx` spinner — it stays as fallback for layout-level loading

### Item E — Dashboard chart data wiring

**IN:**
- Add `getProcesosByMonth()` query to `lib/db/queries/` (or inline in dashboard page)
- Query: `SELECT strftime('%Y-%m', fecha_publicacion) as mes, COUNT(*) as total FROM procesos GROUP BY mes ORDER BY mes DESC LIMIT 12`
- Pass data via `ProcesosChart initialData` prop from `app/page.tsx`

**OUT:**
- Client-side fetching — data comes from server component
- Filter controls or date range picker on chart
- Chart drilling (clicking a bar to see procesos)

### Item F — Admin page (sync dashboard)

**IN:**
- Create `app/admin/layout.tsx` — role guard (redirect non-admin users)
- Create `app/admin/sync/page.tsx` — page showing:
  - Source health table (from `sourceHealth` table)
  - Recent sync log (from `syncLog` table, last 20)
  - Quick stats (total users, total procesos, total analysis)
- Create `app/api/admin/stats/route.ts` — aggregate stats endpoint
- Add "Admin" link to sidebar (behind `user.role === "admin"` check)

**OUT:**
- Full admin panel — this is a single-page sync dashboard
- User management (list/edit users)
- Activity log viewer (activityLog table) — deferred

### Item G — LLM Analysis UI integration + worker init fix (CRITICAL)

**IN:**
- Initialize worker via `startWorker()` in Next.js instrumentation — create `instrumentation.ts` at `app/` root that calls `startWorker()` on server startup
- Add polling mechanism to Proceso detail page:
  - Client component `<AnalysisTracker />` that reads `?analysis=` query param
  - Polls `GET /api/analysis/[id]` every 3s while status is in-progress
  - Renders `<StatusCard />` while processing
  - Renders `<ResultsDisplay />` when `job.estado === "completed"`
- Wire `<AnalysisTracker />` into `procesos/[id]/page.tsx`

**OUT:**
- Worker hardening (retry logic, better error recovery) — already exists in worker.ts
- Notification on analysis completion (deferred to toast Item B after Item G is stable)

## Approach

### Item A
One-line addition to `tsconfig.json` compilerOptions.

### Item B
1. `npm install sonner`
2. Create `components/ui/sonner.tsx` wrapping `Toaster` with shadcn-compatible styling using existing CSS vars
3. Import `<Toaster />` in `app/layout.tsx` root
4. Components call `toast()` from `sonner` directly — no provider needed (sonner uses DOM portal)

### Item C
1. Create `components/ui/alert-dialog.tsx`:
   - Uses @base-ui/react `AlertDialog` (part of @base-ui/react@1.6+)
   - Exports: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogCancel`, `AlertDialogAction`
   - Styling reuses dialog.tsx patterns (same colors, ring, backdrop)
2. In each of the 4 files with `confirm()`, wrap the destructive action in an AlertDialog:
   - Trigger button (already exists) becomes `AlertDialogTrigger`
   - Content pops up with cancel + confirm buttons
   - Confirm executes the original action

### Item D
For each of the 7 pages, create a `loading.tsx` that mirrors the page's layout:
- **Dashboard**: LoadingCard grid (2 cols) + SkeletonBox for WelcomeBanner area
- **Procesos/[id]**: SkeletonText for title + back button, SkeletonCard for detail area
- **PAC**: LoadingTable (rows=5, cols=6)
- **Perfil**: 2-column grid of SkeletonCards
- **Planes**: LoadingCard (count=3, columns=3) for pricing cards
- **SENA**: LoadingCard (count=6, columns=3) for profile cards
- **Suscripcion**: SkeletonCard x2 for subscription detail cards

### Item E
1. Server query in `app/page.tsx`:
   ```ts
   const chartData = db
     .select({
       mes: sql<string>`strftime('%Y-%m', fecha_publicacion)`,
       total: sql<number>`COUNT(*)`,
     })
     .from(procesos)
     .groupBy(sql`strftime('%Y-%m', fecha_publicacion)`)
     .orderBy(desc(sql`strftime('%Y-%m', fecha_publicacion)`))
     .limit(12)
     .all();
   ```
2. Pass `<ProcesosChart initialData={chartData} />`

### Item F
1. `app/admin/layout.tsx`:
   ```ts
   const session = await auth()
   if (!session?.user || session.user.role !== "admin") redirect("/")
   ```
2. `app/admin/sync/page.tsx` fetches from `sourceHealth` + `syncLog` tables directly, renders with existing shared components (PageHeader, LoadingTable, ErrorMessage)
3. API route for stats (aggregate counts from procesos, users, analysisJobs)
4. Sidebar: add conditional entry `user.role === "admin" ? { href: "/admin/sync", label: "Admin", icon: Shield }` in navLinks
5. Import `Shield` or `ShieldHalf` from lucide-react

### Item G
1. Create `instrumentation.ts` at `apps/web/instrumentation.ts`:
   ```ts
   import { startWorker } from "@/lib/analysis/worker"
   export function register() { startWorker() }
   ```
2. Create `components/analysis/analysis-tracker.tsx`:
   ```ts
   // Client component
   // On mount: if searchParams has "analysis", start polling GET /api/analysis/[id]
   // Poll every 3s while estado in ["pending","downloading","ocr","extracting","verifying"]
   // On "completed": render <ResultsDisplay />
   // On "failed": show error with retry button
   // On any: show <StatusCard />
   ```
3. Wire into `procesos/[id]/page.tsx` — add `<AnalysisTracker analysisId={searchParams.analysis} />`
   (Note: page needs to accept searchParams; current page doesn't destructure it)

## Dependencies

```
A (tsconfig) → nothing, independent
B (toast) → independent
C (AlertDialog) → independent
D (skeletons) → depends on shared/skeleton.tsx (already exists)
E (chart) → independent
F (admin) → independent
G (analysis) → depends on worker.ts (already exists), independent of A-F
```

No blocking dependencies between any items. They can be implemented in parallel, but the suggested ordering below handles risk.

## Suggested Ordering

1. **A** — Build fix. 1 line, zero risk. Unblocks any other work if dev server was failing.
2. **B** — Toast. Adds infrastructure, but no replacements yet. Only addition.
3. **C** — AlertDialog. Replaces confirm() calls to prevent the "are you sure?" UX gap. 4 surgical changes.
4. **D** — Skeletons. 7 files, all similar pattern. Page layout awareness needed but no business logic.
5. **E** — Chart data. 1 file change to dashboard page + 1 query. Low risk.
6. **F** — Admin page. Self-contained new route group. Medium complexity (role guard + layout + data).
7. **G** — Analysis integration. **HIGHEST RISK** — involves async polling, worker lifecycle, and conditionally rendering 3 different components. Do last after everything else is stable.

## Tradeoffs

| Decision | Option A | Option B | Chosen | Rationale |
|----------|----------|----------|--------|-----------|
| Toast library | sonner (1.6kB) | Custom @base-ui/react toast | **sonner** | Already in shadcn ecosystem, zero-config Toaster, used by 50k+ projects. Custom toast = 200+ lines for same result |
| Admin page | Single page (sync dashboard) | Multi-page panel | **Single page** | Minimal scope. Full admin panel is a separate change. This just exposes existing data |
| Admin API | Direct DB in page (server component) | Separate API route | **Both** — stats via API route, sync tables direct from server component | API route is reusable. Server component for table data avoids auth duplication |
| Analysis polling | Server-sent events | Interval polling | **Interval polling** | SSE adds infrastructure (event emitter, connection tracking). Polling every 3s is fine for this volume |
| AlertDialog | @base-ui AlertDialog (already installed) | shadcn alert-dialog (requires install) | **@base-ui AlertDialog** | @base-ui/react@1.6+ has AlertDialog primitives. Zero installs. Reuses existing dialog styling patterns |

## Risks

1. **Item G: Worker never started in production.** The `instrumentation.ts` file runs on server startup in Next.js. If deploy uses a platform that doesn't support `register()` (e.g., old Node version), worker stays off. **Mitigation:** add fallback log + manual health check endpoint that reports worker status.
2. **Item C: @base-ui AlertDialog API may differ from Dialog API.** The dialog.tsx was written for @base-ui's `Dialog` — AlertDialog in @base-ui has its own namespace (`AlertDialog`), not `Dialog.Alert`. Verify import path before implementing.
3. **Item D: loading.tsx conflicts with existing `(authenticated)/loading.tsx`.** Next.js matches the nearest `loading.tsx`. Page-level loading.tsx takes precedence over layout-level. Need to ensure each page-level file doesn't just override the layout one but provides page-specific skeletons.
4. **Item F: Sidebar role check runs on client.** The sidebar is a client component. `session.user.role` must be passed from the layout. Layout already passes `user` to `<Sidebar user={session.user} />` — and `session.user.role` is already in the type. Just need to add the navLink+filter.
5. **Item B: sonner Toaster CSS compatibility.** sonner's default styling uses its own CSS. Need to override using Tailwind or import sonner's CSS. The shadcn pattern uses `style.js` from sonner directly.

## Estimated Scope

| Item | Files Created | Files Modified | Est. Lines |
|------|--------------|----------------|------------|
| A — Build fix | 0 | 1 | +1 |
| B — Toast | 1 (`sonner.tsx`) | 2 (`package.json`, `layout.tsx`) | ~25 |
| C — AlertDialog | 1 (`alert-dialog.tsx`) | 4 (confirm callers) | ~120 |
| D — Skeletons | 7 (loading.tsx per page) | 0 | ~80 |
| E — Chart data | 0 | 1 (`page.tsx` dashboard) | ~25 |
| F — Admin page | 3 (`layout.tsx`, `page.tsx`, API route) | 1 (`sidebar.tsx`) | ~130 |
| G — Analysis fix | 2 (`instrumentation.ts`, `analysis-tracker.tsx`) | 1 (`procesos/[id]/page.tsx`) | ~100 |
| **Total** | **14** | **10** | **~481** |
