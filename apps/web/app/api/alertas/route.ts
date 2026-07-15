import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertas } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

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

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating alerta:", error);
    return NextResponse.json(
      { error: "Error al crear alerta" },
      { status: 500 }
    );
  }
}
