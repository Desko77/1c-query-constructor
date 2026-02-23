// QueryModel utility functions — traversal, cloning, parameter search

import type {
  QueryModel,
  QueryBody,
  Expr,
  BoolExpr,
  ParameterSpec,
  Source,
} from './query-model.js';

/**
 * Deep clone a QueryModel (structuredClone wrapper for convenience).
 */
export function cloneModel(model: QueryModel): QueryModel {
  return JSON.parse(JSON.stringify(model));
}

/**
 * Iterate over all QueryBody items in a model (including union parts, subqueries).
 */
export function* walkQueryBodies(model: QueryModel): Generator<QueryBody> {
  for (const item of model.queries) {
    if (item.kind === 'queryBody') {
      yield* walkQueryBodyRecursive(item);
    }
  }
}

function* walkQueryBodyRecursive(body: QueryBody): Generator<QueryBody> {
  yield body;

  // Union parts
  if (body.union) {
    for (const u of body.union) {
      yield* walkQueryBodyRecursive(u.body);
    }
  }

  // Subqueries in sources
  for (const source of body.sources) {
    if (source.kind === 'subquery' && source.subquery) {
      yield* walkQueryBodyRecursive(source.subquery);
    }
  }

  // Subqueries in expressions
  for (const item of body.select) {
    if (item.kind === 'selectExpr') {
      yield* walkExprSubqueries(item.expr);
    }
  }

  if (body.where) {
    yield* walkBoolExprSubqueries(body.where);
  }

  if (body.having) {
    yield* walkBoolExprSubqueries(body.having);
  }
}

function* walkExprSubqueries(expr: Expr): Generator<QueryBody> {
  switch (expr.kind) {
    case 'subquery':
      yield* walkQueryBodyRecursive(expr.subquery);
      break;
    case 'func':
      for (const arg of expr.args) {
        yield* walkExprSubqueries(arg);
      }
      break;
    case 'case':
      for (const branch of expr.branches) {
        yield* walkBoolExprSubqueries(branch.when);
        yield* walkExprSubqueries(branch.then);
      }
      if (expr.elseExpr) {
        yield* walkExprSubqueries(expr.elseExpr);
      }
      break;
    case 'cast':
      yield* walkExprSubqueries(expr.expr);
      break;
    case 'bin':
      yield* walkExprSubqueries(expr.left);
      yield* walkExprSubqueries(expr.right);
      break;
    case 'un':
      yield* walkExprSubqueries(expr.expr);
      break;
  }
}

function* walkBoolExprSubqueries(boolExpr: BoolExpr): Generator<QueryBody> {
  switch (boolExpr.kind) {
    case 'exists':
      yield* walkQueryBodyRecursive(boolExpr.subquery);
      break;
    case 'in':
      yield* walkExprSubqueries(boolExpr.expr);
      if (!Array.isArray(boolExpr.values)) {
        yield* walkQueryBodyRecursive(boolExpr.values);
      } else {
        for (const v of boolExpr.values) {
          yield* walkExprSubqueries(v);
        }
      }
      break;
    case 'cmp':
      yield* walkExprSubqueries(boolExpr.left);
      yield* walkExprSubqueries(boolExpr.right);
      break;
    case 'between':
      yield* walkExprSubqueries(boolExpr.expr);
      yield* walkExprSubqueries(boolExpr.from);
      yield* walkExprSubqueries(boolExpr.to);
      break;
    case 'refCheck':
      yield* walkExprSubqueries(boolExpr.expr);
      break;
    case 'inHierarchy':
      yield* walkExprSubqueries(boolExpr.expr);
      yield* walkExprSubqueries(boolExpr.value);
      break;
    case 'boolGroup':
      for (const item of boolExpr.items) {
        yield* walkBoolExprSubqueries(item);
      }
      break;
    case 'not':
      yield* walkBoolExprSubqueries(boolExpr.item);
      break;
  }
}

/**
 * Collect all parameter references from a QueryModel.
 */
export function collectParameters(model: QueryModel): ParameterSpec[] {
  const params = new Map<string, ParameterSpec>();

  for (const body of walkQueryBodies(model)) {
    if (body.parameters) {
      for (const p of body.parameters) {
        if (!params.has(p.name)) {
          params.set(p.name, p);
        }
      }
    }
  }

  return Array.from(params.values());
}

/**
 * Collect all parameter names referenced in expressions (ParamRef nodes).
 */
export function collectParamRefs(model: QueryModel): string[] {
  const names = new Set<string>();

  for (const body of walkQueryBodies(model)) {
    collectParamRefsFromBody(body, names);
  }

  return Array.from(names);
}

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

/**
 * Get all source aliases from a QueryBody (non-recursive, just the body itself).
 */
export function getSourceAliases(body: QueryBody): string[] {
  return body.sources.map(s => s.alias);
}

/**
 * Find a source by alias in a QueryBody.
 */
export function findSource(body: QueryBody, alias: string): Source | undefined {
  return body.sources.find(s => s.alias === alias);
}

/**
 * Get QueryBody at a specific index (handling both queryBody and destroyTempTable).
 */
export function getQueryBody(model: QueryModel, index: number): QueryBody | undefined {
  const item = model.queries[index];
  if (item && item.kind === 'queryBody') {
    return item;
  }
  return undefined;
}
