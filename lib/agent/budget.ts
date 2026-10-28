export const BUDGET_MESSAGE = 'Demo LLM budget reached for this month; cached example still available';
export class LlmBudgetError extends Error {
  constructor() { super(BUDGET_MESSAGE); }
}
export function isSpendLimit(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { statusCode?: number; data?: { error?: { type?: string; message?: string } } };
  return e.statusCode === 400 && e.data?.error?.type === 'invalid_request_error'
    && e.data.error.message?.startsWith('You have reached your specified') === true;
}
export class QlooBudgetError extends Error {
  constructor() { super('Demo Qloo budget reached; try later'); }
}
let qlooCalls = 0;
export function reserveQlooCall() {
  const limit = Number(process.env.QLOO_MAX_CALLS_PER_PROCESS ?? '600');
  if (!Number.isSafeInteger(limit) || limit < 0) throw Error('Invalid QLOO_MAX_CALLS_PER_PROCESS');
  if (qlooCalls >= limit) throw new QlooBudgetError();
  qlooCalls++;
}
