import { afterEach, expect, it, vi } from 'vitest';
const input = { references: ['Mock Screen', 'Mock Text'], games: [] };
const sdk = vi.hoisted(() => ({ generate: vi.fn(), provider: vi.fn() }));
vi.mock('ai', () => ({ generateText: sdk.generate }));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => sdk.provider,
}));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });
it('defaults to deterministic mock output without network access', async () => {
  vi.stubEnv('LLM_PROVIDER', 'mock');
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
  try {
    const { createLlmWriter } = await import('../../lib/agent/llm');
    expect(await createLlmWriter()(input)).toEqual({ games: [] });
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});
it('shares a hard call cap across writer instances', async () => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-only'); vi.stubEnv('LLM_MAX_CALLS_PER_PROCESS', '0');
  const { createLlmWriter } = await import('../../lib/agent/llm');
  await expect(createLlmWriter()(input)).rejects.toThrow('Demo LLM budget');
});
it.each(['invalid', 'opencode'])('rejects invalid provider %s and invalid caps', async invalidProvider => {
  const { createLlmWriter } = await import('../../lib/agent/llm');
  vi.stubEnv('LLM_PROVIDER', invalidProvider);
  expect(createLlmWriter).toThrow('Invalid LLM_PROVIDER');
  vi.stubEnv('LLM_PROVIDER', 'anthropic'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-only'); vi.stubEnv('LLM_MAX_CALLS_PER_PROCESS', 'NaN');
  await expect(createLlmWriter()(input)).rejects.toThrow('Invalid LLM_MAX_CALLS_PER_PROCESS');
});
it('requires an explicit anthropic credential before calling the network', async () => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic'); vi.stubEnv('ANTHROPIC_API_KEY', '');
  const { createLlmWriter } = await import('../../lib/agent/llm');
  await expect(createLlmWriter()(input)).rejects.toThrow('ANTHROPIC_API_KEY missing');
});

it.each([undefined, 'mock', 'anthropic'])('identifies the selected writer provider %s', async provider => {
  vi.stubEnv('LLM_PROVIDER', provider);
  const { createLlmWriter } = await import('../../lib/agent/llm');
  expect(createLlmWriter().tool).toBe(provider === 'anthropic' ? 'llm' : 'llm.mock');
});

it('mock calls never consume even a zero process fuse', async () => {
  vi.stubEnv('LLM_PROVIDER', 'mock'); vi.stubEnv('LLM_MAX_CALLS_PER_PROCESS', '0');
  const { createLlmWriter } = await import('../../lib/agent/llm');
  await createLlmWriter()(input); await createLlmWriter()(input);
});
it('reads the legacy fuse name as fallback', async () => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
  vi.stubEnv('LLM_MAX_CALLS_PER_PROCESS', undefined); vi.stubEnv('LLM_MAX_CALLS_PER_DAY', '0');
  const { createLlmWriter } = await import('../../lib/agent/llm');
  await expect(createLlmWriter()(input)).rejects.toThrow('Demo LLM budget');
});

it.each(['0', '4001', '1.5', 'NaN', '', 'Infinity'])('rejects invalid output cap %s before SDK calls', async cap => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
  vi.stubEnv('LLM_MAX_OUTPUT_TOKENS', cap);
  const { createLlmWriter } = await import('../../lib/agent/llm');
  await expect(createLlmWriter()(input)).rejects.toThrow('Invalid LLM_MAX_OUTPUT_TOKENS');
  expect(sdk.generate).not.toHaveBeenCalled();
});
it.each([undefined, '1', '4000'])('passes output cap %s and safety settings through', async cap => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
  vi.stubEnv('LLM_MAX_OUTPUT_TOKENS', cap); vi.stubEnv('LLM_MODEL', undefined);
  sdk.generate.mockResolvedValue({ text: '{"games":[]}', usage: { inputTokens: 123, outputTokens: 12 } });
  const { createLlmWriter, DRAFT_SYSTEM_PROMPT } = await import('../../lib/agent/llm');
  const usage = vi.fn();
  expect(await createLlmWriter(usage)(input)).toBe('{"games":[]}');
  expect(sdk.provider).toHaveBeenCalledWith('claude-haiku-5-5');
  expect(sdk.generate).toHaveBeenCalledWith(expect.objectContaining({
    maxOutputTokens: cap === undefined ? 4000 : Number(cap), maxRetries: 0,
    system: DRAFT_SYSTEM_PROMPT, prompt: JSON.stringify(input), abortSignal: expect.any(AbortSignal),
  }));
  expect(usage).toHaveBeenCalledWith({ inputTokens: 123, outputTokens: 12 });
});
it('honors model override and shares consumed calls across writers', async () => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
  vi.stubEnv('LLM_MODEL', 'custom-model'); vi.stubEnv('LLM_MAX_CALLS_PER_PROCESS', '1');
  sdk.generate.mockResolvedValue({ text: '{}', usage: {} });
  const { createLlmWriter } = await import('../../lib/agent/llm');
  await createLlmWriter()(input);
  expect(sdk.provider).toHaveBeenCalledWith('custom-model');
  await expect(createLlmWriter()(input)).rejects.toThrow('Demo LLM budget');
  expect(sdk.generate).toHaveBeenCalledTimes(1);
});
it('accepts only JSON payloads with the existing parser and strict schema', async () => {
  const { parseDraftOutput } = await import('../../lib/agent/grounding');
  const { draftSchema } = await import('../../lib/agent/schema');
  const json = '{"games":[{"gameId":"g1","reasons":[{"factIds":["g1.affinity"],"text":"Qloo affinity 0.9"}]}]}';
  expect(draftSchema.safeParse(parseDraftOutput(json)).success).toBe(true);
  expect(draftSchema.safeParse(parseDraftOutput('```json\n' + json + '\n```')).success).toBe(true);
  expect(() => parseDraftOutput('Here is JSON: ' + json)).toThrow();
  expect(draftSchema.safeParse(parseDraftOutput('{"games":[],"extra":true}')).success).toBe(false);
});
it('maps provider monthly spend exhaustion to a safe budget error', async () => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
  sdk.generate.mockRejectedValue({ statusCode: 400, data: { error: { type: 'invalid_request_error', message: 'You have reached your specified monthly spend limit' } } });
  const { createLlmWriter } = await import('../../lib/agent/llm');
  await expect(createLlmWriter()(input)).rejects.toThrow('Demo LLM budget reached for this month; cached example still available');
});

it('requires verbatim display names and JSON only, with invented field examples', async () => {
  const { DRAFT_SYSTEM_PROMPT } = await import('../../lib/agent/llm');
  expect(DRAFT_SYSTEM_PROMPT).toContain('exact reference display names in references verbatim');
  expect(DRAFT_SYSTEM_PROMPT).toContain('Return JSON only, no markdown fences.');
  for (const field of ['affinity', 'contribution', 'shared_tags', 'steam_tags', 'audience_tags', 'emotional_tone', 'developer', 'publisher', 'platforms']) expect(DRAFT_SYSTEM_PROMPT).toContain(`${field}: "`);
  expect(DRAFT_SYSTEM_PROMPT).toContain('58% of this pick came from Mock Book.');
});
