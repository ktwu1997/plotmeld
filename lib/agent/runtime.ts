import 'server-only';
import { createQlooClient } from '../qloo/client';
import { createMockQlooClient } from '../qloo/mock';
import { createRunNextGame } from './index';
import { createLlmWriter } from './llm';

export function runtimeMode(): 'mock' | 'live' {
  const mode = process.env.QLOO_MODE ?? 'mock';
  if (mode !== 'mock' && mode !== 'live') throw new Error('Invalid QLOO_MODE');
  if (process.env.NODE_ENV === 'production' && mode === 'mock') throw new Error('Production mock mode is disabled');
  return mode;
}
let liveClient: ReturnType<typeof createQlooClient> | undefined;
export const runNextGame = async (...args: Parameters<import('../contracts').RunNextGame>) => {
  const mode = runtimeMode();
  if (mode === 'mock') return createRunNextGame({ qloo: createMockQlooClient(), write: createLlmWriter(), mode })(...args);
  liveClient ??= createQlooClient({ apiKey: process.env.QLOO_API_KEY ?? '' });
  return createRunNextGame({ qloo: liveClient, write: createLlmWriter(), mode })(...args);
};
