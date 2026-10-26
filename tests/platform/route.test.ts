import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPost } from '../../lib/agent/http';
import { runtimeMode } from '../../lib/agent/runtime';
let ip = 0;
function request(body: string, headers: Record<string, string> = {}) { return new Request('http://localhost/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `test-${++ip}`, ...headers }, body }); }
afterEach(() => vi.unstubAllEnvs());
describe('POST brief', () => {
  it('validates tuple, bounded strings, unknown fields and malformed JSON', async () => {
    vi.stubEnv('QLOO_MODE', 'mock'); const run = vi.fn(); const post = createPost(run);
    for (const body of ['{', '{}', JSON.stringify({ references: ['one'] }), JSON.stringify({ references: ['one', 'two'], manuscriptNote: 'x'.repeat(2001) }), JSON.stringify({ references: ['one', 'two'], extra: true })]) expect((await post(request(body))).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    expect((await post(request('x'.repeat(8193)))).status).toBe(413);
    expect((await post(request('{}', { 'Content-Type': 'text/plain' }))).status).toBe(415);
  });
  it('returns report and explicit mode with no-store headers', async () => {
    vi.stubEnv('QLOO_MODE', 'mock');
    const brief = { references: ['one', 'two'] as [string, string] };
    const run = vi.fn().mockResolvedValue({ status: 'evidence_unavailable', input: brief, reason: 'No evidence', trace: [] });
    const response = await createPost(run)(request(JSON.stringify(brief)));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-qloo-mode')).toBe('mock'); expect((await response.json()).status).toBe('evidence_unavailable');
  });
  it('rate limits a repeated IP', async () => {
    vi.stubEnv('QLOO_MODE', 'mock'); const post = createPost(vi.fn());
    for (let i = 0; i < 5; i++) expect((await post(request('{}', { 'x-forwarded-for': 'fixed-test-ip' }))).status).toBe(400);
    expect((await post(request('{}', { 'x-forwarded-for': 'fixed-test-ip' }))).status).toBe(429);
  });
  it('refuses production mock mode unless explicitly allowed', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('QLOO_MODE', 'mock'); vi.stubEnv('DEMO_ALLOW_MOCK', '0');
    expect(runtimeMode).toThrow(); expect((await createPost()(request('{}'))).status).toBe(503);
    vi.stubEnv('DEMO_ALLOW_MOCK', '1'); expect(runtimeMode).toThrow();
    vi.stubEnv('QLOO_MODE', 'live'); expect(runtimeMode()).toBe('live');
    vi.stubEnv('QLOO_MODE', 'invalid'); expect(runtimeMode).toThrow();
  });
});

it('caps concurrent runs per process and frees slots after completion', async () => {
  vi.stubEnv('QLOO_MODE', 'mock');
  const release: Array<() => void> = [];
  const brief = { references: ['one', 'two'] as [string, string] };
  const run = vi.fn().mockImplementation(() => new Promise(resolve => release.push(() => resolve({ status: 'evidence_unavailable', input: brief, reason: 'No evidence', trace: [] }))));
  const post = createPost(run);
  const pending = Array.from({ length: 3 }, () => post(request(JSON.stringify(brief))));
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(3));
  expect((await post(request(JSON.stringify(brief)))).status).toBe(429);
  release.forEach(done => done()); await Promise.all(pending);
  const next = post(request(JSON.stringify(brief)));
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(4));
  release[3](); expect((await next).status).toBe(200);
});
