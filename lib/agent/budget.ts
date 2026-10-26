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
