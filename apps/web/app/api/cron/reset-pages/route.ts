// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Cron Trigger: Reset Pages
// GET /api/cron/reset-pages
// Secured via Authorization: Bearer <CRON_SECRET>
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { resetPages } from "@/lib/scheduler/resetPages";

export async function GET(request: NextRequest) {
  // Validate CRON_SECRET if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (token !== cronSecret) {
      return NextResponse.json(
        { reset: 0, message: "unauthorized" },
        { status: 401 }
      );
    }
  }

  const result = await resetPages();
  return NextResponse.json(result);
}
