import { NextRequest, NextResponse } from "next/server";
import { auth, canUseFeature } from "@/lib/auth";
import { db } from "@/lib/db";
import { senaProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import { validateCsrf, csrfErrorResponse } from "@/lib/security/csrf";
import { logAudit } from "@/lib/audit/logger";

const createProfileSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  profesion: z.string().min(1, "La profesion es requerida"),
  habilidades: z.array(z.string()).min(1, "Al menos una habilidad"),
  experienciaAnos: z.number().int().min(0),
  ubicacion: z.string().min(1, "La ubicacion es requerida"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canUseFeature(session.user.plan ?? "free", "sena_ilimitado")) {
    return NextResponse.json({ error: "Plan no autorizado" }, { status: 403 });
  }

  const rl = rateLimitMiddleware(`sena-list:${session.user.id}`, { maxRequests: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const data = await db
      .select()
      .from(senaProfiles)
      .where(eq(senaProfiles.userId, session.user.id))
      .all();

    const parsed = data.map((p) => {
      let habilidades: string[] = [];
      try {
        habilidades = JSON.parse(p.habilidades ?? "[]") as string[];
      } catch {
        habilidades = [];
      }
      return { ...p, habilidades };
    });

    return NextResponse.json({ data: parsed });
  } catch (error) {
    console.error("Error fetching SENA profiles:", error);
    return NextResponse.json(
      { error: "Error al obtener perfiles SENA" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canUseFeature(session.user.plan ?? "free", "sena_ilimitado")) {
    return NextResponse.json({ error: "Plan no autorizado" }, { status: 403 });
  }

  const rl = rateLimitMiddleware(`sena-create:${session.user.id}`, { maxRequests: 20, windowMs: 3600_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados perfiles creados. Intenta mas tarde." },
      { status: 429 }
    );
  }

  const csrf = validateCsrf(request);
  if (!csrf.valid) return csrfErrorResponse();

  try {
    const body = await request.json();
    const parsed = createProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await db
      .insert(senaProfiles)
      .values({
        userId: session.user.id,
        nombre: parsed.data.nombre,
        profesion: parsed.data.profesion,
        habilidades: JSON.stringify(parsed.data.habilidades),
        experienciaAnos: parsed.data.experienciaAnos,
        ubicacion: parsed.data.ubicacion,
        fuente: "manual",
      })
      .returning()
      .get();

    await logAudit({
      action: "sena.create",
      userId: session.user.id,
      entity: "sena_profile",
      entityId: String(result.id),
      metadata: JSON.stringify({ nombre: parsed.data.nombre }),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating SENA profile:", error);
    return NextResponse.json(
      { error: "Error al crear perfil SENA" },
      { status: 500 }
    );
  }
}
