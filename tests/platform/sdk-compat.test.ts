import { afterEach, expect, it, vi } from 'vitest';
import { createLlmWriter, DRAFT_SYSTEM_PROMPT } from '../../lib/agent/llm';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('runs the real Anthropic and AI SDKs with the existing text and usage contract offline', async () => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
  vi.stubEnv('LLM_MODEL', 'claude-3-haiku-20240307');
  vi.stubEnv('LLM_MAX_CALLS_PER_PROCESS', '200');
  vi.stubEnv('LLM_MAX_OUTPUT_TOKENS', '2000');
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-3-haiku-20240307',
    content: [{ type: 'text', text: '{"games":[]}' }],
    stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 123, output_tokens: 12 },
  }));
  const usage = vi.fn();
  const input = { references: ['Mock Screen', 'Mock Text'], games: [] };
  expect(await createLlmWriter(usage)(input)).toBe('{"games":[]}');
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
  const body = JSON.parse(init?.body as string);
  expect(body).toMatchObject({
    model: 'claude-3-haiku-20240307', max_tokens: 2000,
    messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify(input) }] }],
  });
  expect(body.system).toEqual([{ type: 'text', text: DRAFT_SYSTEM_PROMPT }]);
  expect(body.output_config).toEqual({ effort: 'low' });
  expect(body.temperature).toBeUndefined();
  expect(usage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 123, outputTokens: 12 }));
});

it('defaults the output cap to 4000 so model thinking cannot truncate the JSON', async () => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
  vi.stubEnv('LLM_MAX_CALLS_PER_PROCESS', '200');
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-3-haiku-20240307',
    content: [{ type: 'text', text: '{"games":[]}' }], stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }));
  await createLlmWriter()({ references: ['Mock Screen', 'Mock Text'], games: [] });
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).max_tokens).toBe(4000);
});
