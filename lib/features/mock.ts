import type { NextGameInput, NextGameReport, RunNextGame } from "../contracts";

export const exampleInput: NextGameInput = { references: ["Mock Screen (synthetic)", "Mock Book (synthetic)"] };
/** Invented UI fixtures. No entity, fact, score or trace represents a live request. */
export function createFixtureNextGame(input: NextGameInput = exampleInput, status: NextGameReport["status"] = "ok"): NextGameReport {
  if (process.env.NODE_ENV === "production") throw new Error("Synthetic fixtures are disabled in production.");
  const trace = [{ id: "synthetic-search", tool: "qloo.search", input: { note: "Synthetic reference resolution; no request made" }, ok: true, ms: 0 }, { id: "synthetic-insights", tool: "qloo.insights", input: { note: "Synthetic game fixture; no request made" }, ok: true, ms: 0 }];
  if (status === "needs_choice") return { status, input, trace, choices: (["screen", "book"] as const).map((slot, i) => ({ slot, query: input.references[i], reason: i === 0 ? "ambiguous" : "no_exact_match", options: [{ entityId: `synthetic-ref-${i}`, name: `Mock ${slot} Choice (synthetic)`, label: `Mock ${slot} Choice (synthetic)`, type: i === 0 ? "urn:entity:tv_show" : "urn:entity:book", disambiguation: "synthetic edition" }] })) };
  if (status === "insufficient_candidates") return { status, input, found: 0, reason: "Synthetic scenario: too few supported games were returned.", trace };
  if (status === "evidence_unavailable") return { status, input, reason: "Synthetic scenario: supporting evidence is unavailable.", trace };
  const references: Extract<NextGameReport, { status: "ok" }>["references"] = [
    { entityId: "synthetic-ref-0", name: input.references[0], type: "urn:entity:tv_show", sourceCall: "synthetic-search" },
    { entityId: "synthetic-ref-1", name: input.references[1], type: "urn:entity:book", sourceCall: "synthetic-search" },
  ];
  return { status, input, references, refEffect: [], wording: "facts", unknowns: ["Check price.", "Check hardware requirements.", "Check store availability."], trace,
    candidates: ["One", "Two", "Three"].map((name, i) => ({
      game: { entityId: `synthetic-game-${i}`, name: `Mock Game ${name} (synthetic)`, type: "urn:entity:videogame", sourceCall: "synthetic-insights", ...(i === 2 ? {} : { affinity: 0.7900197225141475 - i * 0.01 }) },
      facts: i === 2 ? {} : { developer: "Mock Developer (synthetic)", publisher: "Mock Publisher (synthetic)", releaseDate: "2024-02-03", platforms: ["Mock Platform Alpha", "Mock Platform Beta"], steamTags: ["tag-alpha"] },
      contributions: i === 2 ? [] : references.map((r, j) => ({ refEntityId: r.entityId, score: j === 0 ? 0.62 : 0.38 })),
      sharedTags: i === 2 ? [] : [{ refEntityId: references[0].entityId, tags: ["tag-alpha"] }],
      groundedFacts: [{ id: `synthetic-fact-${i}`, field: "affinity" as const, text: "Synthetic audience evidence for this mock game.", values: ["synthetic"] }],
      reasons: [{ text: "Synthetic audience evidence for this mock game.", factIds: [`synthetic-fact-${i}`], source: "facts" as const }],
    })) };
}
export const mockRunNextGame: RunNextGame = async input => createFixtureNextGame(input);
