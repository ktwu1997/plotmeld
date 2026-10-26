import 'server-only';
import { createQlooClient } from '../qloo/client';
import { createMockQlooClient } from '../qloo/mock';
import { createRunComparablesBrief } from './index';
import { createLlmWriter } from './llm';

export function runtimeMode(): 'mock' | 'live' {
  const mode = process.env.QLOO_MODE ?? 'mock';
  if (mode !== 'mock' && mode !== 'live') throw new Error('Invalid QLOO_MODE');
  if (process.env.NODE_ENV === 'production' && mode === 'mock') throw new Error('Production mock mode is disabled');
  return mode;
}
let liveClient: ReturnType<typeof createQlooClient> | undefined;
export const runComparablesBrief = async (...args: Parameters<import('../contracts').RunComparablesBrief>) => {
  const mode = runtimeMode();
  if (mode === 'mock') return createRunComparablesBrief({ qloo: createMockQlooClient(), write: createLlmWriter(), mode })(...args);
  liveClient ??= createQlooClient({ apiKey: process.env.QLOO_API_KEY ?? '' });
  return createRunComparablesBrief({ qloo: liveClient, write: createLlmWriter(), mode })(...args);
};
