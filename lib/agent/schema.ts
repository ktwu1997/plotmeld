import { z } from 'zod';
export const genreSchema = z.object({ id: z.string().regex(/^urn:tag:genre:media:[a-z0-9_]+$/), name: z.string().trim().min(1).max(200) }).strict();
export const comparablesBriefInputSchema = z.object({
  references: z.tuple([z.string().trim().min(1).max(200), z.string().trim().min(1).max(200)]),
  genre: genreSchema.optional(), genreQuery: z.string().trim().max(100).optional(),
  manuscriptNote: z.string().max(2000).optional(),
}).strict();
export const draftSchema = z.object({ candidates: z.array(z.object({
  bookId: z.string().uuid(), evidenceIds: z.array(z.string().uuid()).min(1).max(12),
  angle: z.enum(['shared_audience', 'leans_first_ref', 'leans_second_ref', 'genre_anchor']),
}).strict()).min(1).max(3) }).strict();
export type Draft = z.infer<typeof draftSchema>;
