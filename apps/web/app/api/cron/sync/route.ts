import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { SocrataClient } from "@/lib/secop/client";
import { runSync } from "@/lib/secop/sync";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!config.CRON_SECRET || token !== config.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = new URL(request.url).searchParams.get("source") ?? "socrata";
  if (source !== "socrata") {
    return NextResponse.json({ error: "Unsupported source" }, { status: 400 });
  }

  const client = new SocrataClient({
    baseUrl: config.SECOP_API_URL,
    datasetId: config.SECOP_DATASET_ID,
    appToken: config.SOCRATA_APP_TOKEN,
    delayMs: config.SOCRATA_REQUEST_DELAY_MS,
    jitterPct: config.SOCRATA_REQUEST_JITTER_PCT,
    maxRetryAfterSeconds: config.SOCRATA_MAX_RETRY_AFTER_SECONDS,
  });
  const result = await runSync(client, {
    datasetId: config.SECOP_DATASET_ID,
    mode: config.SOCRATA_SYNC_TYPE,
  });

  return NextResponse.json(result);
}
