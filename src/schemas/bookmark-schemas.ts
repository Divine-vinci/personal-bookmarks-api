import { z } from 'zod';

const tagSchema = z.string().trim().min(1).transform((value) => value.toLowerCase());

const bookmarkFields = {
  url: z.string().min(1, 'URL is required').max(2000, 'URL must be 2000 characters or fewer').url('Invalid url: must be a valid URL'),
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or fewer'),
  description: z.union([
    z.string().max(2000, 'Description must be 2000 characters or fewer'),
    z.null(),
  ]).optional(),
  tags: z.array(tagSchema).optional(),
};

export const createBookmarkSchema = z.object(bookmarkFields);

export const updateBookmarkSchema = z.object(bookmarkFields);

export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;
