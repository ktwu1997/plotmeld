import { z } from "zod";

const text = z.string().trim().min(1);
const evidenceSchema = z.object({
  entityId: z.string().uuid(),
  name: text,
  type: text,
  affinity: z.number().finite().optional(),
  tags: z.array(z.string()).optional(),
  imageUrl: z.string().url().refine((url) => /^https?:\/\//.test(url), "Expected an HTTP image").optional(),
  sourceCall: text,
});
const traceSchema = z.object({
  id: text, tool: text, input: z.unknown(), ok: z.boolean(),
  ms: z.number().finite().nonnegative(), error: z.string().optional(),
}).transform((trace) => ({ ...trace, input: trace.input }));
// Paper Neighbors v2 browser boundary.
import type { ComparablesBriefInput, ComparablesBriefReport, RunComparablesBrief } from "../contracts";
import { comparablesBriefInputSchema, genreSchema } from '../agent/schema';
const contributionSchema = z.object({ refEntityId: z.string().uuid(), score: z.number().finite() });
const factsSchema = z.object({ author: text.optional(), year: z.number().optional(), publisher: text.optional(), isbn13: text.optional(), goodreads: z.object({ rating: z.number().finite(), count: z.number().finite() }).optional() });
export const comparablesBriefReportSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), input: comparablesBriefInputSchema, references: z.array(evidenceSchema).length(2), genre: genreSchema,
    candidates: z.array(z.object({ book: evidenceSchema.extend({ type: z.literal('urn:entity:book') }), facts: factsSchema, contributions: z.array(contributionSchema), whyRead: text, evidence: z.array(evidenceSchema).min(1), cannotClaim: z.array(text).min(1) })).min(1).max(3),
    refEffect: z.array(contributionSchema), unknowns: z.array(text), trace: z.array(traceSchema) }),
  z.object({ status: z.literal('needs_genre'), input: comparablesBriefInputSchema, options: z.array(genreSchema), trace: z.array(traceSchema) }),
  z.object({ status: z.literal('insufficient_candidates'), input: comparablesBriefInputSchema, found: z.number().int().nonnegative(), reason: text, trace: z.array(traceSchema) }),
  z.object({ status: z.literal('evidence_unavailable'), input: comparablesBriefInputSchema, reason: text, trace: z.array(traceSchema) }),
]).superRefine((report, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (new Set(report.trace.map(t => t.id)).size !== report.trace.length) issue('Duplicate trace IDs');
  if (report.status !== 'ok') return;
  const sources = new Map(report.trace.filter(t => t.ok).map(t => [t.id, t.tool]));
  const refs = new Set(report.references.map(r => r.entityId.toLowerCase()));
  const ids = new Set<string>();
  for (const ref of report.references) if (sources.get(ref.sourceCall) !== 'qloo.search') issue('Reference requires search provenance');
  for (const candidate of report.candidates) {
    const id = candidate.book.entityId.toLowerCase();
    if (ids.has(id) || refs.has(id)) issue('Duplicate or reference candidate ID');
    ids.add(id);
    if (sources.get(candidate.book.sourceCall) !== 'qloo.insights') issue('Book requires insights provenance');
    if (candidate.contributions.some(c => !refs.has(c.refEntityId.toLowerCase()))) issue('Unknown contribution reference');
  }
  if (report.refEffect.some(c => !refs.has(c.refEntityId.toLowerCase()))) issue('Unknown effect reference');
  const catalog = new Map([...report.references, ...report.candidates.map(c => c.book)].map(e => [e.entityId.toLowerCase(), e]));
  for (const candidate of report.candidates) {
    if (!candidate.evidence.some(e => e.entityId.toLowerCase() === candidate.book.entityId.toLowerCase())) issue('Missing candidate self-citation');
    for (const citation of candidate.evidence) {
      const entity = catalog.get(citation.entityId.toLowerCase());
      if (!entity) issue('Citation outside response catalog');
      else if (citation.sourceCall !== entity.sourceCall || citation.name !== entity.name || citation.type !== entity.type
        || citation.affinity !== entity.affinity || citation.imageUrl !== entity.imageUrl
        || JSON.stringify(citation.tags) !== JSON.stringify(entity.tags)) issue('Citation inconsistent with catalog entity');
    }
  }
  const calls = new Set(report.trace.filter(t => t.ok && t.tool.startsWith('qloo.')).map(t => t.id));
  for (const evidence of [...report.references, ...report.candidates.flatMap(c => [c.book, ...c.evidence])]) {
    if (!calls.has(evidence.sourceCall)) ctx.addIssue({ code: 'custom', message: 'Evidence has no successful Qloo source call' });
  }
});
export const runComparablesBrief: RunComparablesBrief = async (input: ComparablesBriefInput, options?: { live?: boolean }): Promise<ComparablesBriefReport> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(options?.live ? { 'X-Run-Live': '1' } : {}) }, body: JSON.stringify(comparablesBriefInputSchema.parse(input)), signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (response.status === 503 && body.error === 'Demo LLM budget reached for this month; cached example still available') throw new Error(body.error);
      throw new Error('Paper Neighbors could not finish. Please retry.');
    }
    const parsed = comparablesBriefReportSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('The server returned an invalid evidence report. Please retry.');
    return { ...parsed.data, ...(response.headers?.get('X-Example-Cached') === '1' ? { cachedRunAt: response.headers?.get('X-Example-Run-At') ?? undefined } : {}) };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Research timed out after 60 seconds. Please retry.');
    throw error;
  } finally { clearTimeout(timeout); }
};
