// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — SENA Profile Matcher
// Basic keyword matching between profile skills and proceso text
// ─────────────────────────────────────────────────────────────

export interface MatchResult {
  profileId: number;
  profileName: string;
  score: number;
  matchedSkills: string[];
  relevance: "alta" | "media" | "baja";
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "");
}

export function matchProfileToProceso(
  profile: { id: number; nombre: string | null; habilidades: string[] },
  procesoText: string
): MatchResult {
  const normalizedText = normalize(procesoText);
  const matchedSkills: string[] = [];

  for (const skill of profile.habilidades) {
    const normalizedSkill = normalize(skill);
    if (normalizedText.includes(normalizedSkill)) {
      matchedSkills.push(skill);
    }
  }

  const score = profile.habilidades.length > 0
    ? matchedSkills.length / profile.habilidades.length
    : 0;

  let relevance: MatchResult["relevance"] = "baja";
  if (score >= 0.5) relevance = "alta";
  else if (score >= 0.25) relevance = "media";

  return {
    profileId: profile.id,
    profileName: profile.nombre ?? "Sin nombre",
    score: Math.round(score * 100),
    matchedSkills,
    relevance,
  };
}

export function matchProfilesToProceso(
  profiles: { id: number; nombre: string | null; habilidades: string[] }[],
  procesoText: string
): MatchResult[] {
  const results = profiles.map((p) => matchProfileToProceso(p, procesoText));
  return results.sort((a, b) => b.score - a.score);
}
