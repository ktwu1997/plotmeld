import type { NextConfig } from 'next';
if (process.env.QLOO_MODE && !['mock', 'live'].includes(process.env.QLOO_MODE)) throw new Error('Invalid QLOO_MODE');
if (process.env.NODE_ENV === 'production' && (process.env.QLOO_MODE ?? 'mock') === 'mock') {
  throw new Error('Production mock mode is disabled; use QLOO_MODE=live for a genuine Qloo run.');
}
const config: NextConfig = { poweredByHeader: false };
export default config;
