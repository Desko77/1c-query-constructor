// =============================================================================
// Validator — main entry point (ТЗ §4.7)
// =============================================================================

import type { QueryModel } from '../model/query-model.js';
import type { Diagnostic } from './diagnostic.js';
import { checkInvariants, type ValidatorOptions } from './invariants.js';

/**
 * Validate a QueryModel structurally and return diagnostics.
 *
 * @param model   The QueryModel to validate.
 * @param options Optional configuration for the validator.
 * @returns       An array of Diagnostic objects (empty = valid).
 */
export function validate(
  model: QueryModel,
  options?: ValidatorOptions,
): Diagnostic[] {
  return checkInvariants(model, options);
}

export type { ValidatorOptions } from './invariants.js';
