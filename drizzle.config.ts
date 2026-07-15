// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Drizzle Kit Configuration
// ─────────────────────────────────────────────────────────────

import type { Config } from "drizzle-kit";

export default {
  schema: "./apps/web/lib/db/schema.ts",
  out: "./apps/web/lib/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH || "./data/secop.db",
  },
  verbose: true,
  strict: true,
} satisfies Config;
