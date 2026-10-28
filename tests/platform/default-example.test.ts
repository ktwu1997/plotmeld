import { expect, it } from 'vitest';
import { DEFAULT_EXAMPLE, normalizedInput } from '../../lib/default-example';
it('qualifies the default book and separates familiarity cache keys', () => {
  expect(DEFAULT_EXAMPLE.references).toEqual(['Twin Peaks (1990, TV)', 'The Secret History (1992, book)']);
  expect(normalizedInput(DEFAULT_EXAMPLE)).toBe(normalizedInput({ ...DEFAULT_EXAMPLE, familiarity: 'any' }));
  const keys = ['any', 'less', 'least'].map(familiarity => normalizedInput({ ...DEFAULT_EXAMPLE, familiarity: familiarity as 'any' | 'less' | 'least' }));
  expect(new Set(keys).size).toBe(3);
});
