// SQA-005: Unused Parameter
// Fires when a parameter is declared in parameters[] but not referenced anywhere in the query body

import type { QueryBody, Expr, BoolExpr } from '../../model/query-model.js';
import type { Diagnostic } from '../../validator/diagnostic.js';
import type { QueryRule, AnalyzerContext } from '../rule-types.js';

export const sqa005UnusedParam: QueryRule = {
  id: 'SQA-005',
  title: 'Unused parameter',
  description: 'A parameter is declared but never referenced in any expression within the query body.',
  severity: 'info',

  evaluate(body: QueryBody, _ctx: AnalyzerContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (!body.parameters || body.parameters.length === 0) {
      return diagnostics;
    }

    // Collect all referenced parameter names
    const referencedParams = new Set<string>();
    collectParamRefsFromBody(body, referencedParams);

    for (const param of body.parameters) {
      if (!referencedParams.has(param.name)) {
        diagnostics.push({
          severity: 'info',
          code: 'SQA-005',
          message: `Parameter '&${param.name}' is declared but not used in the query`,
        });
      }
    }

    return diagnostics;
  },
};

function collectParamRefsFromBody(body: QueryBody, names: Set<string>): void {
  for (const item of body.select) {
    if (item.kind === 'selectExpr') {
      collectParamRefsFromExpr(item.expr, names);
    }
  }

  if (body.where) collectParamRefsFromBoolExpr(body.where, names);
  if (body.having) collectParamRefsFromBoolExpr(body.having, names);

  if (body.groupBy) {
    for (const expr of body.groupBy) {
      collectParamRefsFromExpr(expr, names);
    }
  }

  if (body.orderBy) {
    for (const item of body.orderBy) {
      collectParamRefsFromExpr(item.expr, names);
    }
  }

  for (const source of body.sources) {
    if (source.virtualParams) {
      for (const vp of source.virtualParams) {
        collectParamRefsFromExpr(vp.value, names);
      }
    }
  }

  if (body.joins) {
    for (const join of body.joins) {
      collectParamRefsFromBoolExpr(join.on, names);
    }
  }
}

function collectParamRefsFromExpr(expr: Expr, names: Set<string>): void {
  switch (expr.kind) {
    case 'param':
      names.add(expr.name);
      break;
    case 'func':
      for (const arg of expr.args) collectParamRefsFromExpr(arg, names);
      break;
    case 'case':
      for (const b of expr.branches) {
        collectParamRefsFromBoolExpr(b.when, names);
        collectParamRefsFromExpr(b.then, names);
      }
      if (expr.elseExpr) collectParamRefsFromExpr(expr.elseExpr, names);
      break;
    case 'cast':
      collectParamRefsFromExpr(expr.expr, names);
      break;
    case 'bin':
      collectParamRefsFromExpr(expr.left, names);
      collectParamRefsFromExpr(expr.right, names);
      break;
    case 'un':
      collectParamRefsFromExpr(expr.expr, names);
      break;
    case 'subquery':
      collectParamRefsFromBody(expr.subquery, names);
      break;
  }
}

function collectParamRefsFromBoolExpr(boolExpr: BoolExpr, names: Set<string>): void {
  switch (boolExpr.kind) {
    case 'cmp':
      collectParamRefsFromExpr(boolExpr.left, names);
      collectParamRefsFromExpr(boolExpr.right, names);
      break;
    case 'in':
      collectParamRefsFromExpr(boolExpr.expr, names);
      if (Array.isArray(boolExpr.values)) {
        for (const v of boolExpr.values) collectParamRefsFromExpr(v, names);
      }
      break;
    case 'between':
      collectParamRefsFromExpr(boolExpr.expr, names);
      collectParamRefsFromExpr(boolExpr.from, names);
      collectParamRefsFromExpr(boolExpr.to, names);
      break;
    case 'refCheck':
      collectParamRefsFromExpr(boolExpr.expr, names);
      break;
    case 'inHierarchy':
      collectParamRefsFromExpr(boolExpr.expr, names);
      collectParamRefsFromExpr(boolExpr.value, names);
      break;
    case 'boolGroup':
      for (const item of boolExpr.items) collectParamRefsFromBoolExpr(item, names);
      break;
    case 'not':
      collectParamRefsFromBoolExpr(boolExpr.item, names);
      break;
    case 'exists':
      collectParamRefsFromBody(boolExpr.subquery, names);
      break;
  }
}
