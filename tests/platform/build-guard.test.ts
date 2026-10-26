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
