import { expect, it } from 'vitest';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { z } from 'zod';
import { nextGameInputSchema } from '../lib/agent/schema';
import { checkGrounding } from '../lib/agent/grounding';
import { nextGameReportSchema } from '../lib/features/client';
import type { NextGameInput } from '../lib/contracts';
const pairsSchema = z.object({ pairs: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), references: nextGameInputSchema.shape.references, pick: z.object({ screen: z.string().min(1).optional(), book: z.string().min(1).optional() }).strict().optional() }).strict()).min(1) }).strict();
it('runs supplied live pairs with bounded transport and grounded wording', async () => {
  if (process.env.QLOO_MODE !== 'live' || process.env.LLM_PROVIDER !== 'anthropic') throw Error('Smoke requires live Qloo and Anthropic modes');
  if (!process.env.SMOKE_PAIRS_FILE || !process.env.SMOKE_OUT_DIR) throw Error('Smoke requires SMOKE_PAIRS_FILE and SMOKE_OUT_DIR');
  const pairs = pairsSchema.parse(JSON.parse(await readFile(process.env.SMOKE_PAIRS_FILE, 'utf8'))).pairs;
  if (new Set(pairs.map(p => p.id)).size !== pairs.length) throw Error('Pair IDs must be unique');
  const repo = await realpath(process.cwd()); const requested = resolve(process.env.SMOKE_OUT_DIR);
  // Check existing ancestors as well as the final real path to reject symlink escapes into the repository.
  const inside = (path: string) => { const rel = relative(repo, path); return !rel || (!rel.startsWith('..') && !isAbsolute(rel)); };
  let ancestor = requested;
  while (true) { try { if (inside(await realpath(ancestor))) throw Error('SMOKE_OUT_DIR must be outside the repository'); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; const parent = resolve(ancestor, '..'); if (parent === ancestor) throw error; ancestor = parent; } }
  if (inside(requested)) throw Error('SMOKE_OUT_DIR must be outside the repository');
  await mkdir(requested, { recursive: true }); const out = await realpath(requested); if (inside(out)) throw Error('SMOKE_OUT_DIR must be outside the repository');
  const original = globalThis.fetch; let qloo = 0; let llm = 0; let totalQloo = 0; let totalLlm = 0; let lastQloo = 0; let stopped = false; let caps = true;
  globalThis.fetch = async (url, init) => {
    if (stopped) throw Error('Smoke transport stopped');
    const host = new URL(url instanceof Request ? url.url : String(url)).hostname;
    if (['api.qloo.com', 'hackathon.api.qloo.com'].includes(host)) {
      if (qloo >= 8) { caps = false; throw Error('Qloo request cap'); }
      qloo++; totalQloo++; const wait = 1150 - (Date.now() - lastQloo); if (wait > 0) await new Promise(r => setTimeout(r, wait)); lastQloo = Date.now();
    } else if (host === 'api.anthropic.com') { if (llm >= 2) { caps = false; throw Error('LLM request cap'); } llm++; totalLlm++; }
    else throw Error('Unexpected smoke host');
    const response = await original(url, init);
    if ([401, 403, 429].includes(response.status)) { stopped = true; await response.body?.cancel(); throw Error('Smoke transport stopped'); }
    return response;
  };
  let passed = true;
  try {
    const { runNextGame } = await import('../lib/agent/runtime');
    for (const pair of pairs) {
      totalQloo = 0; totalLlm = 0; caps = true;
      let status = 'error'; let count = 0; let wording = 'facts'; let grounded = false; let client = false; let pass = false;
      try {
        const run = async (input: NextGameInput) => { qloo = 0; llm = 0; return runNextGame(input); };
        let report = await run({ references: pair.references });
        if (report.status === 'needs_choice') {
          const choices: NonNullable<NextGameInput['choices']> = {};
          for (const choice of report.choices) {
            const query = pair.pick?.[choice.slot]?.normalize('NFKC').toLowerCase();
            const options = query ? choice.options.filter(o => o.label.normalize('NFKC').toLowerCase().includes(query)) : choice.options.length === 1 ? choice.options : [];
            if (options.length === 1) choices[choice.slot] = options[0].entityId;
          }
          if (report.choices.every(c => choices[c.slot])) report = await run({ references: pair.references, choices });
        }
        await writeFile(resolve(out, `${pair.id}.json`), JSON.stringify(report, null, 2) + '\n');
        status = report.status;
        if (report.status === 'ok') {
          count = report.candidates.length; wording = report.wording;
          grounded = report.candidates.every(c => c.reasons.every(r => checkGrounding(c.game.entityId, r, report.candidates, report.references).ok));
          client = nextGameReportSchema.safeParse(JSON.parse(JSON.stringify(report))).success;
          pass = count >= 2 && report.candidates.every(c => c.game.affinity !== undefined) && grounded && client && wording === 'llm' && caps && !stopped;
        }
      } catch { /* Never print provider bodies, headers, credentials, or supplied titles. */ }
      console.log(`pair ${pair.id}: ${pass ? 'PASS' : 'FAIL'} status=${status} games=${count} qloo=${totalQloo} llm=${totalLlm} wording=${wording} grounding=${grounded ? 'ok' : 'fail'} client=${client ? 'ok' : 'fail'}`);
      passed &&= pass; if (stopped) break;
    }
  } finally { globalThis.fetch = original; }
  expect(passed && !stopped).toBe(true);
}, 600_000);
