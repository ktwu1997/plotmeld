import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ esbuild: { jsx: 'automatic' }, resolve: { alias: { 'server-only': fileURLToPath(new URL('./tests/platform/server-only.ts', import.meta.url)), '@': fileURLToPath(new URL('./', import.meta.url)) } }, test: { setupFiles: ['./tests/setup.ts'], environment: 'node', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] } });
