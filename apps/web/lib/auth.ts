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
    strategy: "jwt", // Credentials provider requiere JWT strategy
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
    async jwt({ token, user }) {
      // Persist user data to token on sign-in
      if (user) {
        token.id = user.id;
        token.plan = (user as any).plan;
        token.role = (user as any).role;
        token.pagesUsed = (user as any).pagesUsed;
        token.planExpiresAt = (user as any).planExpiresAt;
      }
      // Re-read plan from DB on token refresh so webhook upgrades/downgrades
      // are reflected before JWT expiry (30d default)
      if (!user && token.sub) {
        const dbUser = await db.select().from(users).where(eq(users.id, token.sub)).get();
        if (dbUser) token.plan = dbUser.plan;
      }
      return token;
    },
    async session({ session, token }) {
      // Attach plan and role to session from JWT token
      if (session.user) {
        session.user.id = token.id as string;
        session.user.plan = token.plan as string;
        session.user.role = token.role as string;
        session.user.pagesUsed = token.pagesUsed as number;
        session.user.planExpiresAt = token.planExpiresAt as number | undefined;
      }
      return session;
    },
  },
});

// ─── AUTH HELPERS ───────────────────────────────────────────
// Re-exported from features.ts as single source of truth
export { canUseFeature, hasPagesRemaining } from './features'
