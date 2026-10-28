import { afterEach, expect, it, vi } from 'vitest';
import { createQlooClient } from '../../lib/qloo/client';
import { createPost } from '../../lib/agent/http';
import { QlooBudgetError } from '../../lib/agent/budget';
afterEach(() => vi.unstubAllEnvs());
it('stops Qloo process calls before fetch and returns a safe 503', async () => {
  vi.stubEnv('QLOO_MAX_CALLS_PER_PROCESS', '0'); const fetch = vi.fn();
  await expect(createQlooClient({ apiKey: 'test-only', fetch }).search({ query: 'Mock Screen' })).rejects.toBeInstanceOf(QlooBudgetError);
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv('QLOO_MODE', 'live');
  const response = await createPost(async () => { throw new QlooBudgetError(); })(new Request('http://localhost/api/agent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': 'qloo-fuse-test' }, body: JSON.stringify({ references: ['Mock Screen', 'Mock Text'] }) }));
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'Demo Qloo budget reached; try later' });
});
