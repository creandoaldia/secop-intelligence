CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`user_id` text,
	`entity` text NOT NULL,
	`entity_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (strftime('%s','now'))
);
--> statement-breakpoint
CREATE TABLE `alertas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`nombre` text NOT NULL,
	`palabras_clave` text,
	`entidad_id` text,
	`valor_min` integer,
	`valor_max` integer,
	`departamento` text,
	`categoria_unspc` text,
	`activa` integer DEFAULT true,
	`ultima_notificacion` integer,
	`frecuencia` text DEFAULT 'diario',
	`created_at` integer DEFAULT (strftime('%s','now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entidad_id`) REFERENCES `entidades`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `analysis_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`proceso_id` text,
	`estado` text DEFAULT 'pending' NOT NULL,
	`paginas_total` integer DEFAULT 0,
	`paginas_procesadas` integer DEFAULT 0,
	`created_at` integer DEFAULT (strftime('%s','now')),
	`completed_at` integer,
	`error` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proceso_id`) REFERENCES `procesos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `analysis_results` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`requisitos_habilitantes` text,
	`garantias` text,
	`cronograma` text,
	`forma_pago` text,
	`experiencia_requerida` text,
	`riesgos` text,
	`resumen` text,
	`verificacion` text,
	`confianza` real,
	`modelo_extraccion` text DEFAULT 'gpt-4o-mini',
	`modelo_verificacion` text DEFAULT 'claude-haiku',
	`feedback_usuario` text,
	`created_at` integer DEFAULT (strftime('%s','now')),
	FOREIGN KEY (`job_id`) REFERENCES `analysis_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entidades` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`sigla` text,
	`tipo` text,
	`departamento` text,
	`municipio` text,
	`url_logo` text,
	`created_at` integer DEFAULT (strftime('%s','now'))
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`score` integer,
	`comentario` text,
	`pagina` text,
	`created_at` integer DEFAULT (strftime('%s','now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `linkedin_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`analysis_job_id` text,
	`post_urn` text,
	`content` text,
	`status` text DEFAULT 'draft',
	`created_at` integer DEFAULT (strftime('%s','now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_job_id`) REFERENCES `analysis_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mp_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`data` text,
	`processed_at` integer,
	`created_at` integer DEFAULT (strftime('%s','now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mp_webhook_events_event_id_unique` ON `mp_webhook_events` (`event_id`);--> statement-breakpoint
CREATE TABLE `pac_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entidad_id` text,
	`entidad_nombre` text,
	`descripcion` text NOT NULL,
	`valor` integer,
	`categoria_unspc` text,
	`mes_estimado` integer,
	`anno` integer DEFAULT 2026,
	`estado` text,
	`url_fuente` text,
	`hash_contenido` text,
	`created_at` integer DEFAULT (strftime('%s','now')),
	`updated_at` integer DEFAULT (strftime('%s','now')),
	FOREIGN KEY (`entidad_id`) REFERENCES `entidades`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `procesos` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`entidad_id` text,
	`entidad_nombre` text,
	`valor` integer,
	`moneda` text DEFAULT 'COP',
	`estado` text,
	`modalidad` text,
	`fecha_publicacion` integer,
	`fecha_cierre` integer,
	`fecha_adjudicacion` integer,
	`categoria_unspc` text,
	`ubicacion` text,
	`departamento` text,
	`url_secop` text,
	`url_pliego` text,
	`hash_contenido` text,
	`fuente` text DEFAULT 'socrata',
	`version` integer DEFAULT 1,
	`datos_raw` text,
	`created_at` integer DEFAULT (strftime('%s','now')),
	`updated_at` integer DEFAULT (strftime('%s','now')),
	FOREIGN KEY (`entidad_id`) REFERENCES `entidades`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sena_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`nombre` text,
	`profesion` text,
	`habilidades` text,
	`experiencia_anos` integer,
	`ubicacion` text,
	`fuente` text DEFAULT 'manual',
	`datos_raw` text,
	`created_at` integer DEFAULT (strftime('%s','now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_token` text NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_token_unique` ON `sessions` (`session_token`);--> statement-breakpoint
CREATE TABLE `source_health` (
	`source` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'healthy' NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`consecutive_successes` integer DEFAULT 0 NOT NULL,
	`breaker_trip_count` integer DEFAULT 0 NOT NULL,
	`cooldown_until` integer,
	`watermark_date` text,
	`watermark_id` text,
	`last_success_at` integer,
	`last_failure_at` integer,
	`last_error_message` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_procesos_fecha_publicacion` ON `procesos` (`fecha_publicacion`);
--> statement-breakpoint
INSERT OR IGNORE INTO `source_health` (`source`, `status`, `consecutive_failures`, `consecutive_successes`, `breaker_trip_count`, `created_at`, `updated_at`)
VALUES ('socrata', 'healthy', 0, 0, 0, strftime('%s','now'), strftime('%s','now'));
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan` text NOT NULL,
	`mp_subscription_id` text,
	`mp_preapproval_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`current_period_start` integer NOT NULL,
	`current_period_end` integer NOT NULL,
	`pages_allocated` integer NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fuente` text NOT NULL,
	`fecha_inicio` integer NOT NULL,
	`fecha_fin` integer,
	`registros_nuevos` integer DEFAULT 0,
	`registros_actualizados` integer DEFAULT 0,
	`errores` integer DEFAULT 0,
	`metricas` text,
	`estado` text DEFAULT 'running'
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer,
	`image` text,
	`password` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`plan_expires_at` integer,
	`pages_used` integer DEFAULT 0 NOT NULL,
	`pages_reset_at` integer,
	`role` text DEFAULT 'user' NOT NULL,
	`linkedin_api_key` text,
	`linkedin_api_secret` text,
	`linkedin_access_token` text,
	`linkedin_token_expires_at` integer,
	`linkedin_profile_id` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL
);
