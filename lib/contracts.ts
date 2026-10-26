// Frozen contracts for hack-qloo. Owned by Kai; sessions must not change shapes without approval.
// v2 (Kai, 2026-10-24, wu approved the private architecture brief 10-24 16:53 Taipei).
// Paper Neighbors: two public film/TV/book references describing a manuscript's audience
// -> up to three evidence-backed *audience-side* comparison books from Qloo, each with what the author still cannot claim.

/** One piece of evidence returned by Qloo. entityId must come from a real Qloo response in this run. */
export interface QlooEvidence {
  entityId: string;
  name: string;
  type: string; // Qloo entity type URN, e.g. "urn:entity:book"
  affinity?: number; // Qloo query.affinity as returned, unmodified (audience co-affinity, NOT content similarity)
  tags?: string[];
  imageUrl?: string;
  sourceCall: string; // ToolTrace.id of the Qloo call that returned it
}

export interface ToolTrace {
  id: string;
  tool: string; // "qloo.search" | "qloo.tags" | "qloo.insights" | "llm" | "llm.mock"
  input: unknown;
  ok: boolean;
  ms: number;
  error?: string;
}

// ---------------- Paper Neighbors v2 ----------------

/** A Qloo book-genre tag. id MUST come from a /v2/tags response (filter.parents.types=urn:entity:book) or be one of the
 * ids the user picked from a previous needs_genre.options list. Pattern: urn:tag:genre:media:<slug>. Never invented. */
export interface GenreTag { id: string; name: string }

export interface ComparablesBriefInput {
  /** Exactly two public references (film, TV show or book titles). */
  references: [string, string];
  /** Genre picked by the author (from needs_genre.options or the UI picker). Preferred path. */
  genre?: GenreTag;
  /** Free-text genre query (e.g. "psychological thriller") used for /v2/tags lookup when genre is absent. */
  genreQuery?: string;
  /** Optional manuscript note for the author's own brief; NEVER sent to Qloo. */
  manuscriptNote?: string;
}

/** Book facts copied verbatim from Qloo properties/external; never filled in by the LLM. */
export interface BookFacts {
  author?: string; // from disambiguation / properties when present
  year?: number; // properties.publication_year
  publisher?: string;
  isbn13?: string;
  goodreads?: { rating: number; count: number }; // external.goodreads[0].user_rating / user_ratings_count
}

/** Explainability: how much one input reference contributed (score as returned by Qloo). */
export interface RefContribution { refEntityId: string; score: number }

export interface BookCandidate {
  book: QlooEvidence; // type must be "urn:entity:book"; entityId from this run's insights response
  facts: BookFacts;
  contributions: RefContribution[]; // per-book query.explainability["signal.interests.entities"]
  whyRead: string; // LLM-written; must name the book title; no sales/fit/content-similarity claims
  evidence: QlooEvidence[]; // non-empty; includes the book itself and/or the references
  cannotClaim: string[]; // non-empty; e.g. content similarity, sales, fitness for submission
}

export type ComparablesBriefReport =
  | {
      status: "ok";
      input: ComparablesBriefInput;
      references: QlooEvidence[]; // the two resolved references
      genre: GenreTag;
      candidates: BookCandidate[]; // 1-3
      refEffect: RefContribution[]; // response-level effect_on_top10 (missing ref => it did not drive results)
      unknowns: string[]; // what the author still has to verify
      trace: ToolTrace[];
    }
  | { status: "needs_genre"; input: ComparablesBriefInput; options: GenreTag[]; trace: ToolTrace[] }
  | { status: "insufficient_candidates"; input: ComparablesBriefInput; found: number; reason: string; trace: ToolTrace[] }
  | { status: "evidence_unavailable"; input: ComparablesBriefInput; reason: string; trace: ToolTrace[] };

/** The only interface between UI and agent. Bounded: <=8 Qloo calls, <=2 LLM turns.
 * Server: POST /api/agent with JSON ComparablesBriefInput -> 200 JSON ComparablesBriefReport.
 * Browser: `runComparablesBrief` exported from lib/features/client.ts. */
export type RunComparablesBrief = (input: ComparablesBriefInput, options?: { live?: boolean }) => Promise<ComparablesBriefReport & { cachedRunAt?: string }>;
