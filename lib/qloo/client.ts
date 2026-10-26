import 'server-only';
import type { z } from 'zod';
import { MemoryCache, type Cache } from '../cache';
import { searchParams, tagsParams, insightsParams, searchResponse, tagsResponse, insightsResponse, type QlooClient, type ObserveQloo } from './schemas';

export interface ClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  cache?: Cache;
  timeoutMs?: number;
  baseUrl?: string;
}
/** Deliberately small allowlist. No user-selected URLs, headers, or arbitrary parameters. */
export function createQlooClient(options: ClientOptions): QlooClient {
  const base = new URL(options.baseUrl ?? process.env.QLOO_API_BASE_URL ?? 'https://hackathon.api.qloo.com');
  if (base.protocol !== 'https:' || !['hackathon.api.qloo.com', 'api.qloo.com'].includes(base.hostname) || base.username || base.password || base.port || base.pathname !== '/' || base.search || base.hash) throw new Error('Invalid QLOO_API_BASE_URL');
  const cache = options.cache ?? new MemoryCache();
  const request = options.fetch ?? fetch;
  async function get<T>(path: string, params: Record<string, string | number | undefined>, schema: z.ZodType<T, unknown>, observe?: ObserveQloo): Promise<T> {
    if (!options.apiKey) throw new Error('Qloo credential missing');
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params).sort()) if (value !== undefined) query.set(key, String(value));
    const key = `${path}?${query}`;
    let notified = false;
    const result = await cache.dedupe(key, async () => {
      const hit = cache.get<T>(key);
      if (hit !== undefined) {
        const parsed = schema.parse(hit);
        notified = true;
        observe?.({ attempt: 1, ok: true, ms: 0, cache: 'hit' });
        return parsed;
      }
      const start = Date.now();
      try {
        const response = await request(`${base.origin}${key}`, { headers: { 'X-Api-Key': options.apiKey }, signal: AbortSignal.timeout(options.timeoutMs ?? 12000), cache: 'no-store', redirect: 'error' });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`Qloo HTTP ${response.status}`);
        }
        const parsed = schema.parse(await response.json());
        cache.set(key, parsed, 60_000);
        notified = true;
        observe?.({ attempt: 1, ok: true, ms: Date.now() - start, cache: 'miss' });
        return parsed;
      } catch (error) {
        notified = true;
        observe?.({ attempt: 1, ok: false, ms: Date.now() - start, cache: 'miss', error: 'Qloo request failed or response invalid' });
        throw error;
      }
    });
    if (!notified) observe?.({ attempt: 1, ok: true, ms: 0, cache: 'deduplicated' });
    return result;
  }
  return {
    search: (params, observe) => get('/search', searchParams.parse(params), searchResponse, observe),
    tags: (params, observe) => get('/v2/tags', tagsParams.parse(params), tagsResponse, observe),
    insights: (params, observe) => get('/v2/insights', insightsParams.parse(params), insightsResponse, observe),
  };
}
