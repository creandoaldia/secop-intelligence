CREATE VIRTUAL TABLE IF NOT EXISTS `procesos_fts` USING fts5(
  nombre,
  entidad_nombre,
  content='procesos',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `procesos_ai` AFTER INSERT ON `procesos` BEGIN
  INSERT INTO `procesos_fts`(rowid, nombre, entidad_nombre)
  VALUES (new.id, new.nombre, new.entidad_nombre);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `procesos_au` AFTER UPDATE ON `procesos` BEGIN
  INSERT INTO `procesos_fts`(`procesos_fts`, rowid, nombre, entidad_nombre)
  VALUES ('delete', old.id, old.nombre, old.entidad_nombre);
  INSERT INTO `procesos_fts`(rowid, nombre, entidad_nombre)
  VALUES (new.id, new.nombre, new.entidad_nombre);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `procesos_ad` AFTER DELETE ON `procesos` BEGIN
  INSERT INTO `procesos_fts`(`procesos_fts`, rowid, nombre, entidad_nombre)
  VALUES ('delete', old.id, old.nombre, old.entidad_nombre);
END;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_procesos_estado` ON `procesos` (`estado`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_procesos_fecha` ON `procesos` (`fecha_publicacion` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_procesos_entidad` ON `procesos` (`entidad_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_procesos_valor` ON `procesos` (`valor`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_procesos_unspc` ON `procesos` (`categoria_unspc`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_procesos_ubicacion` ON `procesos` (`ubicacion`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pac_entidad` ON `pac_items` (`entidad_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pac_anno` ON `pac_items` (`anno`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_alertas_user` ON `alertas` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_analysis_user` ON `analysis_jobs` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sync_fecha` ON `sync_log` (`fecha_inicio`);
--> statement-breakpoint
INSERT INTO `procesos_fts`(rowid, nombre, entidad_nombre)
SELECT id, nombre, entidad_nombre FROM `procesos`
WHERE id IS NOT NULL;
