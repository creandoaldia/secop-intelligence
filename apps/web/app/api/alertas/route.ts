import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertas } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import { validateCsrf, csrfErrorResponse } from "@/lib/security/csrf";
import { logAudit } from "@/lib/audit/logger";

const createAlertaSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  palabrasClave: z.array(z.string()).optional(),
  entidadId: z.string().optional(),
  valorMin: z.number().optional(),
  valorMax: z.number().optional(),
  departamento: z.string().optional(),
  frecuencia: z.enum(["inmediato", "diario", "semanal"]).default("diario"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 30 requests/min per user for alertas
  const rl = rateLimitMiddleware(`alertas-list:${session.user.id}`, { maxRequests: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const data = await db
      .select()
      .from(alertas)
      .where(eq(alertas.userId, session.user.id))
      .all();

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error fetching alertas:", error);
    return NextResponse.json(
      { error: "Error al obtener alertas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 20 alertas created/hour per user
  const rl = rateLimitMiddleware(`alertas-create:${session.user.id}`, { maxRequests: 20, windowMs: 3600_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas alertas creadas. Intenta mas tarde." },
      { status: 429 }
    );
  }

  // CSRF check for mutating requests
  const csrf = validateCsrf(request);
  if (!csrf.valid) return csrfErrorResponse();

  try {
    const body = await request.json();
    const parsed = createAlertaSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await db
      .insert(alertas)
      .values({
        userId: session.user.id,
        nombre: parsed.data.nombre,
        palabrasClave: parsed.data.palabrasClave
          ? JSON.stringify(parsed.data.palabrasClave)
          : null,
        entidadId: parsed.data.entidadId || null,
        valorMin: parsed.data.valorMin || null,
        valorMax: parsed.data.valorMax || null,
        departamento: parsed.data.departamento || null,
        frecuencia: parsed.data.frecuencia,
        activa: true,
      })
      .returning()
      .get();

    // Audit log
    await logAudit({
      action: "alerta.create",
      userId: session.user.id,
      entity: "alerta",
      entityId: String(result.id),
      metadata: JSON.stringify({ nombre: parsed.data.nombre }),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating alerta:", error);
    return NextResponse.json(
      { error: "Error al crear alerta" },
      { status: 500 }
    );
  }
}
