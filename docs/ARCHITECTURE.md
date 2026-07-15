# SECOP Intelligence Hub — Architecture Document

## Stack

- **Framework**: Next.js 14 App Router (TypeScript)
- **Database**: better-sqlite3 + Drizzle ORM (WAL mode)
- **UI**: Tailwind CSS + shadcn/ui + Lucide icons
- **Auth**: NextAuth v5 + database sessions (SQLite)
- **Charts**: Recharts
- **Scheduler**: node-cron (no n8n en Fase 1)
- **OCR**: Azure Document Intelligence
- **LLM**: GPT-4o-mini (extraction) + Claude Haiku (JD verification)
- **Payments**: MercadoPago (preapproval API)
- **Notifications**: Telegram Bot API + Resend (email)
- **Deploy**: Docker Compose (VPS)

## Data Sources

| Source | Type | Risk | Usage |
|--------|------|------|-------|
| Socrata (datos.gov.co) | API REST | Low | Primary — procesos + PAC |
| CKAN (datos.gov.co) | API REST | Low | Fallback if Socrata down |
| SECOP II PDFs | Direct download | Low | Per-user document analysis |
| SENA (Agencia Publica Empleo) | Web/API | Medium | Profile matching (to verify) |
| RUP (ruppro.colombiacompra) | Browser | HIGH — BLOCKED | NOT USED |
| Camara de Comercio | None | HIGH — BLOCKED | NOT USED |

## Business Model

See `docs/deploy-protocol/secop-intelligence.yaml` and Engram #3205.

## Pipeline — AI Document Analysis

```
User clicks "Analizar" on a SECOP process
  → wafle-scraper downloads PDF from url_pliego
  → Azure Document Intelligence (Read + Layout) extracts text
  → LLM #1 (GPT-4o-mini) extracts structured requirements
  → LLM #2 (Claude Haiku) verifies extraction (JD internal)
  → Merge results → store in analysis_results
  → User sees: summary, checklist, risks, recommendation
  → User can report: "Esto esta mal" → feedback loop
```

## Phases

- **Fase 0**: Data pipeline, source verification, schema, auth
- **Fase 1**: MVP — dashboard, search, PAC, Telegram alerts
- **Fase 2**: Monetization — AI analysis, MercadoPago, plans
- **Fase 3**: Intelligence — pricing history, export, public API

## Project Structure

```
apps/web/
├── app/
│   ├── layout.tsx + page.tsx (dashboard)
│   ├── procesos/[id]/ (detail)
│   ├── pac/ (annual plan)
│   ├── alertas/ (CRUD)
│   ├── perfil/ (settings + LinkedIn config)
│   ├── admin/sync/ (sync status + metrics)
│   ├── login/
│   └── api/ (auth, health, procesos, pac, alertas, secop)
├── components/
│   ├── ui/ (shadcn)
│   ├── layout/ (sidebar, header)
│   ├── dashboard/ (stats, charts)
│   ├── procesos/ (table, filters, detail, timeline)
│   ├── alertas/ (form, list)
│   ├── linkedin/ (connect button, profile match)
│   └── shared/ (loading, empty, error)
├── lib/
│   ├── db/ (schema, index, migrations)
│   ├── secop/ (client, types, sync)
│   ├── linkedin/ (client)
│   └── utils/ (formatters, constants)
├── hooks/ (use-procesos, use-alertas, use-linkedin)
└── types/ (shared types)
```

## Licensing

All SECOP data used under CC BY 4.0. See `docs/license-audit.md`.
