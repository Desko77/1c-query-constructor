// SQA-003: Redundant Join Warning
// Fires when a join's rightAlias is not referenced in select, where, groupBy, having, or orderBy

import type { QueryBody, Expr, BoolExpr } from '../../model/query-model.js';
import type { Diagnostic } from '../../validator/diagnostic.js';
import type { QueryRule, AnalyzerContext } from '../rule-types.js';

export const sqa003RedundantJoin: QueryRule = {
  id: 'SQA-003',
  title: 'Unused join',
  description: 'A join whose right alias is not referenced in SELECT, WHERE, GROUP BY, HAVING, or ORDER BY may be redundant.',
  severity: 'warn',

  evaluate(body: QueryBody, _ctx: AnalyzerContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (!body.joins || body.joins.length === 0) {
      return diagnostics;
    }

    // Collect all sourceAlias references from expressions
    const referencedAliases = new Set<string>();
    collectAliasesFromBody(body, referencedAliases);

    for (const join of body.joins) {
      if (!referencedAliases.has(join.rightAlias)) {
        diagnostics.push({
          severity: 'warn',
          code: 'SQA-003',
          message: `Join to '${join.rightAlias}' appears unused \u2014 none of its fields are referenced`,
        });
      }
    }

    return diagnostics;
  },
};

function collectAliasesFromBody(body: QueryBody, aliases: Set<string>): void {
  // Select items
  for (const item of body.select) {
    if (item.kind === 'selectExpr') {
      collectAliasesFromExpr(item.expr, aliases);
    } else if (item.kind === 'wildcard' && item.sourceAlias) {
      aliases.add(item.sourceAlias);
    }
  }

  // Where
  if (body.where) {
    collectAliasesFromBoolExpr(body.where, aliases);
  }

  // Group by
  if (body.groupBy) {
    for (const expr of body.groupBy) {
      collectAliasesFromExpr(expr, aliases);
    }
  }

  // Having
  if (body.having) {
    collectAliasesFromBoolExpr(body.having, aliases);
  }

  // Order by
  if (body.orderBy) {
    for (const item of body.orderBy) {
      collectAliasesFromExpr(item.expr, aliases);
    }
  }
}

function collectAliasesFromExpr(expr: Expr, aliases: Set<string>): void {
  switch (expr.kind) {
    case 'column':
      if (expr.sourceAlias) {
        aliases.add(expr.sourceAlias);
      }
      break;
    case 'func':
      for (const arg of expr.args) {
        collectAliasesFromExpr(arg, aliases);
      }
      break;
    case 'case':
      for (const branch of expr.branches) {
        collectAliasesFromBoolExpr(branch.when, aliases);
        collectAliasesFromExpr(branch.then, aliases);
      }
      if (expr.elseExpr) {
        collectAliasesFromExpr(expr.elseExpr, aliases);
      }
      break;
    case 'cast':
      collectAliasesFromExpr(expr.expr, aliases);
      break;
    case 'bin':
      collectAliasesFromExpr(expr.left, aliases);
      collectAliasesFromExpr(expr.right, aliases);
      break;
    case 'un':
      collectAliasesFromExpr(expr.expr, aliases);
      break;
    case 'subquery':
      // Subquery references are in their own scope, don't bubble up
      break;
  }
}

function collectAliasesFromBoolExpr(boolExpr: BoolExpr, aliases: Set<string>): void {
  switch (boolExpr.kind) {
    case 'cmp':
      collectAliasesFromExpr(boolExpr.left, aliases);
      collectAliasesFromExpr(boolExpr.right, aliases);
      break;
    case 'in':
      collectAliasesFromExpr(boolExpr.expr, aliases);
      if (Array.isArray(boolExpr.values)) {
        for (const v of boolExpr.values) {
          collectAliasesFromExpr(v, aliases);
        }
      }
      break;
    case 'between':
      collectAliasesFromExpr(boolExpr.expr, aliases);
      collectAliasesFromExpr(boolExpr.from, aliases);
      collectAliasesFromExpr(boolExpr.to, aliases);
      break;
    case 'refCheck':
      collectAliasesFromExpr(boolExpr.expr, aliases);
      break;
    case 'inHierarchy':
      collectAliasesFromExpr(boolExpr.expr, aliases);
      collectAliasesFromExpr(boolExpr.value, aliases);
      break;
    case 'boolGroup':
      for (const item of boolExpr.items) {
        collectAliasesFromBoolExpr(item, aliases);
      }
      break;
    case 'not':
      collectAliasesFromBoolExpr(boolExpr.item, aliases);
      break;
    case 'exists':
      // Exists subquery is its own scope
      break;
  }
}
