import type { ComparablesBriefInput, ComparablesBriefReport, RunComparablesBrief } from "../contracts";

export const exampleBrief: ComparablesBriefInput = { references: ["Prisoners", "Normal People"], genreQuery: "psychological thriller" };
const options = [{ id: "urn:tag:genre:media:psychological_thriller", name: "Psychological thriller (synthetic)" }, { id: "urn:tag:genre:media:literary_fiction", name: "Literary fiction (synthetic)" }];
/** Synthetic UI fixtures, shaped after the book-combo spike's facts and explainability.
 * No identifiers, books, scores or traces are evidence from a live request. */
export function createFixtureComparablesBrief(input: ComparablesBriefInput = exampleBrief, status: ComparablesBriefReport["status"] = input.genre ? "ok" : "needs_genre"): ComparablesBriefReport {
  if (process.env.NODE_ENV === "production") throw new Error("Synthetic fixtures are disabled in production.");
  const trace = [{ id: "synthetic-search", tool: "qloo.search", input: { note: "Synthetic reference resolution; no request made" }, ok: true, ms: 0 }, { id: "synthetic-insights", tool: "qloo.insights", input: { note: "Synthetic book fixture; no request made" }, ok: true, ms: 0 }];
  if (status === "needs_genre") return { status, input, options, trace };
  if (status === "insufficient_candidates") return { status, input, found: 1, reason: "Synthetic scenario: too few supported books were returned.", trace };
  if (status === "evidence_unavailable") return { status, input, reason: "Synthetic scenario: supporting evidence is unavailable.", trace };
  const references = input.references.map((name, i) => ({ entityId: `00000000-0000-4000-8000-00000000000${i}`, name, type: "urn:entity:movie", sourceCall: "synthetic-search" }));
  return { status, input, references, genre: input.genre ?? options[0], refEffect: [{ refEntityId: references[0].entityId, score: 0.5 }], unknowns: ["Read the books to assess content and manuscript fit.", "Verify edition details and current submission expectations."], trace,
    candidates: ["The Glass Landing", "A Quiet Witness", "After the Rain"].map((title, i) => {
      const book = { entityId: `00000000-0000-4000-8000-00000000001${i}`, name: `${title} (synthetic)`, type: "urn:entity:book", affinity: 0.8 - i * 0.01, sourceCall: "synthetic-insights" };
      return { book, facts: i === 0 ? { author: "Synthetic Author", year: 2024, publisher: "Synthetic Press", isbn13: "synthetic-isbn-placeholder", goodreads: { rating: 4, count: 100 } } : {}, contributions: references.map((ref, index) => ({ refEntityId: ref.entityId, score: index === 0 ? 0.6 : 0.4 })), whyRead: `${book.name} is a synthetic example of an audience-side lead, supported here only by synthetic-insights. Read it before judging fit.`, evidence: [book, ...references], cannotClaim: ["Content similarity", "Sales performance", "Fitness for submission"] };
    }) };
}
export const mockRunComparablesBrief: RunComparablesBrief = async (input) => createFixtureComparablesBrief(input);
