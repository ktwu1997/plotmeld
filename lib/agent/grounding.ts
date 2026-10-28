import { normalize, referenceNames } from './reference';
export { normalize } from './reference';
import type { GameCandidate, GameReason, QlooEvidence } from '../contracts';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const GROUNDING_CONNECTORS = "a an the it its it's this that these they their you your and or with from of on by for to in as at both also while but is are was has have players fans people who liked like enjoy enjoyed tag tags tagged common shared shares share came pick made developed published available platforms platform affinity qloo score mood tone audience audiences mention describe described percent picks steam emotional include includes listed lists known".split(' ');
const words = (s: string) => s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
const mask = (text: string, values: string[]) => values.map(normalize).filter(Boolean).sort((a, b) => b.length - a.length).reduce((s, v) => {
  const pattern = v.split(/[^\p{L}\p{N}%]+/u).map(escape).join("[^\\p{L}\\p{N}%]*");
  return s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'giu'), ' ');
}, text.replace(/[™®]/g, '').normalize('NFKC'));
export function parseDraftOutput(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1')) : value;
}
export function mustInclude(fact: GameCandidate['groundedFacts'][number]): string[] {
  return fact.field === 'affinity' || fact.field === 'contribution' ? fact.values.filter(v => /^(?:\d+[.,]?)+%?$/.test(v)) : fact.values.slice(0, 1);
}
export interface GroundingResult { ok: boolean; rules: string[]; errors: string[] }
/** Pure acceptance check; diagnostics include offending words, never full rejected prose. */
export function checkGrounding(gameId: string, reason: Pick<GameReason, 'text' | 'factIds'> & { source?: GameReason['source'] }, candidates: GameCandidate[], references: QlooEvidence[], catalog: QlooEvidence[] = []): GroundingResult {
  const rules = new Set<string>(); const errors: string[] = [];
  const fail = (rule: string, message: string) => { rules.add(rule); errors.push(message); };
  const game = candidates.find(c => c.game.entityId === gameId);
  if (!game) return { ok: false, rules: ['a'], errors: ['unknown game'] };
  const facts = reason.factIds.map(id => game.groundedFacts.find(f => f.id === id));
  if (!facts.length || facts.some(f => !f) || new Set(reason.factIds).size !== reason.factIds.length) fail('a', 'invalid fact IDs');
  const cited = facts.filter(f => f !== undefined);
  const text = normalize(reason.text);
  const identicalReferenceNames = new Set(references.map(ref => normalize(ref.name))).size < references.length;
  for (const fact of cited) {
    const required = mustInclude(fact);
    if (!fact.values.filter(v => fact.field !== 'shared_tags' || !references.some(r => referenceNames(r, references).some(name => normalize(name) === normalize(v)))).some(v => text.includes(normalize(v)))) fail('b', `missing value for ${fact.id}`);
    for (const value of (fact.field === 'affinity' || fact.field === 'contribution' ? required : [])) if (!text.includes(normalize(value))) fail('b', `missing '${value}'`);
    if (fact.field === 'affinity' || fact.field === 'contribution') {
      const ownReferences = references.filter(r => fact.values.some(v => referenceNames(r, references).some(name => normalize(v) === normalize(name))));
      if (!ownReferences.length && !text.includes(normalize(fact.text))) fail('b', `missing numeric fact text for ${fact.id}`);
      // Affinity is global unless its fact explicitly names a reference.
      for (const ref of identicalReferenceNames && reason.source === 'facts' && reason.text === fact.text ? [] : ownReferences) for (const number of required.filter(v => /^(?:\d+[.,]?)+%?$/.test(v))) {
        const numberPattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(normalize(number))}(?![\\p{L}\\p{N}%])`, 'gu');
        const mentions = references.flatMap(reference => {
          const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${referenceNames(reference, references).map(name => escape(normalize(name))).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
          return [...text.matchAll(pattern)].map(match => ({ reference, match }));
        });
        const adjacent = [...text.matchAll(numberPattern)].some(n => {
          const distance = (r: RegExpMatchArray) => Math.max(0, n.index! - (r.index! + r[0].length), r.index! - (n.index! + n[0].length));
          const nearest = Math.min(...mentions.map(({ match }) => distance(match)));
          return nearest <= 40 && mentions.some(m => m.reference === ref && distance(m.match) === nearest)
            && !mentions.some(m => m.reference !== ref && distance(m.match) === nearest);
        });
        if (!adjacent) fail('b', `number not adjacent to reference for ${fact.id}`);
      }
    }
    if (reason && fact.field === 'no_shared_tags' && 'source' in reason && reason.source === 'llm') fail('e', 'no_shared_tags is deterministic');
  }
  const values = cited.flatMap(f => f.values);
  const names = [game.game.name, ...references.flatMap(ref => referenceNames(ref, references))];
  const masked = mask(reason.text, [...names, ...values]);
  const allowed = new Set([...GROUNDING_CONNECTORS, ...cited.flatMap(f => words(f.text))]);
  if (cited.some(f => f.field === 'affinity' && f.values.some(value => /^0(?:[.,]\d+)?$|^1(?:[.,]0+)?$/.test(value) && Number(value.replace(',', '.')) >= 0.8))) {
    allowed.add('strong'); allowed.add('match');
  }
  const unsupported = [...new Set(words(masked).filter(word => !allowed.has(word)))];
  if (unsupported.length) fail('g', `words not grounded: ${unsupported.join(', ')}`);
  if (masked.match(/(?<![\p{L}\d])\d+(?:[.,]\d+)?%?(?![\p{L}])/gu)) fail('c', 'unsupported number');
  const catalogText = mask(reason.text, references.flatMap(ref => referenceNames(ref, references)));
  for (const entity of [...catalog, ...candidates.map(c => c.game)]) {
    if (names.includes(entity.name)) continue;
    const flags = /\s/.test(entity.name) ? 'iu' : 'u';
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escape(entity.name)}(?![\\p{L}\\p{N}])`, flags).test(catalogText)) fail('d', 'other catalog entity');
  }
  for (const fact of candidates.flatMap(c => c.groundedFacts)) {
    if (!['developer', 'publisher', 'platforms', 'steam_tags', 'shared_tags', 'audience_tags', 'emotional_tone'].includes(fact.field)) continue;
    for (const value of fact.values) {
      if (value.length < 4 || values.some(v => normalize(v) === normalize(value)) || names.includes(value)) continue;
      if (!['developer', 'publisher', 'platforms'].includes(fact.field) && !/\s/.test(value)) continue;
      if (text.includes(normalize(value))) fail('d', 'uncited proper name or multi-word tag');
    }
  }
  if (!game.sharedTags.some(s => s.tags.length) || cited.some(f => f.field === 'no_shared_tags')) {
    for (const match of reason.text.matchAll(/\b(?:shares?|shared|in common|both have)\b/gi)) {
      const before = reason.text.slice(0, match.index).split(/\s+/).slice(-4).join(' ');
      if (!/\b(?:no|not|neither|none)\b|n't/i.test(before) && !/^\s+no\b/i.test(reason.text.slice(match.index! + match[0].length))) fail('e', 'unsupported sharing claim');
    }
  }
  const sharing = /\b(?:shares?|shared|sharing|common)\b/i.test(reason.text);
  const deterministicNoSharing = reason.source !== 'llm' && cited.some(f => f.field === 'no_shared_tags');
  const allReferences = sharing && /\b(?:both|either|each of|two titles|picks|they)\b/i.test(reason.text);
  if (allReferences && !deterministicNoSharing) {
    if (![0, 1].every(i => cited.some(f => f.id.endsWith(`.shared_tags.${i}`)))) fail('e', 'sharing across references requires both shared_tags facts');
  }
  const sharedFacts = game.groundedFacts.filter(f => f.field === 'shared_tags');
  const tagsOf = (fact: typeof sharedFacts[number]) => fact.values.filter(value => !references.some(ref => referenceNames(ref, references).some(name => normalize(name) === normalize(value))));
  const tagText = mask(reason.text, references.flatMap(ref => referenceNames(ref, references)));
  const mentionedTags = sharedFacts.flatMap(tagsOf).filter(tag => mask(tagText, [tag]) !== tagText);
  const namedReferences = references.map((ref, i) => ({ ref, i })).filter(({ ref }) => allReferences || referenceNames(ref, references).some(name => mask(reason.text, [name]) !== reason.text.replace(/[™®]/g, '').normalize('NFKC')));
  const collective = /\b(?:both|either|each of|also|like|they|picks|two titles)\b/i.test(reason.text);
  const linking = sharing || collective || namedReferences.length > 0;
  const cueTags = linking ? cited.filter(f => ['steam_tags', 'audience_tags', 'emotional_tone'].includes(f.field)).flatMap(f => f.values).filter(v => mask(tagText, [v]) !== tagText) : [];
  if (sharing && !deterministicNoSharing && !cited.some(f => f.field === 'shared_tags')) fail('e', 'sharing requires a shared_tags fact');
  if (linking && cueTags.length && !deterministicNoSharing && !cited.some(f => f.field === 'shared_tags')) fail('e', 'tag linked to a reference requires a shared_tags fact');
  for (const tag of linking || cited.some(f => f.field === 'shared_tags') ? [...mentionedTags, ...cueTags] : []) {
    const supports = (fact: typeof sharedFacts[number]) => tagsOf(fact).some(value => normalize(value) === normalize(tag));
    if (namedReferences.length
      ? namedReferences.some(({ i }) => !sharedFacts.some(f => f.id.endsWith(`.shared_tags.${i}`) && supports(f)))
      : (citedShared => !citedShared.length || !citedShared.every(supports))(cited.filter(f => f.field === 'shared_tags'))) fail('e', 'mentioned tag is not shared with every named reference');
  }
  (deterministicNoSharing ? [] : namedReferences).forEach(({ i }) => {
    if (!(identicalReferenceNames && reason.source === 'facts' && cited.some(f => reason.text === f.text)) && !cited.some(f => f.id.endsWith(`.shared_tags.${i}`) || f.id.endsWith(`.contribution.${i}`))) fail('e', 'named reference requires its shared_tags or contribution fact');
  });
  const banned = /\b(?:similar|same)\s+(?:story|plot|themes?|setting|world|characters)\b|\binspired by\b|\bbased on the (?:book|show|film|series|novel)\b|\b(?:adaptation|niche|hidden gem|underrated|obscure|price|cheap|sale|hardware|requirements|GPU|specs|guarantee)\b|\b(?:for free|free[- ]to[- ]play|on Steam|you will love|perfect for you)\b|\$/i;
  const contentClaims = [/\b(story|game|tale|book|show|film)\s+about\b/i, /\bis\s+about\b/i, /\babout\s+growing\s+up\b/i, /\bplot\b/i, /\bnarrative\s+(is|of)\b/i];
  for (const pattern of contentClaims) { const claim = masked.match(pattern); if (claim) fail('f', `banned '${claim[0]}'`); }
  const bad = masked.match(banned); if (bad) fail('f', `banned '${bad[0]}'`);
  return { ok: !rules.size, rules: [...rules], errors: [...new Set(errors)] };
}
export function fallbackReasons(game: GameCandidate): GameReason[] {
  const preferred = game.groundedFacts.filter(f => ['contribution', 'shared_tags', 'no_shared_tags'].includes(f.field));
  const selected = [...preferred, ...game.groundedFacts.filter(f => f.field === 'platforms'), ...game.groundedFacts.filter(f => f.field === 'affinity')];
  return selected.filter(f => f.text.length <= 200).slice(0, 3).map(f => ({ text: f.text, factIds: [f.id], source: 'facts' }));
}
