// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Drizzle ORM Schema
// SQLite + WAL mode + FTS5
// ─────────────────────────────────────────────────────────────

import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── USERS & AUTH ───────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // uuid
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "timestamp" }),
  image: text("image"),
  password: text("password"), // hashed, null if OAuth
  plan: text("plan", { enum: ["free", "basic", "pro", "premium"] })
    .default("free").notNull(),
  planExpiresAt: integer("plan_expires_at", { mode: "timestamp" }),
  pagesUsed: integer("pages_used").default(0).notNull(),
  pagesResetAt: integer("pages_reset_at", { mode: "timestamp" }),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  // ATENCION: Estas claves DEBEN cifrarse con crypto.createCipheriv
  // antes de almacenarse. El cifrado se implementa en el helper
  // lib/linkedin/encrypt.ts (pendiente de crear en Fase 2).
  linkedinApiKey: text("linkedin_api_key"),
  linkedinApiSecret: text("linkedin_api_secret"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`).notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
  sessionState: text("session_state"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp" }).notNull(),
});

export const verificationTokens = sqliteTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: integer("expires", { mode: "timestamp" }).notNull(),
});

// ─── SECOP DATA ─────────────────────────────────────────────

export const procesos = sqliteTable("procesos", {
  id: text("id").primaryKey(), // SECOP ID unico
  nombre: text("nombre").notNull(),
  entidadId: text("entidad_id").references(() => entidades.id),
  entidadNombre: text("entidad_nombre"),
  valor: integer("valor"), // en pesos COP
  moneda: text("moneda").default("COP"),
  estado: text("estado"), // publicado, adjudicado, terminado, etc
  modalidad: text("modalidad"), // licitacion publica, contratacion directa, etc
  fechaPublicacion: integer("fecha_publicacion", { mode: "timestamp" }),
  fechaCierre: integer("fecha_cierre", { mode: "timestamp" }),
  fechaAdjudicacion: integer("fecha_adjudicacion", { mode: "timestamp" }),
  categoriaUnspc: text("categoria_unspc"),
  ubicacion: text("ubicacion"),
  departamento: text("departamento"),
  urlSecop: text("url_secop"),
  urlPliego: text("url_pliego"), // PDF del pliego
  hashContenido: text("hash_contenido"), // SHA256 del contenido para diffing
  fuente: text("fuente", { enum: ["socrata", "ckan", "scraper"] }).default("socrata"),
  version: integer("version").default(1), // para detectar cambios (addendums)
  datosRaw: text("datos_raw"), // JSON completo de la fuente
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
});

// ─── ENTIDADES CONTRATANTES ─────────────────────────────────

export const entidades = sqliteTable("entidades", {
  id: text("id").primaryKey(), // NIT
  nombre: text("nombre").notNull(),
  sigla: text("sigla"),
  tipo: text("tipo", { enum: ["nacional", "departamental", "municipal", "otro"] }),
  departamento: text("departamento"),
  municipio: text("municipio"),
  urlLogo: text("url_logo"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
});

// ─── PLAN ANUAL DE ADQUISICIONES (PAC) ──────────────────────

export const pacItems = sqliteTable("pac_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entidadId: text("entidad_id").references(() => entidades.id),
  entidadNombre: text("entidad_nombre"),
  descripcion: text("descripcion").notNull(),
  valor: integer("valor"),
  categoriaUnspc: text("categoria_unspc"),
  mesEstimado: integer("mes_estimado"), // 1-12
  anno: integer("anno").default(2026),
  estado: text("estado", { enum: ["planeado", "publicado", "ejecutado", "cancelado"] }),
  urlFuente: text("url_fuente"),
  hashContenido: text("hash_contenido"), // para diffing de versiones
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
});

// ─── ALERTAS ────────────────────────────────────────────────

export const alertas = sqliteTable("alertas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  palabrasClave: text("palabras_clave"), // JSON array
  entidadId: text("entidad_id").references(() => entidades.id),
  valorMin: integer("valor_min"),
  valorMax: integer("valor_max"),
  departamento: text("departamento"),
  categoriaUnspc: text("categoria_unspc"),
  activa: integer("activa", { mode: "boolean" }).default(true),
  ultimaNotificacion: integer("ultima_notificacion", { mode: "timestamp" }),
  frecuencia: text("frecuencia", { enum: ["inmediato", "diario", "semanal"] })
    .default("diario"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
});

// ─── ANALISIS IA ────────────────────────────────────────────

export const analysisJobs = sqliteTable("analysis_jobs", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  procesoId: text("proceso_id").references(() => procesos.id),
  estado: text("estado", {
    enum: ["pending", "downloading", "ocr", "extracting", "verifying", "completed", "failed"]
  }).default("pending").notNull(),
  paginasTotal: integer("paginas_total").default(0),
  paginasProcesadas: integer("paginas_procesadas").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  error: text("error"),
});

export const analysisResults = sqliteTable("analysis_results", {
  id: text("id").primaryKey(), // uuid
  jobId: text("job_id").notNull().references(() => analysisJobs.id, { onDelete: "cascade" }),
  // Extraccion LLM #1
  requisitosHabilitantes: text("requisitos_habilitantes"), // JSON
  garantias: text("garantias"), // JSON
  cronograma: text("cronograma"), // JSON
  formaPago: text("forma_pago"), // JSON
  experienciaRequerida: text("experiencia_requerida"), // JSON
  riesgos: text("riesgos"), // JSON
  resumen: text("resumen"),
  // Verificacion LLM #2 (JD interno)
  verificacion: text("verificacion"), // JSON — diff de correcciones
  confianza: real("confianza"), // 0.0 - 1.0
  // Metadata
  modeloExtraccion: text("modelo_extraccion").default("gpt-4o-mini"),
  modeloVerificacion: text("modelo_verificacion").default("claude-haiku"),
  feedbackUsuario: text("feedback_usuario"), // "correcto" | "parcial" | "incorrecto"
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
});

// ─── SUSCRIPCIONES (MercadoPago) ────────────────────────────

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan", { enum: ["basic", "pro", "premium"] }).notNull(),
  mpSubscriptionId: text("mp_subscription_id"), // MercadoPago ID
  mpPreapprovalId: text("mp_preapproval_id"),
  status: text("status", {
    enum: ["active", "paused", "cancelled", "expired"]
  }).default("active").notNull(),
  currentPeriodStart: integer("current_period_start", { mode: "timestamp" }).notNull(),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }).notNull(),
  pagesAllocated: integer("pages_allocated").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
});

// ─── SENA PERFILES ──────────────────────────────────────────

export const senaProfiles = sqliteTable("sena_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id),
  nombre: text("nombre"),
  profesion: text("profesion"),
  habilidades: text("habilidades"), // JSON array
  experienciaAnos: integer("experiencia_anos"),
  ubicacion: text("ubicacion"),
  fuente: text("fuente", { enum: ["sena_api", "manual"] }).default("manual"),
  datosRaw: text("datos_raw"), // JSON de la fuente original
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
});

// ─── SYNC LOG ───────────────────────────────────────────────

export const syncLog = sqliteTable("sync_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fuente: text("fuente", { enum: ["socrata", "ckan", "scraper", "sena"] }).notNull(),
  fechaInicio: integer("fecha_inicio", { mode: "timestamp" }).notNull(),
  fechaFin: integer("fecha_fin", { mode: "timestamp" }),
  registrosNuevos: integer("registros_nuevos").default(0),
  registrosActualizados: integer("registros_actualizados").default(0),
  errores: integer("errores").default(0),
  metricas: text("metricas"), // JSON
  estado: text("estado", { enum: ["running", "done", "error", "rate_limited", "stalled"] }).default("running"),
  // Si estado="running" y fecha_inicio es >10 min sin fechaFin, tratarlo como "error" (stale detection)
});

// ─── FEEDBACK ───────────────────────────────────────────────

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id),
  score: integer("score"), // 1-5
  comentario: text("comentario"),
  pagina: text("pagina"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(strftime('%s','now'))`),
});

// ─── FTS5 VIRTUAL TABLES ────────────────────────────────────

// Indices recomendados (crear en migration aparte):
// CREATE INDEX idx_procesos_estado ON procesos(estado);
// CREATE INDEX idx_procesos_fecha ON procesos(fecha_publicacion DESC);
// CREATE INDEX idx_procesos_entidad ON procesos(entidad_id);
// CREATE INDEX idx_procesos_valor ON procesos(valor);
// CREATE INDEX idx_procesos_unspc ON procesos(categoria_unspc);
// CREATE INDEX idx_procesos_ubicacion ON procesos(ubicacion);
// CREATE INDEX idx_pac_entidad ON pac_items(entidad_id);
// CREATE INDEX idx_pac_anno ON pac_items(anno);
// CREATE INDEX idx_alertas_user ON alertas(user_id);
// CREATE INDEX idx_analysis_user ON analysis_jobs(user_id);
// CREATE INDEX idx_sync_fecha ON sync_log(fecha_inicio);
//
// FTS5:
// CREATE VIRTUAL TABLE procesos_fts USING fts5(
//   nombre, entidad_nombre, content='procesos', content_rowid='rowid'
// );
