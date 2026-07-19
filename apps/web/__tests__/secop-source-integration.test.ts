import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  config: {
    CRON_SECRET: "test-cron-secret",
    SECOP_API_URL: "https://example.test/resource",
    SECOP_DATASET_ID: "dataset",
    SOCRATA_APP_TOKEN: undefined,
    SOCRATA_REQUEST_DELAY_MS: 200,
    SOCRATA_REQUEST_JITTER_PCT: 0.25,
    SOCRATA_MAX_RETRY_AFTER_SECONDS: 300,
    SOCRATA_SYNC_TYPE: "incremental",
  },
}));

vi.mock("@/lib/secop/client", () => ({ SocrataClient: class SocrataClient {} }));
vi.mock("@/lib/secop/sync", () => ({ runSync: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimitMiddleware: vi.fn(() => ({ allowed: true, resetAt: Date.now() })) }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

function chain(result: unknown, terminal: "all" | "get") {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["from", "where", "orderBy", "limit", "offset"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder[terminal] = vi.fn(async () => result);
  return builder;
}

describe("source resilience routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
  });

  it("rejects an unauthenticated sync cron request", async () => {
    const { POST } = await import("@/app/api/cron/sync/route");
    const response = await POST(new NextRequest("http://localhost/api/cron/sync", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("runs the authorized Socrata cron request", async () => {
    const { runSync } = await import("@/lib/secop/sync");
    vi.mocked(runSync).mockResolvedValue({ status: "done", nuevos: 1, actualizados: 0, errores: 0, metricas: {} } as never);
    const { POST } = await import("@/app/api/cron/sync/route");
    const response = await POST(new NextRequest("http://localhost/api/cron/sync?source=socrata", {
      method: "POST",
      headers: { Authorization: "Bearer test-cron-secret" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "done" });
  });

  it("adds stale warning metadata to list and detail reads", async () => {
    const { db } = await import("@/lib/db");
    const staleHealth = { status: "down", lastSuccessAt: new Date("2026-01-01T00:00:00Z") };
    vi.mocked(db.select)
      .mockReturnValueOnce(chain([{ id: "process-1" }], "all") as never)
      .mockReturnValueOnce(chain({ value: 1 }, "get") as never)
      .mockReturnValueOnce(chain(staleHealth, "get") as never);
    const { GET: list } = await import("@/app/api/procesos/route");
    const listResponse = await list(new NextRequest("http://localhost/api/procesos"));
    await expect(listResponse.json()).resolves.toMatchObject({
      ultima_sincronizacion: "2026-01-01T00:00:00.000Z",
      advertencia_datos_desactualizados: expect.stringContaining("desactualizados"),
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(chain({ id: "process-1" }, "get") as never)
      .mockReturnValueOnce(chain(staleHealth, "get") as never);
    const { GET: detail } = await import("@/app/api/procesos/[id]/route");
    const detailResponse = await detail(new NextRequest("http://localhost/api/procesos/process-1"), { params: { id: "process-1" } });
    await expect(detailResponse.json()).resolves.toMatchObject({
      ultima_sincronizacion: "2026-01-01T00:00:00.000Z",
      advertencia_datos_desactualizados: expect.stringContaining("desactualizados"),
    });
  });
});
