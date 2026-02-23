// SQA-001: SELECT * Warning
// Fires when SelectItem has kind='wildcard'

import type { QueryBody } from '../../model/query-model.js';
import type { Diagnostic } from '../../validator/diagnostic.js';
import type { QueryRule, AnalyzerContext } from '../rule-types.js';

export const sqa001SelectWildcard: QueryRule = {
  id: 'SQA-001',
  title: 'Avoid SELECT *',
  description: 'Wildcard SELECT (*) should be replaced with an explicit list of required fields for clarity and performance.',
  severity: 'warn',

  evaluate(body: QueryBody, _ctx: AnalyzerContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const item of body.select) {
      if (item.kind === 'wildcard') {
        diagnostics.push({
          severity: 'warn',
          code: 'SQA-001',
          message: 'Avoid SELECT * \u2014 explicitly list required fields',
        });
      }
    }

    return diagnostics;
  },
};
