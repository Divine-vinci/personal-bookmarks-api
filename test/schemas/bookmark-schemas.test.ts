import { describe, expect, it } from 'vitest';

import { createBookmarkSchema, updateBookmarkSchema } from '../../src/schemas/bookmark-schemas.js';
import { isInvalidUrlZodError } from '../../src/middleware/error-middleware.js';

describe('bookmark schemas', () => {
  it('accepts a valid create payload', () => {
    const result = createBookmarkSchema.safeParse({
      url: 'https://example.com',
      title: 'Example',
      description: 'Useful link',
      tags: ['dev', 'tools'],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a missing url', () => {
    const result = createBookmarkSchema.safeParse({
      title: 'Example',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['url']);
  });

  it('rejects a missing title', () => {
    const result = createBookmarkSchema.safeParse({
      url: 'https://example.com',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['title']);
  });

  it('rejects urls longer than 2000 characters', () => {
    const result = createBookmarkSchema.safeParse({
      url: `https://example.com/${'a'.repeat(1981)}`,
      title: 'Example',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'url')).toBe(true);
  });

  it('rejects titles longer than 500 characters', () => {
    const result = createBookmarkSchema.safeParse({
      url: 'https://example.com',
      title: 'a'.repeat(501),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'title')).toBe(true);
  });

  it('flags invalid URL format distinctly', () => {
    const result = createBookmarkSchema.safeParse({
      url: 'not-a-url',
      title: 'Example',
    });

    expect(result.success).toBe(false);
    expect(isInvalidUrlZodError(result.error!)).toBe(true);
  });

  it('normalizes tags to trimmed lowercase strings', () => {
    const result = createBookmarkSchema.parse({
      url: 'https://example.com',
      title: 'Example',
      tags: ['  DEV  ', ' Tools '],
    });

    expect(result.tags).toEqual(['dev', 'tools']);
  });

  it('rejects descriptions longer than 2000 characters', () => {
    const result = createBookmarkSchema.safeParse({
      url: 'https://example.com',
      title: 'Example',
      description: 'a'.repeat(2001),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'description')).toBe(true);
  });

  it('allows description to be omitted or null', () => {
    expect(createBookmarkSchema.safeParse({
      url: 'https://example.com',
      title: 'Example',
    }).success).toBe(true);

    expect(createBookmarkSchema.safeParse({
      url: 'https://example.com',
      title: 'Example',
      description: null,
    }).success).toBe(true);
  });

  it('applies the same rules to update payloads', () => {
    const result = updateBookmarkSchema.safeParse({
      url: 'https://example.com',
      title: 'Updated title',
      description: null,
      tags: ['  NEWS '],
    });

    expect(result.success).toBe(true);
    expect(result.data?.tags).toEqual(['news']);
  });
});
