import type { NextGameInput } from './contracts';
/** User-entered titles, not response evidence. */
export const DEFAULT_EXAMPLE: NextGameInput = { references: ['Twin Peaks (1990, TV)', 'The Secret History (1992, book)'] };
export function normalizedInput(input: NextGameInput): string {
  const normalize = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return JSON.stringify([input.references.map(normalize), input.choices?.screen?.toLowerCase() ?? null, input.choices?.book?.toLowerCase() ?? null, input.familiarity ?? 'any']);
}
