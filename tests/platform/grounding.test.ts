import { expect, it } from 'vitest';
import { checkGrounding, fallbackReasons } from '../../lib/agent/grounding';
import type { GameCandidate, GroundedFact, QlooEvidence } from '../../lib/contracts';
const ref: QlooEvidence = { entityId: 'ref', name: 'Mock Reference 1990', type: 'urn:entity:movie', sourceCall: 'search' };
const facts: GroundedFact[] = [
  { id: 'g1.affinity', field: 'affinity', text: 'Qloo affinity 0.9', values: ['0.9'] },
  { id: 'g1.developer', field: 'developer', text: 'developer: Mock Studio™', values: ['Mock Studio™'] },
  { id: 'g1.platforms', field: 'platforms', text: 'platforms: Mock Console 4', values: ['Mock Console 4'] },
  { id: 'g1.no_shared_tags', field: 'no_shared_tags', text: 'Shares no tags with either title; the pick rests on affinity and contribution only', values: ['no tags'] },
];
const game: GameCandidate = { game: { entityId: 'game', name: 'Mock Game 2', type: 'urn:entity:videogame', sourceCall: 'insights' }, facts: {}, contributions: [], sharedTags: [], groundedFacts: facts, reasons: [] };
const check = (text: string, factIds = ['g1.affinity'], gameId = 'game') => checkGrounding(gameId, { text, factIds }, [game], [ref], [{ ...ref, name: 'Other Catalog' }]);
it('accepts cited facts, punctuation normalization and masked title/platform digits', () => {
  expect(check('Mock Game 2 has Qloo affinity 0.9').ok).toBe(true);
  expect(check('Mock Studio', ['g1.developer']).ok).toBe(true);
  expect(check('Mock Console 4', ['g1.platforms']).ok).toBe(true);
});
it.each([
  ['a', 'Qloo affinity 0.9', ['invented']],
  ['a', 'Qloo affinity 0.9', ['g1.affinity', 'g1.affinity']],
  ['b', 'Qloo affinity is high', ['g1.affinity']],
  ['c', 'Qloo affinity 0.9 and 88%', ['g1.affinity']],
  ['d', 'Other Catalog has Qloo affinity 0.9', ['g1.affinity']],
  ['d', 'Mock Console 4 has affinity 0.9', ['g1.affinity']],
  ['e', 'Shares tags and affinity 0.9', ['g1.affinity']],
  ['f', 'A niche pick with affinity 0.9', ['g1.affinity']],
] as const)('rejects rule %s', (rule, text, ids) => expect(check(text, [...ids]).rules).toContain(rule));
it('rejects unknown games and empty citation lists', () => { expect(check('0.9', [], 'other').rules).toContain('a'); expect(check('0.9', []).rules).toContain('a'); });
it.each(['similar story', 'same world', 'inspired by', 'based on the novel', 'adaptation', 'hidden gem', 'underrated', 'obscure', 'price', 'cheap', 'for free', 'free-to-play', '$', 'sale', 'hardware', 'requirements', 'GPU', 'specs', 'on Steam', 'guarantee', 'you will love', 'perfect for you'])('rejects banned claim %s', claim => expect(check(`${claim}; affinity 0.9`).rules).toContain('f'));
it('handles negated sharing and rejects unsupported free wording', () => {
  expect(check('Does not share tags; Qloo affinity 0.9').rules).toContain('g');
  expect(check('Based on audience overlap, affinity 0.9; free to explore').rules).toContain('g');
});
it('all deterministic fallback reasons pass grounding', () => { for (const r of fallbackReasons(game)) expect(checkGrounding('game', r, [game], [ref])).toMatchObject({ ok: true }); });
it('masks cited banned-looking names and tags', () => {
  const c = structuredClone(game); c.groundedFacts.push({ id: 'g1.steam_tags', field: 'steam_tags', text: 'tags: Free to Play', values: ['Free to Play'] });
  expect(checkGrounding('game', { text: 'Free to Play', factIds: ['g1.steam_tags'] }, [c], [ref]).ok).toBe(true);
});
it('forbids LLM citations of the deterministic no-sharing fact', () => {
  expect(checkGrounding('game', { text: facts[3].text, factIds: ['g1.no_shared_tags'], source: 'llm' }, [game], [ref]).rules).toContain('e');
});
it('requires exact contribution percentages and accepts any cited tag value', () => {
  const c = structuredClone(game); c.groundedFacts.push({ id: 'g1.contribution.0', field: 'contribution', text: '61% from Mock Reference 1990', values: ['61%', ref.name] }, { id: 'g1.steam_tags', field: 'steam_tags', text: 'tag-alpha, tag-beta', values: ['tag-alpha', 'tag-beta'] });
  expect(checkGrounding('game', { text: ref.name, factIds: ['g1.contribution.0'] }, [c], [ref]).rules).toContain('b');
  expect(checkGrounding('game', { text: '61% from Mock Reference 1990', factIds: ['g1.contribution.0'] }, [c], [ref]).ok).toBe(true);
  expect(checkGrounding('game', { text: 'tag-beta', factIds: ['g1.steam_tags'] }, [c], [ref]).ok).toBe(true);
});
it('uses word boundaries and case-sensitive single-word catalog names', () => {
  const catalog = [{ ...ref, name: 'Mock' }];
  expect(checkGrounding('game', { text: 'mocking affinity 0.9', factIds: ['g1.affinity'] }, [game], [ref], catalog).rules).not.toContain('d');
  expect(checkGrounding('game', { text: 'mock affinity 0.9', factIds: ['g1.affinity'] }, [game], [ref], catalog).rules).not.toContain('d');
  expect(checkGrounding('game', { text: 'Mock affinity 0.9', factIds: ['g1.affinity'] }, [game], [ref], catalog).rules).toContain('d');
});

it.each(['a story about growing up', 'it is about friendship', 'about growing up', 'its plot unfolds', 'the narrative is moving', 'the narrative of friendship', 'It shares the coming-of-age theme with both of your picks, so it is a story about growing up.'])('rejects content claim under rule f: %s', claim => {
  expect(check(`${claim}; affinity 0.9`).rules).toContain('f');
});
it('accepts a cited audience tag containing storyline after masking', () => {
  const c = structuredClone(game);
  c.groundedFacts.push({ id: 'g1.audience_tags', field: 'audience_tags', text: 'Audience tag: storyline lovers', values: ['storyline lovers'] });
  expect(checkGrounding('game', { text: 'Audience tag: storyline lovers', factIds: ['g1.audience_tags'] }, [c], [ref]).ok).toBe(true);
});

it.each(['story about growing up', 'set in a gothic world', "you'll love it", 'half of this pick', 'most', 'majority', 'minority', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'dozen', 'Spookwave'])('rejects ungrounded words: %s', claim => {
  expect(check(`Qloo affinity 0.9; ${claim}`).rules).toContain('g');
});
const refs = [ref, { ...ref, entityId: 'ref2', name: 'Mock Orbital Book' }];
const rich = structuredClone(game);
rich.sharedTags = refs.map(r => ({ refEntityId: r.entityId, tags: ['tense', 'suspenseful', 'Survival'] }));
rich.groundedFacts = [
  { id: 'g1.affinity', field: 'affinity', text: 'Qloo affinity 0.91', values: ['0.91'] },
  ...refs.map((r, i): GroundedFact => ({ id: `g1.contribution.${i}`, field: 'contribution', text: `${i ? 53 : 47}% of this pick came from ${r.name}`, values: [`${i ? 53 : 47}%`, r.name] })),
  ...refs.map((r, i): GroundedFact => ({ id: `g1.shared_tags.${i}`, field: 'shared_tags', text: `Tags in common with ${r.name}: tense, suspenseful, Survival`, values: ['tense', 'suspenseful', 'Survival', r.name] })),
  { id: 'g1.emotional_tone', field: 'emotional_tone', text: 'emotional tone: melancholic, introspective, tense', values: ['melancholic', 'introspective', 'tense'] },
];
const richCheck = (text: string, factIds: string[]) => checkGrounding('game', { text, factIds }, [rich], refs);
it.each([
  ["Qloo affinity 0.91 is a strong match for your picks.", ['g1.affinity']],
  ['Mock Reference 1990: 47%, 53%: Mock Orbital Book.', ['g1.contribution.0', 'g1.contribution.1']],
  ['It shares the tags tense, suspenseful, and Survival with Mock Reference 1990.', ['g1.shared_tags.0']],
  ['Its mood is melancholic, introspective, and tense.', ['g1.emotional_tone']],
])('accepts grounded natural wording: %s', (text, ids) => expect(richCheck(text, ids)).toMatchObject({ ok: true }));
it('rejects swapped contribution percentages', () => {
  expect(richCheck('53% of this pick came from Mock Reference 1990, and 47% came from Mock Orbital Book.', ['g1.contribution.0', 'g1.contribution.1']).rules).toContain('b');
});
it('requires a tag rather than only the reference name', () => {
  expect(richCheck(ref.name, ['g1.shared_tags.0']).rules).toContain('b');
});
it.each(['both', 'either', 'each of', 'two titles', 'your picks'])('requires both shared-tag citations for %s', phrase => {
  expect(richCheck(`It shares tense with ${phrase}.`, ['g1.shared_tags.0']).rules).toContain('e');
  if (phrase === 'both') expect(richCheck(`It shares tense with ${phrase}.`, ['g1.shared_tags.0', 'g1.shared_tags.1']).ok).toBe(true);
});
it('requires a named reference to have its own citation', () => {
  expect(richCheck('Mock Orbital Book shares tense.', ['g1.shared_tags.0']).rules).toContain('e');
});
it('masks longest values first with NFKC, punctuation and case normalization', () => {
  expect(richCheck('It shares TENSE with Ｍｏｃｋ—Reference 1990.', ['g1.shared_tags.0']).ok).toBe(true);
});
it('checks every rich deterministic fallback under all rules', () => {
  for (const reason of fallbackReasons(rich)) expect(richCheck(reason.text, reason.factIds)).toMatchObject({ ok: true });
});
it('accepts a contribution number after its own reference', () => {
  expect(richCheck('Mock Reference 1990: 47%', ['g1.contribution.0']).ok).toBe(true);
});
it('rejects a distant percentage or an intervening reference', () => {
  expect(richCheck(`47% ${'with '.repeat(10)}Mock Reference 1990`, ['g1.contribution.0']).rules).toContain('b');
  expect(richCheck('47% Mock Orbital Book Mock Reference 1990', ['g1.contribution.0']).rules).toContain('b');
});
it('does not let an unrelated negation bypass both-reference sharing checks', () => {
  expect(richCheck('It is not Qloo; it shares tense with both.', ['g1.shared_tags.0']).rules).toContain('e');
});

it('accepts full and display reference names for masking, adjacency and naming checks', () => {
  const reference = { ...ref, name: 'Mock Title (Series Name, #1)' };
  const c = structuredClone(rich);
  c.groundedFacts = [
    { id: 'g1.contribution.0', field: 'contribution', text: '58% of this pick came from Mock Title', values: ['58%', 'Mock Title'] },
    { id: 'g1.shared_tags.0', field: 'shared_tags', text: 'Tags in common with Mock Title: tense', values: ['tense', 'Mock Title'] },
    rich.groundedFacts[0],
  ];
  for (const name of ['Mock Title', reference.name]) {
    for (const text of [`58% of this pick came from ${name}.`, `${name}: 58%`]) expect(checkGrounding('game', { text, factIds: ['g1.contribution.0'] }, [c], [reference]).ok).toBe(true);
    expect(checkGrounding('game', { text: `It shares tense with ${name}.`, factIds: ['g1.shared_tags.0'] }, [c], [reference]).ok).toBe(true);
    expect(checkGrounding('game', { text: name, factIds: ['g1.shared_tags.0'] }, [c], [reference]).rules).toContain('b');
    expect(checkGrounding('game', { text: `${name}: Qloo affinity 0.91`, factIds: ['g1.affinity'] }, [c], [reference]).rules).toContain('e');
  }
});
it('allows the requested neutral connectors while retaining forbidden-word exclusions', async () => {
  const { GROUNDING_CONNECTORS } = await import('../../lib/agent/grounding');
  for (const word of ['picks', 'steam', 'emotional', 'of', 'these', 'include', 'includes', 'listed', 'lists', 'known']) expect(GROUNDING_CONNECTORS).toContain(word);
  for (const word of ['not', 'no', 'does', 'neither', 'none', "don't", 'strong', 'match', 'pull', 'signal', 'suggests', 'story', 'plot', 'theme', 'about', 'world', 'similar', 'same', 'love', 'perfect', 'niche', 'gem', 'underrated', 'free', 'price', 'hardware']) expect(GROUNDING_CONNECTORS).not.toContain(word);
  expect(richCheck('These picks include Qloo affinity 0.91; it is known.', ['g1.affinity']).ok).toBe(true);
  expect(richCheck('On Steam; Qloo affinity 0.91.', ['g1.affinity']).rules).toContain('f');
});

it('accepts display aliases for contribution facts stored with full numeric titles', () => {
  const reference = { ...ref, name: 'Mock Title (Series Name, #1)' };
  const c = structuredClone(game);
  c.groundedFacts.push({ id: 'g1.contribution.0', field: 'contribution', text: `58% of this pick came from ${reference.name}`, values: ['58%', reference.name] });
  expect(checkGrounding('game', { text: '58% of this pick came from Mock Title.', factIds: ['g1.contribution.0'] }, [c], [reference]).ok).toBe(true);
});

const splitRefs = [{ ...ref, name: 'Ref One' }, { ...ref, entityId: 'ref2', name: 'Ref Two' }];
const splitGame = structuredClone(rich);
splitGame.groundedFacts = [
  ...splitRefs.map((r, i): GroundedFact => ({ id: `g1.shared_tags.${i}`, field: 'shared_tags', text: `Tags in common with ${r.name}: ${i ? 'tagB' : 'tagA'}, dark`, values: [i ? 'tagB' : 'tagA', ...(i ? [] : ['dark']), r.name] })),
  ...splitRefs.map((r, i): GroundedFact => ({ id: `g1.contribution.${i}`, field: 'contribution', text: `${i ? 58 : 42}% of this pick came from ${r.name}`, values: [`${i ? 58 : 42}%`, r.name] })),
];
const splitCheck = (text: string, factIds: string[]) => checkGrounding('game', { text, factIds }, [splitGame], splitRefs);
it('rejects tags attributed to references that do not share them', () => {
  expect(splitCheck('Shares the tags tagA and tagB with Ref One and Ref Two.', ['g1.shared_tags.0', 'g1.shared_tags.1']).rules).toContain('e');
  expect(splitCheck('Shares dark with Ref One and Ref Two, which gave 58%', ['g1.shared_tags.0', 'g1.contribution.1']).rules).toContain('e');
  expect(splitCheck('Shares tagA with Ref One.', ['g1.shared_tags.0']).ok).toBe(true);
  expect(splitCheck('Shares tagA.', ['g1.shared_tags.0']).ok).toBe(true);
  expect(splitCheck('Shares tagA.', ['g1.shared_tags.1']).rules).toContain('e');
  expect(splitCheck('This pick does not share tagA with Ref One.', ['g1.shared_tags.0']).rules).toContain('g');
});
it('binds each percentage to its nearest reference', () => {
  const ids = ['g1.contribution.0', 'g1.contribution.1'];
  expect(splitCheck('Ref One 58%, 42% Ref Two', ids).rules).toContain('b');
  expect(splitCheck('Ref One 42%, 58% Ref Two', ids).ok).toBe(true);
});
it.each([0.12, 0.79, 0.8, 0.91])('gates strong match on cited affinity %s', affinity => {
  const c = structuredClone(game);
  c.groundedFacts[0] = { id: 'g1.affinity', field: 'affinity', text: `Qloo affinity ${affinity}`, values: [String(affinity)] };
  expect(checkGrounding('game', { text: `Qloo affinity ${affinity} is a strong match`, factIds: ['g1.affinity'] }, [c], [ref]).ok).toBe(affinity >= 0.8);
  expect(checkGrounding('game', { text: 'Mock Studio is a strong match', factIds: ['g1.developer'] }, [c], [ref]).rules).toContain('g');
});

it.each(['Both your picks share tagA and tagB.', 'It shares tagA and tagB with your picks.', 'They share tagA and tagB.', 'Shares tagA and tagB.', 'These picks share tagA and tagB.'])('rejects unsupported collective tags: %s', text => {
  expect(splitCheck(text, ['g1.shared_tags.0', 'g1.shared_tags.1']).rules).toContain('e');
});
it('accepts a tag attributed only to its supporting reference', () => {
  expect(splitCheck('It shares tagA with Ref One.', ['g1.shared_tags.0']).ok).toBe(true);
});
it('does not bind a short reference title inside another word', () => {
  const references = [{ ...ref, name: 'Mock Peaks' }, { ...ref, entityId: 'ref2', name: 'It' }];
  const c = structuredClone(game);
  c.groundedFacts = references.map((r, i) => ({ id: `g1.contribution.${i}`, field: 'contribution', text: `${i ? 42 : 58}% from ${r.name}`, values: [`${i ? 42 : 58}%`, r.name] }));
  const factIds = c.groundedFacts.map(f => f.id);
  expect(checkGrounding('game', { text: '42% with Mock Peaks, 58% from It.', factIds }, [c], references).rules).toContain('b');
  expect(checkGrounding('game', { text: '58% with Mock Peaks, and It: 42%.', factIds }, [c], references).ok).toBe(true);
});

it.each(['steam_tags', 'audience_tags', 'emotional_tone'] as const)('checks sharing claims using cited %s values', field => {
  const c = structuredClone(splitGame);
  c.groundedFacts.push({ id: `g1.${field}`, field, text: 'Tags: Roguelike, Open World', values: ['Roguelike', 'Open World'] });
  for (const [text, factIds] of [
    ['Shares Roguelike with Ref One; 42% of this pick came from Ref One.', [`g1.${field}`, 'g1.contribution.0']],
    ['Shares Roguelike and tagA with Ref One.', [`g1.${field}`, 'g1.shared_tags.0']],
    ['Shares Roguelike.', [`g1.${field}`]],
  ] as const) {
    expect(checkGrounding('game', { text, factIds: [...factIds] }, [c], splitRefs).rules).toEqual(['e']);
  }
  expect(checkGrounding('game', { text: 'Steam tags include Open World.', factIds: [`g1.${field}`] }, [c], splitRefs).ok).toBe(true);
});
it('does not require a citation for a short reference name inside with', () => {
  const references = [{ ...ref, name: 'Ref One' }, { ...ref, entityId: 'ref2', name: 'It' }];
  expect(checkGrounding('game', { text: 'Shares tagA with Ref One.', factIds: ['g1.shared_tags.0'] }, [splitGame], references).ok).toBe(true);
});
it.each(['steam_tags', 'audience_tags', 'emotional_tone'] as const)('rejects reference-linked %s values without shared-tag evidence', field => {
  const c = structuredClone(splitGame);
  c.groundedFacts.push({ id: `g1.${field}`, field, text: 'Tags: Roguelike, Open World', values: ['Roguelike', 'Open World'] });
  for (const [text, factIds] of [
    ['Both are tagged Roguelike.', [`g1.${field}`]],
    ['Your picks are also tagged Roguelike.', [`g1.${field}`]],
    ['These picks are tagged Roguelike.', [`g1.${field}`]],
    ['Like Ref One (42% of this pick), it is tagged Roguelike.', [`g1.${field}`, 'g1.contribution.0']],
  ] as const) {
    expect(checkGrounding('game', { text, factIds: [...factIds] }, [c], splitRefs).rules).toContain('e');
  }
});
it('rejects a picks-wide claim for a tag only one reference shares', () => {
  expect(splitCheck('These picks share tagA.', ['g1.shared_tags.0']).rules).toContain('e');
});
it('requires a shared-tag citation even when an uncited fact supports the named tag', () => {
  const c = structuredClone(splitGame);
  c.groundedFacts.push({ id: 'g1.steam_tags', field: 'steam_tags', text: 'Tags: tagA', values: ['tagA'] });
  expect(checkGrounding('game', { text: 'Shares tagA with Ref One; 42% of this pick came from Ref One.', factIds: ['g1.steam_tags', 'g1.contribution.0'] }, [c], splitRefs).rules).toEqual(['e']);
});
