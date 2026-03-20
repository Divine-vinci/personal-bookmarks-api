import { describe, expect, it } from 'vitest';

import { paginationSchema } from '../../src/schemas/common-schemas.js';

describe('common schemas', () => {
  it('applies default pagination values', () => {
    const result = paginationSchema.parse({});

    expect(result).toEqual({
      limit: 20,
      offset: 0,
    });
  });

  it('rejects limits above 100', () => {
    const result = paginationSchema.safeParse({ limit: 101 });

    expect(result.success).toBe(false);
  });

  it('rejects invalid sort values', () => {
    const result = paginationSchema.safeParse({ sort: 'random' });

    expect(result.success).toBe(false);
  });

  it('accepts all valid sort values', () => {
    expect(paginationSchema.safeParse({ sort: 'created_at' }).success).toBe(true);
    expect(paginationSchema.safeParse({ sort: 'updated_at' }).success).toBe(true);
    expect(paginationSchema.safeParse({ sort: 'title' }).success).toBe(true);
  });
});
