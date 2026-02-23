// SQA-004: GROUP BY Conflict
// Fires when GROUP BY is present but a SELECT expression is neither in GROUP BY nor an aggregate function

import type { QueryBody, Expr } from '../../model/query-model.js';
import type { Diagnostic } from '../../validator/diagnostic.js';
import type { QueryRule, AnalyzerContext } from '../rule-types.js';

const AGGREGATE_NAMES = new Set(['SUM', 'COUNT', 'AVG', 'MIN', 'MAX']);

export const sqa004GroupByConflict: QueryRule = {
  id: 'SQA-004',
  title: 'GROUP BY conflict',
  description: 'When GROUP BY is present, every SELECT expression must either appear in the GROUP BY list or be an aggregate function.',
  severity: 'error',

  evaluate(body: QueryBody, _ctx: AnalyzerContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (!body.groupBy || body.groupBy.length === 0) {
      return diagnostics;
    }

    for (const item of body.select) {
      if (item.kind === 'wildcard') {
        // Wildcard with GROUP BY is already caught by validator E009
        continue;
      }

      const expr = item.expr;

      // Check if it's an aggregate function call
      if (isAggregate(expr)) {
        continue;
      }

      // Check if it appears in GROUP BY
      if (isInGroupBy(expr, body.groupBy)) {
        continue;
      }

      diagnostics.push({
        severity: 'error',
        code: 'SQA-004',
        message: 'Expression in SELECT is not aggregated and not in GROUP BY',
      });
    }

    return diagnostics;
  },
};

function isAggregate(expr: Expr): boolean {
  if (expr.kind === 'func') {
    return AGGREGATE_NAMES.has(expr.name.toUpperCase());
  }
  return false;
}

function isInGroupBy(expr: Expr, groupBy: Expr[]): boolean {
  return groupBy.some(gb => exprsEqual(expr, gb));
}

function exprsEqual(a: Expr, b: Expr): boolean {
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case 'column': {
      const bc = b as typeof a;
      return a.name === bc.name && a.sourceAlias === bc.sourceAlias;
    }
    case 'param': {
      const bp = b as typeof a;
      return a.name === bp.name;
    }
    case 'literal': {
      const bl = b as typeof a;
      return a.litType === bl.litType && a.value === bl.value;
    }
    case 'func': {
      const bf = b as typeof a;
      if (a.name !== bf.name || a.args.length !== bf.args.length) return false;
      return a.args.every((arg, i) => exprsEqual(arg, bf.args[i]));
    }
    case 'cast': {
      const bca = b as typeof a;
      return exprsEqual(a.expr, bca.expr);
    }
    case 'bin': {
      const bb = b as typeof a;
      return a.op === bb.op && exprsEqual(a.left, bb.left) && exprsEqual(a.right, bb.right);
    }
    case 'un': {
      const bu = b as typeof a;
      return a.op === bu.op && exprsEqual(a.expr, bu.expr);
    }
    default:
      return false;
  }
}
