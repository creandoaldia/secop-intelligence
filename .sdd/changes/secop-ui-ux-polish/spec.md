# secop-ui-ux-polish Specification

## Item A: Build Fix (downlevelIteration)

### Description
Add `downlevelIteration: true` to tsconfig.json compilerOptions to fix runtime errors when iterating over iterables (e.g., `Set`, `Map`, generators) that are transpiled to ES5 targets by Next.js.

### Requirements
- MUST add `"downlevelIteration": true` to `compilerOptions` in `apps/web/tsconfig.json`
- MUST NOT change any other tsconfig.json property
- MUST unblock builds that fail with `TypeError: X is not iterable` when using `for...of` or `[...iterable]` with compiled-down iterables

### Scenarios

**Scenario 1: Iterable spread works at runtime**
- Given `tsconfig.json` has `"downlevelIteration": true` under `compilerOptions`
- When the app is built with `next build`
- Then code using `Set`, `Map`, or generator spreads does not throw "is not iterable"

**Scenario 2: No regression to existing config**
- Given the tsconfig.json before the change
- When `"downlevelIteration": true` is added
- Then all other `compilerOptions` values remain identical

### Files Affected
- `apps/web/tsconfig.json:19` — add `"downlevelIteration": true` after `"jsx": "preserve"`

### Success Criteria
- [ ] `"downlevelIteration": true` is present in tsconfig.json compilerOptions
- [ ] `next build` succeeds without iteration-related runtime errors
- [ ] No other config keys are modified

---

## Item B: Toast System

### Description
Install `sonner` and create a shadcn-compatible `Toaster` wrapper component. Add the Toaster to the root layout so any component can call `toast()` for ephemeral notifications.

### Requirements
- MUST install `sonner` as a production dependency in `apps/web/package.json`
- MUST create `components/ui/sonner.tsx` exporting a `Toaster` component with shadcn-compatible styling (uses existing CSS variables: `--background`, `--foreground`, `--border`, `--ring`, `--destructive`, etc.)
- MUST import `<Toaster />` in `apps/web/app/layout.tsx` inside the `<body>` tag
- MUST support `toast()` calls from `sonner` directly — no extra provider or context wrapper
- MUST use sonner's built-in DOM portal — no custom portal or z-index management
- MUST support `toast.success()`, `toast.error()`, and `toast()` (default/info)
- Non-goal: replacing form errors or inline validation messages

### Scenarios

**Scenario 1: Success toast renders in root layout**
- Given `sonner` is installed and `<Toaster />` is in the root layout
- When a component calls `toast.success("Proceso analizado")`
- Then a green-tinted toast appears at the bottom-right (default sonner position) and auto-dismisses

**Scenario 2: Error toast on failure**
- Given `<Toaster />` is in the root layout
- When a component calls `toast.error("Error al conectar LinkedIn")`
- Then a red-tinted toast appears and persists until dismissed or timeout

### Files Affected
- `apps/web/package.json` — add `"sonner": "^2.0.0"` to dependencies
- `apps/web/components/ui/sonner.tsx` — create Toaster wrapper (NEW)
- `apps/web/app/layout.tsx` — add `<Toaster />` inside `<body>`

### Success Criteria
- [ ] `sonner` is in package.json dependencies
- [ ] `components/ui/sonner.tsx` exists and exports `Toaster`
- [ ] `<Toaster />` renders in the root layout
- [ ] `toast()` calls work from any client component

---

## Item C: AlertDialog + Replace confirm()

### Description
Create an `alert-dialog.tsx` component using `@base-ui/react` AlertDialog primitives. Replace all 4 native `confirm()` calls with accessible, styled AlertDialog overlays.

### Requirements
- MUST create `components/ui/alert-dialog.tsx` using `@base-ui/react` AlertDialog primitives (import from `@base-ui/react/alert-dialog`)
- MUST export: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogCancel`, `AlertDialogAction`
- MUST reuse styling patterns from the existing `dialog.tsx` (same colors, backdrop, ring, rounded-xl popup)
- MUST replace `confirm()` in exactly these 4 files:
  1. `components/subscriptions/subscription-manager.tsx:52` — cancel subscription
  2. `components/sena/profile-list.tsx:34` — delete profile
  3. `app/(authenticated)/alertas/page.tsx:68` — delete alert
  4. `components/linkedin/connect-button.tsx:40` — disconnect LinkedIn
- Each replacement: existing button becomes `AlertDialogTrigger`, content dialog opens on click, confirm executes the original action
- MUST NOT replace any other native `confirm()` or dialog usage
- MUST NOT affect `AlertForm` or other existing dialog components

### Scenarios

**Scenario 1: Cancel subscription confirmation**
- Given the user clicks "Cancelar Suscripcion" on `subscription-manager.tsx`
- When the button is clicked
- Then an AlertDialog opens with title "Cancelar Suscripcion", description explaining the consequence, a Cancel button, and a Confirm/Cancelar button
- When user clicks Confirm, the subscription cancel fetch runs
- When user clicks Cancel, the dialog closes with no action

**Scenario 2: Delete profile confirmation**
- Given the user clicks the delete button on a SENA profile card
- When the button is clicked
- Then an AlertDialog opens asking to confirm deletion
- When user clicks Confirm, `DELETE /api/sena/profiles/[id]` fires
- When user clicks Cancel, the dialog closes

**Scenario 3: Delete alert confirmation**
- Given the user clicks the delete action on an alert
- When the button is clicked
- Then an AlertDialog opens asking to confirm deletion
- When user clicks Confirm, `DELETE /api/alertas/[id]` fires
- When user clicks Cancel, the dialog closes

**Scenario 4: Disconnect LinkedIn confirmation**
- Given the user has LinkedIn connected and clicks "Desconectar LinkedIn"
- When the button is clicked
- Then an AlertDialog opens asking "Desconectar LinkedIn?"
- When user clicks Confirm, `DELETE /api/linkedin/disconnect` fires
- When user clicks Cancel, the dialog closes

**Scenario 5: Escape key closes dialog**
- Given an AlertDialog is open
- When the user presses Escape
- Then the dialog closes without action

### Files Affected
- `apps/web/components/ui/alert-dialog.tsx` — create AlertDialog component (NEW)
- `apps/web/components/subscriptions/subscription-manager.tsx` — wrap cancel button in AlertDialog
- `apps/web/components/sena/profile-list.tsx` — wrap delete button in AlertDialog
- `apps/web/app/(authenticated)/alertas/page.tsx` — wrap delete action in AlertDialog
- `apps/web/components/linkedin/connect-button.tsx` — wrap disconnect button in AlertDialog

### Success Criteria
- [ ] `components/ui/alert-dialog.tsx` exists with all 9 exports
- [ ] All 4 `confirm()` calls are replaced with AlertDialog
- [ ] AlertDialog styling matches existing dialog.tsx patterns
- [ ] Escape key closes the dialog
- [ ] Clicking outside (backdrop) does NOT close (AlertDialog default)

---

## Item D: Loading Skeletons (7 pages)

### Description
Create `loading.tsx` files for 7 pages missing them, using the existing shared skeleton components (`SkeletonBox`, `SkeletonText`, `SkeletonCard`, `LoadingCard`, `LoadingTable` from `components/shared/`).

### Requirements
- MUST create `loading.tsx` for each of these 7 pages, in the same directory as the `page.tsx`:
  1. `app/loading.tsx` — Dashboard (grid with WelcomeBanner area + 2-column chart/recent)
  2. `app/(authenticated)/procesos/[id]/loading.tsx` — Proceso detail (back button + detail card)
  3. `app/(authenticated)/pac/loading.tsx` — PAC (LoadingTable, rows=5, cols=6)
  4. `app/(authenticated)/perfil/loading.tsx` — Perfil (2-column grid of SkeletonCards)
  5. `app/(authenticated)/planes/loading.tsx` — Planes (LoadingCard, count=3, columns=3 for pricing cards)
  6. `app/(authenticated)/sena/loading.tsx` — SENA (LoadingCard, count=6, columns=3 for profile cards)
  7. `app/(authenticated)/suscripcion/loading.tsx` — Suscripcion (2 SkeletonCards for subscription detail)
- MUST reuse existing primitives from `components/shared/` — no new skeleton primitives
- MUST NOT modify or replace the existing `(authenticated)/loading.tsx` (layout-level fallback)
- Each loading.tsx MUST be a server component (no `"use client"`) — only uses client components from shared

### Scenarios

**Scenario 1: Dashboard loading shows skeleton grid**
- Given the user navigates to `/`
- While the DashboardPage is loading
- Then the user sees 2 skeleton cards in a 2-column grid + a skeleton box in the WelcomeBanner area

**Scenario 2: Proceso detail loading shows text skeleton**
- Given the user navigates to `/procesos/123`
- While the ProcesoDetailPage is loading
- Then the user sees a back button skeleton + a card skeleton for the detail area

**Scenario 3: PAC loading shows table skeleton**
- Given the user navigates to `/pac`
- While the PacPage is loading
- Then the user sees a LoadingTable with 5 rows and 6 columns

**Scenario 4: Page-level loading overrides layout loading**
- Given a `loading.tsx` exists at the page level AND the layout level
- When the page is loading
- Then Next.js renders the page-level loading.tsx, not the layout-level fallback

### Files Affected
- `apps/web/app/loading.tsx` — create Dashboard skeleton (NEW)
- `apps/web/app/(authenticated)/procesos/[id]/loading.tsx` — create detail skeleton (NEW)
- `apps/web/app/(authenticated)/pac/loading.tsx` — create PAC skeleton (NEW)
- `apps/web/app/(authenticated)/perfil/loading.tsx` — create Perfil skeleton (NEW)
- `apps/web/app/(authenticated)/planes/loading.tsx` — create Planes skeleton (NEW)
- `apps/web/app/(authenticated)/sena/loading.tsx` — create SENA skeleton (NEW)
- `apps/web/app/(authenticated)/suscripcion/loading.tsx` — create Suscripcion skeleton (NEW)

### Success Criteria
- [ ] 7 `loading.tsx` files created in correct directories
- [ ] Each skeleton matches the corresponding page's layout shape
- [ ] Existing `(authenticated)/loading.tsx` is untouched
- [ ] All loading files are server components (no `"use client"`)

---

## Item E: Dashboard Chart Data Wiring

### Description
Add a server-side query to the Dashboard page that aggregates monthly proceso counts and passes them as `initialData` to `ProcesosChart`, replacing the empty "Datos de grafico proximamente" state.

### Requirements
- MUST add a query in `app/page.tsx` that selects `strftime('%Y-%m', fecha_publicacion)` as month and `COUNT(*)` as total from the `procesos` table
- MUST group by month, order descending by month, and limit to the last 12 months
- MUST pass the result as `initialData` prop to `<ProcesosChart />`
- MUST NOT modify `ProcesosChart` component internals (it already accepts `initialData`)
- MUST NOT add client-side fetching — data comes from the server component
- MUST NOT add chart drilling, filter controls, or date range pickers

### Scenarios

**Scenario 1: Chart renders with real data**
- Given there are procesos in the database with various `fecha_publicacion` values
- When the DashboardPage loads
- Then `ProcesosChart` receives an array of `{ mes: string, total: number }` objects bound to the last 12 months
- Then the chart renders bars instead of the "Datos de grafico proximamente" placeholder

**Scenario 2: Empty database shows empty chart**
- Given there are no procesos in the database
- When the DashboardPage loads
- Then `ProcesosChart` receives an empty array
- Then the chart shows the empty state message

**Scenario 3: Data order is newest-first**
- Given the query returns data
- When the data is passed to the chart
- Then the bars are ordered from most recent month (left) to oldest (right)

### Files Affected
- `apps/web/app/page.tsx` — add Drizzle query + pass `initialData` to `ProcesosChart`

### Success Criteria
- [ ] Monthly proceso aggregation query is in `app/page.tsx`
- [ ] `ProcesosChart` receives `initialData` with real data
- [ ] Chart renders bars with data when procesos exist
- [ ] Empty state still shows when no data

---

## Item F: Admin Page (Sync Dashboard)

### Description
Create an admin section with role-guarded layout and a sync dashboard page that displays source health, recent sync log, and aggregate stats. Add an admin link in the sidebar for admin users.

### Requirements
- MUST create `app/admin/layout.tsx` — server component that calls `auth()`, redirects non-admin users (`user.role !== "admin"`) to `/`
- MUST create `app/admin/sync/page.tsx` — server component displaying:
  - Source health table (data from `sourceHealth` table)
  - Recent sync log table (last 20 rows from `syncLog` table)
  - Quick stats section (total users count, total procesos count, total analysis jobs count)
- MUST create `app/api/admin/stats/route.ts` — GET endpoint returning JSON `{ totalUsers, totalProcesos, totalAnalysis }`
- MUST add a conditional "Admin" link to the sidebar in `components/layout/sidebar.tsx`, visible only when `user.role === "admin"`
- Stats MUST be fetched via the API route (`/api/admin/stats`) from the admin page (or inline DB query)
- Source health + sync log data MUST be queried directly from the DB (server component)
- MUST import `Shield` (or `ShieldHalf`) from `lucide-react` for the sidebar icon
- Non-goal: user management, activity log viewer, full admin panel

### Scenarios

**Scenario 1: Admin user sees admin page**
- Given a user with `role === "admin"` is authenticated
- When they navigate to `/admin/sync`
- Then they see the source health table, sync log, and quick stats
- When they view the sidebar
- Then an "Admin" link with a Shield icon is visible

**Scenario 2: Non-admin user is redirected**
- Given a user with `role !== "admin"` is authenticated
- When they navigate to `/admin/sync`
- Then they are redirected to `/`

**Scenario 3: Unauthenticated user is redirected**
- Given no user is authenticated
- When they navigate to `/admin/sync`
- Then they are redirected to `/login`

**Scenario 4: Sidebar conditionally renders admin link**
- Given a user with `role === "admin"`
- When the sidebar renders
- Then the navLinks array includes `{ href: "/admin/sync", label: "Admin", icon: Shield }`
- Given a user with `role !== "admin"`
- When the sidebar renders
- Then the admin link is not rendered

**Scenario 5: API returns correct aggregate counts**
- Given the admin stats API is called
- When `GET /api/admin/stats` is requested
- Then it returns `{ totalUsers: number, totalProcesos: number, totalAnalysis: number }`
- Then counts are accurate based on DB state

### Files Affected
- `apps/web/app/admin/layout.tsx` — create admin layout with role guard (NEW)
- `apps/web/app/admin/sync/page.tsx` — create sync dashboard page (NEW)
- `apps/web/app/api/admin/stats/route.ts` — create stats API route (NEW)
- `apps/web/components/layout/sidebar.tsx` — add conditional admin link + update SidebarProps to include role

### Success Criteria
- [ ] `app/admin/layout.tsx` redirects non-admin users to `/`
- [ ] `app/admin/sync/page.tsx` renders source health, sync log, and stats
- [ ] `GET /api/admin/stats` returns correct aggregate counts
- [ ] Sidebar shows "Admin" link only for admin users
- [ ] Shield icon is used for the admin link

---

## Item G: LLM Analysis Integration + Worker Fix

### Description
Initialize the analysis background worker via Next.js `instrumentation.ts` so it starts on server boot (fixing the "permanently stuck in pending" bug). Create an `AnalysisTracker` client component that polls the analysis API while a job is in progress, and wire it into the proceso detail page.

### Requirements
- MUST create `apps/web/instrumentation.ts` that imports `startWorker` from `@/lib/analysis/worker` and calls it in the `register()` export
- MUST create `components/analysis/analysis-tracker.tsx` — a client component that:
  - Reads `analysisId` from the `?analysis=` search param (passed as prop)
  - On mount: if `analysisId` is present, starts polling `GET /api/analysis/[id]` every 3 seconds
  - While `job.estado` is `"pending"`, `"downloading"`, `"ocr"`, `"extracting"`, or `"verifying"`: renders `<StatusCard />` with current progress
  - When `job.estado === "completed"`: renders `<ResultsDisplay />` with the extraction result
  - When `job.estado === "failed"`: shows error text + a "Reintentar" button
  - Stops polling when `estado` is `"completed"` or `"failed"`
  - Cleans up the interval on unmount
- MUST wire `<AnalysisTracker />` into `app/(authenticated)/procesos/[id]/page.tsx`:
  - Add `searchParams` to `PageProps` interface
  - Pass `searchParams.analysis` as `analysisId` prop to `<AnalysisTracker />`
- MUST handle null/undefined `analysisId` gracefully (render nothing)
- MUST NOT change the worker's retry logic or error recovery (already exists in worker.ts)
- MUST NOT add notification on analysis completion (deferred to toast with Item B after stable)

### Scenarios

**Scenario 1: Worker starts on server boot**
- Given the server starts (via `next dev` or `next start`)
- When the `instrumentation.ts` module is loaded
- Then `startWorker()` is called
- Then `[Analysis Worker] Started` appears in the server logs
- Then pending jobs in the `analysisJobs` table begin processing

**Scenario 2: Analysis in progress shows status card**
- Given the user navigates to `/procesos/123?analysis=job-uuid` after clicking "Analizar"
- When the page renders
- Then `<AnalysisTracker />` sees `analysisId=job-uuid` and starts polling
- Then `<StatusCard />` renders showing current step (pending/downloading/ocr/extracting/verifying)
- Then the card updates every 3 seconds as the job progresses

**Scenario 3: Analysis completes shows results**
- Given the user is watching an analysis job
- When `GET /api/analysis/[id]` returns `estado: "completed"`
- Then `<StatusCard />` is replaced by `<ResultsDisplay />`
- Then the polling interval is cleared

**Scenario 4: Analysis fails shows error + retry**
- Given the user is watching an analysis job
- When `GET /api/analysis/[id]` returns `estado: "failed"`
- Then the error message is displayed
- Then a "Reintentar" button is visible
- When the user clicks "Reintentar", a new analysis is started (POST /api/analysis/start)

**Scenario 5: No analysis param renders nothing**
- Given the user navigates to `/procesos/123` without `?analysis=`
- When the page renders
- Then `<AnalysisTracker />` receives `analysisId={null|undefined}`
- Then nothing is rendered and no polling starts

**Scenario 6: Component cleanup on unmount**
- Given the user is watching an analysis job (polling active)
- When they navigate away from the page
- Then the polling interval is cleared (no memory leak)

### Files Affected
- `apps/web/instrumentation.ts` — create register() that calls startWorker() (NEW)
- `apps/web/components/analysis/analysis-tracker.tsx` — create AnalysisTracker client component (NEW)
- `apps/web/app/(authenticated)/procesos/[id]/page.tsx` — add searchParams, wire AnalysisTracker

### Success Criteria
- [ ] `instrumentation.ts` exists and exports `register()` that calls `startWorker()`
- [ ] Worker starts on server boot (verified by server log)
- [ ] `AnalysisTracker` polls every 3s while job is in progress
- [ ] `StatusCard` renders during processing phases
- [ ] `ResultsDisplay` renders on completion
- [ ] Error state shows error + retry button
- [ ] No analysis param = nothing renders
- [ ] Polling interval is cleaned up on unmount
- [ ] Proceso detail page accepts `searchParams` and passes `analysis` to `AnalysisTracker`
