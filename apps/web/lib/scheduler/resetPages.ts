// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Monthly Pages Reset Scheduler
// Resets pagesUsed for expired subscriptions in a transaction.
// Called externally via GET /api/cron/reset-pages
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { users, subscriptions } from "@/lib/db/schema";
import { eq, lt, and } from "drizzle-orm";

export interface ResetResult {
  reset: number;
  message: string;
  error?: string;
}

export async function resetPages(): Promise<ResetResult> {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Find expired active subscriptions
    const expired = await db
      .select({ id: subscriptions.id, userId: subscriptions.userId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, "active"),
          lt(subscriptions.currentPeriodEnd, new Date(now * 1000))
        )
      )
      .all();

    if (expired.length === 0) {
      return { reset: 0, message: "ok" };
    }

    // Transaction: reset pages + mark expired
    await db.transaction(async (tx) => {
      for (const sub of expired) {
        await tx
          .update(users)
          .set({ pagesUsed: 0, pagesResetAt: new Date(now * 1000) })
          .where(eq(users.id, sub.userId))
          .run();

        await tx
          .update(subscriptions)
          .set({ status: "expired" })
          .where(eq(subscriptions.id, sub.id))
          .run();
      }
    });

    return { reset: expired.length, message: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { reset: 0, message: "error", error: message };
  }
}
