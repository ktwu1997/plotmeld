# Plotmeld: find your next game

Enter one film or TV title and one book. Qloo returns up to three video games in its own affinity order. Each reason cites facts built from returned fields. Affinity measures audience overlap and does not guarantee enjoyment.

Use Node.js 22.19 or newer. Run `npm run dev`, `npm run typecheck`, `npm run lint`, and `npm test`. The browser calls `runNextGame` with the frozen `NextGameInput` contract. Reports use `ok`, `needs_choice`, `insufficient_candidates`, or `evidence_unavailable`.

`QLOO_MODE=mock` and `LLM_PROVIDER=mock` run offline with synthetic evidence. Live mode requires server-only `QLOO_API_KEY`; Anthropic wording requires `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. Production refuses mock Qloo mode. Never put credentials in browser configuration.

Titles can include year and type qualifiers. Ambiguous or alternate-title searches require the user to choose from returned options. The agent revalidates choices against a fresh search. No popularity threshold or genre selection is used.

The agent makes at most eight Qloo attempts and two writer turns per request. Process fuses default to 600 Qloo calls (`QLOO_MAX_CALLS_PER_PROCESS`) and 200 Anthropic calls (`LLM_MAX_CALLS_PER_PROCESS`). These counters reset with the process. The Anthropic account quota remains the spend bound. The default model is `claude-haiku-5-5`, with zero retries, no temperature setting, and a 20-second timeout.

The default example is cached only in server memory for 24 hours after a successful live run. Live bypass and changed inputs remain rate limited. No recorded default report is written to disk.

Kai runs the live smoke outside the sandbox:

```sh
QLOO_MODE=live LLM_PROVIDER=anthropic SMOKE_PAIRS_FILE=/private/pairs.json SMOKE_OUT_DIR=/private/results npm run smoke:d1
```

The pairs file has `{ "pairs": [{ "id": "sample", "references": ["screen title", "book title"], "pick": { "screen": "option substring" } }] }`. The output directory must be outside the repository. The script writes private reports, spaces Qloo fetches by at least 1.15 seconds, stops on credential or rate-limit errors, and prints only aggregate checks.

Prices, hardware requirements, and store availability require the player's own checks. Platforms are copied from Qloo. See [ARCHITECTURE.md](ARCHITECTURE.md) and [LICENSE](LICENSE).
