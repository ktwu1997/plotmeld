import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it('rejects production mock builds before loading Next', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('QLOO_MODE', 'mock'); vi.stubEnv('DEMO_ALLOW_MOCK', '0');
  await expect(import('../../next.config')).rejects.toThrow('Production mock mode');
});
it('rejects the legacy production mock override', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('QLOO_MODE', 'mock'); vi.stubEnv('DEMO_ALLOW_MOCK', '1');
  await expect(import('../../next.config')).rejects.toThrow('Production mock mode');
});
it('rejects production mock builds when QLOO_MODE is unset', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('QLOO_MODE', undefined);
  await expect(import('../../next.config')).rejects.toThrow('Production mock mode');
});
it.each([{ CI: 'true' }, { VERCEL: '1', VERCEL_ENV: 'production' }, { CI: 'true', VERCEL: '1', VERCEL_ENV: 'preview' }])('has no CI or Vercel bypass for production mock builds (%o)', async extra => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('QLOO_MODE', 'mock'); vi.stubEnv('DEMO_ALLOW_MOCK', '1');
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
  await expect(import('../../next.config')).rejects.toThrow('Production mock mode');
});
it('allows the live-mode production build used by CI and Vercel', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('QLOO_MODE', 'live'); vi.stubEnv('CI', 'true');
  await expect(import('../../next.config')).resolves.toBeDefined();
});
it('refuses production mock mode at runtime even inside CI', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('QLOO_MODE', 'mock'); vi.stubEnv('CI', 'true'); vi.stubEnv('DEMO_ALLOW_MOCK', '1');
  const { runtimeMode } = await import('../../lib/agent/runtime');
  expect(runtimeMode).toThrow('Production mock mode');
});
it('CI builds in live mode and never sets a mock override', () => {
  const workflow = readFileSync(fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)), 'utf8');
  expect(workflow).toMatch(/- run: npm run build\n\s+env:\n\s+QLOO_MODE: live\n/);
  expect(workflow).not.toMatch(/DEMO_ALLOW_MOCK/);
});
