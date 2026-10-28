export const normalize = (s: string) => s.replace(/[™®]/g, '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, ' ').trim();
/** Shorten one trailing Qloo qualifier for prose while retaining the full evidence name. */
export function displayName(ref: { name: string }): string {
  const short = ref.name.replace(/\s*\([^()]*\)\s*$/, '');
  return short.length >= 2 ? short : ref.name;
}
export function referenceDisplayNames(references: { name: string }[]): string[] {
  const shortened = references.map(displayName);
  return shortened.map((name, i) => shortened.some((other, j) => i !== j && normalize(other) === normalize(name)) ? references[i].name : name);
}
export const referenceNames = (ref: { name: string }, references: { name: string }[] = [ref]): string[] =>
  [...new Set([ref.name, referenceDisplayNames(references)[references.indexOf(ref)] ?? displayName(ref)])];
