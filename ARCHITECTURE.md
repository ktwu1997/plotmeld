# Paper Neighbors

TypeScript strict, Next.js App Router, React 19, Zod, Vitest and Testing Library. The product researches audience-side book comps from two film/TV/book references. It does not establish sales comps or produce a ready-to-submit query letter.

The flow below is the implemented Paper Neighbors contract (`lib/contracts.ts` v2). The synthetic UI preview exercises the same contract without API requests.

## Boundaries

`components/paper-neighbors.tsx` owns the form, author genre choice, result states, book cards and plain-text export. `components/trace.tsx` renders ToolTrace. The browser depends on frozen `ComparablesBriefInput`, `GenreTag`, `BookCandidate`, `ComparablesBriefReport` and `RunComparablesBrief` contracts in `lib/contracts.ts`. `runComparablesBrief` in `lib/features/client.ts` posts to `/api/agent`; the server owns validation and external requests. The manuscript note stays client-side, is omitted from API payloads and is merged back locally for display/copy. The server additionally discards it before writer input.

The server resolves references, looks up book-genre tags, asks the author to pick a tag via `needs_genre`, queries book insights, excludes duplicates/input books and validates evidence before requesting interpretation. No AI genre choice is made by the UI. The measured spike returned unrelated popular nonfiction without a genre tag; insights therefore require a resolved book-genre tag, book entity type, popularity minimum 0.8 and explainability.

The Qloo transport, host allowlist, in-memory cache, deduplication and trace remain platform responsibilities. Every run is bounded to ≤8 Qloo calls and ≤2 LLM turns. LLM wording uses Anthropic (`ANTHROPIC_API_KEY`), with `LLM_PROVIDER=mock` until the key is available, then `LLM_PROVIDER=anthropic`. Interpretation must refer to returned evidence, never invent IDs or missing bibliographic facts.

## Reports and evidence

- `ok`: one to three books with facts, per-reference contributions, AI interpretation, nonempty evidence, cannot-claim lists, response-level reference effect and author unknowns.
- `needs_genre`: returned tag options; the author picks one and the UI reruns the original input with `genre` set.
- `insufficient_candidates`: supported count and reason; no invented books.
- `evidence_unavailable`: reason and trace; no fallback recommendations.

Facts are copied verbatim from Qloo properties/external data: author, year, publisher, ISBN-13 and Goodreads rating/count. Missing values stay missing. Each receipt carries entity ID, type, affinity and source call. Per-book contributions represent query explainability; `refEffect` represents effect on the top 10 results. Only a present response-level effect list allows an absent reference to be identified as not driving results. Missing effect data produces an explicit unknown and an empty refEffect. Affinity is audience overlap, not content similarity, sales or submission fit. Literary-fiction results in the spike skewed toward UK/Irish publishing; authors must check coverage, content, recency and applicability themselves.

## Modes and verification

`QLOO_MODE=mock|live` chooses the server adapter. Live mode needs `QLOO_API_KEY`; production refuses mock mode. The independent browser preview uses `NEXT_PUBLIC_PAPER_NEIGHBORS_DEMO=true` outside production. `lib/features/mock.ts` provides synthetic fixtures for all four statuses, modeled on the book-combo spike's response structure. All fixture IDs start with `synthetic-`; fixtures reject production use and make no requests.

Feature tests inject `RunComparablesBrief`, verify all states, author genre selection, verbatim facts, missing fields, contributions, receipts and clipboard fallback. Platform tests remain independently owned. Required checks are TypeScript, the full Vitest suite, ESLint and a Next.js build with `DEMO_ALLOW_MOCK=1`. These offline checks do not validate live Qloo/Anthropic operation. No deployment or external contact is part of this product change. The repository retains its MIT LICENSE.

References resolve only when exactly one case-insensitive exact name matches after optional year/type qualifiers, across books, films and TV. Ambiguity is refused with copyable `Title (YYYY, TV|film|book)` options; popularity never breaks ties. Use `Prisoners (2013)` and `Normal People (2020, TV)` for the live smoke. Supplied genre IDs are rechecked through Qloo book tags and canonical names are used.

`LLM_MAX_CALLS_PER_PROCESS` (default 200; legacy `LLM_MAX_CALLS_PER_DAY` is a fallback) is a per-process safety fuse, not a daily budget. Each worker/restart has its own counter. Mock calls do not consume it. The real spend bound is the Anthropic account quota.

The browser requires candidate self-citation, citation IDs in the response candidates/references, and matching catalog metadata and source calls. This is structural consistency only: the frozen input-only trace cannot authenticate source-response membership or bibliographic facts (including publisher), and a consistently forged catalog can still pass. Independent fact-membership verification would require a returned source catalog/receipt beyond this trace.

The deterministic mock filters out books with no supported angle before selecting up to three. A rejected mock draft refuses immediately, including an empty selection when no angle is supported, since repeating that deterministic selection cannot correct it; provider writers retain their correction turn.

The Anthropic provider uses `@ai-sdk/anthropic` 2.x (AI SDK 5 / language-model provider v2), default model `claude-haiku-5-5`, temperature 0.2, no SDK retries and a 20-second timeout. `LLM_MODEL` overrides the model. `LLM_MAX_OUTPUT_TOKENS` defaults to 2000 and must be an integer in 1..4000. The existing system prompt, JSON parser, strict schema and evidence grounding are unchanged. Optional usage observation exposes only `result.usage` token counts to the separate `smoke:llm` harness; normal drafts still return only text.

`smoke:llm` runs the actual agent on offline Qloo evidence with Anthropic, so it needs no Qloo credential. Both the agent's two-turn limit and a process cap of two bound model calls. It reports model ID, pass/fail and response usage, without logging request content, credentials, provider exceptions or generated text. `measure:llm` captures the same fixture-derived DraftInput without contacting either API.

The exact homepage default input is cached only after a successful live run, in server process memory for 24 hours. Normalized identical inputs reuse that report with its run timestamp; Run live bypasses this cache and remains rate limited. Changed inputs go live. Cache entries disappear on restart and are never persisted or stored in browser storage. Anthropic monthly spend exhaustion returns a safe 503 message; an already cached default remains accessible.
