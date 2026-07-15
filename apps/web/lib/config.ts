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

  // ─── Socrata Sync — Anti-Blocking ─────────────────────────
  // Delay minimo entre requests en ms. <50ms puede causar bloqueo de IP.
  SOCRATA_REQUEST_DELAY_MS: z.coerce.number().min(50).default(200),
  // Jitter aleatorio como fraccion del delay (0 = fijo, 0.5 = +/-50%)
  SOCRATA_REQUEST_JITTER_PCT: z.coerce.number().min(0).max(0.5).default(0.25),
  // Maximo Retry-After en segundos que aceptamos antes de abortar
  SOCRATA_MAX_RETRY_AFTER_SECONDS: z.coerce.number().positive().default(300),
  // Tipo de sync por defecto: full (todo) o incremental (solo cambios)
  SOCRATA_SYNC_TYPE: z.enum(["full", "incremental"]).default("incremental"),

  // ─── Azure OCR ────────────────────────────────────────────
  AZURE_OCR_ENDPOINT: z.string().url().optional(),
  AZURE_OCR_KEY: z.string().optional(),

  // ─── OpenAI ───────────────────────────────────────────────
  OPENAI_API_KEY: z.string().optional(),

  // ─── Anthropic (para JD verification) ─────────────────────
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_VERIFIER_MODEL: z.string().default("claude-3-haiku-20240307"),

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
  // Token para autenticar llamadas a /api/cron/* (via Authorization: Bearer)
  CRON_SECRET: z.string().optional(),

  // ─── App ──────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  // URL publica de la app (para callbacks OAuth y webhooks)
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
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
