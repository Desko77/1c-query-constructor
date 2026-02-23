import { describe, it, expect } from 'vitest';
import { validate } from './validator.js';
import type { QueryModel, QueryBody, Source, SelectItem } from '../model/query-model.js';

// =============================================================================
// Helpers — build minimal valid model pieces
// =============================================================================

function minimalSource(alias = 'T1', object = 'Справочник.Контрагенты'): Source {
  return { alias, kind: 'object', object };
}

function minimalSelectExpr(alias?: string): SelectItem {
  return {
    kind: 'selectExpr',
    expr: { kind: 'column', sourceAlias: 'T1', name: 'Наименование' },
    ...(alias ? { alias } : {}),
  };
}

function minimalBody(overrides?: Partial<QueryBody>): QueryBody {
  return {
    kind: 'queryBody',
    sources: [minimalSource()],
    select: [minimalSelectExpr()],
    ...overrides,
  };
}

function minimalModel(overrides?: Partial<QueryModel>): QueryModel {
  return {
    version: '1.0',
    queries: [minimalBody()],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Validator', () => {
  // -------------------------------------------------------------------------
  // Minimal valid model
  // -------------------------------------------------------------------------
  it('passes for a minimal valid QueryModel', () => {
    const diags = validate(minimalModel());
    expect(diags).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // E001 — queries.length >= 1
  // -------------------------------------------------------------------------
  describe('E001: queries.length >= 1', () => {
    it('errors when queries is empty', () => {
      const model = minimalModel({ queries: [] });
      const diags = validate(model);
      expect(diags).toHaveLength(1);
      expect(diags[0].code).toBe('E001');
      expect(diags[0].message).toBe('QueryModel must have at least one query');
    });

    it('passes when queries has one item', () => {
      const diags = validate(minimalModel());
      expect(diags.filter((d) => d.code === 'E001')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E002 — kind checks
  // -------------------------------------------------------------------------
  describe('E002: kind field validation', () => {
    it('accepts queryBody kind', () => {
      const diags = validate(minimalModel());
      expect(diags.filter((d) => d.code === 'E002')).toHaveLength(0);
    });

    it('accepts destroyTempTable kind', () => {
      const body = minimalBody({ intoTempTable: { name: 'TT' } });
      const model: QueryModel = {
        version: '1.0',
        queries: [body, { kind: 'destroyTempTable', name: 'TT' }],
      };
      const diags = validate(model);
      expect(diags.filter((d) => d.code === 'E002')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E003 — Duplicate source alias
  // -------------------------------------------------------------------------
  describe('E003: Duplicate source alias', () => {
    it('errors on duplicate aliases', () => {
      const body = minimalBody({
        sources: [minimalSource('A'), minimalSource('A')],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E003')).toBe(true);
      expect(diags.find((d) => d.code === 'E003')!.message).toBe(
        'Duplicate source alias: A',
      );
    });

    it('passes with unique aliases', () => {
      const body = minimalBody({
        sources: [minimalSource('A'), minimalSource('B', 'Справочник.Товары')],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E003')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E004 — Join references unknown alias
  // -------------------------------------------------------------------------
  describe('E004: Join references unknown alias', () => {
    it('errors when join references non-existent alias', () => {
      const body = minimalBody({
        sources: [minimalSource('A')],
        joins: [
          {
            leftAlias: 'A',
            rightAlias: 'NOPE',
            type: 'inner',
            on: {
              kind: 'cmp',
              op: '=',
              left: { kind: 'column', sourceAlias: 'A', name: 'id' },
              right: { kind: 'column', sourceAlias: 'NOPE', name: 'id' },
            },
          },
        ],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E004')).toBe(true);
      expect(diags.find((d) => d.code === 'E004')!.message).toContain('NOPE');
    });

    it('passes when both aliases exist', () => {
      const body = minimalBody({
        sources: [minimalSource('A'), minimalSource('B', 'Справочник.Товары')],
        joins: [
          {
            leftAlias: 'A',
            rightAlias: 'B',
            type: 'left',
            on: {
              kind: 'cmp',
              op: '=',
              left: { kind: 'column', sourceAlias: 'A', name: 'id' },
              right: { kind: 'column', sourceAlias: 'B', name: 'id' },
            },
          },
        ],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E004')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E005 — Duplicate select alias
  // -------------------------------------------------------------------------
  describe('E005: Duplicate select alias', () => {
    it('errors on duplicate select aliases', () => {
      const body = minimalBody({
        select: [minimalSelectExpr('Col'), minimalSelectExpr('Col')],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E005')).toBe(true);
      expect(diags.find((d) => d.code === 'E005')!.message).toBe(
        'Duplicate select alias: Col',
      );
    });

    it('passes with unique select aliases', () => {
      const body = minimalBody({
        select: [minimalSelectExpr('A'), minimalSelectExpr('B')],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E005')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E006 — Duplicate parameter name
  // -------------------------------------------------------------------------
  describe('E006: Duplicate parameter name', () => {
    it('errors on duplicate parameter names across packet', () => {
      const body1 = minimalBody({
        parameters: [{ name: 'Дата' }],
      });
      const body2 = minimalBody({
        parameters: [{ name: 'Дата' }],
      });
      const diags = validate(minimalModel({ queries: [body1, body2] }));
      expect(diags.some((d) => d.code === 'E006')).toBe(true);
      expect(diags.find((d) => d.code === 'E006')!.message).toBe(
        'Duplicate parameter name: Дата',
      );
    });

    it('passes with unique parameter names', () => {
      const body = minimalBody({
        parameters: [{ name: 'Дата' }, { name: 'Контрагент' }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E006')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E007 — SELECT must have at least one item
  // -------------------------------------------------------------------------
  describe('E007: SELECT must have at least one item', () => {
    it('errors when select is empty', () => {
      const body = minimalBody({ select: [] });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E007')).toBe(true);
      expect(diags.find((d) => d.code === 'E007')!.message).toBe(
        'SELECT must have at least one item',
      );
    });

    it('passes with one select item', () => {
      const diags = validate(minimalModel());
      expect(diags.filter((d) => d.code === 'E007')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E008 — HAVING requires GROUP BY
  // -------------------------------------------------------------------------
  describe('E008: HAVING requires GROUP BY', () => {
    it('errors when HAVING without GROUP BY', () => {
      const body = minimalBody({
        having: {
          kind: 'cmp',
          op: '>',
          left: { kind: 'func', name: 'COUNT', args: [{ kind: 'column', name: 'id' }] },
          right: { kind: 'literal', litType: 'number', value: 0 },
        },
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E008')).toBe(true);
      expect(diags.find((d) => d.code === 'E008')!.message).toBe(
        'HAVING requires GROUP BY',
      );
    });

    it('passes when HAVING with GROUP BY', () => {
      const body = minimalBody({
        groupBy: [{ kind: 'column', sourceAlias: 'T1', name: 'Тип' }],
        select: [minimalSelectExpr('Тип')],
        having: {
          kind: 'cmp',
          op: '>',
          left: { kind: 'func', name: 'COUNT', args: [{ kind: 'column', name: 'id' }] },
          right: { kind: 'literal', litType: 'number', value: 0 },
        },
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E008')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E009 — Wildcard SELECT not allowed with GROUP BY
  // -------------------------------------------------------------------------
  describe('E009: Wildcard SELECT with GROUP BY', () => {
    it('errors when SELECT * with GROUP BY', () => {
      const body = minimalBody({
        select: [{ kind: 'wildcard' }],
        groupBy: [{ kind: 'column', sourceAlias: 'T1', name: 'Тип' }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E009')).toBe(true);
      expect(diags.find((d) => d.code === 'E009')!.message).toBe(
        'Wildcard SELECT not allowed with GROUP BY',
      );
    });

    it('passes when SELECT * without GROUP BY', () => {
      const body = minimalBody({
        select: [{ kind: 'wildcard' }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E009')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E010 — Source kind 'object' must have 'object' field
  // -------------------------------------------------------------------------
  describe('E010: Source kind object consistency', () => {
    it('errors when object source lacks object field', () => {
      const body = minimalBody({
        sources: [{ alias: 'T1', kind: 'object' }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E010')).toBe(true);
      expect(diags.find((d) => d.code === 'E010')!.message).toBe(
        "Source with kind 'object' must have 'object' field",
      );
    });

    it('passes when object source has object field', () => {
      const diags = validate(minimalModel());
      expect(diags.filter((d) => d.code === 'E010')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E011 — Source kind 'virtual' must have 'object' field
  // -------------------------------------------------------------------------
  describe('E011: Source kind virtual consistency', () => {
    it('errors when virtual source lacks object field', () => {
      const body = minimalBody({
        sources: [{ alias: 'V1', kind: 'virtual' }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E011')).toBe(true);
    });

    it('passes when virtual source has object field', () => {
      const body = minimalBody({
        sources: [{ alias: 'V1', kind: 'virtual', object: 'РегистрНакопления.Остатки' }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E011')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E012 — Source kind 'subquery' consistency
  // -------------------------------------------------------------------------
  describe('E012: Source kind subquery consistency', () => {
    it('errors when subquery source lacks subquery field', () => {
      const body = minimalBody({
        sources: [{ alias: 'SQ', kind: 'subquery' }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E012' && d.message.includes("must have 'subquery'"))).toBe(true);
    });

    it('errors when subquery source has object field', () => {
      const innerBody = minimalBody();
      const body = minimalBody({
        sources: [{ alias: 'SQ', kind: 'subquery', subquery: innerBody, object: 'Foo' }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E012' && d.message.includes("must not have 'object'"))).toBe(true);
    });

    it('passes with valid subquery source', () => {
      const innerBody = minimalBody();
      const body = minimalBody({
        sources: [{ alias: 'SQ', kind: 'subquery', subquery: innerBody }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E012')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E013 — Source kind 'tempTable' consistency
  // -------------------------------------------------------------------------
  describe('E013: Source kind tempTable consistency', () => {
    it('errors when tempTable source lacks tempTableName', () => {
      const body = minimalBody({
        sources: [{ alias: 'TT', kind: 'tempTable' }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E013' && d.message.includes("must have 'tempTableName'"))).toBe(true);
    });

    it('errors when tempTable source has object field', () => {
      // First create the temp table, then use it
      const createBody = minimalBody({ intoTempTable: { name: 'TT1' } });
      const useBody = minimalBody({
        sources: [{ alias: 'TT', kind: 'tempTable', tempTableName: 'TT1', object: 'Foo' }],
      });
      const diags = validate(minimalModel({ queries: [createBody, useBody] }));
      expect(diags.some((d) => d.code === 'E013' && d.message.includes("must not have 'object'"))).toBe(true);
    });

    it('passes with valid tempTable source', () => {
      const createBody = minimalBody({ intoTempTable: { name: 'TT1' } });
      const useBody = minimalBody({
        sources: [{ alias: 'TT', kind: 'tempTable', tempTableName: 'TT1' }],
      });
      const diags = validate(minimalModel({ queries: [createBody, useBody] }));
      expect(diags.filter((d) => d.code === 'E013')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E014 — UNION parts must have same select count
  // -------------------------------------------------------------------------
  describe('E014: UNION select count mismatch', () => {
    it('errors when union parts have different select counts', () => {
      const body = minimalBody({
        select: [minimalSelectExpr('A'), minimalSelectExpr('B')],
        union: [
          {
            all: true,
            body: minimalBody({
              select: [minimalSelectExpr('X')],
            }),
          },
        ],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E014')).toBe(true);
      expect(diags.find((d) => d.code === 'E014')!.message).toBe(
        'UNION parts have different select counts: 2 vs 1',
      );
    });

    it('passes when union parts have same select count', () => {
      const body = minimalBody({
        select: [minimalSelectExpr('A')],
        union: [
          {
            all: true,
            body: minimalBody({
              select: [minimalSelectExpr('X')],
            }),
          },
        ],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E014')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E015 / E016 — ORDER BY / TOTALS not allowed in UNION part
  // -------------------------------------------------------------------------
  describe('E015/E016: ORDER BY / TOTALS in UNION part', () => {
    it('errors when union part has ORDER BY', () => {
      const body = minimalBody({
        union: [
          {
            all: true,
            body: minimalBody({
              orderBy: [
                { expr: { kind: 'column', sourceAlias: 'T1', name: 'id' }, direction: 'asc' },
              ],
            }),
          },
        ],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E015')).toBe(true);
      expect(diags.find((d) => d.code === 'E015')!.message).toBe(
        'ORDER BY not allowed in UNION part',
      );
    });

    it('errors when union part has TOTALS', () => {
      const body = minimalBody({
        union: [
          {
            all: true,
            body: minimalBody({
              totals: { by: [{ kind: 'column', sourceAlias: 'T1', name: 'id' }] },
            }),
          },
        ],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E016')).toBe(true);
      expect(diags.find((d) => d.code === 'E016')!.message).toBe(
        'TOTALS not allowed in UNION part',
      );
    });

    it('passes when main query has ORDER BY (not in union part)', () => {
      const body = minimalBody({
        orderBy: [
          { expr: { kind: 'column', sourceAlias: 'T1', name: 'id' }, direction: 'asc' },
        ],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E015')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E017 — TOP must be positive
  // -------------------------------------------------------------------------
  describe('E017: TOP validation', () => {
    it('errors when top is 0', () => {
      const body = minimalBody({ options: { top: 0 } });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E017')).toBe(true);
      expect(diags.find((d) => d.code === 'E017')!.message).toBe(
        'TOP must be a positive integer',
      );
    });

    it('errors when top is negative', () => {
      const body = minimalBody({ options: { top: -5 } });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E017')).toBe(true);
    });

    it('passes when top is positive', () => {
      const body = minimalBody({ options: { top: 10 } });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E017')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E018 / E019 — forUpdate specific mode
  // -------------------------------------------------------------------------
  describe('E018/E019: forUpdate validation', () => {
    it('errors when specific mode has empty tables', () => {
      const body = minimalBody({
        options: { forUpdate: { mode: 'specific', tables: [] } },
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E018')).toBe(true);
    });

    it('errors when specific mode references unknown alias', () => {
      const body = minimalBody({
        options: { forUpdate: { mode: 'specific', tables: ['UNKNOWN'] } },
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E019')).toBe(true);
      expect(diags.find((d) => d.code === 'E019')!.message).toContain('UNKNOWN');
    });

    it('passes when specific mode references existing alias', () => {
      const body = minimalBody({
        options: { forUpdate: { mode: 'specific', tables: ['T1'] } },
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E018')).toHaveLength(0);
      expect(diags.filter((d) => d.code === 'E019')).toHaveLength(0);
    });

    it('passes with forUpdate mode all', () => {
      const body = minimalBody({
        options: { forUpdate: { mode: 'all' } },
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.filter((d) => d.code === 'E018')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Temp table lifecycle
  // -------------------------------------------------------------------------
  describe('Temp table lifecycle', () => {
    it('E023: errors when temp table used before creation', () => {
      const body = minimalBody({
        sources: [{ alias: 'TT', kind: 'tempTable', tempTableName: 'MyTT' }],
      });
      const diags = validate(minimalModel({ queries: [body] }));
      expect(diags.some((d) => d.code === 'E023')).toBe(true);
      expect(diags.find((d) => d.code === 'E023')!.message).toBe(
        'Temp table used before creation: MyTT',
      );
    });

    it('E024: errors when temp table used after DESTROY', () => {
      const create = minimalBody({ intoTempTable: { name: 'MyTT' } });
      const destroy: QueryModel['queries'][number] = { kind: 'destroyTempTable', name: 'MyTT' };
      const useAfterDestroy = minimalBody({
        sources: [{ alias: 'TT', kind: 'tempTable', tempTableName: 'MyTT' }],
      });
      const diags = validate(minimalModel({ queries: [create, destroy, useAfterDestroy] }));
      expect(diags.some((d) => d.code === 'E024')).toBe(true);
      expect(diags.find((d) => d.code === 'E024')!.message).toBe(
        'Temp table used after DESTROY: MyTT',
      );
    });

    it('E020: errors on DESTROY of non-existent temp table', () => {
      const diags = validate(
        minimalModel({
          queries: [{ kind: 'destroyTempTable', name: 'Ghost' }],
        }),
      );
      expect(diags.some((d) => d.code === 'E020')).toBe(true);
      expect(diags.find((d) => d.code === 'E020')!.message).toBe(
        'DESTROY of non-existent temp table: Ghost',
      );
    });

    it('E021: errors on double DESTROY', () => {
      const create = minimalBody({ intoTempTable: { name: 'TT' } });
      const diags = validate(
        minimalModel({
          queries: [
            create,
            { kind: 'destroyTempTable', name: 'TT' },
            { kind: 'destroyTempTable', name: 'TT' },
          ],
        }),
      );
      expect(diags.some((d) => d.code === 'E021')).toBe(true);
      expect(diags.find((d) => d.code === 'E021')!.message).toBe(
        'Double DESTROY of temp table: TT',
      );
    });

    it('E022: errors on double creation of same temp table', () => {
      const create1 = minimalBody({ intoTempTable: { name: 'TT' } });
      const create2 = minimalBody({ intoTempTable: { name: 'TT' } });
      const diags = validate(minimalModel({ queries: [create1, create2] }));
      expect(diags.some((d) => d.code === 'E022')).toBe(true);
      expect(diags.find((d) => d.code === 'E022')!.message).toBe(
        'Double creation of temp table: TT',
      );
    });

    it('passes for valid create → use → destroy lifecycle', () => {
      const create = minimalBody({ intoTempTable: { name: 'TT1' } });
      const use = minimalBody({
        sources: [{ alias: 'T', kind: 'tempTable', tempTableName: 'TT1' }],
      });
      const destroy = { kind: 'destroyTempTable' as const, name: 'TT1' };
      const diags = validate(minimalModel({ queries: [create, use, destroy] }));
      const ttErrors = diags.filter((d) =>
        ['E020', 'E021', 'E022', 'E023', 'E024'].includes(d.code),
      );
      expect(ttErrors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E030 — maxSubqueryDepth
  // -------------------------------------------------------------------------
  describe('E030: maxSubqueryDepth', () => {
    it('errors when subquery depth exceeds maximum', () => {
      const innermost = minimalBody();
      const middle = minimalBody({
        sources: [{ alias: 'SQ2', kind: 'subquery', subquery: innermost }],
      });
      const outer = minimalBody({
        sources: [{ alias: 'SQ1', kind: 'subquery', subquery: middle }],
      });
      const diags = validate(minimalModel({ queries: [outer] }), {
        maxSubqueryDepth: 1,
      });
      expect(diags.some((d) => d.code === 'E030')).toBe(true);
    });

    it('passes when subquery depth within limit', () => {
      const inner = minimalBody();
      const outer = minimalBody({
        sources: [{ alias: 'SQ1', kind: 'subquery', subquery: inner }],
      });
      const diags = validate(minimalModel({ queries: [outer] }), {
        maxSubqueryDepth: 5,
      });
      expect(diags.filter((d) => d.code === 'E030')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Complex integration scenario
  // -------------------------------------------------------------------------
  describe('Integration: multiple errors in one model', () => {
    it('reports multiple errors simultaneously', () => {
      const body = minimalBody({
        sources: [
          { alias: 'A', kind: 'object' }, // E010: missing object field
          { alias: 'A', kind: 'object', object: 'Foo' }, // E003: duplicate alias
        ],
        select: [], // E007: empty select
        having: {
          // E008: having without group by
          kind: 'cmp',
          op: '>',
          left: { kind: 'literal', litType: 'number', value: 1 },
          right: { kind: 'literal', litType: 'number', value: 0 },
        },
        options: { top: 0 }, // E017: top <= 0
      });
      const diags = validate(minimalModel({ queries: [body] }));
      const codes = diags.map((d) => d.code);
      expect(codes).toContain('E003');
      expect(codes).toContain('E007');
      expect(codes).toContain('E008');
      expect(codes).toContain('E010');
      expect(codes).toContain('E017');
    });
  });

  // -------------------------------------------------------------------------
  // Severity checks
  // -------------------------------------------------------------------------
  describe('Diagnostics severity', () => {
    it('all structural invariant violations are errors', () => {
      const body = minimalBody({ select: [] });
      const diags = validate(minimalModel({ queries: [body] }));
      for (const d of diags) {
        expect(d.severity).toBe('error');
      }
    });
  });
});
