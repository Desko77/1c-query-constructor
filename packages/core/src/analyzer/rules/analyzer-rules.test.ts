import { describe, it, expect } from 'vitest';
import type { QueryModel, QueryBody, Source, SelectItem } from '../../model/query-model.js';
import { analyze } from '../analyzer.js';
import type { QueryRule } from '../rule-types.js';
import { sqa001SelectWildcard } from './sqa-001-select-wildcard.js';
import { sqa002CrossJoin } from './sqa-002-cross-join.js';
import { sqa003RedundantJoin } from './sqa-003-redundant-join.js';
import { sqa004GroupByConflict } from './sqa-004-groupby-conflict.js';
import { sqa005UnusedParam } from './sqa-005-unused-param.js';
import { sqa006UndefinedParam } from './sqa-006-undefined-param.js';

// =============================================================================
// Helpers
// =============================================================================

function minimalSource(alias = 'T1', object = 'Справочник.Контрагенты'): Source {
  return { alias, kind: 'object', object };
}

function colExpr(name: string, sourceAlias?: string): SelectItem {
  return {
    kind: 'selectExpr',
    expr: { kind: 'column', sourceAlias, name },
  };
}

function minimalBody(overrides?: Partial<QueryBody>): QueryBody {
  return {
    kind: 'queryBody',
    sources: [minimalSource()],
    select: [colExpr('Наименование', 'T1')],
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

const allRules: QueryRule[] = [
  sqa001SelectWildcard,
  sqa002CrossJoin,
  sqa003RedundantJoin,
  sqa004GroupByConflict,
  sqa005UnusedParam,
  sqa006UndefinedParam,
];

// =============================================================================
// SQA-001: SELECT * Warning
// =============================================================================

describe('SQA-001: SELECT * Warning', () => {
  it('fires when SELECT has wildcard', () => {
    const body = minimalBody({
      select: [{ kind: 'wildcard' }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa001SelectWildcard]);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('SQA-001');
    expect(diags[0].severity).toBe('warn');
    expect(diags[0].message).toContain('Avoid SELECT *');
  });

  it('does not fire when SELECT has explicit columns', () => {
    const model = minimalModel();
    const diags = analyze(model, [sqa001SelectWildcard]);
    expect(diags).toHaveLength(0);
  });

  it('fires for multiple wildcards', () => {
    const body = minimalBody({
      select: [{ kind: 'wildcard' }, { kind: 'wildcard', sourceAlias: 'T1' }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa001SelectWildcard]);
    expect(diags).toHaveLength(2);
  });
});

// =============================================================================
// SQA-002: Cross Join Warning
// =============================================================================

describe('SQA-002: Cross Join Warning', () => {
  it('fires when multiple sources have no joins', () => {
    const body = minimalBody({
      sources: [minimalSource('A'), minimalSource('B', 'Справочник.Товары')],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa002CrossJoin]);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('SQA-002');
    expect(diags[0].severity).toBe('warn');
    expect(diags[0].message).toContain('cross join');
  });

  it('does not fire when there is a single source', () => {
    const model = minimalModel();
    const diags = analyze(model, [sqa002CrossJoin]);
    expect(diags).toHaveLength(0);
  });

  it('does not fire when joins cover all sources', () => {
    const body = minimalBody({
      sources: [minimalSource('A'), minimalSource('B', 'Справочник.Товары')],
      joins: [{
        leftAlias: 'A',
        rightAlias: 'B',
        type: 'inner',
        on: {
          kind: 'cmp',
          op: '=',
          left: { kind: 'column', sourceAlias: 'A', name: 'id' },
          right: { kind: 'column', sourceAlias: 'B', name: 'id' },
        },
      }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa002CrossJoin]);
    expect(diags).toHaveLength(0);
  });

  it('fires when 3 sources but only 1 join', () => {
    const body = minimalBody({
      sources: [
        minimalSource('A'),
        minimalSource('B', 'Справочник.Товары'),
        minimalSource('C', 'Документ.Счет'),
      ],
      joins: [{
        leftAlias: 'A',
        rightAlias: 'B',
        type: 'left',
        on: {
          kind: 'cmp',
          op: '=',
          left: { kind: 'column', sourceAlias: 'A', name: 'id' },
          right: { kind: 'column', sourceAlias: 'B', name: 'id' },
        },
      }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa002CrossJoin]);
    expect(diags).toHaveLength(1);
  });
});

// =============================================================================
// SQA-003: Redundant Join Warning
// =============================================================================

describe('SQA-003: Redundant Join Warning', () => {
  it('fires when joined alias is not referenced anywhere', () => {
    const body = minimalBody({
      sources: [minimalSource('A'), minimalSource('B', 'Справочник.Товары')],
      select: [colExpr('Наименование', 'A')], // only A is referenced
      joins: [{
        leftAlias: 'A',
        rightAlias: 'B',
        type: 'left',
        on: {
          kind: 'cmp',
          op: '=',
          left: { kind: 'column', sourceAlias: 'A', name: 'id' },
          right: { kind: 'column', sourceAlias: 'B', name: 'id' },
        },
      }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa003RedundantJoin]);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('SQA-003');
    expect(diags[0].severity).toBe('warn');
    expect(diags[0].message).toContain("'B'");
  });

  it('does not fire when joined alias is referenced in SELECT', () => {
    const body = minimalBody({
      sources: [minimalSource('A'), minimalSource('B', 'Справочник.Товары')],
      select: [colExpr('Наименование', 'A'), colExpr('Цена', 'B')],
      joins: [{
        leftAlias: 'A',
        rightAlias: 'B',
        type: 'inner',
        on: {
          kind: 'cmp',
          op: '=',
          left: { kind: 'column', sourceAlias: 'A', name: 'id' },
          right: { kind: 'column', sourceAlias: 'B', name: 'id' },
        },
      }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa003RedundantJoin]);
    expect(diags).toHaveLength(0);
  });

  it('does not fire when joined alias is referenced in WHERE', () => {
    const body = minimalBody({
      sources: [minimalSource('A'), minimalSource('B', 'Справочник.Товары')],
      select: [colExpr('Наименование', 'A')],
      joins: [{
        leftAlias: 'A',
        rightAlias: 'B',
        type: 'inner',
        on: {
          kind: 'cmp',
          op: '=',
          left: { kind: 'column', sourceAlias: 'A', name: 'id' },
          right: { kind: 'column', sourceAlias: 'B', name: 'id' },
        },
      }],
      where: {
        kind: 'cmp',
        op: '>',
        left: { kind: 'column', sourceAlias: 'B', name: 'Цена' },
        right: { kind: 'literal', litType: 'number', value: 100 },
      },
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa003RedundantJoin]);
    expect(diags).toHaveLength(0);
  });

  it('does not fire when no joins', () => {
    const model = minimalModel();
    const diags = analyze(model, [sqa003RedundantJoin]);
    expect(diags).toHaveLength(0);
  });
});

// =============================================================================
// SQA-004: GROUP BY Conflict
// =============================================================================

describe('SQA-004: GROUP BY Conflict', () => {
  it('fires when select expression is not in GROUP BY and not aggregate', () => {
    const body = minimalBody({
      select: [
        colExpr('Наименование', 'T1'),
        colExpr('Цена', 'T1'),
      ],
      groupBy: [{ kind: 'column', sourceAlias: 'T1', name: 'Наименование' }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa004GroupByConflict]);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('SQA-004');
    expect(diags[0].severity).toBe('error');
    expect(diags[0].message).toContain('not aggregated');
  });

  it('does not fire when all selects are in GROUP BY or aggregates', () => {
    const body = minimalBody({
      select: [
        colExpr('Наименование', 'T1'),
        {
          kind: 'selectExpr',
          expr: { kind: 'func', name: 'SUM', args: [{ kind: 'column', sourceAlias: 'T1', name: 'Цена' }] },
          alias: 'Итого',
        },
      ],
      groupBy: [{ kind: 'column', sourceAlias: 'T1', name: 'Наименование' }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa004GroupByConflict]);
    expect(diags).toHaveLength(0);
  });

  it('does not fire when no GROUP BY', () => {
    const model = minimalModel();
    const diags = analyze(model, [sqa004GroupByConflict]);
    expect(diags).toHaveLength(0);
  });

  it('allows COUNT as aggregate', () => {
    const body = minimalBody({
      select: [
        {
          kind: 'selectExpr',
          expr: { kind: 'func', name: 'COUNT', args: [{ kind: 'column', sourceAlias: 'T1', name: 'Ссылка' }] },
          alias: 'Кол',
        },
      ],
      groupBy: [{ kind: 'column', sourceAlias: 'T1', name: 'Тип' }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa004GroupByConflict]);
    expect(diags).toHaveLength(0);
  });
});

// =============================================================================
// SQA-005: Unused Parameter
// =============================================================================

describe('SQA-005: Unused Parameter', () => {
  it('fires when parameter is declared but not referenced', () => {
    const body = minimalBody({
      parameters: [{ name: 'НеИспользуемый' }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa005UnusedParam]);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('SQA-005');
    expect(diags[0].severity).toBe('info');
    expect(diags[0].message).toContain('&НеИспользуемый');
  });

  it('does not fire when parameter is used in WHERE', () => {
    const body = minimalBody({
      parameters: [{ name: 'Период' }],
      where: {
        kind: 'cmp',
        op: '=',
        left: { kind: 'column', sourceAlias: 'T1', name: 'Дата' },
        right: { kind: 'param', name: 'Период' },
      },
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa005UnusedParam]);
    expect(diags).toHaveLength(0);
  });

  it('does not fire when no parameters declared', () => {
    const model = minimalModel();
    const diags = analyze(model, [sqa005UnusedParam]);
    expect(diags).toHaveLength(0);
  });

  it('fires for each unused parameter', () => {
    const body = minimalBody({
      parameters: [
        { name: 'А' },
        { name: 'Б' },
        { name: 'В' },
      ],
      where: {
        kind: 'cmp',
        op: '=',
        left: { kind: 'column', sourceAlias: 'T1', name: 'X' },
        right: { kind: 'param', name: 'А' },
      },
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa005UnusedParam]);
    expect(diags).toHaveLength(2);
    const names = diags.map(d => d.message);
    expect(names.some(m => m.includes('&Б'))).toBe(true);
    expect(names.some(m => m.includes('&В'))).toBe(true);
  });
});

// =============================================================================
// SQA-006: Undefined Parameter
// =============================================================================

describe('SQA-006: Undefined Parameter', () => {
  it('fires when param ref exists but no declaration', () => {
    const body = minimalBody({
      where: {
        kind: 'cmp',
        op: '=',
        left: { kind: 'column', sourceAlias: 'T1', name: 'Дата' },
        right: { kind: 'param', name: 'НеОбъявленный' },
      },
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa006UndefinedParam]);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('SQA-006');
    expect(diags[0].severity).toBe('warn');
    expect(diags[0].message).toContain('&НеОбъявленный');
  });

  it('does not fire when param is declared', () => {
    const body = minimalBody({
      parameters: [{ name: 'Период' }],
      where: {
        kind: 'cmp',
        op: '=',
        left: { kind: 'column', sourceAlias: 'T1', name: 'Дата' },
        right: { kind: 'param', name: 'Период' },
      },
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa006UndefinedParam]);
    expect(diags).toHaveLength(0);
  });

  it('does not fire when there are no param refs', () => {
    const model = minimalModel();
    const diags = analyze(model, [sqa006UndefinedParam]);
    expect(diags).toHaveLength(0);
  });

  it('fires for param ref in SELECT', () => {
    const body = minimalBody({
      select: [
        { kind: 'selectExpr', expr: { kind: 'param', name: 'Х' } },
      ],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa006UndefinedParam]);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain('&Х');
  });
});

// =============================================================================
// Integration with analyze() engine
// =============================================================================

describe('Analyzer integration', () => {
  it('runs all rules together', () => {
    const body = minimalBody({
      sources: [minimalSource('A'), minimalSource('B', 'Справочник.Товары')],
      select: [{ kind: 'wildcard' }], // SQA-001
      // No joins between A and B → SQA-002
      parameters: [{ name: 'НеИспольз' }], // SQA-005
      where: {
        kind: 'cmp',
        op: '=',
        left: { kind: 'column', sourceAlias: 'A', name: 'X' },
        right: { kind: 'param', name: 'НеОбъявл' }, // SQA-006
      },
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, allRules);
    const codes = diags.map(d => d.code);
    expect(codes).toContain('SQA-001');
    expect(codes).toContain('SQA-002');
    expect(codes).toContain('SQA-005');
    expect(codes).toContain('SQA-006');
  });

  it('analyzes union parts', () => {
    const unionBody = minimalBody({
      select: [{ kind: 'wildcard' }],
    });
    const body = minimalBody({
      union: [{ all: true, body: unionBody }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa001SelectWildcard]);
    // Should fire for union part
    expect(diags.some(d => d.code === 'SQA-001')).toBe(true);
  });
});

// =============================================================================
// Rule override tests
// =============================================================================

describe('Rule overrides', () => {
  it('can change severity via ruleOverrides', () => {
    const body = minimalBody({
      select: [{ kind: 'wildcard' }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa001SelectWildcard], {
      ruleOverrides: { 'SQA-001': 'error' },
    });
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
  });

  it('can turn off a rule via ruleOverrides', () => {
    const body = minimalBody({
      select: [{ kind: 'wildcard' }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa001SelectWildcard], {
      ruleOverrides: { 'SQA-001': 'off' },
    });
    expect(diags).toHaveLength(0);
  });

  it('can downgrade error to info', () => {
    const body = minimalBody({
      select: [
        colExpr('Цена', 'T1'),
      ],
      groupBy: [{ kind: 'column', sourceAlias: 'T1', name: 'Наименование' }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa004GroupByConflict], {
      ruleOverrides: { 'SQA-004': 'info' },
    });
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('info');
  });

  it('overrides do not affect other rules', () => {
    const body = minimalBody({
      sources: [minimalSource('A'), minimalSource('B', 'Справочник.Товары')],
      select: [{ kind: 'wildcard' }],
    });
    const model = minimalModel({ queries: [body] });
    const diags = analyze(model, [sqa001SelectWildcard, sqa002CrossJoin], {
      ruleOverrides: { 'SQA-001': 'off' },
    });
    // SQA-001 should be off, SQA-002 should still fire
    expect(diags.every(d => d.code !== 'SQA-001')).toBe(true);
    expect(diags.some(d => d.code === 'SQA-002')).toBe(true);
  });
});
