// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Health Check Endpoint
// GET /api/health — readiness probe
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { db, isDbConnected, getDbStats } from "@/lib/db";

export async function GET() {
  const dbOk = isDbConnected();

  if (!dbOk) {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }

  let dbStats;
  try {
    dbStats = getDbStats();
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        database: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    status: "healthy",
    version: 2,
    database: {
      connected: true,
      totalProcesos: dbStats.totalProcesos,
      totalUsuarios: dbStats.totalUsuarios,
      totalAnalisis: dbStats.totalAnalisis,
    },
    integrations: {
      mercadopago: !!process.env.MP_ACCESS_TOKEN,
      linkedin: !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
      azureOcr: !!(process.env.AZURE_OCR_ENDPOINT && process.env.AZURE_OCR_KEY),
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
    },
    uptime: process.uptime(),
    responseTimeMs: 0,
    timestamp: new Date().toISOString(),
  });
}
