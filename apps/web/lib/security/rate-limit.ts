// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — In-Memory Rate Limiter
// Simple token bucket with TTL per key (IP, userId, etc.)
// ─────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  store.forEach((_entry, key) => {
    if (_entry.resetAt < now) store.delete(key);
  });
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig = { maxRequests: 100, windowMs: 60_000 }
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

export function rateLimitMiddleware(
  key: string,
  config: RateLimitConfig = { maxRequests: 100, windowMs: 60_000 }
): { allowed: boolean; remaining: number; resetAt: number } {
  return checkRateLimit(key, config);
}
