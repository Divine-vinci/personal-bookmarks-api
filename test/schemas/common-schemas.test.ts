import { describe, expect, it } from 'vitest';

import { idParamSchema, paginationSchema } from '../../src/schemas/common-schemas.js';

describe('common schemas', () => {
  describe('idParamSchema', () => {
    it('accepts a positive integer', () => {
      expect(idParamSchema.safeParse({ id: 1 }).success).toBe(true);
      expect(idParamSchema.safeParse({ id: 42 }).success).toBe(true);
    });

    it('rejects zero and negative numbers', () => {
      expect(idParamSchema.safeParse({ id: 0 }).success).toBe(false);
      expect(idParamSchema.safeParse({ id: -1 }).success).toBe(false);
    });

    it('rejects non-integer values', () => {
      expect(idParamSchema.safeParse({ id: 1.5 }).success).toBe(false);
    });

    it('coerces string ids to numbers', () => {
      const result = idParamSchema.safeParse({ id: '7' });
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(7);
    });
  });

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
