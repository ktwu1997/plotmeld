import type { ComparablesBriefInput } from './contracts';
/** User-entered reference titles, not response evidence. */
export const DEFAULT_EXAMPLE: ComparablesBriefInput = { references: ['Prisoners', 'Normal People'], genreQuery: 'psychological thriller' };
export function normalizedInput(input: ComparablesBriefInput): string {
  const normalize = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return JSON.stringify([input.references.map(normalize), input.genre ? [input.genre.id, normalize(input.genre.name)] : null, normalize(input.genreQuery ?? ''), input.manuscriptNote ?? '']);
}
