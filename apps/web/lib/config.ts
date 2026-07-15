// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Environment & Config Validation
// Zod schema — fallo rapido si falta algo critico
// ─────────────────────────────────────────────────────────────

import { z } from "zod";

const configSchema = z.object({
  // ─── Database ─────────────────────────────────────────────
  DB_PATH: z.string().optional(),

  // ─── SECOP Data Sources ───────────────────────────────────
  SECOP_API_URL: z.string().url().default(
    "https://www.datos.gov.co/resource"
  ),
  SECOP_DATASET_ID: z.string().min(1).default(""),
  CKAN_API_URL: z.string().url().default(
    "https://www.datos.gov.co/api/3/action"
  ),
  SOCRATA_APP_TOKEN: z.string().optional(),

  // ─── Azure OCR ────────────────────────────────────────────
  AZURE_OCR_ENDPOINT: z.string().url().optional(),
  AZURE_OCR_KEY: z.string().optional(),

  // ─── OpenAI ───────────────────────────────────────────────
  OPENAI_API_KEY: z.string().optional(),

  // ─── Anthropic (para JD verification) ─────────────────────
  ANTHROPIC_API_KEY: z.string().optional(),

  // ─── Auth ─────────────────────────────────────────────────
  AUTH_SECRET: z.string().min(32).default(
    "dev-secret-change-in-production-32chars"
  ),

  // ─── MercadoPago ──────────────────────────────────────────
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),

  // ─── LinkedIn ─────────────────────────────────────────────
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),

  // ─── Notifications ────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // ─── Scheduler ────────────────────────────────────────────
  SYNC_INTERVAL_HOURS: z.coerce.number().default(6),

  // ─── App ──────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Configuracion invalida:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    // En produccion, fallar rapido
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    // En dev, devolver valores por defecto
    return configSchema.parse({});
  }
  return result.data;
}

export const config = loadConfig();
