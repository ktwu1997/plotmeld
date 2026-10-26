import { expect, it } from 'vitest';

it('completes one live agent request with a mock LLM', async () => {
  expect(process.env.QLOO_MODE).toBe('live');
  expect(process.env.LLM_PROVIDER).toBe('mock');
  const original = globalThis.fetch;
  let count = 0;
  let last = 0;
  let stopped = false;
  globalThis.fetch = async (input, init) => {
    if (stopped || count >= 8) throw new Error('Live smoke request budget or stop condition reached');
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1150 - (Date.now() - last))));
    last = Date.now(); count++;
    const response = await original(input, init).catch(error => { console.log(`${new URL(String(input)).pathname}: network failure (${error instanceof Error ? error.name : 'unknown'})`); throw error; });
    const endpoint = new URL(String(input)).pathname;
    console.log(`${endpoint}: HTTP ${response.status}`);
    if ([401, 403, 429].includes(response.status)) stopped = true;
    return response;
  };
  try {
    const { runComparablesBrief } = await import('../lib/agent/runtime');
    const report = await runComparablesBrief({ references: ['Prisoners (2013)', 'Normal People (2020, TV)'], genre: { id: 'urn:tag:genre:media:psychological_thriller', name: 'Clockwork suspense (synthetic)' } });
    console.log(`smoke:live ${report.status === 'ok' ? 'PASS' : 'FAIL'}; requests=${count}; LLM=mock`);
    expect(report.status).toBe('ok');
    expect(report.trace.some(t => t.tool === 'llm.mock')).toBe(true);
    if (process.env.SMOKE_REPORT_OUT) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(process.env.SMOKE_REPORT_OUT, JSON.stringify(report, null, 2) + '\n');
    }
    if (report.status === 'ok') {
      expect(report.candidates.length).toBeGreaterThanOrEqual(2);
      expect(report.trace.every(t => t.ok)).toBe(true);
      expect(report.candidates.every(p => p.book.type === 'urn:entity:book' && p.book.affinity !== undefined && p.contributions.length > 0)).toBe(true);
    }
  } finally { globalThis.fetch = original; }
});
