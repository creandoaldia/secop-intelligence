import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const rl = rateLimitMiddleware(`register:${ip}`, { maxRequests: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta en una hora." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de solicitud invalido" },
      { status: 400 }
    );
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError =
      fieldErrors.email?.[0] ||
      fieldErrors.password?.[0] ||
      fieldErrors.name?.[0] ||
      "Datos invalidos";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { email, password, name } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (existing) {
    return NextResponse.json(
      { error: "Error al registrarse. Intenta de nuevo." },
      { status: 400 }
    );
  }

  const hashedPassword = await hash(password, 12);

  const user = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      name,
      email,
      password: hashedPassword,
      plan: "free",
      role: "user",
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .get();

  if (!user) {
    return NextResponse.json(
      { error: "Error al crear el usuario" },
      { status: 500 }
    );
  }

  return NextResponse.json(user, { status: 201 });
}
