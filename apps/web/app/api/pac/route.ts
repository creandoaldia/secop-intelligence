import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pacItems } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const anno = parseInt(searchParams.get("anno") || String(new Date().getFullYear()));
  const entidadId = searchParams.get("entidadId") || "";

  try {
    const conditions = [eq(pacItems.anno, anno)];
    if (entidadId) conditions.push(eq(pacItems.entidadId, entidadId));

    const where = and(...conditions);

    const [data, totalResult] = await Promise.all([
      db.select().from(pacItems).where(where).all(),
      db.select({ value: count() }).from(pacItems).where(where).get(),
    ]);

    return NextResponse.json({
      data,
      total: totalResult?.value ?? 0,
      anno,
    });
  } catch (error) {
    console.error("Error fetching PAC items:", error);
    return NextResponse.json(
      { error: "Error al obtener items del PAC" },
      { status: 500 }
    );
  }
}
