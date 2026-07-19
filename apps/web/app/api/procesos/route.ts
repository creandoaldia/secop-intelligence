import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { procesos, sourceHealth } from "@/lib/db/schema";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import {
  and,
  gte,
  lte,
  eq,
  or,
  desc,
  asc,
  count,
  sql,
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

function sanitizeFts5(query: string): string {
  let s = query.replace(/\b(AND|OR|NOT|NEAR)\b/gi, ' ');
  s = s.replace(/[*()"'+\-~^]/g, ' ');
  s = s.replace(/'/g, "''");
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map(w => `"${w}"`).join(' ');
}

function sanitizeLike(query: string): string {
  return query.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 100 requests/min per user
  const rl = rateLimitMiddleware(`procesos:${session.user.id}`);
  if (!rl.allowed) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Demasiadas solicitudes", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

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
    const conditions: any[] = [];
    let useFts = false;

    if (q) {
      const ftsQuery = sanitizeFts5(q);
      if (ftsQuery) {
        conditions.push(
          sql`EXISTS (SELECT 1 FROM procesos_fts WHERE procesos_fts MATCH ${ftsQuery} AND procesos_fts.rowid = ${procesos.id})`
        );
        useFts = true;
      } else {
        const likeQ = sanitizeLike(q);
        conditions.push(
          or(
            sql`${procesos.nombre} LIKE '%' || ${likeQ} || '%' ESCAPE '\\'`,
            sql`${procesos.entidadNombre} LIKE '%' || ${likeQ} || '%' ESCAPE '\\'`
          ) as any
        );
      }
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

    let data: any[];
    let total: number;
    let health: any;

    try {
      const result = await Promise.all([
        db
          .select()
          .from(procesos)
          .where(where)
          .orderBy(orderBy)
          .limit(pageSize)
          .offset(offset)
          .all(),
        db.select({ value: count() }).from(procesos).where(where).get(),
        db.select().from(sourceHealth).where(eq(sourceHealth.source, "socrata")).get(),
      ]);
      data = result[0] as any[];
      total = (result[1] as any)?.value ?? 0;
      health = result[2];
    } catch (queryErr) {
      if (!useFts) throw queryErr;

      const likeQ = sanitizeLike(q);
      const fbConditions: any[] = [
        or(
          sql`${procesos.nombre} LIKE '%' || ${likeQ} || '%' ESCAPE '\\'`,
          sql`${procesos.entidadNombre} LIKE '%' || ${likeQ} || '%' ESCAPE '\\'`
        ) as any,
      ];
      if (estado) fbConditions.push(eq(procesos.estado, estado));
      if (modalidad) fbConditions.push(eq(procesos.modalidad, modalidad));
      if (departamento) fbConditions.push(eq(procesos.departamento, departamento));
      if (valorMin) fbConditions.push(gte(procesos.valor, parseInt(valorMin)));
      if (valorMax) fbConditions.push(lte(procesos.valor, parseInt(valorMax)));
      const fbWhere = and(...fbConditions);

      const result = await Promise.all([
        db
          .select()
          .from(procesos)
          .where(fbWhere)
          .orderBy(orderBy)
          .limit(pageSize)
          .offset(offset)
          .all(),
        db.select({ value: count() }).from(procesos).where(fbWhere).get(),
        db.select().from(sourceHealth).where(eq(sourceHealth.source, "socrata")).get(),
      ]);
      data = result[0] as any[];
      total = (result[1] as any)?.value ?? 0;
      health = result[2];
    }

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      ultima_sincronizacion: health?.lastSuccessAt ?? null,
      advertencia_datos_desactualizados: health?.status === "down"
        ? "La fuente Socrata no esta disponible; los datos mostrados pueden estar desactualizados."
        : null,
    });
  } catch (error) {
    console.error("Error fetching procesos:", error);
    return NextResponse.json(
      { error: "Error al obtener procesos" },
      { status: 500 }
    );
  }
}
