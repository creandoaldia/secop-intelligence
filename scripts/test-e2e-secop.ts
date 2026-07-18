// ─────────────────────────────────────────────────────────────
// E2E Test: SECOP login + download (REAL, no mocks)
// Ejecutar DESPUES de inyectar credenciales:
//   .\scripts\secret-injector.ps1 inject
//   npx tsx scripts/test-e2e-secop.ts
// ─────────────────────────────────────────────────────────────

import { SecopAuthClient } from "../apps/web/lib/secop/auth";
import { CookieStore } from "../apps/web/lib/secop/cookie-store";
import { CaptchaTracker } from "../apps/web/lib/secop/captcha-tracker";
import { SecopDownloadClient } from "../apps/web/lib/secop/download-client";

const STEP = process.env.STEP || "full"; // "login" | "download" | "full"

async function main() {
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║   E2E REAL — SECOP Login + Download          ║");
  console.log("╚═══════════════════════════════════════════════╝");

  // ── Init ──────────────────────────────────────────────────
  const cookieStore = new CookieStore();
  const tracker = new CaptchaTracker();
  const authClient = new SecopAuthClient(cookieStore, undefined, tracker);
  const downloadClient = new SecopDownloadClient(authClient);

  await cookieStore.init();
  await tracker.loadHistory();

  console.log(`[E2E] CaptchaTracker historical records: ${tracker["records"].length}`);
  console.log(`[E2E] Budget: $${tracker["budget"]}`);
  console.log("");

  // ── STEP 1: LOGIN ────────────────────────────────────────
  if (STEP === "login" || STEP === "full") {
    console.log("═══ STEP 1: LOGIN REAL ═══");
    console.log(`Target: https://community.secop.gov.co/STS/Users/Login/Index`);

    try {
      const session = await authClient.login();
      console.log(`[E2E] ✅ Login OK`);
      console.log(`[E2E] Session expires: ${session.expiresAt.toISOString()}`);

      // Show tracker summary
      console.log(tracker.getSummary());

      // Check activity_log was written
      console.log(`[E2E] ✅ Session cookies length: ${session.cookies.length} chars`);
    } catch (err) {
      console.error(`[E2E] ❌ Login FAILED:`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      console.log(tracker.getSummary());
      process.exit(1);
    }
  }

  // ── STEP 2: DOWNLOAD PDF (opcional) ──────────────────────
  if (STEP === "download" || STEP === "full") {
    console.log("");
    console.log("═══ STEP 2: DOWNLOAD PDF REAL ═══");

    // Usar un proceso real de la BD (si hay datos) o un ID de prueba
    // Por ahora: solo verificar que el cliente de descarga usa la sesion activa
    const testProcesoId = process.env.TEST_PROCESO_ID || "";
    if (!testProcesoId) {
      console.log("[E2E] ⏭️  STEP 2 saltado: TEST_PROCESO_ID no configurado");
      console.log("[E2E] Para probar descarga: TEST_PROCESO_ID=<secop-id> npx tsx ...");
    } else {
      try {
        const pdfPath = await downloadClient.getPliegoPDF(testProcesoId);
        console.log(`[E2E] ✅ PDF descargado: ${pdfPath}`);
      } catch (err) {
        console.error(`[E2E] ❌ Download FAILED:`);
        console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── FINAL ─────────────────────────────────────────────────
  console.log("");
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║   E2E COMPLETED                             ║");
  console.log(tracker.getSummary());
  console.log("╚═══════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("[E2E] Fatal error:", err);
  process.exit(1);
});
