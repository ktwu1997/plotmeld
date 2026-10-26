import 'server-only';
import type { QlooClient } from './schemas';
/** Synthetic offline adapter; never contains recorded response evidence. */
export function createMockQlooClient(): QlooClient {
  return {
    async search(params) { return { results: [{ entity_id: '00000000-0000-4000-8000-000000000001', name: params.query, types: ['urn:entity:movie'] }] }; },
    async tags() { return { results: { tags: [] } }; },
    async insights() { return { results: { entities: [] } }; },
  };
}
