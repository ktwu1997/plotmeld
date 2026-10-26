# Paper Neighbors

An author enters two public film, TV or book references and a genre query to research up to three audience-side comparison books. The author picks a returned book-genre tag before research continues. The optional manuscript note stays in the browser brief; it is stripped before the API call and restored locally for display and copying. The server also drops it before writer input.

These are reading leads for the author to verify: **not sales comps, content-similarity claims, or a ready-to-submit query letter**. Qloo affinity measures audience co-affinity. AI interpretation explains why a lead may deserve investigation without establishing manuscript fit.

## Development

Use the existing dependencies (Node.js 20.19+). Start with `npm run dev`. The browser calls `runComparablesBrief` in `lib/features/client.ts`, which posts `ComparablesBriefInput` to `/api/agent` and receives one of four `ComparablesBriefReport` statuses: `ok`, `needs_genre`, `insufficient_candidates`, or `evidence_unavailable`.

For a UI-only preview:

```sh
NEXT_PUBLIC_PAPER_NEIGHBORS_DEMO=true npm run dev
```

The preview works only outside production. The banner identifies fictional books, facts, scores and traces as synthetic; IDs use `synthetic-` prefixes. No API requests are made. `createFixtureComparablesBrief(input, status)` supplies each status for tests. Its default is genre selection until the author chooses a tag. The fixture shape follows the measured psychological-thriller book-combo response; it is not live evidence.

The server pipeline (`lib/agent`) and the browser boundary (`runComparablesBrief` in `lib/features/client.ts`) implement Paper Neighbors end to end. `npm run smoke:live` runs one real Qloo flow (Prisoners + Normal People, psychological thriller) with the LLM on mock; the real LLM uses the Anthropic API with `ANTHROPIC_API_KEY`.

The server uses `QLOO_MODE=mock` (default) or `QLOO_MODE=live` with server-only `QLOO_API_KEY`. Production refuses mock execution. The LLM integration is Anthropic with `ANTHROPIC_API_KEY`; select `LLM_PROVIDER=mock` until a key is available, then `LLM_PROVIDER=anthropic`. Keep credentials server-only and out of traces. See [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries and integration limits.

## Evidence and limitations

Each book shows author, publication year, publisher, ISBN-13 and Goodreads rating/count exactly as returned. Missing fields say “Not returned”. Receipts expose entity ID, type, affinity and source call. Per-book contributions come from Qloo explainability; response-level reference effect shows when a reference did not drive the results only when effect data is present; missing data is reported as unknown. ToolTrace exposes inputs, status and timings. Copy brief exports references, genre, facts, AI interpretation, unsupported claims and author checks as plain text.

The book spike found that **without a book-genre tag, results were unrelated popular nonfiction**. Genre selection is therefore essential. Literary-fiction results showed a UK/Irish skew. Coverage and usefulness vary by reference; publication recency, manuscript fit, sales, and submission suitability remain unverified. Goodreads figures do not establish sales. Missing evidence or too few candidates produces an explicit state, never invented replacement books.

Each run is bounded to ≤8 Qloo calls and ≤2 LLM turns. UI fixtures and offline checks do not prove a live end-to-end run.

## Verification

```sh
npx tsc --noEmit
npx vitest run
npx eslint .
DEMO_ALLOW_MOCK=1 npx next build
```

## License

MIT; see [LICENSE](LICENSE).

References resolve only when exactly one case-insensitive exact name matches after optional year/type qualifiers, across books, films and TV. Ambiguity is refused with copyable `Title (YYYY, TV|film|book)` options; popularity never breaks ties. Use `Prisoners (2013)` and `Normal People (2020, TV)` for the live smoke. Supplied genre IDs are rechecked through Qloo book tags and canonical names are used.

`LLM_MAX_CALLS_PER_PROCESS` (default 200; legacy `LLM_MAX_CALLS_PER_DAY` is a fallback) is a per-process safety fuse, not a daily budget. Each worker/restart has its own counter. Mock calls do not consume it. The real spend bound is the Anthropic account quota.

Run the independent real-model smoke with an exported server-only `ANTHROPIC_API_KEY`:

```sh
LLM_PROVIDER=anthropic npm run smoke:llm
```

This uses the existing Qloo fixtures, makes at most two Anthropic calls with no retries, and reports pass/fail, model ID and per-response input/output token usage. Missing credentials fail clearly without network access. No response text or credentials are printed. The default model is `claude-haiku-5-5`; override it with `LLM_MODEL`. `LLM_MAX_OUTPUT_TOKENS` defaults to 2000 and accepts integers from 1 through 4000. Calls use a 20-second timeout, temperature 0.2 and zero retries. Strict JSON parsing and evidence validation remain mandatory.

`npm run measure:llm` captures the actual first-turn draft from the fixture-backed agent and prints character counts and approximate tokens (characters / 4). See [C8 notes](docs/c8-notes.md) for the measurements.

The exact homepage default input is cached only after a successful live run, in server process memory for 24 hours. Normalized identical inputs reuse that report with its run timestamp; Run live bypasses this cache and remains rate limited. Changed inputs go live. Cache entries disappear on restart and are never persisted or stored in browser storage. Anthropic monthly spend exhaustion returns a safe 503 message; an already cached default remains accessible.
