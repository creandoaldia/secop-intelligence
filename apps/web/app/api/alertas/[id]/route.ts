import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertas } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { validateCsrf, csrfErrorResponse } from "@/lib/security/csrf";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit/logger";

const updateAlertaSchema = z.object({
  nombre: z.string().min(1).optional(),
  palabrasClave: z.array(z.string()).optional(),
  entidadId: z.string().optional(),
  valorMin: z.number().optional(),
  valorMax: z.number().optional(),
  departamento: z.string().optional(),
  activa: z.boolean().optional(),
  frecuencia: z.enum(["inmediato", "diario", "semanal"]).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const alerta = await db
      .select()
      .from(alertas)
      .where(and(eq(alertas.id, parseInt(params.id)), eq(alertas.userId, session.user.id)))
      .get();

    if (!alerta) {
      return NextResponse.json(
        { error: "Alerta no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(alerta);
  } catch (error) {
    console.error("Error fetching alerta:", error);
    return NextResponse.json(
      { error: "Error al obtener alerta" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit + CSRF
  const rl = rateLimitMiddleware(`alertas-update:${session.user.id}`, { maxRequests: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }
  const csrf = validateCsrf(request);
  if (!csrf.valid) return csrfErrorResponse();

  try {
    const existing = await db
      .select()
      .from(alertas)
      .where(and(eq(alertas.id, parseInt(params.id)), eq(alertas.userId, session.user.id)))
      .get();

    if (!existing) {
      return NextResponse.json(
        { error: "Alerta no encontrada" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateAlertaSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.nombre !== undefined) updateData.nombre = parsed.data.nombre;
    if (parsed.data.palabrasClave !== undefined)
      updateData.palabrasClave = JSON.stringify(parsed.data.palabrasClave);
    if (parsed.data.entidadId !== undefined) updateData.entidadId = parsed.data.entidadId;
    if (parsed.data.valorMin !== undefined) updateData.valorMin = parsed.data.valorMin;
    if (parsed.data.valorMax !== undefined) updateData.valorMax = parsed.data.valorMax;
    if (parsed.data.departamento !== undefined) updateData.departamento = parsed.data.departamento;
    if (parsed.data.activa !== undefined) updateData.activa = parsed.data.activa;
    if (parsed.data.frecuencia !== undefined) updateData.frecuencia = parsed.data.frecuencia;

    // Defense-in-depth: include userId in WHERE
    await db
      .update(alertas)
      .set(updateData)
      .where(and(eq(alertas.id, parseInt(params.id)), eq(alertas.userId, session.user.id)))
      .run();

    await logAudit({
      action: "alerta.update",
      userId: session.user.id,
      entity: "alerta",
      entityId: params.id,
    });

    const updated = await db
      .select()
      .from(alertas)
      .where(eq(alertas.id, parseInt(params.id)))
      .get();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating alerta:", error);
    return NextResponse.json(
      { error: "Error al actualizar alerta" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit + CSRF
  const rl = rateLimitMiddleware(`alertas-delete:${session.user.id}`, { maxRequests: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }
  const csrf = validateCsrf(request);
  if (!csrf.valid) return csrfErrorResponse();

  try {
    const existing = await db
      .select()
      .from(alertas)
      .where(and(eq(alertas.id, parseInt(params.id)), eq(alertas.userId, session.user.id)))
      .get();

    if (!existing) {
      return NextResponse.json(
        { error: "Alerta no encontrada" },
        { status: 404 }
      );
    }

    await db
      .delete(alertas)
      .where(and(eq(alertas.id, parseInt(params.id)), eq(alertas.userId, session.user.id)))
      .run();

    await logAudit({
      action: "alerta.delete",
      userId: session.user.id,
      entity: "alerta",
      entityId: params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting alerta:", error);
    return NextResponse.json(
      { error: "Error al eliminar alerta" },
      { status: 500 }
    );
  }
}
