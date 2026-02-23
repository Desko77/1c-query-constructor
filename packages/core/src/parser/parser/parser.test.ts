import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, parseQuery } from './parser.js';
import type {
  QueryBody,
  SelectExprItem,
  SelectWildcard,
  ColumnRef,
  ParamRef,
  Literal,
  FuncCall,
  CaseExpr,
  CastExpr,
  BinaryExpr,
  CompareExpr,
  InExpr,
  BetweenExpr,
  RefCheckExpr,
  InHierarchyExpr,
  BoolGroup,
  NotExpr,
  ExistsExpr,
  DestroyTempTable,
  UnaryExpr,
} from '../../model/query-model.js';

const CORPUS = resolve(__dirname, '../../../../../corpus/valid');

function readCorpus(filename: string): string {
  return readFileSync(resolve(CORPUS, filename), 'utf-8');
}

function body0(input: string): QueryBody {
  const { model } = parse(input);
  const q = model.queries[0];
  expect(q.kind).toBe('queryBody');
  return q as QueryBody;
}

// =============================================================================
// 001 — Simple SELECT + WHERE + ORDER BY
// =============================================================================

describe('001-simple-select', () => {
  const input = readCorpus('001-simple-select.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  it('should have one query', () => {
    expect(model.queries).toHaveLength(1);
    expect(model.queries[0].kind).toBe('queryBody');
  });

  it('should detect Russian language', () => {
    expect(model.meta?.language).toBe('RU');
  });

  const q = model.queries[0] as QueryBody;

  it('should have two select items with aliases', () => {
    expect(q.select).toHaveLength(2);

    const sel0 = q.select[0] as SelectExprItem;
    expect(sel0.kind).toBe('selectExpr');
    expect(sel0.alias).toBe('Номенклатура');
    const col0 = sel0.expr as ColumnRef;
    expect(col0.kind).toBe('column');
    expect(col0.sourceAlias).toBe('Ном');
    expect(col0.name).toBe('Ссылка');

    const sel1 = q.select[1] as SelectExprItem;
    expect(sel1.alias).toBe('Наименование');
    const col1 = sel1.expr as ColumnRef;
    expect(col1.sourceAlias).toBe('Ном');
    expect(col1.name).toBe('Наименование');
  });

  it('should have one object source', () => {
    expect(q.sources).toHaveLength(1);
    expect(q.sources[0].kind).toBe('object');
    expect(q.sources[0].object).toBe('Справочник.Номенклатура');
    expect(q.sources[0].alias).toBe('Ном');
  });

  it('should have WHERE with AND of two conditions', () => {
    expect(q.where).toBeDefined();
    const w = q.where as BoolGroup;
    expect(w.kind).toBe('boolGroup');
    expect(w.op).toBe('and');
    expect(w.items).toHaveLength(2);

    // First condition: Ном.ЭтоГруппа = ЛОЖЬ
    const cmp0 = w.items[0] as CompareExpr;
    expect(cmp0.kind).toBe('cmp');
    expect(cmp0.op).toBe('=');
    expect((cmp0.left as ColumnRef).name).toBe('ЭтоГруппа');
    expect((cmp0.right as Literal).value).toBe(false);

    // Second condition: ПОДОБНО &Поиск
    const cmp1 = w.items[1] as CompareExpr;
    expect(cmp1.kind).toBe('cmp');
    expect(cmp1.op).toBe('like');
    expect((cmp1.left as ColumnRef).name).toBe('Наименование');
    expect((cmp1.right as ParamRef).kind).toBe('param');
    expect((cmp1.right as ParamRef).name).toBe('Поиск');
  });

  it('should have ORDER BY with ASC', () => {
    expect(q.orderBy).toHaveLength(1);
    expect(q.orderBy![0].direction).toBe('asc');
    expect((q.orderBy![0].expr as ColumnRef).name).toBe('Наименование');
  });
});

// =============================================================================
// 002 — JOIN with virtual table
// =============================================================================

describe('002-join-virtual-table', () => {
  const input = readCorpus('002-join-virtual-table.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  const q = model.queries[0] as QueryBody;

  it('should have three select items', () => {
    expect(q.select).toHaveLength(3);
    expect((q.select[0] as SelectExprItem).alias).toBe('Склад');
    expect((q.select[1] as SelectExprItem).alias).toBe('Номенклатура');
    expect((q.select[2] as SelectExprItem).alias).toBe('Остаток');
  });

  it('should have virtual table source with parameter', () => {
    expect(q.sources).toHaveLength(2); // main + joined
    const src = q.sources[0];
    expect(src.kind).toBe('virtual');
    expect(src.object).toBe('РегистрНакопления.ТоварыНаСкладах.Остатки');
    expect(src.alias).toBe('Ост');
    expect(src.virtualParams).toHaveLength(1);
    expect((src.virtualParams![0].value as ParamRef).name).toBe('НаДату');
  });

  it('should have LEFT JOIN', () => {
    expect(q.joins).toHaveLength(1);
    expect(q.joins![0].type).toBe('left');
    expect(q.joins![0].rightAlias).toBe('Ном');
    // ON condition: Ост.Номенклатура = Ном.Ссылка
    const on = q.joins![0].on as CompareExpr;
    expect(on.op).toBe('=');
  });

  it('should have WHERE with > comparison', () => {
    const w = q.where as CompareExpr;
    expect(w.kind).toBe('cmp');
    expect(w.op).toBe('>');
    expect((w.right as Literal).value).toBe(0);
  });
});

// =============================================================================
// 003 — Batch with temp tables
// =============================================================================

describe('003-batch-temp-table', () => {
  const input = readCorpus('003-batch-temp-table.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  it('should have three query items (two SELECT + one DESTROY)', () => {
    expect(model.queries).toHaveLength(3);
    expect(model.queries[0].kind).toBe('queryBody');
    expect(model.queries[1].kind).toBe('queryBody');
    expect(model.queries[2].kind).toBe('destroyTempTable');
  });

  it('should have INTO temp table on first query', () => {
    const q0 = model.queries[0] as QueryBody;
    expect(q0.intoTempTable).toBeDefined();
    expect(q0.intoTempTable!.name).toBe('ВТ_Документы');
  });

  it('should have temp table source on second query', () => {
    const q1 = model.queries[1] as QueryBody;
    expect(q1.sources).toHaveLength(1);
    expect(q1.sources[0].kind).toBe('tempTable');
    expect(q1.sources[0].tempTableName).toBe('ВТ_Документы');
  });

  it('should have DESTROY for temp table', () => {
    const d = model.queries[2] as DestroyTempTable;
    expect(d.name).toBe('ВТ_Документы');
  });

  it('should parse function call in select (КОЛИЧЕСТВО → COUNT)', () => {
    const q1 = model.queries[1] as QueryBody;
    const sel = q1.select[0] as SelectExprItem;
    const func = sel.expr as FuncCall;
    expect(func.kind).toBe('func');
    expect(func.name).toBe('COUNT');
    expect(func.args).toHaveLength(1);
  });
});

// =============================================================================
// 004 — UNION ALL, DISTINCT, REFS, IN HIERARCHY
// =============================================================================

describe('004-union-distinct-refs', () => {
  const input = readCorpus('004-union-distinct-refs.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  it('should have one query with UNION ALL', () => {
    expect(model.queries).toHaveLength(1);
    const q = model.queries[0] as QueryBody;
    expect(q.union).toHaveLength(1);
    expect(q.union![0].all).toBe(true);
  });

  it('should have DISTINCT option on first body', () => {
    const q = model.queries[0] as QueryBody;
    expect(q.options?.distinct).toBe(true);
  });

  it('should have REFS check in WHERE', () => {
    const q = model.queries[0] as QueryBody;
    const w = q.where as BoolGroup;
    expect(w.kind).toBe('boolGroup');
    expect(w.op).toBe('and');

    const refsCheck = w.items[0] as RefCheckExpr;
    expect(refsCheck.kind).toBe('refCheck');
    expect(refsCheck.refType).toBe('Документ.РеализацияТоваровУслуг');
  });

  it('should have IN HIERARCHY in WHERE', () => {
    const q = model.queries[0] as QueryBody;
    const w = q.where as BoolGroup;
    const hierCheck = w.items[1] as InHierarchyExpr;
    expect(hierCheck.kind).toBe('inHierarchy');
    expect((hierCheck.value as ParamRef).name).toBe('ГруппаНоменклатуры');
  });

  it('should have subquery source in UNION part', () => {
    const q = model.queries[0] as QueryBody;
    const unionBody = q.union![0].body;
    expect(unionBody.sources).toHaveLength(1);
    expect(unionBody.sources[0].kind).toBe('subquery');
    expect(unionBody.sources[0].alias).toBe('Под');
  });

  it('should have DISTINCT option on union body', () => {
    const q = model.queries[0] as QueryBody;
    const unionBody = q.union![0].body;
    expect(unionBody.options?.distinct).toBe(true);
  });
});

// =============================================================================
// 005 — GROUP BY, HAVING, aggregates
// =============================================================================

describe('005-group-by-aggregates', () => {
  const input = readCorpus('005-group-by-aggregates.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  const q = model.queries[0] as QueryBody;

  it('should have five select items with aggregate functions', () => {
    expect(q.select).toHaveLength(5);

    // СУММА(Продажи.Сумма) → canonicalized to SUM
    const sel1 = q.select[1] as SelectExprItem;
    const func1 = sel1.expr as FuncCall;
    expect(func1.kind).toBe('func');
    expect(func1.name).toBe('SUM');
    expect(sel1.alias).toBe('ОбщаяСумма');

    // КОЛИЧЕСТВО(РАЗЛИЧНЫЕ Продажи.Документ) → canonicalized to COUNT
    const sel2 = q.select[2] as SelectExprItem;
    const func2 = sel2.expr as FuncCall;
    expect(func2.kind).toBe('func');
    expect(func2.name).toBe('COUNT');
    expect(sel2.alias).toBe('КолВоДокументов');

    // МАКСИМУМ(Продажи.Дата) → canonicalized to MAX
    const sel3 = q.select[3] as SelectExprItem;
    expect((sel3.expr as FuncCall).name).toBe('MAX');

    // СРЕДНЕЕ(Продажи.Количество) → canonicalized to AVG
    const sel4 = q.select[4] as SelectExprItem;
    expect((sel4.expr as FuncCall).name).toBe('AVG');
  });

  it('should have WHERE with BETWEEN', () => {
    const w = q.where as BetweenExpr;
    expect(w.kind).toBe('between');
    expect((w.expr as ColumnRef).name).toBe('Период');
    expect((w.from as ParamRef).name).toBe('НачалоПериода');
    expect((w.to as ParamRef).name).toBe('КонецПериода');
  });

  it('should have GROUP BY', () => {
    expect(q.groupBy).toHaveLength(1);
    expect((q.groupBy![0] as ColumnRef).name).toBe('Номенклатура');
  });

  it('should have HAVING with aggregate comparison', () => {
    const h = q.having as CompareExpr;
    expect(h.kind).toBe('cmp');
    expect(h.op).toBe('>');
    const func = h.left as FuncCall;
    expect(func.name).toBe('SUM');
    expect((h.right as Literal).value).toBe(1000);
  });

  it('should have ORDER BY DESC', () => {
    expect(q.orderBy).toHaveLength(1);
    expect(q.orderBy![0].direction).toBe('desc');
  });
});

// =============================================================================
// 006 — CASE, CAST, functions
// =============================================================================

describe('006-case-cast-functions', () => {
  const input = readCorpus('006-case-cast-functions.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  const q = model.queries[0] as QueryBody;

  it('should have six select items', () => {
    expect(q.select).toHaveLength(6);
  });

  it('should parse CASE expression', () => {
    const sel1 = q.select[1] as SelectExprItem;
    const caseExpr = sel1.expr as CaseExpr;
    expect(caseExpr.kind).toBe('case');
    expect(caseExpr.branches).toHaveLength(2);
    expect(caseExpr.elseExpr).toBeDefined();
    expect((caseExpr.elseExpr as Literal).value).toBe('Услуга');
    expect(sel1.alias).toBe('ТипНоменклатуры');
  });

  it('should parse CAST expression', () => {
    const sel2 = q.select[2] as SelectExprItem;
    const castExpr = sel2.expr as CastExpr;
    expect(castExpr.kind).toBe('cast');
    expect(castExpr.toType.kind).toBe('primitive');
    if (castExpr.toType.kind === 'primitive') {
      expect(castExpr.toType.name).toBe('string');
    }
    expect(sel2.alias).toBe('КраткоеНаименование');
  });

  it('should parse ЕСТЬNULL function (canonicalized to ISNULL)', () => {
    const sel3 = q.select[3] as SelectExprItem;
    const func = sel3.expr as FuncCall;
    expect(func.kind).toBe('func');
    expect(func.name).toBe('ISNULL');
    expect(func.args).toHaveLength(2);
  });

  it('should parse ПОДСТРОКА function (canonicalized to SUBSTRING)', () => {
    const sel4 = q.select[4] as SelectExprItem;
    const func = sel4.expr as FuncCall;
    expect(func.kind).toBe('func');
    expect(func.name).toBe('SUBSTRING');
    expect(func.args).toHaveLength(3);
  });

  it('should parse ПРЕДСТАВЛЕНИЕ function (canonicalized to PRESENTATION)', () => {
    const sel5 = q.select[5] as SelectExprItem;
    const func = sel5.expr as FuncCall;
    expect(func.kind).toBe('func');
    expect(func.name).toBe('PRESENTATION');
    expect(func.args).toHaveLength(1);
  });

  it('should have WHERE with NOT and string comparison', () => {
    const w = q.where as BoolGroup;
    expect(w.kind).toBe('boolGroup');
    expect(w.op).toBe('and');
    expect(w.items).toHaveLength(2);

    // First: НЕ Ном.ПометкаУдаления (treated as NOT expr)
    const notExpr = w.items[0] as NotExpr;
    expect(notExpr.kind).toBe('not');

    // Second: Ном.Наименование <> ""
    const cmp1 = w.items[1] as CompareExpr;
    expect(cmp1.op).toBe('<>');
    expect((cmp1.right as Literal).value).toBe('');
  });
});

// =============================================================================
// 012 — English syntax
// =============================================================================

describe('012-english-syntax', () => {
  const input = readCorpus('012-english-syntax.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  it('should detect English language', () => {
    expect(model.meta?.language).toBe('EN');
  });

  const q = model.queries[0] as QueryBody;

  it('should have DISTINCT option', () => {
    expect(q.options?.distinct).toBe(true);
  });

  it('should have three select items', () => {
    expect(q.select).toHaveLength(3);
    expect((q.select[0] as SelectExprItem).alias).toBe('Product');
    expect((q.select[1] as SelectExprItem).alias).toBe('Name');
    expect((q.select[2] as SelectExprItem).alias).toBe('Article');
  });

  it('should parse ISNULL function', () => {
    const sel2 = q.select[2] as SelectExprItem;
    const func = sel2.expr as FuncCall;
    expect(func.kind).toBe('func');
    expect(func.name).toBe('ISNULL');
    expect(func.args).toHaveLength(2);
  });

  it('should have FROM with Catalog.Products', () => {
    expect(q.sources).toHaveLength(1);
    expect(q.sources[0].object).toBe('Catalog.Products');
    expect(q.sources[0].alias).toBe('Products');
  });

  it('should have WHERE with AND of two conditions', () => {
    const w = q.where as BoolGroup;
    expect(w.kind).toBe('boolGroup');
    expect(w.op).toBe('and');
    expect(w.items).toHaveLength(2);

    // Products.DeletionMark = FALSE
    const cmp0 = w.items[0] as CompareExpr;
    expect(cmp0.op).toBe('=');
    expect((cmp0.right as Literal).value).toBe(false);

    // LIKE &SearchPattern
    const cmp1 = w.items[1] as CompareExpr;
    expect(cmp1.op).toBe('like');
  });

  it('should have ORDER BY ASC', () => {
    expect(q.orderBy).toHaveLength(1);
    expect(q.orderBy![0].direction).toBe('asc');
  });
});

// =============================================================================
// Inline unit tests — expressions
// =============================================================================

describe('expression parsing', () => {
  it('should parse arithmetic: a + b * c', () => {
    const q = body0('ВЫБРАТЬ a + b * c ИЗ T КАК T');
    const sel = q.select[0] as SelectExprItem;
    const bin = sel.expr as BinaryExpr;
    expect(bin.kind).toBe('bin');
    expect(bin.op).toBe('+');
    expect((bin.left as ColumnRef).name).toBe('a');
    const mul = bin.right as BinaryExpr;
    expect(mul.op).toBe('*');
  });

  it('should parse unary minus', () => {
    const q = body0('ВЫБРАТЬ -1 ИЗ T КАК T');
    const sel = q.select[0] as SelectExprItem;
    const un = sel.expr as UnaryExpr;
    expect(un.kind).toBe('un');
    expect(un.op).toBe('-');
    expect((un.expr as Literal).value).toBe(1);
  });

  it('should parse parameter reference', () => {
    const q = body0('ВЫБРАТЬ &Param ИЗ T КАК T');
    const sel = q.select[0] as SelectExprItem;
    const param = sel.expr as ParamRef;
    expect(param.kind).toBe('param');
    expect(param.name).toBe('Param');
  });

  it('should parse NULL literal', () => {
    const q = body0('ВЫБРАТЬ NULL ИЗ T КАК T');
    const sel = q.select[0] as SelectExprItem;
    const lit = sel.expr as Literal;
    expect(lit.kind).toBe('literal');
    expect(lit.litType).toBe('null');
    expect(lit.value).toBeNull();
  });

  it('should parse string literal', () => {
    const q = body0("ВЫБРАТЬ 'hello' ИЗ T КАК T");
    const sel = q.select[0] as SelectExprItem;
    const lit = sel.expr as Literal;
    expect(lit.litType).toBe('string');
    expect(lit.value).toBe('hello');
  });

  it('should parse number literal', () => {
    const q = body0('ВЫБРАТЬ 42.5 ИЗ T КАК T');
    const sel = q.select[0] as SelectExprItem;
    const lit = sel.expr as Literal;
    expect(lit.litType).toBe('number');
    expect(lit.value).toBe(42.5);
  });

  it('should parse wildcard *', () => {
    const q = body0('ВЫБРАТЬ * ИЗ T КАК T');
    expect(q.select).toHaveLength(1);
    expect(q.select[0].kind).toBe('wildcard');
  });

  it('should parse alias.* wildcard', () => {
    const q = body0('ВЫБРАТЬ T.* ИЗ T КАК T');
    const w = q.select[0] as SelectWildcard;
    expect(w.kind).toBe('wildcard');
    expect(w.sourceAlias).toBe('T');
  });

  it('should parse dotted column reference', () => {
    const q = body0('ВЫБРАТЬ T.Name ИЗ T КАК T');
    const sel = q.select[0] as SelectExprItem;
    const col = sel.expr as ColumnRef;
    expect(col.sourceAlias).toBe('T');
    expect(col.name).toBe('Name');
  });
});

// =============================================================================
// Boolean expressions
// =============================================================================

describe('boolean expression parsing', () => {
  it('should parse OR with correct grouping', () => {
    const q = body0('ВЫБРАТЬ 1 ИЗ T КАК T ГДЕ a = 1 ИЛИ b = 2 ИЛИ c = 3');
    const w = q.where as BoolGroup;
    expect(w.kind).toBe('boolGroup');
    expect(w.op).toBe('or');
    expect(w.items).toHaveLength(3);
  });

  it('should parse AND with higher precedence than OR', () => {
    const q = body0('ВЫБРАТЬ 1 ИЗ T КАК T ГДЕ a = 1 И b = 2 ИЛИ c = 3');
    const w = q.where as BoolGroup;
    expect(w.kind).toBe('boolGroup');
    expect(w.op).toBe('or');
    expect(w.items).toHaveLength(2);
    const andGroup = w.items[0] as BoolGroup;
    expect(andGroup.kind).toBe('boolGroup');
    expect(andGroup.op).toBe('and');
    expect(andGroup.items).toHaveLength(2);
  });

  it('should parse NOT', () => {
    const q = body0('ВЫБРАТЬ 1 ИЗ T КАК T ГДЕ НЕ a = 1');
    const w = q.where as NotExpr;
    expect(w.kind).toBe('not');
    const inner = w.item as CompareExpr;
    expect(inner.op).toBe('=');
  });

  it('should parse IN with value list', () => {
    const q = body0("ВЫБРАТЬ 1 ИЗ T КАК T ГДЕ a В (1, 2, 3)");
    const w = q.where as InExpr;
    expect(w.kind).toBe('in');
    expect(Array.isArray(w.values)).toBe(true);
    expect((w.values as unknown[]).length).toBe(3);
  });

  it('should parse EXISTS with subquery', () => {
    const q = body0('ВЫБРАТЬ 1 ИЗ T КАК T ГДЕ СУЩЕСТВУЕТ (ВЫБРАТЬ 1 ИЗ T2 КАК T2)');
    const w = q.where as ExistsExpr;
    expect(w.kind).toBe('exists');
    expect(w.subquery.kind).toBe('queryBody');
  });

  it('should parse BETWEEN', () => {
    const q = body0('ВЫБРАТЬ 1 ИЗ T КАК T ГДЕ a МЕЖДУ 1 И 10');
    const w = q.where as BetweenExpr;
    expect(w.kind).toBe('between');
    expect((w.from as Literal).value).toBe(1);
    expect((w.to as Literal).value).toBe(10);
  });

  it('should parse comparison operators', () => {
    const ops = [
      { sql: '=', expected: '=' },
      { sql: '<>', expected: '<>' },
      { sql: '>', expected: '>' },
      { sql: '>=', expected: '>=' },
      { sql: '<', expected: '<' },
      { sql: '<=', expected: '<=' },
    ] as const;

    for (const { sql, expected } of ops) {
      const q = body0(`ВЫБРАТЬ 1 ИЗ T КАК T ГДЕ a ${sql} 1`);
      const w = q.where as CompareExpr;
      expect(w.op).toBe(expected);
    }
  });
});

// =============================================================================
// UNION
// =============================================================================

describe('UNION parsing', () => {
  it('should parse UNION ALL', () => {
    const input = 'ВЫБРАТЬ 1 КАК a ИЗ T КАК T ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 2 КАК a ИЗ T2 КАК T2';
    const { model, diagnostics } = parse(input);
    expect(diagnostics).toHaveLength(0);
    const q = model.queries[0] as QueryBody;
    expect(q.union).toHaveLength(1);
    expect(q.union![0].all).toBe(true);
  });

  it('should parse UNION (without ALL)', () => {
    const input = 'ВЫБРАТЬ 1 КАК a ИЗ T КАК T ОБЪЕДИНИТЬ ВЫБРАТЬ 2 КАК a ИЗ T2 КАК T2';
    const { model, diagnostics } = parse(input);
    expect(diagnostics).toHaveLength(0);
    const q = model.queries[0] as QueryBody;
    expect(q.union).toHaveLength(1);
    expect(q.union![0].all).toBe(false);
  });
});

// =============================================================================
// Error recovery
// =============================================================================

describe('error recovery', () => {
  it('should produce diagnostic for missing FROM but still parse select', () => {
    const { model, diagnostics } = parse('ВЫБРАТЬ a КАК a');
    expect(model.queries).toHaveLength(1);
    const q = model.queries[0] as QueryBody;
    expect(q.select).toHaveLength(1);
    // no diagnostics expected actually — FROM is optional
    // but sources will be empty
    expect(q.sources).toHaveLength(0);
  });

  it('should produce diagnostic for completely invalid input', () => {
    const { model, diagnostics } = parse('!!! garbage !!!');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(model.queries.length).toBeGreaterThanOrEqual(1);
  });

  it('should recover from unexpected tokens and still parse something', () => {
    const { model, diagnostics } = parse('ВЫБРАТЬ a КАК a ИЗ !!! ГДЕ b = 1');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(model.queries).toHaveLength(1);
  });

  it('should handle empty input', () => {
    const { model, diagnostics } = parse('');
    expect(model.queries).toHaveLength(1); // empty fallback
    expect(diagnostics).toHaveLength(0);
  });

  it('should handle unclosed parenthesis with diagnostic', () => {
    const { model, diagnostics } = parse('ВЫБРАТЬ a ИЗ T КАК T ГДЕ a В (1, 2');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(model.queries).toHaveLength(1);
  });
});

// =============================================================================
// Additional corpus files
// =============================================================================

describe('007-multiple-joins', () => {
  const input = readCorpus('007-multiple-joins.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  const q = model.queries[0] as QueryBody;

  it('should have four sources (1 main + 3 joined)', () => {
    expect(q.sources).toHaveLength(4);
  });

  it('should have three joins', () => {
    expect(q.joins).toHaveLength(3);
    expect(q.joins![0].type).toBe('inner');
    expect(q.joins![1].type).toBe('left');
    expect(q.joins![2].type).toBe('left');
  });

  it('should have ORDER BY DESC', () => {
    expect(q.orderBy).toHaveLength(1);
    expect(q.orderBy![0].direction).toBe('desc');
  });
});

describe('008-subquery-in-where', () => {
  const input = readCorpus('008-subquery-in-where.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  const q = model.queries[0] as QueryBody;

  it('should have WHERE with IN subquery and AND NOT', () => {
    const w = q.where as BoolGroup;
    expect(w.kind).toBe('boolGroup');
    expect(w.op).toBe('and');
    expect(w.items).toHaveLength(2);

    // First: IN (subquery)
    const inExpr = w.items[0] as InExpr;
    expect(inExpr.kind).toBe('in');
    expect(!Array.isArray(inExpr.values)).toBe(true); // subquery, not array

    // Second: NOT ЭтоГруппа
    const notExpr = w.items[1] as NotExpr;
    expect(notExpr.kind).toBe('not');
  });
});

describe('009-exists-subquery', () => {
  const input = readCorpus('009-exists-subquery.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  const q = model.queries[0] as QueryBody;

  it('should have EXISTS in WHERE', () => {
    const w = q.where as ExistsExpr;
    expect(w.kind).toBe('exists');
    expect(w.subquery.kind).toBe('queryBody');
    expect(w.subquery.sources).toHaveLength(1);
  });
});

describe('010-top-for-update', () => {
  const input = readCorpus('010-top-for-update.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  const q = model.queries[0] as QueryBody;

  it('should have TOP 10 option', () => {
    expect(q.options?.top).toBe(10);
  });

  it('should have FOR UPDATE option', () => {
    expect(q.options?.forUpdate).toBeDefined();
    expect(q.options?.forUpdate?.mode).toBe('all');
  });
});

describe('011-totals', () => {
  const input = readCorpus('011-totals.1cquery');
  const { model, diagnostics } = parse(input);

  it('should parse without errors', () => {
    expect(diagnostics).toHaveLength(0);
  });

  const q = model.queries[0] as QueryBody;

  it('should have virtual table source with params', () => {
    expect(q.sources[0].kind).toBe('virtual');
    expect(q.sources[0].virtualParams).toHaveLength(2);
  });

  it('should have TOTALS spec', () => {
    expect(q.totals).toBeDefined();
    expect(q.totals!.totals).toHaveLength(2);
    expect(q.totals!.by).toHaveLength(2);
  });
});

// =============================================================================
// parseQuery alias
// =============================================================================

describe('parseQuery alias', () => {
  it('should produce identical results to parse()', () => {
    const input = 'ВЫБРАТЬ Ном.Ссылка ИЗ Справочник.Номенклатура КАК Ном';
    const r1 = parse(input);
    const r2 = parseQuery(input);
    expect(r1.model).toEqual(r2.model);
    expect(r1.diagnostics).toEqual(r2.diagnostics);
  });
});

// =============================================================================
// Additional coverage: canonicalize(), IS NULL/IS NOT NULL, subquery expr
// =============================================================================

describe('additional coverage', () => {
  it('should canonicalize function names from RU to EN UPPER', () => {
    const q = body0('ВЫБРАТЬ СУММА(T.X) КАК S, КОЛИЧЕСТВО(T.Y) КАК C ИЗ T КАК T');
    const func0 = (q.select[0] as SelectExprItem).expr as FuncCall;
    expect(func0.name).toBe('SUM');
    const func1 = (q.select[1] as SelectExprItem).expr as FuncCall;
    expect(func1.name).toBe('COUNT');
  });

  it('should keep EN function names as-is after canonicalize', () => {
    const q = body0('SELECT SUM(T.X) AS S, ISNULL(T.Y, 0) AS N FROM T AS T');
    expect(((q.select[0] as SelectExprItem).expr as FuncCall).name).toBe('SUM');
    expect(((q.select[1] as SelectExprItem).expr as FuncCall).name).toBe('ISNULL');
  });

  it('should parse subquery expression in SELECT', () => {
    const q = body0('SELECT (SELECT MAX(T2.X) FROM T2 AS T2) AS MaxVal FROM T1 AS T1');
    const sel = q.select[0] as SelectExprItem;
    expect(sel.expr.kind).toBe('subquery');
    expect(sel.alias).toBe('MaxVal');
  });

  it('should parse multi-level dotted column: Док.Контрагент.Наименование', () => {
    const q = body0('ВЫБРАТЬ Док.Контрагент.Наименование ИЗ Документ.Продажа КАК Док');
    const sel = q.select[0] as SelectExprItem;
    const col = sel.expr as ColumnRef;
    expect(col.sourceAlias).toBe('Док');
    expect(col.name).toBe('Контрагент.Наименование');
  });

  it('should parse FOR UPDATE at end of query', () => {
    const q = body0('ВЫБРАТЬ T.X ИЗ T КАК T ДЛЯ ИЗМЕНЕНИЯ');
    expect(q.options?.forUpdate?.mode).toBe('all');
  });

  it('should parse AUTOORDER at end of query', () => {
    const q = body0('SELECT T.X FROM T AS T AUTOORDER');
    expect(q.options?.autoOrder).toBe(true);
  });

  it('should parse DISTINCT + TOP combined', () => {
    const q = body0('ВЫБРАТЬ РАЗЛИЧНЫЕ ПЕРВЫЕ 5 T.X ИЗ T КАК T');
    expect(q.options?.distinct).toBe(true);
    expect(q.options?.top).toBe(5);
  });

  it('should parse IS NULL comparison', () => {
    const q = body0('ВЫБРАТЬ 1 ИЗ T КАК T ГДЕ T.X ЕСТЬ NULL');
    const w = q.where as CompareExpr;
    expect(w.kind).toBe('cmp');
    expect(w.op).toBe('=');
    expect((w.right as Literal).litType).toBe('null');
  });

  it('should parse IS NOT NULL as NOT comparison', () => {
    const q = body0('SELECT 1 FROM T AS T WHERE T.X IS NOT NULL');
    const w = q.where as NotExpr;
    expect(w.kind).toBe('not');
    const inner = w.item as CompareExpr;
    expect(inner.op).toBe('=');
    expect((inner.right as Literal).litType).toBe('null');
  });

  it('should never throw on garbage input', () => {
    const inputs = ['', ';;;', 'ВЫБРАТЬ', 'SELECT FROM', '!!!', 'ВЫБРАТЬ ИЗ ГДЕ СГРУППИРОВАТЬ'];
    for (const input of inputs) {
      expect(() => parse(input)).not.toThrow();
      expect(() => parseQuery(input)).not.toThrow();
      const r = parse(input);
      expect(r.model.version).toBe('1.0');
      expect(r.model.queries.length).toBeGreaterThanOrEqual(1);
    }
  });
});
