# D1 backend

The frozen contract in `lib/contracts.ts` connects the UI to `runNextGame` in `lib/features/client.ts`. The browser validates input and report structure. The API validates bounded JSON, rate limits requests, bounds concurrent work, and caches only the successful default example in process memory.

The server searches the screen and book slots independently. Exact NFKC case-insensitive names must also satisfy supplied year/type qualifiers. A validated choice overrides exact matching. Both slots resolve before `needs_choice`; alternate titles are offered rather than guessed. Search provenance remains in the trace.

The agent queries `/v2/insights` with `filter.type=urn:entity:videogame`, two reference IDs, explainability, and take=10. It removes reference IDs and duplicate normalized titles, then keeps at most three games in Qloo order. There is no genre lookup, popularity threshold, or model ranking.

Game properties remain verbatim. Shared tags are computed from game tag names plus steam tags against search-result tag names. Code builds stable rank-prefixed facts, using the shared `score2` formatter. Contribution percentages require both scores and a positive sum. Response-level effects prefer top-three, then top-ten variants.

The writer receives reference names and rank keys with fact IDs, fields, text, and required values. It returns strict JSON reasons. The pure grounding check enforces local citations, required values, numbers, catalog names, uncited proper names, sharing claims, and banned claims. Rejected reasons are dropped. Only games without passing reasons receive a correction turn. Unavailable or repeatedly rejected wording falls back to deterministic fact reasons. A no-shared-tags reason is always deterministic.

The call wrapper bounds Qloo attempts to eight and writer turns to two. Adapter retry implementations must call `observe.beforeAttempt` before each attempted fetch; the shipped adapter does not retry. Process fuses also bound Qloo fetches and Anthropic calls. Traces expose safe error summaries, never provider bodies or credentials. Provider spend exhaustion and process fuses return safe 503 responses.

The Qloo client allows only fixed HTTPS Qloo hosts and validated parameters. It validates every response and keeps a bounded in-memory cache with concurrent-request deduplication. The browser checks successful search/insights provenance, reference membership, unique fact IDs, local reason citations, and successful writer provenance. This verifies structural consistency, not cryptographic authenticity of Qloo responses.

Private recorded fixtures remain under `tests/fixtures/qloo/live`. Export removes fixtures and tests importing them, then scans remaining content for private response names and IDs. Public mocks and tests use invented names and tags. `smoke:d1` takes titles only from an external pairs file and refuses a report output directory inside the repository. Offline checks do not establish live service quality.
