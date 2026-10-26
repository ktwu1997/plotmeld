import { z } from 'zod';

export const entityType = z.enum(['urn:entity:artist', 'urn:entity:album', 'urn:entity:book', 'urn:entity:brand', 'urn:entity:destination', 'urn:entity:movie', 'urn:entity:person', 'urn:entity:place', 'urn:entity:podcast', 'urn:entity:tv_show', 'urn:entity:video_game', 'urn:entity:videogame', 'urn:entity:locality']);
// Search embeds tag_id; tag search and Insights return id. Normalize at the boundary.
export const tagSchema = z.object({ id: z.string().min(1).optional(), tag_id: z.string().min(1).optional(), name: z.string().min(1), type: z.string().optional() }).passthrough()
  .refine(tag => Boolean(tag.id || tag.tag_id), 'Missing tag identifier')
  .transform(tag => ({ ...tag, id: tag.id ?? tag.tag_id! }));
const contribution = z.object({ entity_id: z.string().uuid(), score: z.number().finite() }).passthrough();
const bookExplainability = z.object({ 'signal.interests.entities': z.array(contribution).optional() }).passthrough();
const responseQuery = z.object({ explainability: z.object({ 'signal.interests.entities': z.object({ effect_on_top10: z.array(z.object({ entity_id: z.string().uuid(), avg_score: z.number().finite() }).passthrough()).optional(), effect_on_top10_recs: z.array(z.object({ entity_id: z.string().uuid(), avg_score: z.number().finite() }).passthrough()).optional() }).passthrough().optional() }).passthrough().optional() }).passthrough();
export const entitySchema = z.object({
  entity_id: z.string().uuid(), name: z.string().min(1), types: z.array(entityType).min(1).optional(), subtype: entityType.optional(),
  disambiguation: z.string().optional(), popularity: z.number().finite().optional(),
  external: z.object({ goodreads: z.array(z.object({ user_rating: z.number().finite().optional(), user_ratings_count: z.number().finite().optional() }).passthrough()).optional() }).passthrough().optional(),
  properties: z.object({ title: z.string().optional(), publisher: z.string().optional(), publication_year: z.number().optional(), release_year: z.number().optional(), isbn13: z.string().optional(), image: z.object({ url: z.string().url() }).passthrough().optional() }).passthrough().optional(),
  tags: z.array(tagSchema).optional(),
  query: z.object({ affinity: z.number().finite().optional(), explainability: bookExplainability.optional() }).passthrough().optional(),
}).passthrough().refine(entity => Boolean(entity.types || entity.subtype), 'Missing entity type')
  .transform(entity => ({ ...entity, types: entity.types ?? [entity.subtype!] }));
export const searchResponse = z.object({ results: z.array(entitySchema) }).passthrough();
export const tagsResponse = z.object({ results: z.object({ tags: z.array(tagSchema) }).passthrough() }).passthrough();
export const insightsResponse = z.object({ results: z.object({ entities: z.array(entitySchema) }).passthrough(), query: responseQuery.optional() }).passthrough();
export type Entity = z.infer<typeof entitySchema>;
export type Tag = z.infer<typeof tagSchema>;
const ids = z.string().max(1000).refine(value => value.split(',').every(id => z.string().uuid().safeParse(id).success), 'Expected comma-separated Qloo entity UUIDs');
const tags = z.string().min(1).max(2000).refine(value => value.split(',').every(id => /^urn:tag:[a-zA-Z0-9_:.-]+$/.test(id)), 'Expected Qloo tag URNs');
export const searchParams = z.object({ query: z.string().trim().min(1).max(200), types: z.string().refine(v => v.split(/[|,]/).every(t => ['urn:entity:movie', 'urn:entity:tv_show', 'urn:entity:book'].includes(t))).optional(), take: z.number().int().min(1).max(10).optional() }).strict();
export const tagsParams = z.object({ 'filter.query': z.string().trim().min(1).max(200), 'filter.parents.types': z.literal('urn:entity:book').optional(), take: z.number().int().min(1).max(10).optional() }).strict();
export const insightsParams = z.object({ 'filter.type': z.enum(['urn:entity:brand', 'urn:entity:book']), 'filter.tags': tags.optional(), 'filter.popularity.min': z.number().min(0).max(1).optional(), 'feature.explainability': z.literal('true').optional(), 'signal.interests.entities': ids, 'signal.interests.tags': tags.optional(), take: z.number().int().min(1).max(10).optional() }).strict().refine(p => p['filter.type'] !== 'urn:entity:book' || Boolean(p['filter.tags'] && /^urn:tag:genre:media:[a-z0-9_]+$/.test(p['filter.tags'])), 'Books require a book genre tag');
export interface QlooAttempt { attempt: number; ok: boolean; ms: number; cache: 'miss' | 'hit' | 'deduplicated'; error?: string }
export type ObserveQloo = (attempt: QlooAttempt) => void;
export interface QlooClient {
  search(params: z.infer<typeof searchParams>, observe?: ObserveQloo): Promise<z.infer<typeof searchResponse>>;
  tags(params: z.infer<typeof tagsParams>, observe?: ObserveQloo): Promise<z.infer<typeof tagsResponse>>;
  insights(params: z.infer<typeof insightsParams>, observe?: ObserveQloo): Promise<z.infer<typeof insightsResponse>>;
}
