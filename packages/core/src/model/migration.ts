// QueryModel versioning and migration (ТЗ §4.4)

import type { QueryModel, QueryModelVersion } from './query-model.js';
import type { Diagnostic } from '../validator/diagnostic.js';

const CURRENT_VERSION: QueryModelVersion = '1.0';

/**
 * Migrate a QueryModel to the current version.
 * Currently only v1.0 is supported, so this is a no-op / validation.
 */
export function migrate(model: unknown): QueryModel {
  if (!isObject(model)) {
    throw new Error('QueryModel must be an object');
  }

  const version = (model as Record<string, unknown>).version;
  if (version === CURRENT_VERSION) {
    return model as unknown as QueryModel;
  }

  // Future: add sequential migrations for older versions
  throw new Error(`Unsupported QueryModel version: ${String(version)}. Current: ${CURRENT_VERSION}`);
}

/**
 * Quick schema validation (structural checks only).
 * Returns diagnostics for any issues found.
 */
export function validateSchema(model: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!isObject(model)) {
    diagnostics.push({
      severity: 'error',
      code: 'SCHEMA_001',
      message: 'QueryModel must be an object',
    });
    return diagnostics;
  }

  const obj = model as Record<string, unknown>;

  if (obj.version !== CURRENT_VERSION) {
    diagnostics.push({
      severity: 'error',
      code: 'SCHEMA_002',
      message: `Unsupported version: ${String(obj.version)}. Expected: ${CURRENT_VERSION}`,
    });
  }

  if (!Array.isArray(obj.queries)) {
    diagnostics.push({
      severity: 'error',
      code: 'SCHEMA_003',
      message: 'QueryModel.queries must be an array',
    });
  }

  return diagnostics;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
