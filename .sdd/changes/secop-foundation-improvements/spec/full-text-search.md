# Full-Text Search Specification

## Purpose

Replace slow LIKE-based search on procesos with FTS5-powered ranked full-text search.

## Requirements

### Requirement: FTS5 Virtual Table
MUST create `procesos_fts` virtual table indexing `nombre` and `entidad_nombre` columns, referencing `procesos` by rowid.

| Column | Source |
|--------|--------|
| nombre | procesos.nombre |
| entidad_nombre | procesos.entidad_nombre |

#### Scenario: Basic FTS5 table creation
- GIVEN a `procesos` table exists
- WHEN the migration runs
- THEN a `procesos_fts` virtual table is created with content=`procesos`

#### Scenario: FTS5 with custom tokenizer
- GIVEN the migration
- THEN the FTS5 table uses `porter` stemmer and `unicode61` tokenizer for Spanish-friendly search

### Requirement: Content Sync Triggers
MUST create AFTER INSERT/UPDATE/DELETE triggers to keep `procesos_fts` in sync.

#### Scenario: Sync on INSERT
- GIVEN a new row is inserted into `procesos`
- WHEN the AFTER INSERT trigger fires
- THEN the corresponding row is inserted into `procesos_fts`

#### Scenario: Sync on DELETE
- GIVEN a row is deleted from `procesos`
- WHEN the AFTER DELETE trigger fires
- THEN the corresponding row is deleted from `procesos_fts`

### Requirement: DB Indices
MUST create 9 indices on `procesos` for query performance.

#### Scenario: All indices created
- GIVEN the migration
- THEN 9 indices exist for columns: `estado`, `entidad_nit`, `fecha_publicacion`, `fecha_carga`, `slug`, `departamento`, `municipio`, `valor`, `modalidad`

### Requirement: Search API
MUST replace LIKE with FTS5 MATCH in `GET /api/procesos`.

#### Scenario: Search returns ranked results
- GIVEN the user queries `?search=licitacion`
- WHEN `GET /api/procesos` is called
- THEN results are ordered by `bm25(procesos_fts)` descending

#### Scenario: Empty search returns all
- GIVEN `?search=` is empty or missing
- WHEN `GET /api/procesos` is called
- THEN the query falls back to unsearched (no MATCH clause)

### Requirement: Input Sanitization
MUST sanitize user search input to prevent FTS5 syntax errors.

#### Scenario: Special chars sanitized
- GIVEN search input contains `*` or `"` or `()`
- WHEN the sanitize function runs
- THEN special chars are escaped or removed before passing to MATCH

#### Scenario: Multi-word search
- GIVEN search input is `"contrato obra"`
- WHEN sanitized
- THEN each word is quoted individually, avoiding FTS5 operator interpretation

### Requirement: FTS5 Fallback
SHOULD fall back to LIKE search if FTS5 is unavailable.

#### Scenario: FTS5 table missing
- GIVEN `procesos_fts` does not exist
- WHEN a search request arrives
- THEN the handler catches the error and runs LIKE-based search instead
- THEN the response includes a header `X-Search-Fallback: like`
