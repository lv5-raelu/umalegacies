import { describe, expect, it } from 'vitest';
import { ApiError } from './client';

describe('ApiError', () => {
  it('carries the code and optional field from ErrorResponse', () => {
    const error = new ApiError('BAD_REQUEST', 'traineeCharaId is required', 'traineeCharaId');
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.field).toBe('traineeCharaId');
    expect(error).toBeInstanceOf(Error);
  });

  it('leaves field undefined when the error is not field-attributable', () => {
    expect(new ApiError('INTERNAL_ERROR', 'Internal error.').field).toBeUndefined();
  });
});
