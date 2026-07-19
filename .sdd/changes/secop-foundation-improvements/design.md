# Design: secop-foundation-improvements

## Technical Approach

Migration-first: craft raw SQL migration (0001) with FTS5 virtual table + sync triggers + 10 indices, add the entry to Drizzle Kit's `_journal.json`, then swap the API search to use FTS5 MATCH with BM25 ranking + LIKE fallback, then build 6 shared UI components from shadcn/ui primitives, finally delete empty route directories.

## Architecture Decisions

### Decision 1: FTS5 via hand-crafted Drizzle Kit migration

**Choice**: Hand-write `0001_fts5_indices.sql` following Drizzle Kit's format (`--> statement-breakpoint` delimiters) and add its entry to `meta/_journal.json`. The `drizzle-kit migrate` command executes it normally.

**Alternatives**:
- `db.run(sql.raw(...))` in init code — works but skips the migration pipeline, creating an untracked schema state.
- Separate manual migration runner — adds complexity vs the existing `drizzle-kit migrate` flow.

**Rationale**: Drizzle ORM can't express `CREATE VIRTUAL TABLE`. But Drizzle Kit's migration runner is just a SQL executor — it doesn't care whether the SQL was generated or hand-written. Adding the journal entry is a one-time manual step. Keeps everything in one migration pipeline.

### Decision 2: Content sync triggers instead of external sync

**Choice**: SQLite triggers (`AFTER INSERT/UPDATE/DELETE`) on `procesos` keep `procesos_fts` in sync atomically.

**Rationale**: Zero app code changes for sync. Triggers are transactional — no drift window. Write amplification is minimal (two B-tree writes vs one).

### Decision 3: LIKE fallback on FTS5 failure

**Choice**: `try { FTS5 MATCH } catch { LIKE }`.

**Rationale**: FTS5 might be unavailable pre-migration, or a wild query might slip past sanitization. The API should never 500 on search. LIKE is the universal fallback.

### Decision 4: FTS5 input sanitization via term quoting

**Choice**: Strip FTS5 operator chars (`'^"*()[]~{}&|!@#\`), split whitespace, wrap each term in double quotes.

**Rationale**: FTS5 interprets many characters as operators. Adjacent quoted terms in FTS5 default to AND — matching the current LIKE behavior's implicit AND.

### Decision 5: 10 indices from schema comments (not 9)

**Choice**: All indices listed in `schema.ts:311-321` minus `idx_sync_fecha` (keep at 10).

**Rationale**: The schema comments are the authoritative source for which indices the original author intended. Excluding `sync_log` keeps it aligned with the spec's 9-count approximation.

### Decision 6: Independent component files with barrel export

**Choice**: Each shared component is a standalone `.tsx` file (30-60 lines), exported via `components/shared/index.ts`.

**Rationale**: Tree-shakeable imports. Standard pattern in the shadcn/ui ecosystem. No shared wrapper needed.

### Decision 7: className prop on all components

**Choice**: Every component accepts `className?: string` merged via `cn()` from `tailwind-merge` + `clsx`.

**Rationale**: Consumers can extend styling without wrapping. Matches shadcn/ui conventions already in the project.

## Data Flow

```
Browser → GET /api/procesos?search=licitacion+2026&estado=publicado&sortBy=fechaPublicacion&sortOrder=desc&page=1

  API Route:
    ├─ auth() → 401 if unauthenticated
    ├─ rateLimitMiddleware() → 429 if exceeded
    ├─ Parse query params (search, estado, modalidad, departamento, valorMin/Max, page, pageSize, sortBy, sortOrder)
    ├─ Build conditions array:
    │   ├─ search ≠ "" → sanitizeFts5(q) → FTS5 MATCH (fallback LIKE)
    │   ├─ estado ≠ "" → eq(procesos.estado, estado)
    │   ├─ modalidad ≠ "" → eq(procesos.modalidad, modalidad)
    │   ├─ departamento ≠ "" → eq(procesos.departamento, departamento)
    │   ├─ valorMin → gte(procesos.valor, valorMin)
    │   └─ valorMax → lte(procesos.valor, valorMax)
    ├─ combine via and(...conditions)
    ├─ Sort by SORTABLE_COLUMNS column + direction
    ├─ Paginate: OFFSET=(page-1)*pageSize, LIMIT=pageSize
    ├─ Parallel: main query + count(*) + sourceHealth query
    └─ JSON response { data[], total, page, pageSize, pages, ultima_sincronizacion, advertencia... }
```

FTS5 query path (when `search` param is present):

```
user query "licitacion 2026"
    → sanitizeFts5: "licitacion" "2026"
    → SELECT p.*, rank FROM procesos_fts
      JOIN procesos p ON p.rowid = procesos_fts.rowid
      WHERE procesos_fts MATCH '"licitacion" "2026"'
      ORDER BY bm25(procesos_fts, 0.0, 1.0)  -- weight: nombre is primary, entidad_nombre secondary
    → joined with filter conditions as AND
    → returned as data[]
```

Fallback path (if MATCH throws):

```
    → WHERE (nombre LIKE '%licitacion%' OR entidad_nombre LIKE '%licitacion%')
      AND (other filters...)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/lib/db/migrations/0001_fts5_indices.sql` | Create | FTS5 virtual table + 3 content sync triggers + 10 DB indices |
| `apps/web/lib/db/migrations/meta/_journal.json` | Modify | Add entry for 0001 so drizzle-kit migrate picks it up |
| `apps/web/app/api/procesos/route.ts` | Modify | Add `sanitizeFts5()` helper + import; replace LIKE block with FTS5 MATCH + LIKE catch fallback |
| `apps/web/components/shared/page-header.tsx` | Create | `<PageHeader title description? actions? className? />` |
| `apps/web/components/shared/empty-state.tsx` | Create | `<EmptyState icon? title description? action? className? />` |
| `apps/web/components/shared/skeleton.tsx` | Create | `<Skeleton variant className? />` — text, circle, rect |
| `apps/web/components/shared/error-message.tsx` | Create | `<ErrorMessage message retry? className? />` |
| `apps/web/components/shared/loading-table.tsx` | Create | `<LoadingTable rows? cols? className? />` — uses shadcn Table |
| `apps/web/components/shared/loading-card.tsx` | Create | `<LoadingCard count? className? />` — uses shadcn Card |
| `apps/web/components/shared/index.ts` | Create | Barrel re-exports for all 6 components |
| `apps/web/app/alertas/` | Delete | Empty directory (`.gitkeep` included, will be recreated later) |
| `apps/web/app/pac/` | Delete | Empty directory (`.gitkeep` included, will be recreated later) |

## FTS5 Migration Details

The migration file `0001_fts5_indices.sql` contains:

1. **10 CREATE INDEX statements** (with `IF NOT EXISTS` for idempotency):
   - `idx_procesos_estado` ON `procesos(estado)`
   - `idx_procesos_fecha` ON `procesos(fecha_publicacion DESC)`
   - `idx_procesos_entidad` ON `procesos(entidad_id)`
   - `idx_procesos_valor` ON `procesos(valor)`
   - `idx_procesos_unspc` ON `procesos(categoria_unspc)`
   - `idx_procesos_ubicacion` ON `procesos(ubicacion)`
   - `idx_pac_entidad` ON `pac_items(entidad_id)`
   - `idx_pac_anno` ON `pac_items(anno)`
   - `idx_alertas_user` ON `alertas(user_id)`
   - `idx_analysis_user` ON `analysis_jobs(user_id)`

2. **FTS5 virtual table**:
   ```sql
   CREATE VIRTUAL TABLE IF NOT EXISTS procesos_fts USING fts5(
     nombre, entidad_nombre,
     content='procesos',
     content_rowid='rowid',
     tokenize='porter unicode61'
   );
   ```

3. **3 content sync triggers** (INSERT, DELETE, UPDATE):
   - `procesos_fts_ai` — insert rowid + nombre + entidad_nombre into FTS
   - `procesos_fts_ad` — delete old row from FTS
   - `procesos_fts_au` — delete old + insert new (FTS5 content= tables use delete+insert for updates)

## Change Details

### API Route (`apps/web/app/api/procesos/route.ts`)

Add before the handler:

```typescript
const FTS5_SPECIAL_CHARS = /['^"*()\[\]{}~{}&|!@#\\]/g;

function sanitizeFts5(query: string): string {
  return query
    .replace(FTS5_SPECIAL_CHARS, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t}"`)
    .join(' ');
}
```

Replace the search condition block:

```typescript
// OLD:
if (q) {
  conditions.push(
    or(
      like(procesos.nombre, `%${q}%`),
      like(procesos.entidadNombre, `%${q}%`)
    ) as ReturnType<typeof eq>
  );
}

// NEW:
if (q) {
  try {
    const sanitized = sanitizeFts5(q);
    if (sanitized) {
      const ftsRowIds = db
        .select({ id: procesos.id })
        .from(sql`procesos_fts`)
        .where(sql`procesos_fts MATCH ${sanitized}`)
        .all()
        .map((r) => r.id);
      if (ftsRowIds.length > 0) {
        conditions.push(inArray(procesos.id, ftsRowIds));
      } else {
        // no matches — force empty result
        conditions.push(eq(procesos.id, ''));
      }
    }
  } catch {
    if (q) {
      conditions.push(
        or(
          like(procesos.nombre, `%${q}%`),
          like(procesos.entidadNombre, `%${q}%`)
        ) as ReturnType<typeof eq>
      );
    }
  }
}
```

Imports to add: `inArray`, `sql` from `drizzle-orm`.

### Shared Components

All components follow the same pattern:
- Props interface with `className?: string`
- Default export
- Uses `cn(className)` for root element className merging
- `aria-label` or `role` attributes for accessibility
- Leverage existing `lucide-react` icons

**PageHeader**: Renders `<div>` with `<h1>` (title) and optional `<p>` (description) + optional `actions` slot. `role="banner"`.

**EmptyState**: Centered flex column with optional icon, title, description, action button. `role="status"`.

**Skeleton**: Bare `<div>` with `animate-pulse rounded bg-muted`. Variants control dimensions (`h-4 w-full` for text, `h-10 w-10 rounded-full` for circle).

**ErrorMessage**: Red-tinted container with icon + message + optional retry button. `role="alert"`.

**LoadingTable**: Uses shadcn `<Table>` components with skeleton rows. Configurable `rows` (default 5) and `cols` (default 4).

**LoadingCard**: Uses shadcn `<Card>` components with skeleton content. Configurable `count` (default 3) for grid display.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `sanitizeFts5()` — special chars, empty, multi-word, accented | Pure function, no DB, Vitest |
| Unit | PageHeader renders title + description correctly | Vitest + RTL |
| Unit | EmptyState shows/hides action button based on prop | Vitest + RTL |
| Unit | Skeleton renders correct variant class + dimensions | Vitest + RTL |
| Unit | ErrorMessage shows message text + retry button | Vitest + RTL |
| Unit | LoadingTable renders N rows × M cols | Vitest + RTL |
| Unit | LoadingCard renders N card skeletons | Vitest + RTL |
| Unit | All components merge className properly | Vitest + RTL |
| Integration | Search API with FTS5 MATCH returns ranked results | In-memory SQLite with FTS5 |
| Integration | Search with special characters doesn't error | FTS5 + sanitized query |
| Integration | LIKE fallback works when FTS5 throws | Mock FTS5 to reject |
| Migration | FTS5 table + triggers + indices created | Dry-run 0001 against in-memory DB |

## Open Questions

1. **Migration order**: Should `0001_fts5_indices.sql` run before or after app startup? The `lib/db/index.ts` doesn't currently auto-migrate — it relies on a separate `npm run db:migrate` step. No code change needed there.
2. **BM25 weights**: Need to confirm weight values for `bm25(procesos_fts, 0.0, 1.0)` — currently weighted so `nombre` (field 0, weight 0.0) is the primary match field and `entidad_nombre` (field 1, weight 1.0) is secondary. Verify during implementation.
3. **Empty dir `.gitkeep`**: Both `app/alertas/` and `app/pac/` contain only `.gitkeep`. Deleting the dirs removes `.gitkeep` — they will be recreated when routes exist. Confirm this is acceptable.
