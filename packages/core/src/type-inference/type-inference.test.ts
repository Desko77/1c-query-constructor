import { describe, it, expect } from 'vitest';
import type { QueryModel, QueryBody, Expr, TypeRef } from '../model/query-model.js';
import { NullMetadataProvider } from '../metadata/null-metadata-provider.js';
import {
  createInferenceContext,
  inferExprType,
  inferSelectTypes,
  buildTempTableSchemas,
  isAggregateFunction,
} from './type-inference.js';

// =============================================================================
// Helpers
// =============================================================================

function minimalBody(overrides?: Partial<QueryBody>): QueryBody {
  return {
    kind: 'queryBody',
    sources: [{ alias: 'T1', kind: 'object', object: 'Справочник.Контрагенты' }],
    select: [{ kind: 'selectExpr', expr: { kind: 'column', sourceAlias: 'T1', name: 'Наименование' } }],
    ...overrides,
  };
}

function makeCtx() {
  return createInferenceContext(new NullMetadataProvider());
}

// =============================================================================
// Literal type inference
// =============================================================================

describe('inferExprType — literals', () => {
  const body = minimalBody();
  const ctx = makeCtx();

  it('infers string literal as string', () => {
    const expr: Expr = { kind: 'literal', litType: 'string', value: 'hello' };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'string' });
  });

  it('infers number literal as number', () => {
    const expr: Expr = { kind: 'literal', litType: 'number', value: 42 };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('infers bool literal as bool', () => {
    const expr: Expr = { kind: 'literal', litType: 'bool', value: true };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'bool' });
  });

  it('infers date literal as date', () => {
    const expr: Expr = { kind: 'literal', litType: 'date', value: '2024-01-01' };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'date' });
  });

  it('infers null literal as unknown', () => {
    const expr: Expr = { kind: 'literal', litType: 'null', value: null };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'unknown' });
  });
});

// =============================================================================
// ColumnRef type inference
// =============================================================================

describe('inferExprType — column ref', () => {
  it('returns unknown for column ref without metadata', () => {
    const ctx = makeCtx();
    const body = minimalBody();
    const expr: Expr = { kind: 'column', sourceAlias: 'T1', name: 'Наименование' };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'unknown' });
  });

  it('returns type from temp table schema when available', () => {
    const ctx = makeCtx();
    ctx.tempTableSchemas.set('ВТ_Товары', {
      columns: [
        { name: 'Цена', type: { kind: 'primitive', name: 'number' } },
        { name: 'Название', type: { kind: 'primitive', name: 'string' } },
      ],
    });

    const body = minimalBody({
      sources: [{ alias: 'TT', kind: 'tempTable', tempTableName: 'ВТ_Товары' }],
    });
    const expr: Expr = { kind: 'column', sourceAlias: 'TT', name: 'Цена' };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('returns unknown for column not found in temp table schema', () => {
    const ctx = makeCtx();
    ctx.tempTableSchemas.set('ВТ', {
      columns: [{ name: 'X', type: { kind: 'primitive', name: 'number' } }],
    });

    const body = minimalBody({
      sources: [{ alias: 'TT', kind: 'tempTable', tempTableName: 'ВТ' }],
    });
    const expr: Expr = { kind: 'column', sourceAlias: 'TT', name: 'Y' };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'unknown' });
  });
});

// =============================================================================
// ParamRef type inference
// =============================================================================

describe('inferExprType — param ref', () => {
  it('returns unknown for parameter reference', () => {
    const ctx = makeCtx();
    const body = minimalBody();
    const expr: Expr = { kind: 'param', name: 'МойПараметр' };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'unknown' });
  });
});

// =============================================================================
// FuncCall type inference
// =============================================================================

describe('inferExprType — function calls', () => {
  const body = minimalBody();
  const ctx = makeCtx();

  it('SUM returns number', () => {
    const expr: Expr = { kind: 'func', name: 'SUM', args: [{ kind: 'column', name: 'Количество' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('COUNT returns number', () => {
    const expr: Expr = { kind: 'func', name: 'COUNT', args: [{ kind: 'column', name: 'Ссылка' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('AVG returns number', () => {
    const expr: Expr = { kind: 'func', name: 'AVG', args: [{ kind: 'column', name: 'Цена' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('MIN returns type of argument', () => {
    const expr: Expr = {
      kind: 'func',
      name: 'MIN',
      args: [{ kind: 'literal', litType: 'date', value: '2024-01-01' }],
    };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'date' });
  });

  it('MAX returns type of argument', () => {
    const expr: Expr = {
      kind: 'func',
      name: 'MAX',
      args: [{ kind: 'literal', litType: 'number', value: 100 }],
    };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('SUBSTRING returns string', () => {
    const expr: Expr = {
      kind: 'func',
      name: 'SUBSTRING',
      args: [
        { kind: 'column', name: 'Наименование' },
        { kind: 'literal', litType: 'number', value: 1 },
        { kind: 'literal', litType: 'number', value: 5 },
      ],
    };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'string' });
  });

  it('PRESENTATION returns string', () => {
    const expr: Expr = { kind: 'func', name: 'PRESENTATION', args: [{ kind: 'column', name: 'Ссылка' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'string' });
  });

  it('REFPRESENTATION returns string', () => {
    const expr: Expr = { kind: 'func', name: 'REFPRESENTATION', args: [{ kind: 'column', name: 'Ссылка' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'string' });
  });

  it('YEAR returns number', () => {
    const expr: Expr = { kind: 'func', name: 'YEAR', args: [{ kind: 'column', name: 'Дата' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('MONTH returns number', () => {
    const expr: Expr = { kind: 'func', name: 'MONTH', args: [{ kind: 'column', name: 'Дата' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('QUARTER returns number', () => {
    const expr: Expr = { kind: 'func', name: 'QUARTER', args: [{ kind: 'column', name: 'Дата' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('DAYOFYEAR returns number', () => {
    const expr: Expr = { kind: 'func', name: 'DAYOFYEAR', args: [{ kind: 'column', name: 'Дата' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('WEEKDAY returns number', () => {
    const expr: Expr = { kind: 'func', name: 'WEEKDAY', args: [{ kind: 'column', name: 'Дата' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('ISNULL returns union of arg types', () => {
    const expr: Expr = {
      kind: 'func',
      name: 'ISNULL',
      args: [
        { kind: 'literal', litType: 'number', value: 0 },
        { kind: 'literal', litType: 'string', value: 'fallback' },
      ],
    };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({
      kind: 'union',
      items: [
        { kind: 'primitive', name: 'number' },
        { kind: 'primitive', name: 'string' },
      ],
    });
  });

  it('ISNULL returns single type when both args have same type', () => {
    const expr: Expr = {
      kind: 'func',
      name: 'ISNULL',
      args: [
        { kind: 'literal', litType: 'number', value: 0 },
        { kind: 'literal', litType: 'number', value: 1 },
      ],
    };
    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('VALUETYPE returns string', () => {
    const expr: Expr = { kind: 'func', name: 'VALUETYPE', args: [{ kind: 'column', name: 'Ссылка' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'string' });
  });

  it('TYPE returns string', () => {
    const expr: Expr = { kind: 'func', name: 'TYPE', args: [{ kind: 'literal', litType: 'string', value: 'Справочник.Контрагенты' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'string' });
  });

  it('BEGINOFPERIOD returns date', () => {
    const expr: Expr = {
      kind: 'func',
      name: 'BEGINOFPERIOD',
      args: [
        { kind: 'column', name: 'Дата' },
        { kind: 'literal', litType: 'string', value: 'MONTH' },
      ],
    };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'date' });
  });

  it('ENDOFPERIOD returns date', () => {
    const expr: Expr = {
      kind: 'func',
      name: 'ENDOFPERIOD',
      args: [
        { kind: 'column', name: 'Дата' },
        { kind: 'literal', litType: 'string', value: 'QUARTER' },
      ],
    };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'date' });
  });

  it('DATEADD returns date', () => {
    const expr: Expr = {
      kind: 'func',
      name: 'DATEADD',
      args: [
        { kind: 'column', name: 'Дата' },
        { kind: 'literal', litType: 'string', value: 'DAY' },
        { kind: 'literal', litType: 'number', value: 7 },
      ],
    };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'date' });
  });

  it('DATEDIFF returns number', () => {
    const expr: Expr = {
      kind: 'func',
      name: 'DATEDIFF',
      args: [
        { kind: 'column', name: 'ДатаНачала' },
        { kind: 'column', name: 'ДатаОкончания' },
        { kind: 'literal', litType: 'string', value: 'DAY' },
      ],
    };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('VALUE returns unknown', () => {
    const expr: Expr = { kind: 'func', name: 'VALUE', args: [{ kind: 'literal', litType: 'string', value: 'Перечисление.Пол.Мужской' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'unknown' });
  });

  it('unknown function returns unknown', () => {
    const expr: Expr = { kind: 'func', name: 'CUSTOM_FUNC', args: [] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'unknown' });
  });

  it('MIN with no args returns unknown', () => {
    const expr: Expr = { kind: 'func', name: 'MIN', args: [] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'unknown' });
  });
});

// =============================================================================
// CaseExpr type inference
// =============================================================================

describe('inferExprType — CASE expression', () => {
  const body = minimalBody();
  const ctx = makeCtx();

  it('returns union of all branch types', () => {
    const expr: Expr = {
      kind: 'case',
      branches: [
        {
          when: {
            kind: 'cmp',
            op: '=',
            left: { kind: 'column', name: 'Тип' },
            right: { kind: 'literal', litType: 'number', value: 1 },
          },
          then: { kind: 'literal', litType: 'string', value: 'Товар' },
        },
        {
          when: {
            kind: 'cmp',
            op: '=',
            left: { kind: 'column', name: 'Тип' },
            right: { kind: 'literal', litType: 'number', value: 2 },
          },
          then: { kind: 'literal', litType: 'number', value: 42 },
        },
      ],
      elseExpr: { kind: 'literal', litType: 'date', value: '2024-01-01' },
    };

    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({
      kind: 'union',
      items: [
        { kind: 'primitive', name: 'string' },
        { kind: 'primitive', name: 'number' },
        { kind: 'primitive', name: 'date' },
      ],
    });
  });

  it('returns single type when all branches have same type', () => {
    const expr: Expr = {
      kind: 'case',
      branches: [
        {
          when: {
            kind: 'cmp',
            op: '=',
            left: { kind: 'column', name: 'Тип' },
            right: { kind: 'literal', litType: 'number', value: 1 },
          },
          then: { kind: 'literal', litType: 'number', value: 10 },
        },
      ],
      elseExpr: { kind: 'literal', litType: 'number', value: 20 },
    };

    const result = inferExprType(expr, body, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'number' });
  });
});

// =============================================================================
// BinaryExpr / UnaryExpr type inference
// =============================================================================

describe('inferExprType — binary/unary expressions', () => {
  const body = minimalBody();
  const ctx = makeCtx();

  it('binary expression returns number', () => {
    const expr: Expr = {
      kind: 'bin',
      op: '+',
      left: { kind: 'literal', litType: 'number', value: 1 },
      right: { kind: 'literal', litType: 'number', value: 2 },
    };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('unary expression returns number', () => {
    const expr: Expr = {
      kind: 'un',
      op: '-',
      expr: { kind: 'literal', litType: 'number', value: 5 },
    };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });
});

// =============================================================================
// CastExpr type inference
// =============================================================================

describe('inferExprType — cast expression', () => {
  it('returns the target type', () => {
    const body = minimalBody();
    const ctx = makeCtx();
    const targetType: TypeRef = { kind: 'primitive', name: 'string' };
    const expr: Expr = {
      kind: 'cast',
      expr: { kind: 'literal', litType: 'number', value: 42 },
      toType: targetType,
    };
    expect(inferExprType(expr, body, ctx)).toEqual(targetType);
  });

  it('returns ref type from cast', () => {
    const body = minimalBody();
    const ctx = makeCtx();
    const targetType: TypeRef = { kind: 'ref', object: 'Справочник.Контрагенты' };
    const expr: Expr = {
      kind: 'cast',
      expr: { kind: 'column', name: 'Ссылка' },
      toType: targetType,
    };
    expect(inferExprType(expr, body, ctx)).toEqual(targetType);
  });
});

// =============================================================================
// SubqueryExpr type inference
// =============================================================================

describe('inferExprType — subquery expression', () => {
  it('returns unknown', () => {
    const body = minimalBody();
    const ctx = makeCtx();
    const innerBody = minimalBody();
    const expr: Expr = { kind: 'subquery', subquery: innerBody };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'unknown' });
  });
});

// =============================================================================
// inferSelectTypes
// =============================================================================

describe('inferSelectTypes', () => {
  it('returns types for all select items', () => {
    const ctx = makeCtx();
    const body = minimalBody({
      select: [
        { kind: 'selectExpr', expr: { kind: 'literal', litType: 'string', value: 'hello' } },
        { kind: 'selectExpr', expr: { kind: 'literal', litType: 'number', value: 42 } },
        { kind: 'selectExpr', expr: { kind: 'func', name: 'COUNT', args: [{ kind: 'column', name: 'id' }] } },
      ],
    });
    const types = inferSelectTypes(body, ctx);
    expect(types).toEqual([
      { kind: 'primitive', name: 'string' },
      { kind: 'primitive', name: 'number' },
      { kind: 'primitive', name: 'number' },
    ]);
  });

  it('returns unknown for wildcard select item', () => {
    const ctx = makeCtx();
    const body = minimalBody({ select: [{ kind: 'wildcard' }] });
    const types = inferSelectTypes(body, ctx);
    expect(types).toEqual([{ kind: 'primitive', name: 'unknown' }]);
  });
});

// =============================================================================
// buildTempTableSchemas
// =============================================================================

describe('buildTempTableSchemas', () => {
  it('builds schema for temp table from SELECT types', () => {
    const ctx = makeCtx();
    const body: QueryBody = {
      kind: 'queryBody',
      sources: [{ alias: 'T1', kind: 'object', object: 'Справочник.Товары' }],
      select: [
        { kind: 'selectExpr', expr: { kind: 'literal', litType: 'string', value: 'hello' }, alias: 'Название' },
        { kind: 'selectExpr', expr: { kind: 'literal', litType: 'number', value: 100 }, alias: 'Цена' },
      ],
      intoTempTable: { name: 'ВТ_Товары' },
    };

    const model: QueryModel = { version: '1.0', queries: [body] };
    buildTempTableSchemas(model, ctx);

    const schema = ctx.tempTableSchemas.get('ВТ_Товары');
    expect(schema).toBeDefined();
    expect(schema!.columns).toEqual([
      { name: 'Название', type: { kind: 'primitive', name: 'string' } },
      { name: 'Цена', type: { kind: 'primitive', name: 'number' } },
    ]);
  });

  it('uses column name when alias is missing', () => {
    const ctx = makeCtx();
    const body: QueryBody = {
      kind: 'queryBody',
      sources: [{ alias: 'T1', kind: 'object', object: 'Справочник.Товары' }],
      select: [
        { kind: 'selectExpr', expr: { kind: 'column', sourceAlias: 'T1', name: 'Наименование' } },
      ],
      intoTempTable: { name: 'ВТ' },
    };

    const model: QueryModel = { version: '1.0', queries: [body] };
    buildTempTableSchemas(model, ctx);

    const schema = ctx.tempTableSchemas.get('ВТ');
    expect(schema).toBeDefined();
    expect(schema!.columns[0].name).toBe('Наименование');
  });

  it('subsequent query can reference temp table column types', () => {
    const ctx = makeCtx();
    const createBody: QueryBody = {
      kind: 'queryBody',
      sources: [{ alias: 'T1', kind: 'object', object: 'Справочник.Товары' }],
      select: [
        { kind: 'selectExpr', expr: { kind: 'literal', litType: 'number', value: 100 }, alias: 'Цена' },
      ],
      intoTempTable: { name: 'ВТ_Цены' },
    };

    const useBody: QueryBody = {
      kind: 'queryBody',
      sources: [{ alias: 'TT', kind: 'tempTable', tempTableName: 'ВТ_Цены' }],
      select: [
        { kind: 'selectExpr', expr: { kind: 'column', sourceAlias: 'TT', name: 'Цена' } },
      ],
    };

    const model: QueryModel = { version: '1.0', queries: [createBody, useBody] };
    buildTempTableSchemas(model, ctx);

    // Now infer type of column ref from temp table
    const expr: Expr = { kind: 'column', sourceAlias: 'TT', name: 'Цена' };
    const result = inferExprType(expr, useBody, ctx);
    expect(result).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('skips destroyTempTable items', () => {
    const ctx = makeCtx();
    const body: QueryBody = {
      kind: 'queryBody',
      sources: [{ alias: 'T1', kind: 'object', object: 'Справочник.Товары' }],
      select: [{ kind: 'selectExpr', expr: { kind: 'literal', litType: 'string', value: 'x' }, alias: 'Col' }],
      intoTempTable: { name: 'ВТ' },
    };

    const model: QueryModel = {
      version: '1.0',
      queries: [body, { kind: 'destroyTempTable', name: 'ВТ' }],
    };
    buildTempTableSchemas(model, ctx);

    expect(ctx.tempTableSchemas.has('ВТ')).toBe(true);
  });
});

// =============================================================================
// isAggregateFunction
// =============================================================================

describe('isAggregateFunction', () => {
  it('returns true for aggregate functions', () => {
    expect(isAggregateFunction('SUM')).toBe(true);
    expect(isAggregateFunction('COUNT')).toBe(true);
    expect(isAggregateFunction('AVG')).toBe(true);
    expect(isAggregateFunction('MIN')).toBe(true);
    expect(isAggregateFunction('MAX')).toBe(true);
  });

  it('returns true case-insensitively', () => {
    expect(isAggregateFunction('sum')).toBe(true);
    expect(isAggregateFunction('Count')).toBe(true);
  });

  it('returns false for non-aggregate functions', () => {
    expect(isAggregateFunction('SUBSTRING')).toBe(false);
    expect(isAggregateFunction('YEAR')).toBe(false);
    expect(isAggregateFunction('ISNULL')).toBe(false);
  });
});

// =============================================================================
// Edge cases and unknown fallback
// =============================================================================

describe('inferExprType — edge cases', () => {
  it('handles function name case-insensitively', () => {
    const body = minimalBody();
    const ctx = makeCtx();
    const expr: Expr = { kind: 'func', name: 'sum', args: [{ kind: 'column', name: 'X' }] };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'number' });
  });

  it('column ref without sourceAlias returns unknown', () => {
    const body = minimalBody();
    const ctx = makeCtx();
    const expr: Expr = { kind: 'column', name: 'Foo' };
    expect(inferExprType(expr, body, ctx)).toEqual({ kind: 'primitive', name: 'unknown' });
  });
});
