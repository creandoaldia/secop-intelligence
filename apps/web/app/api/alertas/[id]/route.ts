import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertas } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

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

    const result = await db
      .update(alertas)
      .set(updateData)
      .where(eq(alertas.id, parseInt(params.id)))
      .returning()
      .get();

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating alerta:", error);
    return NextResponse.json(
      { error: "Error al actualizar alerta" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      .where(eq(alertas.id, parseInt(params.id)))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting alerta:", error);
    return NextResponse.json(
      { error: "Error al eliminar alerta" },
      { status: 500 }
    );
  }
}
