import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { procesos, sourceHealth } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const proceso = await db
      .select()
      .from(procesos)
      .where(eq(procesos.id, params.id))
      .get();

    if (!proceso) {
      return NextResponse.json(
        { error: "Proceso no encontrado" },
        { status: 404 }
      );
    }

    const health = await db
      .select()
      .from(sourceHealth)
      .where(eq(sourceHealth.source, "socrata"))
      .get();

    return NextResponse.json({
      ...proceso,
      ultima_sincronizacion: health?.lastSuccessAt ?? null,
      advertencia_datos_desactualizados: health?.status === "down"
        ? "La fuente Socrata no esta disponible; los datos mostrados pueden estar desactualizados."
        : null,
    });
  } catch (error) {
    console.error("Error fetching proceso:", error);
    return NextResponse.json(
      { error: "Error al obtener el proceso" },
      { status: 500 }
    );
  }
}
