import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { procesos } from "@/lib/db/schema";
import {
  like,
  and,
  gte,
  lte,
  eq,
  or,
  desc,
  asc,
  count,
  type AnyColumn,
} from "drizzle-orm";

const SORTABLE_COLUMNS = {
  nombre: "nombre" as const,
  entidadNombre: "entidadNombre" as const,
  valor: "valor" as const,
  estado: "estado" as const,
  fechaPublicacion: "fechaPublicacion" as const,
  fechaCierre: "fechaCierre" as const,
  departamento: "departamento" as const,
};

type SortableColumn = (typeof SORTABLE_COLUMNS)[keyof typeof SORTABLE_COLUMNS];

function isSortableColumn(col: string): col is SortableColumn {
  return Object.values(SORTABLE_COLUMNS).includes(col as SortableColumn);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("search") || "";
  const estado = searchParams.get("estado") || "";
  const modalidad = searchParams.get("modalidad") || "";
  const departamento = searchParams.get("departamento") || "";
  const valorMin = searchParams.get("valorMin");
  const valorMax = searchParams.get("valorMax");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "20"))
  );
  const sortByRaw = searchParams.get("sortBy") || "fechaPublicacion";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
  const sortBy = isSortableColumn(sortByRaw) ? sortByRaw : "fechaPublicacion";

  try {
    const conditions: ReturnType<typeof eq>[] = [];

    if (q) {
      conditions.push(
        or(
          like(procesos.nombre, `%${q}%`),
          like(procesos.entidadNombre, `%${q}%`)
        ) as ReturnType<typeof eq>
      );
    }
    if (estado) conditions.push(eq(procesos.estado, estado));
    if (modalidad) conditions.push(eq(procesos.modalidad, modalidad));
    if (departamento) conditions.push(eq(procesos.departamento, departamento));
    if (valorMin) conditions.push(gte(procesos.valor, parseInt(valorMin)));
    if (valorMax) conditions.push(lte(procesos.valor, parseInt(valorMax)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * pageSize;

    const column = procesos[sortBy as keyof typeof procesos] as AnyColumn;
    const orderBy =
      sortOrder === "asc"
        ? asc(column)
        : desc(column);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(procesos)
        .where(where)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset)
        .all(),
      db.select({ value: count() }).from(procesos).where(where).get(),
    ]);

    const total = totalResult?.value ?? 0;

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Error fetching procesos:", error);
    return NextResponse.json(
      { error: "Error al obtener procesos" },
      { status: 500 }
    );
  }
}
