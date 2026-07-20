// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — MercadoPago Webhook Endpoint
// POST /api/webhooks/mercadopago
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { validateWebhookSignature, processWebhookEvent, isWebhookConfigured } from "@/lib/mercadopago/webhooks";

export async function POST(request: NextRequest) {
  // If not configured, return 501 to tell MP to stop retrying
  if (!isWebhookConfigured()) {
    return NextResponse.json(
      { error: "Webhook handler not configured" },
      { status: 501 }
    );
  }

  try {
    const rawBody = await request.text();

    // Parse JSON body FIRST
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const xSignature = request.headers.get("x-signature");

    // Verify signature if present — using SDK validator
    if (xSignature) {
      const xRequestId = request.headers.get("x-request-id") ?? "";
      const dataId = (event.data as { id?: string })?.id ?? "";
      const isValid = validateWebhookSignature(xSignature, xRequestId, dataId);
      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    } else {
      // In development, allow unsigned requests with a warning
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: "Missing X-Signature header" },
          { status: 401 }
        );
      }
      console.warn("[MP Webhook] No X-Signature header — dev mode, accepting");
    }

    const result = await processWebhookEvent(event);

    // Always return 200 to MP (they will retry on non-200)
    return NextResponse.json({
      received: true,
      handled: result.handled,
      action: result.action,
    });
  } catch (error) {
    console.error("[MP Webhook] Error processing event:", error);
    // Return 200 even on error to prevent MP from retrying endlessly
    // The raw event was already logged in processWebhookEvent
    return NextResponse.json({
      received: true,
      handled: false,
      error: "Internal processing error",
    });
  }
}

// Health check for MP to verify the endpoint exists
export async function GET() {
  return NextResponse.json({
    service: "mercadopago-webhook",
    configured: isWebhookConfigured(),
    environment: process.env.NODE_ENV ?? "development",
  });
}
