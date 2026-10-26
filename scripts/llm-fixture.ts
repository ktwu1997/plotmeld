import { createRunComparablesBrief } from '../lib/agent';
import { mockWriter, type DraftInput } from '../lib/agent/llm';
import { createMockQlooClient } from '../lib/qloo/mock';

/** Capture the actual first-turn payload produced by the agent's existing fixtures. */
export async function fixtureDraft(): Promise<DraftInput> {
  let draft: DraftInput | undefined;
  await createRunComparablesBrief({
    qloo: createMockQlooClient(), mode: 'mock',
    write: async input => { draft ??= input; return mockWriter(input); },
  })({ references: ['Prisoners', 'Normal People'], genre: { id: 'urn:tag:genre:media:psychological_thriller', name: 'Clockwork suspense (synthetic)' } });
  if (!draft) throw new Error('Fixture did not reach writer');
  return draft;
}
