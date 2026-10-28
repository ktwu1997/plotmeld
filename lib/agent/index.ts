import 'server-only';
import { referenceDisplayNames } from './reference';
export { displayName } from './reference';
import { LlmBudgetError, QlooBudgetError } from './budget';
import { FAMILIARITY_MAX, MAX_GAMES, MAX_LLM_TURNS_PER_REQUEST, MAX_QLOO_CALLS_PER_REQUEST, type GameCandidate, type GameFacts, type QlooEvidence, type ReferenceChoice, type ReferenceOption, type RunNextGame, type ToolTrace } from '../contracts';
import type { Entity, QlooClient, ObserveQloo } from '../qloo/schemas';
import { nextGameInputSchema, draftSchema } from './schema';
import type { DraftWriter } from './llm';
import { GROUNDING_CONNECTORS, checkGrounding, fallbackReasons, mustInclude, normalize, parseDraftOutput } from './grounding';
import { score2 } from '../format';
const referenceTypes: Record<string, string> = { film: 'urn:entity:movie', movie: 'urn:entity:movie', tv: 'urn:entity:tv_show', show: 'urn:entity:tv_show', series: 'urn:entity:tv_show', book: 'urn:entity:book' };
export function parseReference(value: string): { title: string; year?: number; type?: string } {
  const match = value.match(/^(.+?)\s*\(([^()]+)\)$/); if (!match) return { title: value };
  const parts = match[2].toLowerCase().split(',').map(p => p.trim());
  if (parts.length > 2 || parts.filter(p => /^\d{4}$/.test(p)).length > 1 || parts.filter(p => referenceTypes[p]).length > 1 || parts.some(p => !/^\d{4}$/.test(p) && !referenceTypes[p])) return { title: value };
  return { title: match[1].trim(), year: Number(parts.find(p => /^\d{4}$/.test(p))) || undefined, type: referenceTypes[parts.find(p => referenceTypes[p]) ?? ''] };
}
const yearOf = (e: Entity) => e.properties?.release_year ?? e.properties?.publication_year ?? (Number(e.disambiguation?.match(/\b\d{4}\b/)?.[0]) || undefined);
function option(e: Entity): ReferenceOption {
  const type = e.types.includes('urn:entity:tv_show') ? 'urn:entity:tv_show' : e.types.includes('urn:entity:movie') ? 'urn:entity:movie' : 'urn:entity:book';
  const year = yearOf(e); const author = type === 'urn:entity:book' ? e.disambiguation?.match(/^\d{4},\s*(.+)$/)?.[1] : undefined;
  return { entityId: e.entity_id, name: e.name, type, ...(year ? { year } : {}), ...(e.disambiguation ? { disambiguation: e.disambiguation } : {}), label: `${e.name} (${[year, type.endsWith('tv_show') ? 'TV' : type.endsWith('movie') ? 'film' : 'book', author].filter(v => v !== undefined).join(', ')})` };
}
export interface AgentDependencies { qloo: QlooClient; write: DraftWriter; mode?: 'live' | 'mock' }
export function createRunNextGame({ qloo, write, mode = 'live' }: AgentDependencies): RunNextGame {
 return async rawInput => {
  const input = nextGameInputSchema.parse(rawInput); const trace: ToolTrace[] = []; let qlooCalls = 0; let llmTurns = 0;
  async function call<T>(tool: string, params: unknown, fn: (observe: ObserveQloo) => Promise<T>) {
    if (tool.startsWith('qloo.') ? ++qlooCalls > MAX_QLOO_CALLS_PER_REQUEST : ++llmTurns > MAX_LLM_TURNS_PER_REQUEST) throw Error('Agent budget exceeded');
    const entry: ToolTrace = { id: `call-${trace.length + 1}`, tool, input: { mode, params }, ok: false, ms: 0 }; trace.push(entry); const start = Date.now(); let observed = false; let id = entry.id;
    const observe: ObserveQloo = attempt => {
      observed = true;
      
      const target = attempt.attempt === 1 ? entry : { ...entry, id: `${entry.id}-attempt-${attempt.attempt}` };
      if (attempt.attempt > 1) trace.push(target); id = target.id;
      target.ok = attempt.ok; target.ms = attempt.ms; target.input = { mode, params, attempt: attempt.attempt, cache: attempt.cache };
      if (attempt.error) target.error = attempt.error;
    };
    try { const result = await fn(observe); if (!observed) entry.ok = true; return { result, id }; }
    catch (error) { entry.error = tool.startsWith('qloo.') ? 'Tool request failed or returned invalid data' : 'Writer unavailable'; throw error; }
    finally { entry.ms = Date.now() - start; }
  }
  const unavailable = (reason: string) => ({ status: 'evidence_unavailable' as const, input, reason, trace });
  const evidence = (e: Entity, sourceCall: string): QlooEvidence => ({ entityId: e.entity_id, name: e.name, type: e.types[0], ...(e.query?.affinity !== undefined ? { affinity: e.query.affinity } : {}), ...(e.tags ? { tags: e.tags.map(t => t.name) } : {}), ...(e.properties?.image?.url ? { imageUrl: e.properties.image.url } : {}), sourceCall });
  try {
    const references: QlooEvidence[] = []; const choices: ReferenceChoice[] = []; const catalog: QlooEvidence[] = []; let missing: string | undefined;
    for (const [index, slot] of (['screen', 'book'] as const).entries()) {
      const parsed = parseReference(input.references[index]); const choice = input.choices?.[slot];
      const params = { query: parsed.title, types: index === 0 ? 'urn:entity:movie,urn:entity:tv_show' : 'urn:entity:book', take: choice ? 10 : 5 };
      const found = await call('qloo.search', params, observe => qloo.search(params, observe));
      const results = found.result.results.filter(e => e.types.some(t => params.types.split(',').includes(t)));
      catalog.push(...results.map(e => evidence(e, found.id)));
      if (!results.length) { missing = `No Qloo search results for the ${slot} slot.`; continue; }
      const exact = results.filter(e => e.name.normalize('NFKC').toLowerCase() === parsed.title.normalize('NFKC').toLowerCase() && (!parsed.year || yearOf(e) === parsed.year) && (!parsed.type || e.types.includes(parsed.type as Entity['types'][number])));
      const selected = choice ? results.find(e => e.entity_id.toLowerCase() === choice.toLowerCase()) : exact.length === 1 ? exact[0] : undefined;
      if (selected) references[index] = evidence(selected, found.id);
      else choices.push({ slot, query: input.references[index], reason: exact.length > 1 ? 'ambiguous' : 'no_exact_match', options: (exact.length > 1 && !choice ? exact : results).slice(0, 5).map(option) });
    }
    if (missing) return unavailable(missing);
    if (choices.length) return { status: 'needs_choice', input, choices, trace };
    const referenceLabels = referenceDisplayNames(references);
    const params = { 'filter.type': 'urn:entity:videogame' as const, 'signal.interests.entities': references.map(r => r.entityId).join(','), 'feature.explainability': 'true' as const, take: 10, ...(input.familiarity && input.familiarity !== 'any' ? { 'filter.popularity.max': FAMILIARITY_MAX[input.familiarity] } : {}) };
    const found = await call('qloo.insights', params, observe => qloo.insights(params, observe));
    const seen = new Set(references.map(r => normalize(r.name))); const ids = new Set(references.map(r => r.entityId.toLowerCase()));
    const entities = found.result.results.entities.filter(e => { if (!e.types.includes('urn:entity:videogame') || ids.has(e.entity_id.toLowerCase()) || seen.has(normalize(e.name))) return false; seen.add(normalize(e.name)); ids.add(e.entity_id.toLowerCase()); return true; }).slice(0, MAX_GAMES);
    if (!entities.length) return { status: 'insufficient_candidates', input, found: 0, reason: input.familiarity && input.familiarity !== 'any' ? "Qloo returned no games under this familiarity setting. Try 'Any'." : 'No games remain after excluding references and duplicates.', trace };
    const candidates: GameCandidate[] = entities.map((e, index) => {
      const game = evidence(e, found.id); game.tags = [...new Set([...(game.tags ?? []), ...(e.properties?.steam_tags ?? [])])];
      const p = e.properties; const facts: GameFacts = {};
      if (p) { for (const key of ['developer', 'publisher'] as const) if (p[key] !== undefined) facts[key] = p[key];
        if (p.release_date !== undefined) facts.releaseDate = p.release_date;
        if (p.platforms) facts.platforms = p.platforms;
        if (p.steam_tags) facts.steamTags = p.steam_tags.slice(0, 8);
        if (p.audience_tags) facts.audienceTags = p.audience_tags.slice(0, 5);
        if (p.emotional_tone) facts.emotionalTone = p.emotional_tone.slice(0, 5);
      }
      const contributions = (e.query?.explainability?.['signal.interests.entities'] ?? []).filter(c => references.some(r => r.entityId.toLowerCase() === c.entity_id.toLowerCase())).map(c => ({ refEntityId: references.find(r => r.entityId.toLowerCase() === c.entity_id.toLowerCase())!.entityId, score: c.score }));
      const sharedTags = references.map(r => ({ refEntityId: r.entityId, tags: [...new Map((game.tags ?? []).filter(t => r.tags?.some(rt => normalize(rt) === normalize(t))).map(t => [normalize(t), t])).values()].slice(0, 5) }));
      const groundedFacts: GameCandidate['groundedFacts'] = []; const prefix = `g${index + 1}`;
      const add = (suffix: string, field: GameCandidate['groundedFacts'][number]['field'], text: string, values: string[]) => groundedFacts.push({ id: `${prefix}.${suffix}`, field, text, values });
      if (game.affinity !== undefined) add('affinity', 'affinity', `Qloo affinity ${score2(game.affinity)}`, [score2(game.affinity)]);
      const scores = references.map(r => contributions.find(c => c.refEntityId === r.entityId)?.score); const sum = (scores[0] ?? 0) + (scores[1] ?? 0);
      if (scores.every(s => s !== undefined) && sum > 0) references.forEach((r, i) => { const percent = `${Math.round(scores[i]! / sum * 100)}%`; add(`contribution.${i}`, 'contribution', `${percent} of this pick came from ${referenceLabels[i]}`, [percent, referenceLabels[i]]); });
      sharedTags.forEach((s, i) => { if (s.tags.length) add(`shared_tags.${i}`, 'shared_tags', `Tags in common with ${referenceLabels[i]}: ${s.tags.join(', ')}`, [...s.tags, referenceLabels[i]]); });
      if (!sharedTags.some(s => s.tags.length)) add('no_shared_tags', 'no_shared_tags', 'Shares no tags with either title; the pick rests on affinity and contribution only', ['no tags']);
      for (const [field, values] of [['steam_tags', facts.steamTags?.slice(0, 5)], ['audience_tags', facts.audienceTags?.slice(0, 3)], ['emotional_tone', facts.emotionalTone?.slice(0, 3)], ['developer', facts.developer === undefined ? undefined : [facts.developer]], ['publisher', facts.publisher === undefined ? undefined : [facts.publisher]], ['platforms', facts.platforms?.slice(0, 4)]] as const) if (values?.length) add(field, field, `${field.replaceAll('_', ' ')}: ${values.join(', ')}`, [...values]);
      return { game, facts, contributions, sharedTags, groundedFacts, reasons: [] };
    });
    let pending = candidates; let correction: string | undefined; let fallback = false;
    for (let turn = 0; turn < MAX_LLM_TURNS_PER_REQUEST && pending.length; turn++) {
      const payload = { connectors: GROUNDING_CONNECTORS, references: referenceLabels, games: pending.map(c => ({ gameId: `g${candidates.indexOf(c) + 1}`, name: c.game.name, facts: c.groundedFacts.filter(f => f.field !== 'no_shared_tags').map(f => ({ id: f.id, field: f.field, text: f.text, mustInclude: mustInclude(f) })) })), ...(correction ? { correction } : {}) };
      let drafted;
      try { drafted = await call(write.tool ?? 'llm', payload, () => write(payload)); }
      catch (error) { if (error instanceof LlmBudgetError || error instanceof QlooBudgetError) throw error; break; }
      try {
        const draft = draftSchema.parse(parseDraftOutput(drafted.result)); const failures: string[] = []; const rejected = new Map<string, Set<string>>();
        const reject = (key: string, rules: string[]) => { const codes = rejected.get(key) ?? new Set<string>(); rules.forEach(rule => codes.add(rule)); rejected.set(key, codes); };
        for (const candidate of pending) {
          const key = `g${candidates.indexOf(candidate) + 1}`; const items = draft.games.filter(g => g.gameId === key);
          for (const item of items) for (const reason of item.reasons) {
            const contributionFacts = candidate.groundedFacts.filter(f => reason.factIds.includes(f.id) && f.field === 'contribution');
            if (new Set(references.map(r => normalize(r.name))).size < references.length && contributionFacts.length) {
              candidate.reasons.push(...contributionFacts.filter(f => !candidate.reasons.some(r => r.factIds.includes(f.id))).map(f => ({ text: f.text, factIds: [f.id], source: 'facts' as const })));
              continue;
            }
            const checked = checkGrounding(candidate.game.entityId, { ...reason, source: 'llm' }, candidates, references, catalog); if (checked.ok) candidate.reasons.push({ ...reason, source: 'llm' }); else { reject(key, checked.rules); failures.push(`${key}: rules ${checked.rules.join(", ")}: ${checked.errors.join('; ')}`); } }
          candidate.reasons = candidate.reasons.slice(0, candidate.groundedFacts.some(f => f.field === 'no_shared_tags') ? 2 : 3);
          if (!candidate.reasons.length) { if (!items.length) reject(key, ['a']); failures.push(`${key}: supply at least one grounded reason`); }
        }
        const kept = pending.some(c => c.reasons.some(r => r.source === 'llm'));
        pending = pending.filter(c => !c.reasons.length); correction = failures.join('\n');
        if (rejected.size) { const entry = trace.find(t => t.id === drafted.id)!; entry.ok = kept; entry.error = `Rejected: ${[...rejected].map(([key, rules]) => `${key} ${rules.size === 1 ? 'rule' : 'rules'} ${[...rules].sort().join(',')}`).join('; ')}`; }
      } catch (error) { if (error instanceof LlmBudgetError || error instanceof QlooBudgetError) throw error; const entry = trace.at(-1); if (entry) { entry.ok = false; entry.error = 'Rejected: output was not valid JSON for the schema'; } correction = 'Invalid JSON or schema. Return strict JSON with games, gameId, reasons, factIds and text using the supplied facts.'; continue; }
    }
    for (const c of candidates) {
      if (!c.reasons.length) { c.reasons = fallbackReasons(c); fallback = true; }
      else { const noTags = c.groundedFacts.find(f => f.field === 'no_shared_tags'); if (noTags) c.reasons.push({ text: noTags.text, factIds: [noTags.id], source: 'facts' }); }
    }
    const effects = found.result.query?.explainability?.['signal.interests.entities'];
    const refEffect = (effects?.effect_on_top3_recs ?? effects?.effect_on_top10_recs ?? effects?.effect_on_top10 ?? []).filter(e => references.some(r => r.entityId.toLowerCase() === e.entity_id.toLowerCase())).map(e => ({ refEntityId: references.find(r => r.entityId.toLowerCase() === e.entity_id.toLowerCase())!.entityId, score: e.avg_score }));
    return { status: 'ok', input, references: references as [QlooEvidence, QlooEvidence], candidates, refEffect, wording: fallback ? 'facts' : 'llm', unknowns: ['Qloo affinity is audience overlap, not a guarantee you will enjoy it', 'Check price, hardware requirements and store availability yourself', 'Platforms are as listed by Qloo'], trace };
  } catch (error) { if (error instanceof LlmBudgetError || error instanceof QlooBudgetError) throw error; return unavailable('Evidence or interpretation unavailable. Retry later.'); }
 };
}
export { runNextGame } from './runtime';
