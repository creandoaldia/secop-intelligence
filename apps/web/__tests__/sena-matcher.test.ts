// ─────────────────────────────────────────────────────────────
// Tests: SENA Profile Matcher
// Pure function — no mocks needed
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { matchProfileToProceso, matchProfilesToProceso } from "@/lib/sena/matcher";

const mockProfile = {
  id: 1,
  nombre: "Ingeniero Civil",
  habilidades: ["construccion", "licitaciones", "presupuestos", "supervision"],
};

describe("matchProfileToProceso", () => {
  it("devuelve score 100 cuando todas las habilidades coinciden", () => {
    const result = matchProfileToProceso(
      mockProfile,
      "Se requiere experiencia en construccion, licitaciones, presupuestos y supervision de obras"
    );
    expect(result.score).toBe(100);
    expect(result.relevance).toBe("alta");
    expect(result.matchedSkills).toHaveLength(4);
  });

  it("devuelve score 50 cuando la mitad de habilidades coinciden", () => {
    const result = matchProfileToProceso(
      mockProfile,
      "Experiencia en construccion y licitaciones de obra publica"
    );
    expect(result.score).toBe(50);
    expect(result.relevance).toBe("alta");
    expect(result.matchedSkills).toHaveLength(2);
  });

  it("devuelve score 0 cuando ninguna habilidad coincide", () => {
    const result = matchProfileToProceso(
      mockProfile,
      "Se requiere experiencia en cocina y reposteria"
    );
    expect(result.score).toBe(0);
    expect(result.relevance).toBe("baja");
    expect(result.matchedSkills).toHaveLength(0);
  });

  it("maneja acentos y mayusculas (normalizacion)", () => {
    const result = matchProfileToProceso(
      { id: 2, nombre: "Abogado", habilidades: ["contratación estatal", "derecho administrativo"] },
      "Experto en CONTRATACION ESTATAL y DERECHO ADMINISTRATIVO"
    );
    expect(result.matchedSkills).toHaveLength(2);
    expect(result.score).toBe(100);
  });

  it("maneja habilidades vacias", () => {
    const result = matchProfileToProceso(
      { id: 3, nombre: "Vacio", habilidades: [] },
      "Cualquier texto sin habilidades relevantes"
    );
    expect(result.score).toBe(0);
    expect(result.matchedSkills).toHaveLength(0);
  });

  it("normaliza texto con tildes", () => {
    const result = matchProfileToProceso(
      { id: 4, nombre: "Test", habilidades: ["licitación", "ejecución"] },
      "Licitacion y ejecucion de proyectos"
    );
    expect(result.matchedSkills).toHaveLength(2);
  });
});

describe("matchProfilesToProceso", () => {
  const profiles = [
    { id: 1, nombre: "Ing Civil", habilidades: ["construccion", "presupuestos"] },
    { id: 2, nombre: "Abogado", habilidades: ["contratos", "licitaciones"] },
    { id: 3, nombre: "Chef", habilidades: ["cocina", "reposteria"] },
  ];

  it("ordena resultados por score descendente", () => {
    const results = matchProfilesToProceso(
      profiles,
      "Experiencia en construccion, presupuestos y licitaciones"
    );
    expect(results[0].profileId).toBe(1); // Ing Civil: 100%
    expect(results[1].profileId).toBe(2); // Abogado: 50%
    expect(results[2].profileId).toBe(3); // Chef: 0%
  });

  it("retorna array vacio con perfiles vacios", () => {
    const results = matchProfilesToProceso([], "cualquier texto");
    expect(results).toHaveLength(0);
  });

  it("maneja texto de proceso vacio", () => {
    const results = matchProfilesToProceso(profiles, "");
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.score === 0)).toBe(true);
  });
});
