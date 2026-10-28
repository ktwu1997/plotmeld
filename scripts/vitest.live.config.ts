import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { alias: { 'server-only': fileURLToPath(new URL('../tests/platform/server-only.ts', import.meta.url)) } }, test: { environment: 'node', include: ['scripts/smoke-live.test.ts'], testTimeout: 180000 } });
