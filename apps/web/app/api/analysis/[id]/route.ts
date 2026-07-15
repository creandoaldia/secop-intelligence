import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { analysisJobs, analysisResults } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitMiddleware(`analysis-get:${session.user.id}`, { maxRequests: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const job = await db
      .select()
      .from(analysisJobs)
      .where(and(eq(analysisJobs.id, params.id), eq(analysisJobs.userId, session.user.id)))
      .get();

    if (!job) {
      return NextResponse.json({ error: "Analisis no encontrado" }, { status: 404 });
    }

    const result = await db
      .select()
      .from(analysisResults)
      .where(eq(analysisResults.jobId, job.id))
      .get();

    return NextResponse.json({ job, result: result ?? null });
  } catch (error) {
    console.error("Error fetching analysis:", error);
    return NextResponse.json(
      { error: "Error al obtener analisis" },
      { status: 500 }
    );
  }
}
