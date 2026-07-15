// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Environment & Config Validation
// Zod schema — fallo rapido si falta algo critico
// ─────────────────────────────────────────────────────────────

import { z } from "zod";

const configSchema = z.object({
  // ─── Database ─────────────────────────────────────────────
  DB_PATH: z.string().optional(),

  // ─── SECOP Data Sources ───────────────────────────────────
  // NOTA: datos.gov.co es Socrata, NO CKAN.
  // Socrata SODA API: GET /resource/{dataset-id}.json
  // La URL de CKAN que sigue es una facade Socrata-compatible, no CKAN real.
  SECOP_API_URL: z.string().url().default(
    "https://www.datos.gov.co/resource"
  ),
  // Requerido en produccion. Descubrir en Fase 0.1.
  SECOP_DATASET_ID: z.string().min(1, "SECOP_DATASET_ID es requerido (ej: jbjy-vk9h)"),
  // Socrata facade (no es CKAN real, pero compatibiliza queries)
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
  // REQUERIDO en produccion. En desarrollo tiene default temporal.
  AUTH_SECRET: z.string().min(32),

  // ─── MercadoPago ──────────────────────────────────────────
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),

  // ─── LinkedIn ─────────────────────────────────────────────
  // ATENCION: Estas claves se almacenan en DB y DEBEN cifrarse
  // con crypto.createCipheriv antes de guardarse en linkedinApiKey/linkedinApiSecret.
  // Ver lib/db/schema.ts — las columnas estan marcadas "encrypted".
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
  const env = { ...process.env };

  // En desarrollo, aplicar defaults para AUTH_SECRET si no esta definido
  if (env.NODE_ENV !== "production" && !env.AUTH_SECRET) {
    env.AUTH_SECRET = "dev-secret-change-in-production-32chars";
  }

  const result = configSchema.safeParse(env);
  if (!result.success) {
    console.error("❌ Configuracion invalida:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    // SIEMPRE fallar, nunca silenciar errores de config
    if (env.NODE_ENV === "production") {
      process.exit(1);
    }
    throw new Error("Configuracion invalida. Corrige los errores antes de continuar.");
  }
  return result.data;
}

export const config = loadConfig();
