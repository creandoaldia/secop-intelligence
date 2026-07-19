// ─────────────────────────────────────────────────────────────
// Tests: Analysis API Routes (T8)
// Validates POST /api/analysis/start and GET /api/analysis/[id]
// with mocked auth, DB, rate-limit, and CSRF
// ─────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisJob, AnalysisResult } from "./fixtures/analysis";
import {
  createCompletedJob,
  createCompletedResult,
  createMockJob,
  createMockResult,
  createPendingJob,
  resetTestIds,
} from "./fixtures/analysis";

// ─── Module-level mocks (hoisted) ───────────────────────────

// We mock auth to control session presence
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
  canUseFeature: vi.fn(),
  hasPagesRemaining: vi.fn(),
}));

// Mock CSRF to always pass by default
const mockValidateCsrf = vi.fn();
vi.mock("@/lib/security/csrf", () => ({
  validateCsrf: mockValidateCsrf,
  csrfErrorResponse: vi.fn(() =>
    new (require("next/server").NextResponse)(
      JSON.stringify({ error: "CSRF validation failed" }),
      { status: 403, headers: { "content-type": "application/json" } },
    )),
}));

// Rate-limit mock — allow by default
const mockRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  rateLimitMiddleware: mockRateLimit,
}));

// Logger mock
vi.mock("@/lib/audit/logger", () => ({
  logAudit: vi.fn(),
}));

// DB mock — we use a simple in-memory store
const jobStore = new Map<string, Record<string, unknown>>();
const resultStore = new Map<string, Record<string, unknown>>();

function makeChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.all = vi.fn(() => returnValue ?? []);
  chain.get = vi.fn(() => returnValue ?? undefined);
  chain.run = vi.fn(() => ({ changes: 1 }));
  chain.values = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  return chain;
}

const mockDb = {
  select: vi.fn(() => makeChain(undefined)),
  insert: vi.fn(() => makeChain(undefined)),
  update: vi.fn(() => makeChain(undefined)),
  run: vi.fn(() => ({ changes: 1 })),
};
vi.mock("@/lib/db", () => ({ db: mockDb }));

// Schema mocks (used for table references in the routes)
vi.mock("@/lib/db/schema", () => ({
  analysisJobs: {},
  analysisResults: {},
  users: {},
  procesos: {},
}));

// ─── Helpers ─────────────────────────────────────────────────

function makeNextRequest({
  method = "POST",
  url = "http://localhost:3000/api/analysis/start",
  body,
  headers = {},
}: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
}): NextRequest {
  const req = new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return req;
}

const SESSION_USER = {
  id: "test-user-id",
  email: "test@example.com",
  name: "Test User",
  plan: "pro" as const,
};

const STORE_DEFAULTS = {
  id: "unset",
  user_id: "test-user-id",
  proceso_id: "proceso-test",
  estado: "pending",
  paginas_total: 10,
  paginas_procesadas: 0,
  created_at: Math.floor(Date.now() / 1000),
  completed_at: null,
  error: null,
  metadata: null,
};

beforeEach(() => {
  resetTestIds();
  jobStore.clear();
  resultStore.clear();
  vi.clearAllMocks();

  // Default mock implementations
  mockAuth.mockResolvedValue({ user: SESSION_USER });
  mockRateLimit.mockReturnValue({ allowed: true, remaining: 50, resetAt: Date.now() + 60_000 });
  mockValidateCsrf.mockReturnValue({ valid: true });

  // DB mock chaining: by default get() returns undefined (no results)
  // Tests override this when needed
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────

describe("T8 — API routes", () => {
  describe("POST /api/analysis/start", () => {
    it("returns 201 with jobId on successful creation", async () => {
      // Arrange: mock canUseFeature + hasPagesRemaining to pass
      const { canUseFeature, hasPagesRemaining } = await import("@/lib/auth");
      vi.mocked(canUseFeature).mockReturnValue(true);
      vi.mocked(hasPagesRemaining).mockReturnValue(true);

      // Make DB's select chain return a user row for the pages check
      const userRow = { pagesUsed: 2, plan: "pro" };
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            get: vi.fn(() => userRow),
          })),
        })),
      }));
      // INSERT returns normally
      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          run: vi.fn(),
        })),
      }));
      // UPDATE for pagesUsed works
      mockDb.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            run: vi.fn(),
          })),
        })),
      }));

      const { POST } = await import("@/app/api/analysis/start/route");
      const request = makeNextRequest({
        body: { procesoId: "proceso-123", paginasEstimadas: 5 },
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json).toHaveProperty("jobId");
      expect(typeof json.jobId).toBe("string");
    });

    it("returns 400 for invalid request body", async () => {
      const { POST } = await import("@/app/api/analysis/start/route");
      const request = makeNextRequest({ body: {} }); // missing procesoId
      const response = await POST(request);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBeDefined();
      expect(json.details).toBeDefined();
    });

    it("returns 401 without session", async () => {
      mockAuth.mockResolvedValue(null);

      const { POST } = await import("@/app/api/analysis/start/route");
      const request = makeNextRequest({
        body: { procesoId: "proceso-123", paginasEstimadas: 1 },
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 403 when user's plan lacks access", async () => {
      const { canUseFeature } = await import("@/lib/auth");
      vi.mocked(canUseFeature).mockReturnValue(false); // feature not available

      const { POST } = await import("@/app/api/analysis/start/route");
      const request = makeNextRequest({
        body: { procesoId: "proceso-123", paginasEstimadas: 1 },
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain("plan");
    });

    it("returns 403 when pages limit is exhausted", async () => {
      const { canUseFeature, hasPagesRemaining } = await import("@/lib/auth");
      vi.mocked(canUseFeature).mockReturnValue(true);
      vi.mocked(hasPagesRemaining).mockReturnValue(false); // no pages left

      // Mock user select
      const userRow = { pagesUsed: 10, plan: "basic" };
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            get: vi.fn(() => userRow),
          })),
        })),
      }));

      const { POST } = await import("@/app/api/analysis/start/route");
      const request = makeNextRequest({
        body: { procesoId: "proceso-123", paginasEstimadas: 1 },
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain("limite");
    });

    it("returns 429 when rate limited", async () => {
      mockRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

      const { POST } = await import("@/app/api/analysis/start/route");
      const request = makeNextRequest({
        body: { procesoId: "proceso-123", paginasEstimadas: 1 },
      });
      const response = await POST(request);

      expect(response.status).toBe(429);
      const json = await response.json();
      expect(json.error).toBeDefined();
    });
  });

  describe("GET /api/analysis/[id]", () => {
    it("returns 200 with job and result for authenticated user", async () => {
      // Mock the query job + result
      const mockJobRow = createPendingJob({ userId: "test-user-id" });
      const mockResultRow = createMockResult({ jobId: mockJobRow.id });

      // Mock DB select chain: first get() returns job, second get() returns result
      let callCount = 0;
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            get: vi.fn(() => {
              callCount++;
              if (callCount === 1) return mockJobRow;
              return mockResultRow;
            }),
          })),
        })),
      }));

      const { GET } = await import("@/app/api/analysis/[id]/route");
      const request = makeNextRequest({
        method: "GET",
        url: "http://localhost:3000/api/analysis/test-job-id",
      });
      const response = await GET(request, { params: { id: "test-job-id" } });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveProperty("job");
      expect(json).toHaveProperty("result");
      expect(json.job.estado).toBe("pending");
      expect(json.result.requisitosHabilitantes).toBeDefined();
    });

    it("returns 200 with job and null result when no result exists", async () => {
      let getCalls = 0;
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            get: vi.fn(() => {
              getCalls++;
              if (getCalls === 1) return createPendingJob({ userId: "test-user-id" });
              return undefined; // second call: no result
            }),
          })),
        })),
      }));

      const { GET } = await import("@/app/api/analysis/[id]/route");
      const request = makeNextRequest({
        method: "GET",
        url: "http://localhost:3000/api/analysis/test-job-id",
      });
      const response = await GET(request, { params: { id: "test-job-id" } });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.job).toBeDefined();
      expect(json.result).toBeNull();
    });

    it("returns 401 without session", async () => {
      mockAuth.mockResolvedValue(null);

      const { GET } = await import("@/app/api/analysis/[id]/route");
      const request = makeNextRequest({
        method: "GET",
        url: "http://localhost:3000/api/analysis/test-job-id",
      });
      const response = await GET(request, { params: { id: "test-job-id" } });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 404 for non-existent job", async () => {
      // get() returns undefined (no matching job)
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            get: vi.fn(() => undefined),
          })),
        })),
      }));

      const { GET } = await import("@/app/api/analysis/[id]/route");
      const request = makeNextRequest({
        method: "GET",
        url: "http://localhost:3000/api/analysis/non-existent",
      });
      const response = await GET(request, { params: { id: "non-existent" } });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBeDefined();
    });

    it("returns 404 when job belongs to another user (ownership check)", async () => {
      // Simulate a job existing in DB but owned by a different user
      // The route filters by AND(id, userId), so get() returns undefined
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            get: vi.fn(() => undefined),
          })),
        })),
      }));

      const { GET } = await import("@/app/api/analysis/[id]/route");
      const request = makeNextRequest({
        method: "GET",
        url: "http://localhost:3000/api/analysis/other-user-job",
      });
      const response = await GET(request, { params: { id: "other-user-job" } });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBeDefined();
    });

    it("returns 429 when rate limited", async () => {
      mockRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

      const { GET } = await import("@/app/api/analysis/[id]/route");
      const request = makeNextRequest({
        method: "GET",
        url: "http://localhost:3000/api/analysis/test-job-id",
      });
      const response = await GET(request, { params: { id: "test-job-id" } });

      expect(response.status).toBe(429);
      const json = await response.json();
      expect(json.error).toBeDefined();
    });
  });
});
