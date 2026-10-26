export function parseDraftOutput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const raw = value.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1');
  return JSON.parse(raw);
}
