import { afterEach, expect, it, vi } from 'vitest';
import { runNextGame, nextGameReportSchema } from '../../lib/features/client';
afterEach(() => vi.restoreAllMocks());
it.each(['needs_choice', 'insufficient_candidates', 'evidence_unavailable'])('accepts boundary state %s', status => {
  const base = { input: { references: ['Mock Screen', 'Mock Text'] }, trace: [] };
  const data = status === 'needs_choice' ? { ...base, status, choices: [{ slot: 'screen', query: 'Mock Screen', reason: 'ambiguous', options: [{ entityId: '00000000-0000-0000-0000-000000000001', name: 'Mock Screen', type: 'urn:entity:movie', label: 'Mock Screen (film)' }] }] } : { ...base, status, found: 0, reason: 'Unavailable' };
  expect(nextGameReportSchema.safeParse(data).success).toBe(true);
});
it('rejects malformed responses and failed requests', async () => {
  const input = { references: ['Mock Screen', 'Mock Text'] as [string, string] };
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ status: 'ok' })).mockResolvedValueOnce(new Response('', { status: 500 }));
  await expect(runNextGame(input)).rejects.toThrow('invalid evidence report'); await expect(runNextGame(input)).rejects.toThrow('could not finish');
});

it('names the per-IP rate limit instead of blaming the connection', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: 'Too many requests' }, { status: 429 }));
  await expect(runNextGame({ references: ['Mock Screen', 'Mock Text'] })).rejects.toThrow('Too many searches right now');
});

it.each(['any', 'less', 'least'])('accepts familiarity %s through the client boundary', async familiarity => {
  const input = { references: ['Mock Screen', 'Mock Text'], familiarity };
  const report = { status: 'insufficient_candidates', input, trace: [], found: 0, reason: 'No games' };
  expect(nextGameReportSchema.safeParse(report).success).toBe(true);
  expect(nextGameReportSchema.safeParse({ ...report, input: { ...input, familiarity: 'other' } }).success).toBe(false);
});

it('sends familiarity in the client request body', async () => {
  const input = { references: ['Mock Screen', 'Mock Text'] as [string, string], familiarity: 'least' as const };
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ status: 'insufficient_candidates', input, trace: [], found: 0, reason: 'No games' }));
  expect((await runNextGame(input)).input).toEqual(input);
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual(input);
});
