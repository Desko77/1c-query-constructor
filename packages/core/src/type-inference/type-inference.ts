// Type Inference Engine (ТЗ §7)

import type {
  QueryModel,
  QueryBody,
  Expr,
  TypeRef,
  SelectItem,
} from '../model/query-model.js';
import type { MetadataProvider } from '../metadata/metadata-provider.js';

export interface InferenceContext {
  metadata: MetadataProvider;
  tempTableSchemas: Map<string, { columns: { name: string; type: TypeRef }[] }>;
}

const UNKNOWN_TYPE: TypeRef = { kind: 'primitive', name: 'unknown' };
const NUMBER_TYPE: TypeRef = { kind: 'primitive', name: 'number' };
const STRING_TYPE: TypeRef = { kind: 'primitive', name: 'string' };
const DATE_TYPE: TypeRef = { kind: 'primitive', name: 'date' };

const AGGREGATE_FUNCTIONS = new Set(['SUM', 'COUNT', 'AVG', 'MIN', 'MAX']);
const NUMERIC_RESULT_FUNCTIONS = new Set([
  'SUM', 'COUNT', 'AVG',
  'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND',
  'QUARTER', 'DAYOFYEAR', 'WEEK', 'WEEKDAY',
  'DATEDIFF',
]);
const STRING_RESULT_FUNCTIONS = new Set([
  'SUBSTRING', 'PRESENTATION', 'REFPRESENTATION',
  'VALUETYPE', 'TYPE',
]);
const DATE_RESULT_FUNCTIONS = new Set([
  'BEGINOFPERIOD', 'ENDOFPERIOD', 'DATEADD',
]);

export function createInferenceContext(metadata: MetadataProvider): InferenceContext {
  return {
    metadata,
    tempTableSchemas: new Map(),
  };
}

export function inferExprType(expr: Expr, body: QueryBody, ctx: InferenceContext): TypeRef {
  switch (expr.kind) {
    case 'column':
      return inferColumnRefType(expr, body, ctx);
    case 'param':
      return UNKNOWN_TYPE;
    case 'literal':
      return inferLiteralType(expr);
    case 'func':
      return inferFuncCallType(expr, body, ctx);
    case 'cast':
      return expr.toType;
    case 'case':
      return inferCaseType(expr, body, ctx);
    case 'bin':
      return NUMBER_TYPE;
    case 'un':
      return NUMBER_TYPE;
    case 'subquery':
      return UNKNOWN_TYPE;
  }
}

function inferLiteralType(expr: { litType: string }): TypeRef {
  switch (expr.litType) {
    case 'string':
      return STRING_TYPE;
    case 'number':
      return NUMBER_TYPE;
    case 'bool':
      return { kind: 'primitive', name: 'bool' };
    case 'date':
      return DATE_TYPE;
    case 'null':
    default:
      return UNKNOWN_TYPE;
  }
}

function inferColumnRefType(
  expr: { sourceAlias?: string; name: string },
  body: QueryBody,
  ctx: InferenceContext,
): TypeRef {
  // Look up from temp table schemas
  if (expr.sourceAlias) {
    const source = body.sources.find(s => s.alias === expr.sourceAlias);
    if (source && source.kind === 'tempTable' && source.tempTableName) {
      const schema = ctx.tempTableSchemas.get(source.tempTableName);
      if (schema) {
        const col = schema.columns.find(c => c.name === expr.name);
        if (col) {
          return col.type;
        }
      }
    }
  }

  // Without async metadata resolution in this synchronous context,
  // fall back to unknown for object/virtual sources
  return UNKNOWN_TYPE;
}

function inferFuncCallType(
  expr: { name: string; args: Expr[] },
  body: QueryBody,
  ctx: InferenceContext,
): TypeRef {
  const funcName = expr.name.toUpperCase();

  // MIN, MAX return type of argument
  if (funcName === 'MIN' || funcName === 'MAX') {
    if (expr.args.length > 0) {
      return inferExprType(expr.args[0], body, ctx);
    }
    return UNKNOWN_TYPE;
  }

  // ISNULL returns union of arg types
  if (funcName === 'ISNULL') {
    if (expr.args.length >= 2) {
      const types = expr.args.map(arg => inferExprType(arg, body, ctx));
      const unique = deduplicateTypes(types);
      if (unique.length === 1) {
        return unique[0];
      }
      return { kind: 'union', items: unique };
    }
    if (expr.args.length === 1) {
      return inferExprType(expr.args[0], body, ctx);
    }
    return UNKNOWN_TYPE;
  }

  if (NUMERIC_RESULT_FUNCTIONS.has(funcName)) {
    return NUMBER_TYPE;
  }

  if (STRING_RESULT_FUNCTIONS.has(funcName)) {
    return STRING_TYPE;
  }

  if (DATE_RESULT_FUNCTIONS.has(funcName)) {
    return DATE_TYPE;
  }

  if (funcName === 'VALUE') {
    return UNKNOWN_TYPE;
  }

  return UNKNOWN_TYPE;
}

function inferCaseType(
  expr: { branches: { when: unknown; then: Expr }[]; elseExpr?: Expr },
  body: QueryBody,
  ctx: InferenceContext,
): TypeRef {
  const types: TypeRef[] = [];

  for (const branch of expr.branches) {
    types.push(inferExprType(branch.then, body, ctx));
  }

  if (expr.elseExpr) {
    types.push(inferExprType(expr.elseExpr, body, ctx));
  }

  const unique = deduplicateTypes(types);
  if (unique.length === 0) {
    return UNKNOWN_TYPE;
  }
  if (unique.length === 1) {
    return unique[0];
  }
  return { kind: 'union', items: unique };
}

function deduplicateTypes(types: TypeRef[]): TypeRef[] {
  const unique: TypeRef[] = [];
  for (const t of types) {
    if (!unique.some(u => typeRefsEqual(u, t))) {
      unique.push(t);
    }
  }
  return unique;
}

function typeRefsEqual(a: TypeRef, b: TypeRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'primitive' && b.kind === 'primitive') {
    return a.name === b.name;
  }
  if (a.kind === 'ref' && b.kind === 'ref') {
    return a.object === b.object;
  }
  if (a.kind === 'union' && b.kind === 'union') {
    if (a.items.length !== b.items.length) return false;
    return a.items.every((ai, idx) => typeRefsEqual(ai, b.items[idx]));
  }
  return false;
}

export function inferSelectTypes(body: QueryBody, ctx: InferenceContext): TypeRef[] {
  return body.select.map(item => inferSelectItemType(item, body, ctx));
}

function inferSelectItemType(item: SelectItem, body: QueryBody, ctx: InferenceContext): TypeRef {
  if (item.kind === 'wildcard') {
    return UNKNOWN_TYPE;
  }
  return inferExprType(item.expr, body, ctx);
}

export function buildTempTableSchemas(model: QueryModel, ctx: InferenceContext): void {
  for (const queryItem of model.queries) {
    if (queryItem.kind !== 'queryBody') continue;
    const body = queryItem;

    if (body.intoTempTable) {
      const types = inferSelectTypes(body, ctx);
      const columns: { name: string; type: TypeRef }[] = [];

      for (let i = 0; i < body.select.length; i++) {
        const selectItem = body.select[i];
        const type = types[i];

        let name: string;
        if (selectItem.kind === 'selectExpr') {
          name = selectItem.alias ?? (selectItem.expr.kind === 'column' ? selectItem.expr.name : `field${i}`);
        } else {
          name = `field${i}`;
        }

        columns.push({ name, type });
      }

      ctx.tempTableSchemas.set(body.intoTempTable.name, { columns });
    }
  }
}

export function isAggregateFunction(name: string): boolean {
  return AGGREGATE_FUNCTIONS.has(name.toUpperCase());
}
