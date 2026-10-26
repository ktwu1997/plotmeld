import { it, expect } from 'vitest';
import { DRAFT_SYSTEM_PROMPT } from '../lib/agent/llm';
import { fixtureDraft } from './llm-fixture';

it('measures the real fixture draft without network calls', async () => {
  const chars = JSON.stringify(await fixtureDraft()).length;
  console.log(JSON.stringify({ draftChars: chars, draftTokensApprox: Math.ceil(chars / 4), systemChars: DRAFT_SYSTEM_PROMPT.length, systemTokensApprox: Math.ceil(DRAFT_SYSTEM_PROMPT.length / 4), totalTokensApprox: Math.ceil((chars + DRAFT_SYSTEM_PROMPT.length) / 4) }));
  expect(chars).toBeGreaterThan(0);
});
