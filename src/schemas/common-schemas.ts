import { z } from 'zod';

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').default(20).transform((value) => Math.min(value, 100)),
  offset: z.coerce.number().int().min(0, 'Offset must be at least 0').default(0),
  sort: z.enum(['created_at', 'updated_at', 'title']).optional(),
  q: z.string().trim().min(1).optional(),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID must be a positive integer'),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type IdParamInput = z.infer<typeof idParamSchema>;
