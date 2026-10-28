import { z } from 'zod';
import { guidSchema } from '../qloo/schemas';
export const nextGameInputSchema = z.object({
  references: z.tuple([z.string().trim().min(1).max(200), z.string().trim().min(1).max(200)]),
  familiarity: z.enum(['any', 'less', 'least']).optional(),
  choices: z.object({ screen: guidSchema.optional(), book: guidSchema.optional() }).strict().optional(),
}).strict();
export const draftSchema = z.object({ games: z.array(z.object({
  gameId: z.enum(['g1', 'g2', 'g3']), reasons: z.array(z.object({ factIds: z.array(z.string()).min(1), text: z.string().trim().min(1).max(200) }).strict()).min(1).max(3),
}).strict()).max(3) }).strict();
