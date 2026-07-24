CREATE TABLE `proceso_pricing_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proceso_id` text NOT NULL,
	`valor` integer NOT NULL,
	`observed_at` integer NOT NULL,
	`source` text,
	`sync_log_id` integer,
	FOREIGN KEY (`proceso_id`) REFERENCES `procesos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sync_log_id`) REFERENCES `sync_log`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pph_proceso_observed` ON `proceso_pricing_history` (`proceso_id`, `observed_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pph_observed` ON `proceso_pricing_history` (`observed_at`);
