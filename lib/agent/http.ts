import { BUDGET_MESSAGE, LlmBudgetError, QlooBudgetError } from './budget';
import { DEFAULT_EXAMPLE, normalizedInput } from '../default-example';
import { createHash } from 'node:crypto';
import { runNextGame, runtimeMode } from './runtime';
import { nextGameInputSchema } from './schema';
import { MemoryCache } from '../cache';
import type { RunNextGame } from '../contracts';

const counters = new MemoryCache(2000);
let active = 0;
const MAX_BODY_BYTES = 8192;
function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
}
export function createPost(agent: RunNextGame = runNextGame) {
  let example: { report: Awaited<ReturnType<RunNextGame>>; runAt: string; expires: number } | undefined;
  return async function POST(request: Request): Promise<Response> {
    let mode: 'live' | 'mock';
    try { mode = runtimeMode(); } catch { return json({ error: 'Service configuration unavailable' }, 503); }
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 100) ?? 'unknown';
    const key = createHash('sha256').update(ip).digest('hex');
    const now = Date.now();
    const counter = counters.get<{ count: number; reset: number }>(key) ?? { count: 0, reset: now + 60_000 };
    if (counter.count >= 5) return json({ error: 'Too many requests' }, 429, { 'Retry-After': '60' });
    counter.count++;
    counters.set(key, counter, Math.max(1, counter.reset - now));
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Expected application/json' }, 415);
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return json({ error: 'Brief too large' }, 413);
    let body: unknown;
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Invalid JSON body' }, 400);
    try {
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY_BYTES) { await reader.cancel(); return json({ error: 'Brief too large' }, 413); }
        chunks.push(value);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return json({ error: 'Invalid JSON body' }, 400); }
    finally { reader.releaseLock(); }
    const parsed = nextGameInputSchema.safeParse(body);
    if (!parsed.success) return json({ error: 'Expected one film or TV title and one book with bounded text' }, 400);
    const isExample = normalizedInput(parsed.data) === normalizedInput(DEFAULT_EXAMPLE);
    if (mode === 'live' && isExample && example && example.expires > now && request.headers.get('x-run-live') !== '1') return json(example.report, 200, { 'X-Qloo-Mode': mode, 'X-Example-Run-At': example.runAt, 'X-Example-Cached': '1' });
    if (active >= 3) return json({ error: 'Service busy; retry shortly' }, 429, { 'Retry-After': '5' });
    active++;
    try {
      const report = await agent(parsed.data);
      if (mode === 'live' && isExample && report.status === 'ok') example = { report: structuredClone(report), runAt: new Date().toISOString(), expires: Date.now() + 86_400_000 };
      return json(report, 200, { 'X-Qloo-Mode': mode });
    }
    catch (error) { if (error instanceof QlooBudgetError) return json({ error: error.message }, 503); if (error instanceof LlmBudgetError) return json({ error: BUDGET_MESSAGE }, 503); return json({ error: 'Agent unavailable' }, 503); }
    finally { active--; }
  };
}
