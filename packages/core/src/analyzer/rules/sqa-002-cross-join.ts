// SQA-002: Cross Join Warning
// Fires when there are multiple sources but no joins between them (implicit cross join)

import type { QueryBody } from '../../model/query-model.js';
import type { Diagnostic } from '../../validator/diagnostic.js';
import type { QueryRule, AnalyzerContext } from '../rule-types.js';

export const sqa002CrossJoin: QueryRule = {
  id: 'SQA-002',
  title: 'Implicit cross join',
  description: 'Multiple sources without sufficient JOIN conditions result in an implicit cross join, which is usually unintended.',
  severity: 'warn',

  evaluate(body: QueryBody, _ctx: AnalyzerContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (body.sources.length > 1) {
      const joinCount = body.joins?.length ?? 0;
      if (joinCount < body.sources.length - 1) {
        diagnostics.push({
          severity: 'warn',
          code: 'SQA-002',
          message: 'Implicit cross join detected \u2014 consider adding explicit JOIN conditions',
        });
      }
    }

    return diagnostics;
  },
};
