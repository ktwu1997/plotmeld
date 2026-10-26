import 'server-only';
import { LlmBudgetError } from './budget';
import type { BookCandidate, BookFacts, QlooEvidence, RunComparablesBrief, ToolTrace } from '../contracts';
import type { Entity, QlooClient, ObserveQloo } from '../qloo/schemas';
import { comparablesBriefInputSchema, draftSchema } from './schema';
import type { DraftWriter } from './llm';
import { parseDraftOutput } from './grounding';

const referenceTypes: Record<string, string> = { film: 'urn:entity:movie', movie: 'urn:entity:movie', tv: 'urn:entity:tv_show', show: 'urn:entity:tv_show', series: 'urn:entity:tv_show', book: 'urn:entity:book' };
function parseReference(value: string): { title: string; year?: number; type?: string } {
  const match = value.match(/^(.+?)\s*\(([^()]+)\)$/);
  if (!match) return { title: value };
  const parts = match[2].toLowerCase().split(',').map(part => part.trim());
  if (parts.length > 2 || parts.some(part => !/^\d{4}$/.test(part) && !Object.hasOwn(referenceTypes, part))) return { title: value };
  const years = parts.filter(part => /^\d{4}$/.test(part));
  const types = parts.filter(part => Object.hasOwn(referenceTypes, part));
  if (years.length > 1 || types.length > 1) return { title: value };
  return { title: match[1].trim(), ...(years.length ? { year: Number(years[0]) } : {}), ...(types.length ? { type: referenceTypes[types[0]] } : {}) };
}
function referenceYear(entity: Entity): number | undefined {
  return entity.properties?.release_year ?? entity.properties?.publication_year ?? (Number(entity.disambiguation?.match(/\b\d{4}\b/)?.[0]) || undefined);
}
function referenceOption(entity: Entity): string {
  const type = entity.types.includes('urn:entity:tv_show') ? 'TV' : entity.types.includes('urn:entity:movie') ? 'film' : 'book';
  return `${entity.name} (${[referenceYear(entity), type].filter(value => value !== undefined).join(', ')})`;
}

export interface AgentDependencies { qloo: QlooClient; write: DraftWriter; mode?: 'live' | 'mock' }
export function createRunComparablesBrief({ qloo, write, mode = 'live' }: AgentDependencies): RunComparablesBrief {
  return async rawInput => {
    const input = comparablesBriefInputSchema.parse(rawInput);
    const trace: ToolTrace[] = [];
    let qlooCalls = 0;
    let llmTurns = 0;
    async function call<T>(tool: string, input: unknown, fn: (observe?: ObserveQloo) => Promise<T>): Promise<{ result: T; id: string }> {
      if (tool.startsWith('qloo.') ? ++qlooCalls > 8 : ++llmTurns > 2) throw new Error('Agent budget exceeded');
      let id = `call-${trace.length + 1}`;
      const entry: ToolTrace = { id, tool, input: { mode, params: input }, ok: false, ms: 0 };
      trace.push(entry);
      const start = Date.now();
      let observed = false;
      const observe: ObserveQloo = attempt => {
        observed = true;
        const target = attempt.attempt === 1 ? entry : { ...entry, id: `${entry.id}-attempt-${attempt.attempt}` };
        if (attempt.attempt > 1) trace.push(target);
        target.input = { mode, params: input, cache: attempt.cache, attempt: attempt.attempt };
        target.ok = attempt.ok; target.ms = attempt.ms;
        if (attempt.error) target.error = attempt.error;
        else delete target.error;
        id = target.id;
      };
      try { const result = await fn(observe); if (!observed) entry.ok = true; return { result, id }; }
      catch (error) { if (error instanceof LlmBudgetError) throw error; entry.error = 'Tool request failed or returned invalid data'; throw new Error(entry.error); }
      finally { if (!observed) entry.ms = Date.now() - start; }
    }
    const unavailable = (reason: string) => ({ status: 'evidence_unavailable' as const, input, reason, trace });
    function evidence(entity: Entity, sourceCall: string): QlooEvidence {
      return { entityId: entity.entity_id, name: entity.name, type: entity.types.includes('urn:entity:book') ? 'urn:entity:book' : entity.types[0],
        ...(entity.query?.affinity !== undefined ? { affinity: entity.query.affinity } : {}),
        ...(entity.tags ? { tags: entity.tags.map(t => t.id) } : {}),
        ...(entity.properties?.image ? { imageUrl: entity.properties.image.url } : {}), sourceCall };
    }
    try {
      const references: QlooEvidence[] = [];
      for (const reference of input.references) {
        const { title: query, year, type } = parseReference(reference);
        const params = { query, types: 'urn:entity:movie,urn:entity:tv_show,urn:entity:book', take: 3 };
        const found = await call('qloo.search', params, observe => qloo.search(params, observe));
        const exact = found.result.results.filter(e => e.name.toLowerCase() === query.toLowerCase());
        const matches = exact.filter(e => (year === undefined || referenceYear(e) === year) && (type === undefined || e.types.includes(type as Entity['types'][number])));
        const selected = matches.length === 1 ? matches[0] : undefined;
        if (!selected) {
          const options = exact.map(referenceOption).join('; ');
          return unavailable(`Reference "${reference}" has ${matches.length ? 'ambiguous exact matches' : 'no exact match'}. Use a more specific public reference.${options ? ` Options: ${options}` : ''}`);
        }
        references.push(evidence(selected, found.id));
      }
      let genre = input.genre;
      {
        const params = { 'filter.query': genre?.name || input.genreQuery || 'fiction', 'filter.parents.types': 'urn:entity:book' as const, take: 10 };
        const found = await call('qloo.tags', params, observe => qloo.tags(params, observe));
        const options = found.result.results.tags.filter(t => /^urn:tag:genre:media:[a-z0-9_]+$/.test(t.id)).map(({ id, name }) => ({ id, name }));
        const query = input.genreQuery?.toLowerCase();
        const exact = genre ? options.filter(t => t.id === input.genre?.id) : query ? options.filter(t => t.name.toLowerCase() === query || t.id.split(':').at(-1) === query.replace(/\s+/g, '_')) : [];
        if (exact.length !== 1) return { status: 'needs_genre', input, options, trace };
        genre = exact[0];
      }
      const params = { 'filter.type': 'urn:entity:book' as const, 'signal.interests.entities': references.map(e => e.entityId).join(','), 'filter.tags': genre.id, 'filter.popularity.min': 0.8, 'feature.explainability': 'true' as const, take: 10 };
      const found = await call('qloo.insights', params, observe => qloo.insights(params, observe));
      const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const seenIds = new Set(references.map(e => e.entityId.toLowerCase()));
      const seenTitles = new Set([...references.map(e => normalize(e.name)), ...input.references.map(normalize)]);
      const entities = found.result.results.entities.filter(e => {
        if (!e.types.includes('urn:entity:book') || seenIds.has(e.entity_id.toLowerCase()) || seenTitles.has(normalize(e.name))) return false;
        seenIds.add(e.entity_id.toLowerCase()); seenTitles.add(normalize(e.name)); return true;
      });
      const books = entities.map(e => evidence(e, found.id));
      if (!books.length) return { status: 'insufficient_candidates', input, found: 0, reason: 'No books remain after excluding references and duplicates.', trace };
      const catalog = new Map([...references, ...books].map(e => [e.entityId.toLowerCase(), e]));
      const effects = found.result.query?.explainability?.['signal.interests.entities'];
      const refEffect = (effects?.effect_on_top10 ?? effects?.effect_on_top10_recs ?? []).map(e => ({ refEntityId: e.entity_id, score: e.avg_score }));
      const { manuscriptNote: _note, ...writerInput } = input;
      void _note;
      const contributionsByBook = Object.fromEntries(entities.map(e => [e.entity_id, (e.query?.explainability?.['signal.interests.entities'] ?? []).filter(c => references.some(r => r.entityId.toLowerCase() === c.entity_id.toLowerCase())).map(c => ({ refEntityId: c.entity_id, score: c.score }))]));
      let correction: string | undefined;
      for (let turn = 0; turn < 2; turn++) {
        const drafted = await call(write.tool ?? (mode === 'mock' ? 'llm.mock' : 'llm'), { evidenceIds: [...catalog.keys()], ...(correction ? { correction } : {}) }, () => write({ input: { ...writerInput, genre }, books, references, contributions: contributionsByBook, evidence: [...catalog.values()], correction }));
        try {
          const draft = draftSchema.parse(parseDraftOutput(drafted.result));
          const seen = new Set<string>();
          const candidates: BookCandidate[] = draft.candidates.map(item => {
            const book = books.find(b => b.entityId.toLowerCase() === item.bookId.toLowerCase());
            if (!book || seen.has(item.bookId.toLowerCase())) throw new Error('Unsubstantiated book');
            if (!item.evidenceIds.some(id => id.toLowerCase() === book.entityId.toLowerCase())) throw new Error('Missing book citation');
            seen.add(item.bookId.toLowerCase());
            const proof = item.evidenceIds.map(id => { const value = catalog.get(id.toLowerCase()); if (!value) throw new Error('Invented evidence'); return value; });
            const entity = entities.find(e => e.entity_id === book.entityId)!;
            const properties = entity.properties;
            const author = entity.disambiguation?.match(/^\d{4}, (.+)$/)?.[1];
            const rating = entity.external?.goodreads?.[0];
            const facts: BookFacts = {
              ...(author ? { author } : {}),
              ...(properties?.publication_year !== undefined ? { year: properties.publication_year } : {}),
              ...(properties?.publisher !== undefined ? { publisher: properties.publisher } : {}),
              ...(properties?.isbn13 !== undefined ? { isbn13: properties.isbn13 } : {}),
              ...(rating?.user_rating !== undefined && rating.user_ratings_count !== undefined ? { goodreads: { rating: rating.user_rating, count: rating.user_ratings_count } } : {}),
            };
            const contributions = contributionsByBook[book.entityId];
            const [first, second] = references.map(r => contributions.find(c => c.refEntityId.toLowerCase() === r.entityId.toLowerCase())?.score);
            const both = first !== undefined && second !== undefined;
            const valid = item.angle === 'shared_audience' ? both && first >= 0.3 && second >= 0.3
              : item.angle === 'leans_first_ref' ? both && first > second
              : item.angle === 'leans_second_ref' ? both && second > first
              : book.affinity !== undefined && book.affinity >= 0.7;
            if (!valid) throw new Error('Angle inconsistent with evidence');
            const label = `${book.name}${facts.author !== undefined || facts.year !== undefined ? ` (${[facts.author, facts.year].filter(v => v !== undefined).join(', ')})` : ''}`;
            const audience = item.angle === 'shared_audience'
              ? `readers who like ${references[0].name} (${first!.toFixed(2)}) and ${references[1].name} (${second!.toFixed(2)}) also show up for this`
              : item.angle === 'leans_first_ref'
                ? `the contribution from ${references[0].name} (${first!.toFixed(2)}) exceeds ${references[1].name} (${second!.toFixed(2)}) for this`
                : item.angle === 'leans_second_ref'
                  ? `the contribution from ${references[1].name} (${second!.toFixed(2)}) exceeds ${references[0].name} (${first!.toFixed(2)}) for this`
                  : 'this has high audience affinity';
            const whyRead = `${label}: ${audience} in Qloo's ${genre.name} data${book.affinity !== undefined ? ` (audience overlap ${book.affinity.toFixed(2)})` : ''}. Check whether its story is relevant to yours.`;
            const cannotClaim = ['Content similarity to your manuscript', 'Sales performance', 'Fitness for submission / agent interest'];
            return { book, facts, contributions, whyRead, evidence: proof, cannotClaim };
          });
          const unknowns = ['Qloo affinity is audience overlap, not content similarity', 'Check publication date is recent enough for your query letter', ...(effects?.effect_on_top10 !== undefined || effects?.effect_on_top10_recs !== undefined ? references.filter(r => !refEffect.some(e => e.refEntityId.toLowerCase() === r.entityId.toLowerCase())).map(r => `${r.name} did not drive these results`) : ['Qloo did not return reference-effect data for this run'])];
          return { status: 'ok', input, references, genre, candidates, refEffect, unknowns, trace };
        } catch {
          const entry = trace.find(t => t.id === drafted.id)!;
          entry.ok = false;
          entry.error = 'Draft rejected: invalid schema, invented ID, or missing evidence citation';
          // The deterministic mock ignores correction; repeating it cannot repair a rejected selection.
          if (write.tool === 'llm.mock') return unavailable('Mock selection could not be grounded in this run’s Qloo evidence.');
          correction = 'Return strict JSON candidates with only bookId, evidenceIds (including that book), and angle. Use catalog IDs and an angle supported by the supplied contribution scores and affinity. No prose or additional keys.';
        }
      }
      return unavailable('Draft could not be grounded in this run’s Qloo evidence.');
    } catch (error) { if (error instanceof LlmBudgetError) throw error; return unavailable('Evidence or interpretation unavailable. Retry later.'); }
  };
}

export { runComparablesBrief } from './runtime';
