# Design: secop-ui-ux-polish

## Technical Approach

Seven independent items (A-G) addressing surface-level UX gaps, a build fix, and a critical worker initialization bug. Items have zero blocking dependencies — can be implemented in any order, though the risk-ordered sequence is A -> B -> C -> D -> E -> F -> G. Each item is self-contained with its own file changes and test scenarios.

## Architecture Decisions

### Decision 1: sonner for toasts

**Choice**: sonner (1.6kB) with shadcn-style Toaster wrapper.

**Rationale**: Already in the shadcn ecosystem, used by 50k+ projects, zero-config DOM portal. Custom toast via @base-ui would be ~200+ lines for equivalent behavior. sonner accepts `style` prop for CSS var overrides — no custom CSS file needed.

### Decision 2: @base-ui/react AlertDialog (zero installs)

**Choice**: `@base-ui/react/alert-dialog` at `@base-ui/react/alert-dialog` — already available as `@base-ui/react` is a dependency (v1.6.0+).

**Rationale**: AlertDialog is a separate namespace from Dialog in @base-ui. No new dependency. Styling mirrors the existing `dialog.tsx` patterns (same backdrop, popup ring, rounded-xl, animation classes). The namespaced primitives (`AlertDialog.Trigger`, `AlertDialog.Backdrop`, `AlertDialog.Popup`, etc.) map 1:1 to Dialog primitives.

### Decision 3: Page-level loading.tsx (Next.js route-based)

**Choice**: Create `loading.tsx` in each page directory. Next.js automatically shows the nearest `loading.tsx` while the page's async component is resolving.

**Rationale**: The existing `(authenticated)/loading.tsx` is a generic spinner. Page-level files override it with layout-matching skeletons. No JS needed — they are server components that render shared skeleton primitives from `components/shared/`.

**JD Fix**: LoadingCard must use Tailwind `grid-cols-{n}` classes instead of inline `style={{ gridTemplateColumns }}` to allow responsive overrides via className. `loading-table.tsx` uses `columns` prop (not `cols`).

### Decision 4: Server-side chart data query (no client fetch)

**Choice**: Drizzle raw SQL query in the dashboard server component, passed as `initialData` prop.

**Rationale**: The `ProcesosChart` already accepts `initialData?: ChartData[]`. Server rendering avoids waterfall fetches. The query groups Unix timestamp `fecha_publicacion` (seconds) using SQLite's `%Y-%m` format with `unixepoch` modifier.

### Decision 5: Role guard via nested route under (authenticated)

**Choice**: Admin routes live under `app/(authenticated)/admin/` to inherit the existing sidebar+header layout. A nested `layout.tsx` adds role-specific guard.

**Rationale**: Inherits the full authenticated chrome (Sidebar, Header) without duplicating layout code. The `(authenticated)/layout.tsx` already provides auth check; admin layout only adds `role === "admin"` guard. No standalone admin layout needed.

**JD Fix**: Original design had admin outside `(authenticated)`, causing no navigation. Now uses nested route group.

### Decision 6: interval polling instead of SSE

**Choice**: `setInterval` every 3s in the `AnalysisTracker` client component. Cleans up on unmount.

**Rationale**: SSE adds infrastructure (event emitter, connection tracking) for a low-volume feature. Interval polling every 3s is simple, proven, and the GET endpoint already exists (`GET /api/analysis/[id]`). The user already navigated to the page — they expect to wait.

### Decision 7: instrumentation.ts for worker startup

**Choice**: `apps/web/instrumentation.ts` exporting `register()` that calls `startWorker()` from `@/lib/analysis/worker`.

**Rationale**: Next.js 14.2+ runs `instrumentation.ts` on server boot (stable, no experimental flag). This is the canonical hook point for background workers. The worker module already has idempotency guards (`if (workerInterval) return`).

## Data Flow

### Item E — Chart Data
```
DashboardPage (server)
  ├─ auth() → redirect if unauthenticated
  ├─ db.select({ mes, total }).from(procesos)
  │    .groupBy(strftime(...))
  │    .orderBy(desc)
  │    .limit(12)
  │    .all()
  └─ <ProcesosChart initialData={chartData} />
      └─ renders <BarChart> with data, or "Datos de grafico proximamente" if empty
```

### Item F — Admin Sync Dashboard
```
AdminLayout (server)
  └─ auth() → role !== "admin" → redirect("/")

AdminSyncPage (server)
  ├─ direct DB: sourceHealth.all()
  ├─ direct DB: syncLog.orderBy(desc).limit(20).all()
  └─ fetch("/api/admin/stats") → { totalUsers, totalProcesos, totalAnalysis }

GET /api/admin/stats (route handler)
  ├─ auth() → 401
  ├─ getDbStats() → { totalProcesos, totalUsuarios, totalAnalisis }
  └─ NextResponse.json({ totalUsers, totalProcesos, totalAnalysis })
```

### Item G — Analysis polling
```
AnalyzeButton (client)
  └─ POST /api/analysis/start → { jobId }
    └─ router.push(`/procesos/${procesoId}?analysis=${jobId}`)

ProcesoDetailPage (server)
  └─ <AnalysisTracker analysisId={searchParams.analysis} />

AnalysisTracker (client) — on mount if analysisId:
  ├─ setInterval 3s:
  │   └─ GET /api/analysis/[id] → { job, result }
  │      ├─ estado in (pending, downloading, ocr, extracting, verifying)
  │      │   └─ <StatusCard status={job.estado} ... />
  │      ├─ estado === "completed"
  │      │   └─ clearInterval → <ResultsDisplay result={result} />
  │      └─ estado === "failed"
  │          └─ clearInterval → error + <Button "Reintentar" />
  └─ cleanup: clearInterval on unmount
```

## File Changes

| Item | File | Action | Description |
|------|------|--------|-------------|
| A | `apps/web/tsconfig.json` | Modify | Add `"downlevelIteration": true` to compilerOptions |
| B | `apps/web/package.json` | Modify | Add `"sonner": "^2.0.0"` to dependencies |
| B | `apps/web/components/ui/sonner.tsx` | Create | shadcn-compatible Toaster wrapper using CSS vars |
| B | `apps/web/app/layout.tsx` | Modify | Add `<Toaster />` inside `<body>` |
| C | `apps/web/components/ui/alert-dialog.tsx` | Create | @base-ui AlertDialog primitives with dialog.tsx styling |
| C | `apps/web/components/subscriptions/subscription-manager.tsx` | Modify | Replace confirm() with AlertDialog |
| C | `apps/web/components/sena/profile-list.tsx` | Modify | Replace confirm() with AlertDialog |
| C | `apps/web/app/(authenticated)/alertas/page.tsx` | Modify | Replace confirm() with AlertDialog (handler only) |
| C | `apps/web/components/alertas/alert-list.tsx` | Modify | Add AlertDialog state + trigger (delete button lives here) |
| C | `apps/web/components/linkedin/connect-button.tsx` | Modify | Replace confirm() with AlertDialog |
| D | `apps/web/app/loading.tsx` | Create | Dashboard skeleton (grid + WelcomeBanner) |
| D | `apps/web/app/(authenticated)/procesos/[id]/loading.tsx` | Create | Proceso detail skeleton (back + card) |
| D | `apps/web/app/(authenticated)/pac/loading.tsx` | Create | PAC table skeleton (LoadingTable 5x6) |
| D | `apps/web/app/(authenticated)/perfil/loading.tsx` | Create | Perfil 2-column skeleton grid |
| D | `apps/web/app/(authenticated)/planes/loading.tsx` | Create | Planes pricing cards skeleton (3 cols) |
| D | `apps/web/app/(authenticated)/sena/loading.tsx` | Create | SENA profiles skeleton (6 cards, 3 cols) |
| D | `apps/web/app/(authenticated)/suscripcion/loading.tsx` | Create | Suscripcion skeleton (2 cards) |
| E | `apps/web/app/page.tsx` | Modify | Add Drizzle query + pass initialData to ProcesosChart |
| F | `apps/web/app/(authenticated)/admin/layout.tsx` | Create | Role guard layout (redirect non-admin) — inherits sidebar from parent |
| F | `apps/web/app/(authenticated)/admin/sync/page.tsx` | Create | Sync dashboard: source health + sync log + stats (direct getDbStats()) |
| F | `apps/web/app/api/admin/stats/route.ts` | Create | GET stats API route (for external use) |
| F | `apps/web/components/layout/sidebar.tsx` | Modify | Add role to SidebarProps, conditional Admin link |
| G | `apps/web/instrumentation.ts` | Create | register() -> startWorker() |
| G | `apps/web/components/analysis/analysis-tracker.tsx` | Create | Client component: poll + StatusCard/ResultsDisplay/error |
| G | `apps/web/app/(authenticated)/procesos/[id]/page.tsx` | Modify | Add searchParams, wire AnalysisTracker |

## Change Details

### Item A — Build fix (1 file, +1 line)

**Location**: `apps/web/tsconfig.json:14` — after `"jsx": "preserve",` on line 13.

```json
{
  "compilerOptions": {
    ...
    "jsx": "preserve",
    "downlevelIteration": true,   // <-- add this
    "incremental": true,
    ...
  }
}
```

**Why**: `Set`, `Map` iterations and `for...of` on iterables can fail at runtime when TypeScript transpiles to ES5-compatible output (Next.js default for legacy browser support). `downlevelIteration: true` adds the iterator protocol helper.

**Edge cases**: No side effects — this is a purely additive compiler flag. Does not affect output for modern browsers.

---

### Item B — Toast system (3 files: 1 create, 2 modify)

**JD Fix applied**: `package.json` add `"sonner": "^2.0.0"` with latest available version.

**`components/ui/sonner.tsx`** — Toaster wrapper:
```tsx
"use client"

import { Toaster as SonnerToaster } from "sonner"

type ToasterProps = React.ComponentProps<typeof SonnerToaster>

function Toaster({ ...props }: ToasterProps) {
  return (
    <SonnerToaster
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
```

**`app/layout.tsx`** — add after `<SessionProvider>` closing tag:
```tsx
import { Toaster } from "@/components/ui/sonner"
// ...
<body>
  <SessionProvider>{children}</SessionProvider>
  <Toaster />
</body>
```

**`package.json`**: Add `"sonner": "^2.0.0"` to dependencies.

**Usage pattern** (no changes to existing components in this item):
```tsx
import { toast } from "sonner"
toast.success("Proceso analizado")
toast.error("Error al conectar LinkedIn")
toast("Mensaje informativo")
```

**CSS variables used**: `--background`, `--foreground`, `--border`, `--primary`, `--primary-foreground`, `--muted`, `--muted-foreground` — all already defined in globals.css.

---

### Item C — AlertDialog + replace confirm() (6 files: 1 create, 5 modify)

**JD Fix applied**: AlertList (components/alertas/alert-list.tsx) is also modified — the delete button lives inside AlertList, not directly in alertas/page.tsx.

**JD Fix applied**: AlertDialog does NOT have a native `Action` component in @base-ui/react — only `Close`. Both AlertDialogAction and AlertDialogCancel use `AlertDialogPrimitive.Close` internally, differentiated by Button variant (destructive vs outline).

**`components/ui/alert-dialog.tsx`** — follows dialog.tsx patterns exactly:

```tsx
"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogContent({
  className,
  children,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        className="fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="alert-dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function AlertDialogCancel({ className, ...props }: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button variant="outline" />}
      className={className}
      {...props}
    />
  )
}

function AlertDialogAction({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-action"
      render={<Button variant="destructive" className={className} {...props} />}
    />
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
}
```

**Key API note**: `@base-ui/react/alert-dialog` is a separate module from `@base-ui/react/dialog` in @base-ui/react@1.6+. It exports `AlertDialog` as a namespace with: `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close` (Cancel), and `Action`. `Action` is a specialized `Close` that confirms the dialog intent.

**Pattern for replacing confirm() in each file**:

Replace:
```tsx
async function handleDelete(id: number) {
  if (!confirm("Eliminar esta alerta?")) return
  // ... action
}
```

With (example for alertas/page.tsx):
```tsx
// In the component, add state:
const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

// handleDelete no longer has confirm — it just executes
async function handleDelete(id: number) {
  try {
    const res = await fetch(`/api/alertas/${id}`, { method: "DELETE" })
    if (!res.ok) throw new Error("Error al eliminar alerta")
    setAlertas((prev) => prev.filter((a) => a.id !== id))
  } catch (error) {
    console.error(error)
  }
}

// In JSX, wrap delete button (in AlertList) or add AlertDialog around the trigger:
<AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" size="icon-sm" onClick={() => setDeleteConfirmId(alerta.id)}>
      <Trash2Icon className="size-4" />
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Eliminar Alerta</AlertDialogTitle>
      <AlertDialogDescription>
        Esta accion no se puede deshacer.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={() => deleteConfirmId !== null && handleDelete(deleteConfirmId)}>
        Eliminar
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Per-file specifics**:

1. **subscription-manager.tsx:52**: Remove `confirm()` from `handleCancel`. Wrap the "Cancelar Suscripcion" `<Button>` (lines 173-189) in AlertDialog. Title: "Cancelar Suscripcion". Description: "Perderas acceso a funciones premium al final del periodo actual."

2. **profile-list.tsx:34**: Remove `confirm()` from `handleDelete`. Wrap each delete `<Button>` (lines 104-112) in AlertDialog. Title: "Eliminar Perfil". Description: "Este perfil se eliminara permanentemente."

3. **alertas/page.tsx + alert-list.tsx**: Remove `confirm()` from `handleDelete` in page. The delete button is inside `AlertList` component. **Chosen**: Modify `AlertList` to handle its own AlertDialog state — cleaner since the delete is inherently local to each row. Add an `alertId` state, wrap the Trash2Icon button with AlertDialogTrigger, and call `onDelete` in the Action button. Both files modified.

4. **connect-button.tsx:40**: Remove `confirm()` from `handleDisconnect`. Wrap the "Desconectar LinkedIn" `<Button>` (lines 60-69) in AlertDialog. Title: "Desconectar LinkedIn". Description: "Se eliminara la conexion con LinkedIn."

---

### Item D — Loading skeletons (7 files, all create)

**Pattern**: Each file is a server component (no `"use client"`) that imports skeleton primitives from `components/shared/`. Next.js renders the `loading.tsx` closest to the route while the page's async component is resolving.

**Dashboard** (`app/loading.tsx`):
```tsx
import { SkeletonBox, SkeletonCard } from "@/components/shared"

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBox className="h-24" /> {/* WelcomeBanner area */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
```

**Procesos/[id]** (`(authenticated)/procesos/[id]/loading.tsx`):
```tsx
import { SkeletonBox, SkeletonCard } from "@/components/shared"

export default function ProcesoDetailLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBox className="h-5 w-24" /> {/* Back button */}
      <SkeletonCard className="h-96" />    {/* Detail card */}
    </div>
  )
}
```

**JD Fix applied**: `LoadingTable` prop is `columns`, not `cols`.

**PAC** (`(authenticated)/pac/loading.tsx`):
```tsx
import { LoadingTable } from "@/components/shared"

export default function PacLoading() {
  return <LoadingTable rows={5} columns={6} />
}
```

**Perfil** (`(authenticated)/perfil/loading.tsx`):
```tsx
import { SkeletonCard } from "@/components/shared"

export default function PerfilLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SkeletonCard className="h-48" />
      <SkeletonCard className="h-48" />
    </div>
  )
}
```

**JD Fix applied**: LoadingCard uses `columns` prop, not inline style or className grid overrides (inline style blocks Tailwind responsive classes).

**Planes** (`(authenticated)/planes/loading.tsx`):
```tsx
import { LoadingCard } from "@/components/shared"

export default function PlanesLoading() {
  return <LoadingCard count={3} columns={3} />
}
```

**JD Fix applied**: SENA skeleton uses LoadingCard with `columns={3}` (no responsive overrides that inline style would block).

**SENA** (`(authenticated)/sena/loading.tsx`):
```tsx
import { LoadingCard } from "@/components/shared"

export default function SenaLoading() {
  return <LoadingCard count={6} columns={3} />
}
```

**Suscripcion** (`(authenticated)/suscripcion/loading.tsx`):
```tsx
import { SkeletonCard } from "@/components/shared"

export default function SuscripcionLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SkeletonCard className="h-64" />
      <SkeletonCard className="h-64" />
    </div>
  )
}
```

**Key behavior**: When both `(authenticated)/loading.tsx` and a page-level `loading.tsx` exist, Next.js renders the page-level one for that page. The layout-level spinner is the fallback for pages without their own loading file.

---

### Item E — Chart data wiring (1 file, modify)

**`app/page.tsx`** — add import and query before the return:

```tsx
import { sql, desc } from "drizzle-orm"
import { procesos } from "@/lib/db/schema"

// In DashboardPage, after auth check:
const chartData = db
  .select({
    mes: sql<string>`strftime('%Y-%m', fecha_publicacion, 'unixepoch')`,
    total: sql<number>`COUNT(*)`,
  })
  .from(procesos)
  .groupBy(sql`strftime('%Y-%m', fecha_publicacion, 'unixepoch')`)
   .orderBy(sql`strftime('%Y-%m', fecha_publicacion, 'unixepoch')`)  // ASC (oldest first — conventional time-series)
  .limit(12)
  .all()
```

Then pass to component:
```tsx
<ProcesosChart initialData={chartData} />
```

**JD Fix applied**: Chart data is sorted ASC (oldest first) for conventional time-series display. If ordering needs adjustment, reverse array before passing.

**Why `unixepoch` modifier**: `fecha_publicacion` is stored as an integer Unix timestamp (seconds since epoch). SQLite's `strftime` requires a valid time string — the `unixepoch` modifier converts the numeric value.

**Empty state**: When the table is empty, `chartData` is `[]`. `ProcesosChart` already handles this with the `data.length > 0 ? <BarChart> : "Datos de grafico proximamente"` ternary.

**JD Fix applied**: Add label formatter for X-axis to show localized month names instead of raw `'2026-01'` format.

---

### Item F — Admin page (4 files: 3 create, 1 modify)

**JD Fix applied**: Admin routes moved under `(authenticated)/admin/` to inherit sidebar+header. No standalone admin layout. Role guard in `(authenticated)/admin/layout.tsx`. No redundant `auth()` call in page from server component (layout already guards). Stats fetched via direct `getDbStats()` — no self-referencing HTTP fetch.

**`app/(authenticated)/admin/layout.tsx`** — role guard (inherits sidebar+header from parent (authenticated) layout):
```tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  // (authenticated)/layout.tsx already redirects unauthenticated users
  if (session?.user?.role !== "admin") redirect("/")
  return <>{children}</>
}
```

**`app/(authenticated)/admin/sync/page.tsx`** — sync dashboard:
```tsx
import { db } from "@/lib/db"
import { getDbStats } from "@/lib/db"
import { sourceHealth, syncLog } from "@/lib/db/schema"
import { desc } from "drizzle-orm"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorMessage } from "@/components/shared/error-message"

export const dynamic = "force-dynamic"

export default async function AdminSyncPage() {
  let sources: unknown[] = []
  let logs: unknown[] = []
  let error: string | null = null

  try {
    sources = await db.select().from(sourceHealth).all()
    logs = await db.select().from(syncLog).orderBy(desc(syncLog.fechaInicio)).limit(20).all()
  } catch (e) {
    error = "Error al cargar datos de sincronizacion"
  }

  if (error) return <ErrorMessage message={error} />

  const stats = getDbStats()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel de Administracion"
        description="Estado de fuentes y sincronizacion"
      />
      
      {/* Quick stats */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Estadisticas Rapidas</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{stats.totalUsers}</p>
            <p className="text-xs text-muted-foreground">Usuarios</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{stats.totalProcesos}</p>
            <p className="text-xs text-muted-foreground">Procesos</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{stats.totalAnalysis}</p>
            <p className="text-xs text-muted-foreground">Analisis</p>
          </div>
        </div>
      </section>

      {/* Source health table */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Estado de Fuentes</h2>
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">Fuente</th>
                <th className="p-3 text-left font-medium">Estado</th>
                <th className="p-3 text-left font-medium">Fallos</th>
                <th className="p-3 text-left font-medium">Ultimo exito</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s: any) => (
                <tr key={s.source} className="border-b last:border-0">
                  <td className="p-3">{s.source}</td>
                  <td className="p-3">
                    <span className={`text-xs font-medium ${
                      s.status === "healthy" ? "text-emerald-600" :
                      s.status === "degraded" ? "text-amber-600" :
                      "text-destructive"
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="p-3">{s.consecutiveFailures}</td>
                  <td className="p-3">
                    {s.lastSuccessAt ? new Date(s.lastSuccessAt * 1000).toLocaleString("es-CO") : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sync log */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Registro de Sincronizacion</h2>
        {/* Similar table for syncLog rows */}
      </section>
    </div>
  )
}
```

**`app/api/admin/stats/route.ts`** — stats API (kept for external use, but admin page uses direct `getDbStats()`):
```ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getDbStats } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const stats = getDbStats()
    return NextResponse.json({
      totalUsers: stats.totalUsuarios,
      totalProcesos: stats.totalProcesos,
      totalAnalysis: stats.totalAnalisis,
    })
  } catch {
    return NextResponse.json({ error: "Error fetching stats" }, { status: 500 })
  }
}
```

**`components/layout/sidebar.tsx`** — conditional admin link:

Changes:
1. Add `role?: string | null` to `SidebarProps['user']`
2. Import `Shield` from `lucide-react`
3. Conditionally include the admin link in navLinks

```tsx
// In SidebarProps:
interface SidebarProps {
  user: {
    name?: string | null
    email?: string | null
    plan?: string | null
    role?: string | null   // <-- add
  }
}

// navLinks becomes a function:
function getNavLinks(user: SidebarProps["user"]) {
  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/procesos", label: "Procesos", icon: FileSearch },
    { href: "/pac", label: "PAC", icon: CalendarCheck },
    { href: "/alertas", label: "Alertas", icon: Bell },
    { href: "/planes", label: "Planes", icon: CreditCard },
    { href: "/sena", label: "SENA", icon: Users },
    { href: "/perfil", label: "Perfil", icon: Settings },
  ]
  if (user?.role === "admin") {
    links.push({ href: "/admin/sync", label: "Admin", icon: Shield })
  }
  return links
}

// Pass user to NavContent:
function NavContent({ pathname, user }: { pathname: string; user: SidebarProps["user"] }) {
  const navLinks = useMemo(() => getNavLinks(user), [user])
  // ... rest same
}
```

**`: `:

The sidebar receives `session.user` from the authenticated layout. `session.user.role` is populated by the JWT callback in `lib/auth.ts` (line 88: `session.user.role = token.role as string`). The type is available because the auth `callbacks.session` already sets `role` on the session user.

---

### Item G — LLM Analysis integration + worker fix (3 files: 2 create, 1 modify)

**JD Fixes applied**:
- Import `AnalysisJobStatus` from `@/lib/analysis/types` (NOT from status-card — it's not exported there)
- Use `key={analysisId}` on AnalysisTracker in page to force clean remount on retry
- Add state reset `useEffect` for safety
- Fix first poll to clear interval on terminal states
- Add 404 tolerance (keep polling if job not yet visible)
- Remove redundant `router.refresh()` after `router.replace()`

**`apps/web/instrumentation.ts`** — worker startup:
```ts
import { startWorker } from "@/lib/analysis/worker"

export function register() {
  startWorker()
}
```

**Behavior**: Next.js 14.2+ loads `instrumentation.ts` once on server boot (both `next dev` and `next start`). On `next dev`, HMR may re-run the module — `startWorker()` has an idempotency guard (`if (workerInterval) return`) so it won't create duplicate intervals.

**`components/analysis/analysis-tracker.tsx`** — polling client component (JD fixes applied):
```tsx
"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { StatusCard } from "@/components/analysis/status-card"
import { ResultsDisplay } from "@/components/analysis/results-display"
import { Button } from "@/components/ui/button"
import { RotateCwIcon } from "lucide-react"
import type { AnalysisJobStatus } from "@/lib/analysis/types"  // FIXED: import from types, NOT status-card

interface AnalysisJob {
  id: string
  estado: AnalysisJobStatus
  paginasTotal: number
  paginasProcesadas: number
  error?: string | null
}

interface AnalysisResult {
  requisitosHabilitantes: Record<string, unknown> | null
  garantias: Record<string, unknown> | null
  cronograma: Record<string, unknown> | null
  formaPago: Record<string, unknown> | null
  experienciaRequerida: Record<string, unknown> | null
  riesgos: Record<string, unknown> | null
  resumen: string | null
  confianza: number | null
  modeloExtraccion: string | null
  modeloVerificacion: string | null
}

interface AnalysisTrackerProps {
  analysisId: string | null | undefined
  procesoId: string
}

const PROCESSING_STATES = new Set([
  "pending", "downloading", "ocr", "extracting", "verifying",
])

export function AnalysisTracker({ analysisId, procesoId }: AnalysisTrackerProps) {
  const router = useRouter()
  const [job, setJob] = useState<AnalysisJob | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  // FIXED: Reset all state when analysisId changes (retry creates new job)
  useEffect(() => {
    setJob(null)
    setResult(null)
    setError(null)
    setRetrying(false)
  }, [analysisId])

  const poll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/analysis/${id}`)
      if (res.status === 404) return "continue"  // FIXED: job may not be visible yet
      if (!res.ok) throw new Error("Error al consultar estado")
      const data = await res.json()
      setJob(data.job)
      setResult(data.result)

      if (data.job.estado === "completed" || data.job.estado === "failed") {
        return data.job.estado
      }
      return "continue"
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
      return "error"
    }
  }, [])

  useEffect(() => {
    if (!analysisId) return

    let active = true
    let interval: ReturnType<typeof setInterval> | null = null  // FIXED: hoisted for cleanup
    const id = analysisId

    async function startPolling() {
      // First poll
      const status = await poll(id)
      if (!active) return
      if (status === "completed" || status === "failed" || status === "error") return

      // Subsequent polls
      interval = setInterval(async () => {
        if (!active) return
        const s = await poll(id)
        if (!active) return
        if (s === "completed" || s === "failed" || s === "error") {
          clearInterval(interval!)
        }
      }, 3000)
    }

    startPolling()

    return () => {
      active = false
      if (interval) clearInterval(interval)
    }
  }, [analysisId, poll])

  async function handleRetry() {
    setRetrying(true)
    setError(null)
    try {
      const res = await fetch("/api/analysis/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ procesoId, paginasEstimadas: 1 }),
      })
      if (!res.ok) throw new Error("Error al reintentar")
      const data = await res.json()
      router.replace(`/procesos/${procesoId}?analysis=${data.jobId}`)
      // FIXED: removed redundant router.refresh() — router.replace already causes re-render
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al reintentar")
    } finally {
      setRetrying(false)
    }
  }

  if (!analysisId) return null

  if (error && !job) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/50 p-4 text-sm text-destructive">
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
          <RotateCwIcon className="size-4 mr-1" />
          {retrying ? "Reintentando..." : "Reintentar"}
        </Button>
      </div>
    )
  }

  if (job?.estado === "completed" && result) {
    return <ResultsDisplay result={result} />
  }

  if (job && PROCESSING_STATES.has(job.estado)) {
    return (
      <StatusCard
        status={job.estado as AnalysisJobStatus}
        pagesTotal={job.paginasTotal}
        pagesProcesadas={job.paginasProcesadas}
      />
    )
  }

  if (job?.estado === "failed") {
    return (
      <div className="space-y-4">
        <StatusCard
          status="failed"
          pagesTotal={job.paginasTotal}
          pagesProcesadas={job.paginasProcesadas}
          error={job.error}
        />
        <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
          <RotateCwIcon className="size-4 mr-1" />
          {retrying ? "Reintentando..." : "Reintentar"}
        </Button>
      </div>
    )
  }

  // Initial state — loading first poll
  return (
    <div className="flex items-center justify-center py-8">
      <div className="text-sm text-muted-foreground animate-pulse">
        Iniciando analisis...
      </div>
    </div>
  )
}
```

**`app/(authenticated)/procesos/[id]/page.tsx`** — wire AnalysisTracker:

```tsx
// Add to PageProps:
interface PageProps {
  params: { id: string }
  searchParams: { analysis?: string }  // <-- add
}

// In the return, after the Volver/AnalyzeButton row and before/after ProcesoDetail:
{
  !fetchError && searchParams?.analysis && (
    <AnalysisTracker
      key={searchParams.analysis}  // FIXED: key forces clean remount on retry (new analysisId = new component instance)
      analysisId={searchParams.analysis}
      procesoId={params.id}
    />
  )
}
```

**Edge cases handled**:
- `analysisId` is `undefined` (no `?analysis=` param) → renders nothing
- Poll returns 404 (job not yet visible) → continues polling (transient)
- Poll returns 401 → redirects to login (via the existing fetch pattern)
- Component unmounts during polling → `active` flag + `clearInterval` in cleanup
- Retry starts a new job → `key={analysisId}` forces clean remount, all previous state cleared

**Worker start log verification**: After deploy, check server logs for `[Analysis Worker] Started`. If missing, the `instrumentation.ts` is not being loaded. Mitigation: add a fallback check in the startup API route.

## Testing Strategy

| Fix | LoadingCard inline style | Modify `loading-card.tsx` — replace inline `style` with Tailwind `grid-cols-{n}` class |
| Fix | Chart month format | Add label formatter in `procesos-chart.tsx` for X-axis (localized month names) |
| Fix | Chart order | Changed to ASC (oldest first) |

| Item | What to Test | Approach |
|------|-------------|----------|
| A | downlevelIteration enabled | Read tsconfig line 14, verify key present |
| B | sonner Toaster renders | Render root layout, verify `<Toaster />` exists in body |
| B | toast() works from client | Call `toast.success()` in test component, verify DOM presence |
| C | AlertDialog renders with correct exports | Mount AlertDialog, verify all 9 exports are functions |
| C | AlertDialog styling matches dialog.tsx | Compare class strings — same backdrop ring, rounded-xl, colors |
| C | Each confirm() is replaced | Read each of 4 files, verify no `confirm(` string remains |
| C | Escape key closes dialog | Open dialog, press Escape, verify closed |
| D | Each loading.tsx renders skeletons | Render each loading.tsx, verify skeleton primitives present |
| D | Page-level overrides layout-level | Navigate to page, verify page-level skeleton shows (not spinner) |
| E | Chart query returns correct shape | Call `getDbStats`, verify `{ mes: string, total: number }[]` |
| E | Empty DB returns empty array | Truncate procesos table, verify empty array |
| E | strftime with unixepoch works | Insert proceso with known fecha_publicacion, verify format |
| F | Admin layout redirects non-admin | Mock `auth()` returning role=user, verify redirect |
| F | Stats API returns expected shape | GET /api/admin/stats, verify keys |
| F | Sidebar shows admin link only for admin | Render with role=admin vs role=user |
| G | register() calls startWorker() | Import instrumentation, verify worker logs |
| G | AnalysisTracker polls 3s while pending | Mount with analysisId, mock API returning pending, verify 3s interval |
| G | AnalysisTracker renders ResultsDisplay on complete | Mock API returning completed + result |
| G | AnalysisTracker shows error + retry on failed | Mock API returning failed |
| G | Interval cleanup on unmount | Mount, unmount, verify no active interval |
| G | No analysisId renders nothing | Mount without analysisId, verify empty render |

## Open Questions

1. **`instrumentation.ts` in Next.js 14.2**: While stable in 14.1+, verify that the `output: "standalone"` config in `next.config.mjs` works correctly with instrumentation. The standalone output bundles the worker module — test that `startWorker()` resolves in production (`next start`).
2. **@base-ui AlertDialog.Action API**: The `Action` component in @base-ui AlertDialog may have a different API than shown above. Verify the exact props before implementing. The fallback is to use `AlertDialog.Close` with `render={<Button ... onClick={handler} />}` for both Cancel and Confirm.
3. **Sidebar re-render**: Converting navLinks from a static const to a function that depends on `user` means the sidebar re-renders when user changes. This is fine — the sidebar already depends on `user` for the prop. Verify no unnecessary re-renders from the `useMemo` dependency.

**LoadingCard inline style**: The LoadingCard shared component uses `style={{ gridTemplateColumns: repeat(N, 1fr) }}` which blocks Tailwind responsive classes. **Fix**: Modify `loading-card.tsx` to use Tailwind `grid-cols-{n}` utility classes instead. This is a change to a shared component that affects all existing usages. Verify no regressions.
4. **Empty dirs check**: Items A-G don't reference `app/alertas/` or `app/pac/` directories. Confirm they still exist from the foundation migration (were not deleted).
5. **RSC hydration for admin page**: The `StatsCards` inline component fetches from the API route. This is a fetch from server component to API route in the same app — verify no circular dependency or cold-start issue.
