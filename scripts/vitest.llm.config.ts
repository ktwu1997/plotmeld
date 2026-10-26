import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { 'server-only': fileURLToPath(new URL('../tests/platform/server-only.ts', import.meta.url)) } },
  test: { environment: 'node', include: [process.env.LLM_MEASURE === '1' ? 'scripts/measure-llm.test.ts' : 'scripts/smoke-llm.test.ts'] },
});
