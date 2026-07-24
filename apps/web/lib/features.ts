// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Feature Access (client-safe)
// Pure helpers for plan-based feature gating
// Can be imported by both server and client components
// ─────────────────────────────────────────────────────────────

import { PLAN_PAGES } from "./constants";

export function canUseFeature(
  userPlan: string,
  feature: "analisis" | "linkedin" | "sena_ilimitado" | "exportar" | "alertas" | "pricing_history"
): boolean {
  const featureAccess: Record<string, string[]> = {
    analisis: ["basic", "pro", "premium"],
    linkedin: ["pro", "premium"],
    sena_ilimitado: ["pro", "premium"],
    exportar: ["basic", "pro", "premium"],
    alertas: ["basic", "pro", "premium"],
    pricing_history: ["free", "basic", "pro", "premium"],
  };
  return featureAccess[feature]?.includes(userPlan) ?? false;
}

export function hasPagesRemaining(
  pagesUsed: number,
  userPlan: string,
  pagesNeeded: number = 1
): boolean {
  const limit = PLAN_PAGES[userPlan] ?? 0;
  return (pagesUsed + pagesNeeded) <= limit;
}
