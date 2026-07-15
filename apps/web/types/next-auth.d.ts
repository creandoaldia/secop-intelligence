// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — NextAuth Type Augmentations
// ─────────────────────────────────────────────────────────────

import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      plan: string;
      role: string;
      pagesUsed: number;
      planExpiresAt?: number | null;
    } & DefaultSession["user"];
  }

  interface User {
    plan: string;
    role: string;
    pagesUsed: number;
    planExpiresAt?: number | null;
  }
}
