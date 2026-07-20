-- Backfill: actualizar users.plan para suscripciones activas existentes
-- que nunca recibieron el upgrade por el bug del webhook
UPDATE users 
SET plan = (
  SELECT subscriptions.plan 
  FROM subscriptions 
  WHERE subscriptions.user_id = users.id 
    AND subscriptions.status = 'active'
),
    pages_used = 0,
    pages_reset_at = unixepoch(),
    plan_expires_at = unixepoch('now', '+30 days')
WHERE users.plan = 'free' 
  AND EXISTS (
    SELECT 1 FROM subscriptions 
    WHERE subscriptions.user_id = users.id 
      AND subscriptions.status = 'active'
  );
