import { afterEach, expect, it, vi } from 'vitest';
import { runNextGame, nextGameReportSchema } from '../../lib/features/client';
import { createRunNextGame } from '../../lib/agent';
import { createMockQlooClient } from '../../lib/qloo/mock';
import { mockWriter } from '../../lib/agent/llm';
export const input = { references: ['Mock Screen', 'Mock Text'] as [string, string] };
export const report = () => createRunNextGame({ qloo: createMockQlooClient(), write: mockWriter })(input);
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it('validates the browser request and report', async () => {
  const data = await report(); expect(nextGameReportSchema.safeParse(data).success).toBe(true);
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(data)); expect(await runNextGame(input)).toEqual(data);
  expect(fetch).toHaveBeenCalledWith('/api/agent', expect.objectContaining({ body: JSON.stringify(input), signal: expect.any(AbortSignal) }));
});
it.each(['source', 'reference', 'contribution', 'effect', 'duplicate', 'fact', 'citation', 'llm', 'type'])('rejects invalid provenance %s', async kind => {
  const data = await report(); if (data.status !== 'ok') throw Error(); const c = data.candidates[0];
  if (kind === 'source') c.game.sourceCall = data.references[0].sourceCall;
  if (kind === 'reference') data.references[0].sourceCall = c.game.sourceCall;
  if (kind === 'contribution') c.contributions.push({ refEntityId: c.game.entityId, score: 0.5 });
  if (kind === 'effect') data.refEffect.push({ refEntityId: c.game.entityId, score: 0.5 });
  if (kind === 'duplicate') data.candidates[1].game.entityId = c.game.entityId;
  if (kind === 'fact') c.groundedFacts.push(c.groundedFacts[0]);
  if (kind === 'citation') c.reasons[0].factIds = ['g2.affinity'];
  if (kind === 'llm') data.trace.filter(t => t.tool.startsWith('llm')).forEach(t => t.ok = false);
  if (kind === 'type') c.game.type = 'bad';
  expect(nextGameReportSchema.safeParse(data).success).toBe(false);
});
it('aborts at sixty seconds', async () => {
  vi.useFakeTimers(); vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
  const pending = expect(runNextGame(input)).rejects.toThrow('60 seconds'); await vi.advanceTimersByTimeAsync(60_000); await pending;
});
