// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — NextAuth v5 Config
// Credentials provider + Drizzle adapter + SQLite sessions
// ─────────────────────────────────────────────────────────────

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { users, accounts, sessions, verificationTokens } from "./db/schema";
import { eq } from "drizzle-orm";
import { compare } from "bcryptjs";
import { SESSION_MAX_AGE_SECONDS, PLAN_PAGES } from "./constants";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: DrizzleAdapter(db as any, {
    usersTable: users as any,
    accountsTable: accounts as any,
    sessionsTable: sessions as any,
    verificationTokensTable: verificationTokens as any,
  }) as any,
  // NOTA: as any es necesario por conflicto entre versiones de @auth/core
  // (next-auth v5 beta usa distinta version que @auth/drizzle-adapter)
  session: {
    strategy: "database", // SQLite sessions, no JWTs
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contrasena", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email as string))
          .get();

        if (!user || !user.password) return null;

        const isValid = await compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          plan: user.plan,
          role: user.role,
          pagesUsed: user.pagesUsed,
          planExpiresAt: user.planExpiresAt,
        } as any;
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Attach plan and role to session
      if (session.user) {
        session.user.id = user.id;
        // Fetch latest plan info from DB
        const dbUser = await db
          .select({
            plan: users.plan,
            role: users.role,
            pagesUsed: users.pagesUsed,
            planExpiresAt: users.planExpiresAt,
          })
          .from(users)
          .where(eq(users.id, user.id))
          .get();
        if (dbUser) {
          session.user.plan = dbUser.plan;
          session.user.role = dbUser.role;
          session.user.pagesUsed = dbUser.pagesUsed;
          session.user.planExpiresAt = dbUser.planExpiresAt
            ? Math.floor(new Date(dbUser.planExpiresAt).getTime() / 1000)
            : undefined;
        }
      }
      return session;
    },
  },
});

// ─── AUTH HELPERS ───────────────────────────────────────────

// Check if user has access to a feature based on plan
export function canUseFeature(
  userPlan: string,
  feature: "analisis" | "linkedin" | "sena_ilimitado" | "exportar"
): boolean {
  const featureAccess: Record<string, string[]> = {
    analisis: ["basic", "pro", "premium"],
    linkedin: ["pro", "premium"],
    sena_ilimitado: ["pro", "premium"],
    exportar: ["basic", "pro", "premium"],
  };
  return featureAccess[feature]?.includes(userPlan) ?? false;
}

// Check if user has enough pages
export function hasPagesRemaining(
  pagesUsed: number,
  userPlan: string,
  pagesNeeded: number = 1
): boolean {
  const limit = PLAN_PAGES[userPlan] ?? 0;
  return (pagesUsed + pagesNeeded) <= limit;
}
