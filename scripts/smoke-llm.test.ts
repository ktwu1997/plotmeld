import { it, expect } from 'vitest';
import { createRunComparablesBrief } from '../lib/agent';
import { createLlmWriter, DEFAULT_LLM_MODEL, type LlmUsage } from '../lib/agent/llm';
import { createMockQlooClient } from '../lib/qloo/mock';

it('validates Anthropic output against fixture evidence', async () => {
  const model = process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
  const usage: LlmUsage[] = [];
  const safeModel = model.replace(/[^a-zA-Z0-9._:/-]/g, '');
  if (!process.env.ANTHROPIC_API_KEY || process.env.LLM_PROVIDER !== 'anthropic') {
    console.log(JSON.stringify({ status: 'FAIL', model: safeModel, usage, reason: 'LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY required' }));
    throw new Error('Anthropic smoke configuration missing');
  }
  // No retries; the agent allows at most two turns, and the process fuse agrees.
  process.env.LLM_MAX_CALLS_PER_PROCESS = '2';
  let pass = false;
  try {
    const report = await createRunComparablesBrief({ qloo: createMockQlooClient(), mode: 'mock', write: createLlmWriter(value => usage.push(value)) })({
      references: ['Prisoners', 'Normal People'],
      genre: { id: 'urn:tag:genre:media:psychological_thriller', name: 'Clockwork suspense (synthetic)' },
    });
    pass = report.status === 'ok';
  } catch { /* Never print provider errors, request headers, or response text. */ }
  console.log(JSON.stringify({ status: pass ? 'PASS' : 'FAIL', model: safeModel, usage }));
  expect(pass, 'Anthropic smoke failed').toBe(true);
}, 45000);
