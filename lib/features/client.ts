import { z } from 'zod';
import type { NextGameInput, RunNextGame } from '../contracts';
import { nextGameInputSchema } from '../agent/schema';
import { guidSchema } from '../qloo/schemas';
const text = z.string().min(1);
const evidence = z.object({ entityId: guidSchema, name: text, type: text, affinity: z.number().finite().optional(), tags: z.array(z.string()).optional(), imageUrl: z.url().refine(url => /^https?:\/\//.test(url), 'Expected an HTTP image').optional(), sourceCall: text });
const trace = z.object({ id: text, tool: text, input: z.unknown(), ok: z.boolean(), ms: z.number().finite().nonnegative(), error: z.string().optional() }).transform(t => ({ ...t, input: t.input }));
const contribution = z.object({ refEntityId: guidSchema, score: z.number().finite() });
const fact = z.object({ id: text, field: z.enum(['affinity', 'contribution', 'shared_tags', 'no_shared_tags', 'steam_tags', 'audience_tags', 'emotional_tone', 'developer', 'publisher', 'platforms']), text, values: z.array(text).min(1) });
const candidate = z.object({
  game: evidence.extend({ type: z.literal('urn:entity:videogame') }),
  facts: z.object({ developer: z.string().optional(), publisher: z.string().optional(), releaseDate: z.string().optional(), platforms: z.array(z.string()).optional(), steamTags: z.array(z.string()).max(8).optional(), audienceTags: z.array(z.string()).max(5).optional(), emotionalTone: z.array(z.string()).max(5).optional() }),
  contributions: z.array(contribution), sharedTags: z.array(z.object({ refEntityId: guidSchema, tags: z.array(text).max(5) })), groundedFacts: z.array(fact).min(1),
  reasons: z.array(z.object({ text: text.max(200), factIds: z.array(text).min(1), source: z.enum(['llm', 'facts']) })).min(1).max(3),
});
const base = { input: nextGameInputSchema, trace: z.array(trace) };
export const nextGameReportSchema = z.discriminatedUnion('status', [
  z.object({ ...base, status: z.literal('ok'), references: z.tuple([evidence, evidence]), candidates: z.array(candidate).min(1).max(3), refEffect: z.array(contribution), wording: z.enum(['llm', 'facts']), unknowns: z.array(text) }),
  z.object({ ...base, status: z.literal('needs_choice'), choices: z.array(z.object({ slot: z.enum(['screen', 'book']), query: text, reason: z.enum(['ambiguous', 'no_exact_match']), options: z.array(z.object({ entityId: guidSchema, name: text, type: z.enum(['urn:entity:movie', 'urn:entity:tv_show', 'urn:entity:book']), year: z.number().optional(), disambiguation: z.string().optional(), label: text })).min(1).max(5) })).min(1).max(2) }),
  z.object({ ...base, status: z.literal('insufficient_candidates'), found: z.number().int().nonnegative(), reason: text }),
  z.object({ ...base, status: z.literal('evidence_unavailable'), reason: text }),
]).superRefine((report, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (new Set(report.trace.map(t => t.id)).size !== report.trace.length) issue('Duplicate trace IDs');
  if (report.status !== 'ok') return;
  const sources = new Map(report.trace.filter(t => t.ok).map(t => [t.id, t.tool]));
  const refs = new Set(report.references.map(r => r.entityId.toLowerCase())); const games = new Set<string>(); const factIds = new Set<string>();
  for (const ref of report.references) if (sources.get(ref.sourceCall) !== 'qloo.search') issue('Reference requires search provenance');
  if (!['urn:entity:movie', 'urn:entity:tv_show'].includes(report.references[0].type) || report.references[1].type !== 'urn:entity:book') issue('Invalid reference slots');
  for (const c of report.candidates) {
    const id = c.game.entityId.toLowerCase(); if (games.has(id) || refs.has(id)) issue('Duplicate or reference game'); games.add(id);
    if (sources.get(c.game.sourceCall) !== 'qloo.insights') issue('Game requires insights provenance');
    if ([...c.contributions, ...c.sharedTags].some(s => !refs.has(s.refEntityId.toLowerCase()))) issue('Unknown reference');
    for (const f of c.groundedFacts) { if (factIds.has(f.id)) issue('Duplicate fact ID'); factIds.add(f.id); if (f.values.some(v => !f.text.includes(v))) issue('Fact omits its value'); }
    const own = new Set(c.groundedFacts.map(f => f.id));
    for (const r of c.reasons) {
      if (r.factIds.some(id => !own.has(id)) || new Set(r.factIds).size !== r.factIds.length) issue('Invalid reason citations');
      if (r.source === 'llm' && !report.trace.some(t => t.ok && ['llm', 'llm.mock'].includes(t.tool))) issue('LLM reason requires successful LLM trace');
    }
  }
  if (report.refEffect.some(c => !refs.has(c.refEntityId.toLowerCase()))) issue('Unknown effect reference');
});
export const runNextGame: RunNextGame = async (input: NextGameInput, options) => {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(options?.live ? { 'X-Run-Live': '1' } : {}) }, body: JSON.stringify(nextGameInputSchema.parse(input)), signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (response.status === 503 && ['Demo LLM budget reached for this month; cached example still available', 'Demo Qloo budget reached; try later'].includes(body.error)) throw Error(body.error);
      if (response.status === 429) throw Error('Too many searches right now. Wait a minute and try again.');
      throw Error('Plotmeld could not finish. Please retry.');
    }
    const parsed = nextGameReportSchema.safeParse(await response.json());
    if (!parsed.success) throw Error('The server returned an invalid evidence report. Please retry.');
    return { ...parsed.data, ...(response.headers.get('X-Example-Cached') === '1' ? { cachedRunAt: response.headers.get('X-Example-Run-At') ?? undefined } : {}) };
  } catch (error) { if (error instanceof Error && error.name === 'AbortError') throw Error('Research timed out after 60 seconds. Please retry.'); throw error; }
  finally { clearTimeout(timeout); }
};
