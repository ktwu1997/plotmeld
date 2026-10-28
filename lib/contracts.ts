// Shared contracts between the UI and the agent. Change a shape only together with its Zod schema and tests.
// Plotmeld: one film/TV title + one book -> up to three video games from Qloo /v2/insights
// (filter.type=urn:entity:videogame), ranked only by Qloo affinity. Every reason maps back to a field Qloo returned.
// No prices, hardware or store data.

/** One piece of evidence returned by Qloo. entityId must come from a real Qloo response in this run. */
export interface QlooEvidence {
  entityId: string;
  name: string;
  type: string; // Qloo entity type URN, e.g. "urn:entity:videogame", "urn:entity:tv_show", "urn:entity:book"
  affinity?: number; // Qloo query.affinity as returned, unmodified (audience co-affinity, NOT content similarity)
  tags?: string[]; // tag NAMES as returned (search tags[].name for references; tags[].name + steam_tags for games)
  imageUrl?: string;
  sourceCall: string; // ToolTrace.id of the Qloo call that returned it
}

export interface ToolTrace {
  id: string;
  tool: string; // "qloo.search" | "qloo.insights" | "llm" | "llm.mock"
  input: unknown;
  ok: boolean;
  ms: number;
  error?: string;
}

/** Slot 0 is the film/TV title, slot 1 is the book. */
export type ReferenceSlot = 'screen' | 'book';

export interface NextGameInput {
  /** [film or TV title, book title]. Optional qualifier in brackets: "(1990)", "(1990, TV)", "(film)", "(book)". */
  references: [string, string];
  /** Entity IDs the user picked from a previous needs_choice response. The agent re-runs /search and only accepts
   * an ID that appears in THIS run's search results for that slot; never trusted on its own. */
  choices?: { screen?: string; book?: string };
  /** Default any -> no filter; less -> filter.popularity.max 0.95; least -> 0.9. */
  familiarity?: 'any' | 'less' | 'least';
}

/** One search result offered when a title is ambiguous or has no exact name match. All values copied from /search. */
export interface ReferenceOption {
  entityId: string;
  name: string;
  type: string; // urn:entity:movie | urn:entity:tv_show | urn:entity:book
  year?: number; // properties.release_year / publication_year, else first 4-digit year in disambiguation
  disambiguation?: string; // as returned, e.g. "1990,1991" or "1992, Donna Tartt"
  label: string; // display label built only from the fields above, e.g. "Twin Peaks (1990, TV)"
}

export interface ReferenceChoice {
  slot: ReferenceSlot;
  query: string; // the user's text for that slot
  reason: 'ambiguous' | 'no_exact_match';
  options: ReferenceOption[]; // 1-5, from this run's search call
}

/** Game facts copied verbatim from Qloo entity.properties; never filled in by the LLM. Missing = not returned. */
export interface GameFacts {
  developer?: string;
  publisher?: string;
  releaseDate?: string; // properties.release_date as returned (YYYY-MM-DD)
  platforms?: string[]; // properties.platforms
  steamTags?: string[]; // properties.steam_tags (first 8)
  audienceTags?: string[]; // properties.audience_tags (first 5)
  emotionalTone?: string[]; // properties.emotional_tone (first 5)
}

/** Explainability: how much one input reference contributed to this game (score as returned by Qloo). */
export interface RefContribution { refEntityId: string; score: number }

/** Tag names shared between this game and one reference (code-computed, normalized case/punctuation; not LLM). */
export interface SharedTags { refEntityId: string; tags: string[] }

/** Field a grounded fact came from. */
export type FactField =
  | 'affinity' | 'contribution' | 'shared_tags' | 'no_shared_tags'
  | 'steam_tags' | 'audience_tags' | 'emotional_tone' | 'developer' | 'publisher' | 'platforms';

/** One fact built by code from this run's Qloo response. The LLM may cite facts by id; it never creates them. */
export interface GroundedFact {
  id: string; // stable within a report, e.g. "g1.affinity", "g1.contribution.0", "g2.steam_tags"
  field: FactField;
  text: string; // deterministic English rendering, e.g. "58% of the pull came from The Secret History"
  values: string[]; // the exact values (names, tags, rounded numbers as displayed) the text contains
}

/** One reason shown on a game card. */
export interface GameReason {
  text: string; // LLM rephrasing (when source='llm') or the deterministic fact text (when source='facts')
  factIds: string[]; // non-empty; every id must exist in this game's facts
  source: 'llm' | 'facts';
}

export interface GameCandidate {
  game: QlooEvidence; // type "urn:entity:videogame"; entityId from this run's insights response; rank = Qloo affinity order
  facts: GameFacts;
  contributions: RefContribution[]; // per-game query.explainability["signal.interests.entities"]
  sharedTags: SharedTags[]; // may be empty arrays; empty for both refs => a 'no_shared_tags' fact is present
  groundedFacts: GroundedFact[]; // non-empty
  reasons: GameReason[]; // 1-3, each passes the grounding check
}

export type NextGameReport =
  | {
      status: 'ok';
      input: NextGameInput;
      references: [QlooEvidence, QlooEvidence]; // [screen, book], resolved via qloo.search in this run
      candidates: GameCandidate[]; // 1-3, Qloo affinity order, references and duplicate titles excluded
      refEffect: RefContribution[]; // response-level effect_on_top3/top10 recs (missing ref => it did not drive results)
      wording: 'llm' | 'facts'; // 'facts' when both LLM turns were rejected by the grounding check or the LLM was unavailable
      unknowns: string[]; // what the player still has to check (price, hardware, store availability)
      trace: ToolTrace[];
    }
  | { status: 'needs_choice'; input: NextGameInput; choices: ReferenceChoice[]; trace: ToolTrace[] }
  | { status: 'insufficient_candidates'; input: NextGameInput; found: number; reason: string; trace: ToolTrace[] }
  | { status: 'evidence_unavailable'; input: NextGameInput; reason: string; trace: ToolTrace[] };

/** Hard per-request budget, enforced in the agent's call() wrapper (attempts included) and covered by tests.
 * A full flow (needs_choice request + follow-up) uses at most 2 + 3 = 5 Qloo calls. */
export const MAX_QLOO_CALLS_PER_REQUEST = 8;
export const MAX_LLM_TURNS_PER_REQUEST = 2;
export const MAX_GAMES = 3;

/** The only interface between UI and agent.
 * Server: POST /api/agent with JSON NextGameInput -> 200 JSON NextGameReport.
 * Browser: `runNextGame` exported from lib/features/client.ts. */
export type RunNextGame = (input: NextGameInput, options?: { live?: boolean }) => Promise<NextGameReport & { cachedRunAt?: string }>;

export const FAMILIARITY_MAX: Record<'less' | 'least', number> = { less: 0.95, least: 0.9 };
