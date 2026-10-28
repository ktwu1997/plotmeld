import 'server-only';
import type { QlooClient } from './schemas';
/** Synthetic offline adapter; never recorded response evidence. */
export function createMockQlooClient(): QlooClient {
  return {
    async search(params) { const screen = params.types?.includes('movie'); return { results: [{ entity_id: screen ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002', name: params.query, types: [screen ? 'urn:entity:movie' : 'urn:entity:book'] }] }; },
    async tags() { return { results: { tags: [] } }; },
    async insights() { return { results: { entities: [1, 2, 3].map(n => ({ entity_id: `00000000-0000-4000-8000-00000000000${n + 2}`, name: `Mock Game ${['One', 'Two', 'Three'][n - 1]}`, types: ['urn:entity:videogame' as const], properties: { developer: 'Mock Studio', platforms: ['Mock Console'], steam_tags: ['tag-alpha'] }, query: { affinity: 0.9 } })) } }; },
  };
}
