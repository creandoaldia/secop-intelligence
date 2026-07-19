# Tasks: secop-ui-ux-polish

## Task Breakdown

### T1 — Fix LoadingCard inline style to use Tailwind classes

- **Item**: 0 (Prerequisite)
- **Description**: Replace inline `style={{ gridTemplateColumns }}` in LoadingCard with Tailwind `grid-cols-{n}` utility classes. The inline style blocks responsive overrides via className (e.g., `sm:grid-cols-2 lg:grid-cols-4` can't override a JS style).
- **Files**:
  - Modify: `apps/web/components/shared/loading-card.tsx`
- **Approach**:
  - Remove `style={{ gridTemplateColumns: \`repeat(${columns}, 1fr)\` }}` from the root div.
  - Replace with dynamic Tailwind class builder:
    ```tsx
    const gridCols = {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
      5: "grid-cols-5",
      6: "grid-cols-6",
    }[columns] ?? "grid-cols-3"
    // className={cn("grid gap-4", gridCols, className)}
    ```
  - Keeping `columns` prop for backward compatibility (used by LoadingCard consumers like `count`).
  - Test: verify rendered div has `grid-cols-3` class (not inline style).
- **Test criteria**: LoadingCard renders `grid-cols-{n}` class matching the `columns` prop. Responsive className overrides work (e.g., `<LoadingCard className="sm:grid-cols-1" />` overrides the base class).
- **Estimated lines**: ~10 (replace ~3 lines with ~12 lines)

---

### T2 — Add downlevelIteration to tsconfig

- **Item**: A
- **Description**: Add `"downlevelIteration": true` to tsconfig.json compilerOptions to fix runtime `TypeError: X is not iterable` when transpiling `Set`/`Map`/generator iteration to ES5 targets.
- **Files**:
  - Modify: `apps/web/tsconfig.json`
- **Approach**: Add `"downlevelIteration": true` after `"jsx": "preserve",` on line 13-14.
- **Test criteria**: `tsconfig.json:14` contains `"downlevelIteration": true`. `next build` succeeds without iteration-related runtime errors. No other config keys modified.
- **Estimated lines**: +1

---

### T3 — Install sonner and create Toaster wrapper

- **Item**: B
- **Description**: Install `sonner` package, create a shadcn-compatible `Toaster` wrapper component, and add it to the root layout.
- **Files**:
  - Modify: `apps/web/package.json`
  - Create: `apps/web/components/ui/sonner.tsx`
  - Modify: `apps/web/app/layout.tsx`
- **Approach**:
  - `npm install sonner@^2.0.0`
  - Create `components/ui/sonner.tsx` as a `"use client"` component wrapping `Toaster` from `sonner`. Apply shadcn-style classNames using CSS vars (`--background`, `--foreground`, `--border`, `--primary`, `--destructive`, etc.).
  - Add `<Toaster />` inside `<body>` after `<SessionProvider>` in `app/layout.tsx`.
- **Test criteria**: `sonner` in package.json dependencies. `Toaster` component exists and exports correctly. `<Toaster />` renders in root layout DOM. `toast()`, `toast.success()`, `toast.error()` calls work from any client component.
- **Estimated lines**: ~25 (1 create + 2 modify)

---

### T4 — Create AlertDialog component using @base-ui/react

- **Item**: C (part 1)
- **Description**: Create `alert-dialog.tsx` wrapping `@base-ui/react/alert-dialog` primitives, following the existing `dialog.tsx` styling patterns. Export 9 components: AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction.
- **Files**:
  - Create: `apps/web/components/ui/alert-dialog.tsx`
- **Approach**:
  - Import from `@base-ui/react/alert-dialog` (separate namespace from `@base-ui/react/dialog`, available in @base-ui/react@1.6+).
  - Style mirrors `dialog.tsx`: same `rounded-xl`, `bg-popover`, `ring-1 ring-foreground/10`, backdrop with `bg-black/10 supports-backdrop-filter:backdrop-blur-xs`, animation classes (`data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95`).
  - `AlertDialogAction` and `AlertDialogCancel` both use `AlertDialogPrimitive.Close` under the hood, differentiated by Button variant (destructive vs outline). This is a JD fix — @base-ui AlertDialog does NOT have a native `Action` component.
  - `AlertDialogAction` accepts `React.ComponentProps<typeof Button>` (since it renders via `render={<Button variant="destructive" />}`).
- **Test criteria**: 9 exports exist and are renderable. Styling class strings match dialog.tsx patterns (same backdrop ring, rounded-xl, colors). Escape key closes the dialog. Backdrop click does NOT close.
- **Estimated lines**: ~100

---

### T5 — Replace confirm() in subscription-manager.tsx

- **Item**: C (part 2a)
- **Description**: Replace `confirm()` call for cancel subscription with AlertDialog.
- **Files**:
  - Modify: `apps/web/components/subscriptions/subscription-manager.tsx`
- **Approach**:
  - Remove `confirm()` from `handleCancel` function.
  - Add `useState<boolean>` for dialog open state.
  - Wrap the "Cancelar Suscripcion" `<Button>` with `<AlertDialog>`. Title: "Cancelar Suscripcion". Description: "Perderas acceso a funciones premium al final del periodo actual."
  - Confirm button calls the original `handleCancel` logic.
- **Test criteria**: No `confirm(` string remains. Clicking cancel opens AlertDialog. Confirm executes cancel. Cancel dismisses.
- **Estimated lines**: ~25

---

### T6 — Replace confirm() in profile-list.tsx

- **Item**: C (part 2b)
- **Description**: Replace `confirm()` call for delete SENA profile with AlertDialog.
- **Files**:
  - Modify: `apps/web/components/sena/profile-list.tsx`
- **Approach**:
  - Remove `confirm()` from `handleDelete`.
  - Add `useState<number | null>` tracking which profile's delete dialog is open.
  - Wrap each delete `<Button>` with `<AlertDialog>`. Title: "Eliminar Perfil". Description: "Este perfil se eliminara permanentemente."
  - Confirm calls `handleDelete(id)` with the tracked id.
- **Test criteria**: No `confirm(` string remains. Clicking delete opens AlertDialog per row. Confirm fires DELETE API.
- **Estimated lines**: ~25

---

### T7 — Replace confirm() in alert-list.tsx and alertas/page.tsx

- **Item**: C (part 2c)
- **Description**: Replace `confirm()` for delete alert. The delete button lives inside `AlertList` component, not directly in `page.tsx`. Both files modified — AlertList gets AlertDialog state, page's `handleDelete` loses the `confirm()` guard.
- **Files**:
  - Modify: `apps/web/components/alertas/alert-list.tsx`
  - Modify: `apps/web/app/(authenticated)/alertas/page.tsx`
- **Approach**:
  - **alert-list.tsx**: Add `useState<number | null>` for which alert's confirmation is open. Import AlertDialog components. Wrap the Trash2Icon button with AlertDialog. Keep the existing `onDelete` prop — called inside the AlertDialog Action's onClick.
  - **alertas/page.tsx**: Remove `confirm()` from `handleDelete`. The function already exists — just remove the guard.
- **Test criteria**: No `confirm(` string remains in either file. Clicking Trash2Icon opens AlertDialog. Confirm fires `DELETE /api/alertas/[id]`.
- **Estimated lines**: ~30

---

### T8 — Replace confirm() in connect-button.tsx

- **Item**: C (part 2d)
- **Description**: Replace `confirm()` for disconnect LinkedIn with AlertDialog.
- **Files**:
  - Modify: `apps/web/components/linkedin/connect-button.tsx`
- **Approach**:
  - Remove `confirm()` from `handleDisconnect`.
  - Add `useState<boolean>` for dialog open state.
  - Wrap the "Desconectar LinkedIn" `<Button>` with `<AlertDialog>`. Title: "Desconectar LinkedIn". Description: "Se eliminara la conexion con LinkedIn."
  - Confirm calls original `handleDisconnect`.
- **Test criteria**: No `confirm(` string remains. Clicking disconnect opens AlertDialog. Confirm fires `DELETE /api/linkedin/disconnect`.
- **Estimated lines**: ~20

---

### T9 — Create Dashboard loading skeleton

- **Item**: D (part 1)
- **Description**: Create `app/loading.tsx` for the root Dashboard page with skeleton grid matching the dashboard layout.
- **Files**:
  - Create: `apps/web/app/loading.tsx`
- **Approach**: Server component (no `"use client"`). Import `SkeletonBox`, `SkeletonCard` from `@/components/shared`. Render: SkeletonBox for WelcomeBanner area (h-24), 4 SkeletonCards in a responsive grid, then 2 SkeletonCards in a 2-column grid for the chart/recent section.
- **Test criteria**: Renders skeleton shapes matching dashboard layout. No `"use client"` directive. Uses only existing shared primitives.
- **Estimated lines**: ~15

---

### T10 — Create Proceso detail loading skeleton

- **Item**: D (part 2)
- **Description**: Create loading.tsx for `procesos/[id]` page with back button + detail card skeleton.
- **Files**:
  - Create: `apps/web/app/(authenticated)/procesos/[id]/loading.tsx`
- **Approach**: Server component. SkeletonBox (h-5 w-24) for back button, SkeletonCard (h-96) for detail area. Space-y-6 layout.
- **Test criteria**: Renders back button placeholder + large card skeleton. No `"use client"`.
- **Estimated lines**: ~10

---

### T11 — Create PAC loading skeleton

- **Item**: D (part 3)
- **Description**: Create loading.tsx for PAC page with table skeleton.
- **Files**:
  - Create: `apps/web/app/(authenticated)/pac/loading.tsx`
- **Approach**: Server component. Import `LoadingTable` from `@/components/shared`. Render `<LoadingTable rows={5} columns={6} />`. JD fix: LoadingTable prop is `columns` (not `cols`) — confirmed.
- **Test criteria**: Renders 5x6 table skeleton. No `"use client"`.
- **Estimated lines**: ~5

---

### T12 — Create Perfil loading skeleton

- **Item**: D (part 4)
- **Description**: Create loading.tsx for Perfil page with 2-column skeleton card grid.
- **Files**:
  - Create: `apps/web/app/(authenticated)/perfil/loading.tsx`
- **Approach**: Server component. Import `SkeletonCard`. Render 2 SkeletonCards (h-48 each) in a `grid gap-6 lg:grid-cols-2`.
- **Test criteria**: Renders 2 card skeletons in 2-column grid. No `"use client"`.
- **Estimated lines**: ~10

---

### T13 — Create Planes loading skeleton

- **Item**: D (part 5)
- **Description**: Create loading.tsx for Planes page with 3-column pricing card skeleton.
- **Files**:
  - Create: `apps/web/app/(authenticated)/planes/loading.tsx`
- **Approach**: Server component. Import `LoadingCard`. Render `<LoadingCard count={3} columns={3} />`. Note: T1 fix ensures Tailwind grid-cols-3 is used (not inline style).
- **Test criteria**: Renders 3 card skeletons in 3-column grid. No `"use client"`.
- **Estimated lines**: ~5

---

### T14 — Create SENA loading skeleton

- **Item**: D (part 6)
- **Description**: Create loading.tsx for SENA page with 6-card skeleton grid (3 columns).
- **Files**:
  - Create: `apps/web/app/(authenticated)/sena/loading.tsx`
- **Approach**: Server component. Import `LoadingCard`. Render `<LoadingCard count={6} columns={3} />`.
- **Test criteria**: Renders 6 card skeletons in 3-column grid. No `"use client"`.
- **Estimated lines**: ~5

---

### T15 — Create Suscripcion loading skeleton

- **Item**: D (part 7)
- **Description**: Create loading.tsx for Suscripcion page with 2 subscription detail card skeletons.
- **Files**:
  - Create: `apps/web/app/(authenticated)/suscripcion/loading.tsx`
- **Approach**: Server component. Import `SkeletonCard`. Render 2 SkeletonCards (h-64 each) in `grid gap-6 lg:grid-cols-2`.
- **Test criteria**: Renders 2 card skeletons. No `"use client"`.
- **Estimated lines**: ~10

---

### T16 — Add monthly chart data query to Dashboard

- **Item**: E
- **Description**: Add server-side Drizzle query in `app/page.tsx` that aggregates monthly proceso counts and passes them as `initialData` to `ProcesosChart`. Chart ordered ASC (oldest first) for conventional time-series display.
- **Files**:
  - Modify: `apps/web/app/page.tsx`
- **Approach**:
  - Add imports: `sql` from `drizzle-orm`.
  - Query after `auth()` check:
    ```ts
    const chartData = db
      .select({
        mes: sql<string>`strftime('%Y-%m', fecha_publicacion, 'unixepoch')`,
        total: sql<number>`COUNT(*)`,
      })
      .from(procesos)
      .groupBy(sql`strftime('%Y-%m', fecha_publicacion, 'unixepoch')`)
      .orderBy(sql`strftime('%Y-%m', fecha_publicacion, 'unixepoch')`)  // ASC
      .limit(12)
      .all()
    ```
  - Pass `<ProcesosChart initialData={chartData} />`.
  - Add label formatter inside the chart (or page) to show localized month names instead of raw `'2026-01'` format on X-axis.
- **Test criteria**: ChartData shape is `{ mes: string, total: number }[]`. Empty DB returns `[]`. `strftime` with `unixepoch` works correctly on integer timestamp. Data is ASC (oldest first). Chart renders bars instead of "Datos de grafico proximamente" placeholder. X-axis shows localized month names.
- **Estimated lines**: ~25

---

### T17 — Create Admin role-guard layout

- **Item**: F (part 1)
- **Description**: Create `(authenticated)/admin/layout.tsx` with role-based access guard. Inherits sidebar+header from parent `(authenticated)` layout. Redirects non-admin users to `/`.
- **Files**:
  - Create: `apps/web/app/(authenticated)/admin/layout.tsx`
- **Approach**: Server component calling `auth()`. Check `session?.user?.role !== "admin"` → `redirect("/")`. `<>{children}</>` for authorized users. Parent `(authenticated)/layout.tsx` already handles unauthenticated redirect.
- **Test criteria**: Admin user sees content. Non-admin user (role=user) is redirected to `/`. Unauthenticated user is caught by parent layout's auth check. Directory is under `(authenticated)/` so navigation (sidebar, header) is inherited.
- **Estimated lines**: ~10

---

### T18 — Create Admin sync dashboard page

- **Item**: F (part 2)
- **Description**: Create sync dashboard page showing source health table, recent sync log, and quick stats. Stats fetched via direct `getDbStats()` from `lib/db/index.ts` (no self-referencing HTTP fetch — JD fix).
- **Files**:
  - Create: `apps/web/app/(authenticated)/admin/sync/page.tsx`
- **Approach**:
  - Server component with `export const dynamic = "force-dynamic"`.
  - Query `sourceHealth` table directly: `db.select().from(sourceHealth).all()`.
  - Query `syncLog` table: `db.select().from(syncLog).orderBy(desc(syncLog.fechaInicio)).limit(20).all()`.
  - Stats via `getDbStats()` → destructure `totalProcesos`, `totalUsuarios`, `totalAnalisis`.
  - Render: PageHeader, quick stats cards (3-column grid of number+label), source health table (status color-coded: emerald/amber/destructive), sync log table.
  - Error boundary: wrap queries in try/catch, render `<ErrorMessage />` on failure.
- **Test criteria**: Renders source health table (source, status, consecutiveFailures, lastSuccessAt). Renders sync log (last 20 entries). Renders stats cards with counts. Error state shows message. Uses `getDbStats()` directly (no self-fetch).
- **Estimated lines**: ~85

---

### T19 — Create Admin stats API route

- **Item**: F (part 3)
- **Description**: Create `GET /api/admin/stats` endpoint returning aggregate counts. Kept for external use even though admin page uses direct `getDbStats()`.
- **Files**:
  - Create: `apps/web/app/api/admin/stats/route.ts`
- **Approach**:
  - Route handler: `auth()` check → 401 if unauthorized.
  - `getDbStats()` → return `{ totalUsers, totalProcesos, totalAnalysis }` as JSON.
  - Catch block returns 500 with error message.
- **Test criteria**: `GET /api/admin/stats` with admin session returns `{ totalUsers: number, totalProcesos: number, totalAnalysis: number }`. Non-admin gets 401. Error returns 500.
- **Estimated lines**: ~25

---

### T20 — Add conditional Admin link to sidebar

- **Item**: F (part 4)
- **Description**: Add `role` to SidebarProps user type and conditionally render Admin nav link for admin users.
- **Files**:
  - Modify: `apps/web/components/layout/sidebar.tsx`
- **Approach**:
  - Add `role?: string | null` to `SidebarProps['user']`.
  - Import `Shield` from `lucide-react`.
  - Convert `navLinks` from static const to function `getNavLinks(user)` that conditionally includes `{ href: "/admin/sync", label: "Admin", icon: Shield }` when `user?.role === "admin"`.
  - Pass `user` to `NavContent`, call `getNavLinks(user)` inside `useMemo`.
  - `NavContent` signature changes: `function NavContent({ pathname, user }: { pathname: string; user: SidebarProps["user"] })`.
- **Test criteria**: Sidebar shows Admin link with Shield icon for `role === "admin"`. Sidebar hides Admin link for `role !== "admin"`. No layout shift when link is absent.
- **Estimated lines**: ~20

---

### T21 — Create instrumentation.ts for worker startup

- **Item**: G (part 1)
- **Description**: Create `instrumentation.ts` at apps/web root that calls `startWorker()` on Next.js server boot via the `register()` export.
- **Files**:
  - Create: `apps/web/instrumentation.ts`
- **Approach**:
  ```ts
  import { startWorker } from "@/lib/analysis/worker"
  export function register() { startWorker() }
  ```
  Next.js 14.2+ loads this on both `next dev` and `next start`. `startWorker()` has idempotency guard (`if (workerInterval) return`) so HMR re-runs are safe.
- **Test criteria**: File exists at `apps/web/instrumentation.ts`. `register()` calls `startWorker()`. Server logs show `[Analysis Worker] Started` on boot. No duplicate worker instances on HMR.
- **Estimated lines**: ~3

---

### T22 — Create AnalysisTracker client component

- **Item**: G (part 2)
- **Description**: Create polling client component that tracks analysis job progress. Polls `GET /api/analysis/[id]` every 3s, renders StatusCard during processing, ResultsDisplay on completion, error+retry on failure.
- **Files**:
  - Create: `apps/web/components/analysis/analysis-tracker.tsx`
- **Approach**:
  - `"use client"` component with `analysisId: string | null | undefined` and `procesoId: string` props.
  - On mount (if `analysisId` is truthy): start polling loop.
  - First poll immediately, then `setInterval(3000)`. Clean up interval and `active` flag on unmount.
  - JD fix: Poll tolerance for 404 (job not yet visible) — continue polling.
  - JD fix: Import `AnalysisJobStatus` from `@/lib/analysis/types` (NOT from `status-card` — it's not exported there).
  - JD fix: State reset `useEffect` when `analysisId` changes (clean retry).
  - States: `null` (loading first poll) → "Iniciando analisis..." pulse text. `PROCESSING_STATES` (pending/downloading/ocr/extracting/verifying) → `<StatusCard />`. `"completed"` + result → `<ResultsDisplay />`. `"failed"` → error text + `<Button variant="outline">` for retry.
  - Retry logic: POST `/api/analysis/start` → `router.replace()` with new `?analysis=` param. JD fix: removed redundant `router.refresh()`.
  - No `analysisId` → render null.
- **Test criteria**: Polls every 3s while job is in processing states. Renders StatusCard during processing. Renders ResultsDisplay on completion. Shows error + retry on failure. Cleans up interval on unmount. No analysisId renders nothing.
- **Estimated lines**: ~90

---

### T23 — Wire AnalysisTracker into proceso detail page

- **Item**: G (part 3)
- **Description**: Add `searchParams` to ProcesoDetailPage props and render `<AnalysisTracker />` when `?analysis=` param is present.
- **Files**:
  - Modify: `apps/web/app/(authenticated)/procesos/[id]/page.tsx`
- **Approach**:
  - Add `searchParams: { analysis?: string }` to `PageProps` interface.
  - Import `AnalysisTracker` from `@/components/analysis/analysis-tracker`.
  - In the page JSX (after Volver button and before/after detail content):
    ```tsx
    {!fetchError && searchParams?.analysis && (
      <AnalysisTracker
        key={searchParams.analysis}
        analysisId={searchParams.analysis}
        procesoId={params.id}
      />
    )}
    ```
  - `key={searchParams.analysis}` is a JD fix — forces clean remount when retry creates new job (new analysisId = new component instance, all prior state cleared).
- **Test criteria**: Page accepts `searchParams` in props. `?analysis=job-uuid` renders AnalysisTracker. No `?analysis=` renders nothing extra. Key prop changes on new analysisId cause clean remount.
- **Estimated lines**: ~10

---

## Dependency Graph

```
T1 (LoadingCard fix) ────┐
                         ├──→ T13 (Planes skeleton)
                         ├──→ T14 (SENA skeleton)
                         └── (indirect — any LoadingCard usage)
                         
T2 (tsconfig) ──── independent

T3 (toast) ────── independent

T4 (AlertDialog component) ────→ T5 (subscription-manager)
                             ├──→ T6 (profile-list)
                             ├──→ T7 (alert-list + page)
                             └──→ T8 (connect-button)

T9─T15 (skeletons) ──── all independent of each other

T16 (chart data) ──── independent

T17 (admin layout) ────→ T18 (admin page)
                    ├──→ T19 (stats API)
                    └──→ T20 (sidebar link)

T21 (instrumentation) ────→ T22 (AnalysisTracker) ────→ T23 (wire into page)
```

**Zero blocking dependencies between items A-G** per design. The graph above shows within-item ordering. Cross-item execution is fully parallel.

---

## Suggested Execution Order

| Order | Task | Item | Risk | Why Here |
|-------|------|------|------|----------|
| 1 | T2 | A | None | 1-line build fix, unblocks dev server if iteration errors exist |
| 2 | T1 | 0 | Low | Prerequisite for T13/T14 (skel with LoadingCard) |
| 3 | T3 | B | Low | Adds toast infrastructure early, available for any subsequent UI work |
| 4 | T4 | C1 | Medium | AlertDialog component needed by 4 replacement tasks; verify @base-ui API |
| 5 | T5 | C2a | Low | Surgical confirm() replacement |
| 6 | T6 | C2b | Low | Surgical confirm() replacement |
| 7 | T7 | C2c | Low | Two files, but pattern is same |
| 8 | T8 | C2d | Low | Surgical confirm() replacement |
| 9 | T9─T15 | D | Low | 7 files, all same pattern, can batch implement |
| 10 | T16 | E | Low | Single file, chart already handles empty state |
| 11 | T17 | F1 | Medium | Role guard layout, admin base |
| 12 | T18 | F2 | Medium | Main admin page content, most lines in Item F |
| 13 | T19 | F3 | Low | API route, thin wrapper around getDbStats() |
| 14 | T20 | F4 | Low | 3 changes to sidebar.tsx |
| 15 | T21 | G1 | Low | 3-line file, worker has idempotency guard |
| 16 | T22 | G2 | High | Core polling logic, error handling, retry — most complex component |
| 17 | T23 | G3 | Low | Wire into page, 5 lines of JSX |

---

## Total Estimated Lines (Grouped by Item)

| Item | Tasks | Files Created | Files Modified | Est. Lines |
|------|-------|--------------|----------------|------------|
| 0 — LoadingCard fix | T1 | 0 | 1 | ~10 |
| A — Build fix | T2 | 0 | 1 | +1 |
| B — Toast | T3 | 1 | 2 | ~25 |
| C — AlertDialog + confirm() | T4─T8 | 1 | 5 | ~200 |
| D — Skeletons | T9─T15 | 7 | 0 | ~60 |
| E — Chart data | T16 | 0 | 1 | ~25 |
| F — Admin page | T17─T20 | 3 | 1 | ~140 |
| G — Analysis + worker fix | T21─T23 | 2 | 1 | ~103 |
| **Total** | **23 tasks** | **14** | **12** | **~564** |

Note: Estimates are higher than the proposal's ~481 because Item C (4 confirm replacements) and Item F (admin page spec is richer in the design doc) were conservatively estimated in the proposal. Item C has the most files (5 modified) so per-file overhead adds up.

---

## Review Workload Forecast

| Task | Files | Complexity | Review Focus |
|------|-------|-----------|--------------|
| T1 | 1 | Low | Verify no inline style remains, grid-cols-{n} class renders correctly |
| T2 | 1 | Trivial | Verify key present in compilerOptions |
| T3 | 3 | Low | Verify sonner in package.json, Toaster in layout, classNames use existing CSS vars |
| T4 | 1 | Medium | Verify 9 exports, styling matches dialog.tsx, Escape key behavior, no Action component assumed |
| T5 | 1 | Low | Verify confirm() removed, AlertDialog wraps button, action calls correct handler |
| T6 | 1 | Low | Same pattern as T5 |
| T7 | 2 | Low | Verify AlertList handles its own dialog state, page handleDelete clean |
| T8 | 1 | Low | Same pattern as T5 |
| T9─T15 | 7 | Low | Each: verify server component, correct skeleton primitives, layout matches page shape |
| T16 | 1 | Medium | Verify strftime with unixepoch, ASC ordering, empty state, label formatter |
| T17 | 1 | Low | Verify role check, redirect path, no redundant auth() call |
| T18 | 1 | Medium | Verify direct getDbStats(), try/catch error handling, table column accuracy |
| T19 | 1 | Low | Verify auth check, JSON shape matches expected fields |
| T20 | 1 | Medium | Verify SidebarProps.role added, navLinks conditional, useMemo dependency |
| T21 | 1 | Trivial | Verify import path, register() export |
| T22 | 1 | High | Verify polling logic, cleanup, 404 tolerance, import from types not status-card, state reset on analysisId change, retry flow without redundant router.refresh() |
| T23 | 1 | Low | Verify searchParams in PageProps, key prop binding, conditional render |

**High-risk tasks** (require careful review):
1. **T22** — AnalysisTracker: polling lifecycle, edge cases (404, 401, unmount, retry)
2. **T4** — AlertDialog: @base-ui API differences from Dialog, no Action component
3. **T16** — Chart query: SQLite strftime with unixepoch modifier correctness

**Medium-risk**:
- T18 — Admin page: direct DB queries schema accuracy
- T20 — Sidebar: conditional navLinks, useMemo correctness

**Low-risk** (bulk of tasks — straightforward):
- T1-T3, T5-T15, T17, T19, T21, T23 — well-understood patterns with no hidden edge cases
