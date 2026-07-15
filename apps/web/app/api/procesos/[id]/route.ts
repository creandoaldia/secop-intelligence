import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { procesos } from "@/lib/db/schema";
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

    return NextResponse.json(proceso);
  } catch (error) {
    console.error("Error fetching proceso:", error);
    return NextResponse.json(
      { error: "Error al obtener el proceso" },
      { status: 500 }
    );
  }
}
