import { describe, it, expect } from 'vitest';
import { generate } from './model-to-text.js';
import type {
  QueryModel,
  QueryBody,
  Expr,
  BoolExpr,
  Source,
  Join,
  SelectItem,
} from '../../model/query-model.js';

// ---------------------------------------------------------------------------
// Helpers to reduce boilerplate
// ---------------------------------------------------------------------------

function col(name: string, sourceAlias?: string): Expr {
  return { kind: 'column', name, sourceAlias };
}

function param(name: string): Expr {
  return { kind: 'param', name };
}

function lit(litType: 'string', value: string): Expr;
function lit(litType: 'number', value: number): Expr;
function lit(litType: 'bool', value: boolean): Expr;
function lit(litType: 'null'): Expr;
function lit(litType: 'date', value: string): Expr;
function lit(litType: string, value?: string | number | boolean | null): Expr {
  if (litType === 'null') {
    return { kind: 'literal', litType: 'null', value: null };
  }
  return { kind: 'literal', litType: litType as any, value: value! };
}

function selExpr(expr: Expr, alias?: string): SelectItem {
  return { kind: 'selectExpr', expr, alias };
}

function cmp(left: Expr, op: '=' | '<>' | '>' | '>=' | '<' | '<=' | 'like', right: Expr): BoolExpr {
  return { kind: 'cmp', op, left, right };
}

function boolGroup(op: 'and' | 'or', items: BoolExpr[]): BoolExpr {
  return { kind: 'boolGroup', op, items };
}

function objectSource(alias: string, object: string): Source {
  return { alias, kind: 'object', object };
}

// ---------------------------------------------------------------------------
// ТЗ §4.6 Example 1: Simple SELECT + WHERE + parameter
// ---------------------------------------------------------------------------

describe('Example 1: Simple SELECT + WHERE + parameter', () => {
  const model: QueryModel = {
    version: '1.0',
    meta: { language: 'RU' },
    queries: [{
      kind: 'queryBody',
      sources: [{ alias: 'Ном', object: 'Справочник.Номенклатура', kind: 'object' }],
      select: [
        { kind: 'selectExpr', expr: { kind: 'column', sourceAlias: 'Ном', name: 'Ссылка' }, alias: 'Номенклатура' },
        { kind: 'selectExpr', expr: { kind: 'column', sourceAlias: 'Ном', name: 'Наименование' }, alias: 'Наименование' },
      ],
      where: {
        kind: 'boolGroup',
        op: 'and',
        items: [
          { kind: 'cmp', op: '=', left: { kind: 'column', sourceAlias: 'Ном', name: 'ЭтоГруппа' }, right: { kind: 'literal', litType: 'bool', value: false } },
          { kind: 'cmp', op: 'like', left: { kind: 'column', sourceAlias: 'Ном', name: 'Наименование' }, right: { kind: 'param', name: 'Поиск' } },
        ],
      },
      orderBy: [{ expr: { kind: 'column', sourceAlias: 'Ном', name: 'Наименование' }, direction: 'asc' }],
    }],
  };

  it('generates correct Russian query text', () => {
    const result = generate(model);

    expect(result).toContain('ВЫБРАТЬ');
    expect(result).toContain('Ном.Ссылка КАК Номенклатура');
    expect(result).toContain('Ном.Наименование КАК Наименование');
    expect(result).toContain('ИЗ');
    expect(result).toContain('Справочник.Номенклатура КАК Ном');
    expect(result).toContain('ГДЕ');
    expect(result).toContain('Ном.ЭтоГруппа = ЛОЖЬ');
    expect(result).toContain('ПОДОБНО');
    expect(result).toContain('&Поиск');
    expect(result).toContain('УПОРЯДОЧИТЬ ПО');
    expect(result).toContain('Ном.Наименование ВОЗР');
  });

  it('generates correct English query text', () => {
    const result = generate(model, { language: 'EN' });

    expect(result).toContain('SELECT');
    expect(result).toContain('Ном.Ссылка AS Номенклатура');
    expect(result).toContain('FROM');
    expect(result).toContain('Справочник.Номенклатура AS Ном');
    expect(result).toContain('WHERE');
    expect(result).toContain('= FALSE');
    expect(result).toContain('LIKE');
    expect(result).toContain('ORDER BY');
    expect(result).toContain('ASC');
  });
});

// ---------------------------------------------------------------------------
// ТЗ §4.6 Example 3: Batch with temp table + DESTROY
// ---------------------------------------------------------------------------

describe('Example 3: Batch with temp table + DESTROY', () => {
  const model: QueryModel = {
    version: '1.0',
    queries: [
      {
        kind: 'queryBody',
        sources: [{ alias: 'Док', object: 'Документ.РеализацияТоваровУслуг', kind: 'object' }],
        select: [
          { kind: 'selectExpr', expr: { kind: 'column', sourceAlias: 'Док', name: 'Ссылка' }, alias: 'Документ' },
          { kind: 'selectExpr', expr: { kind: 'column', sourceAlias: 'Док', name: 'Дата' }, alias: 'Дата' },
        ],
        intoTempTable: { name: 'ВТ_Документы' },
      },
      {
        kind: 'queryBody',
        sources: [{ alias: 'ВТ', kind: 'tempTable', tempTableName: 'ВТ_Документы' }],
        select: [
          {
            kind: 'selectExpr',
            expr: { kind: 'func', name: 'COUNT', args: [{ kind: 'column', sourceAlias: 'ВТ', name: 'Документ' }] },
            alias: 'КолВо',
          },
        ],
      },
      { kind: 'destroyTempTable', name: 'ВТ_Документы' },
    ],
  };

  it('generates batch with temp table and DESTROY', () => {
    const result = generate(model);

    // First query - SELECT INTO
    expect(result).toContain('ВЫБРАТЬ');
    expect(result).toContain('Док.Ссылка КАК Документ');
    expect(result).toContain('Док.Дата КАК Дата');
    expect(result).toContain('ПОМЕСТИТЬ ВТ_Документы');
    expect(result).toContain('Документ.РеализацияТоваровУслуг КАК Док');

    // Second query - COUNT from temp table
    expect(result).toContain('КОЛИЧЕСТВО(ВТ.Документ) КАК КолВо');
    expect(result).toContain('ВТ_Документы КАК ВТ');

    // Third query - DESTROY
    expect(result).toContain('УНИЧТОЖИТЬ ВТ_Документы');

    // Queries are separated by semicolons
    const parts = result.split(';\n\n');
    expect(parts).toHaveLength(3);
  });

  it('generates batch in English', () => {
    const result = generate(model, { language: 'EN' });

    expect(result).toContain('SELECT');
    expect(result).toContain('INTO ВТ_Документы');
    expect(result).toContain('COUNT(ВТ.Документ) AS КолВо');
    expect(result).toContain('DROP ВТ_Документы');
  });
});

// ---------------------------------------------------------------------------
// UNION ALL
// ---------------------------------------------------------------------------

describe('UNION ALL', () => {
  it('generates UNION ALL between two queries', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('T1', 'Таблица1')],
        select: [selExpr(col('Поле1', 'T1'), 'Результат')],
        union: [{
          all: true,
          body: {
            kind: 'queryBody',
            sources: [objectSource('T2', 'Таблица2')],
            select: [selExpr(col('Поле2', 'T2'), 'Результат')],
          },
        }],
      }],
    };

    const result = generate(model);
    expect(result).toContain('ОБЪЕДИНИТЬ ВСЕ');
    expect(result).toContain('T1.Поле1 КАК Результат');
    expect(result).toContain('T2.Поле2 КАК Результат');
  });

  it('generates UNION (without ALL)', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('T1', 'Таблица1')],
        select: [selExpr(col('Поле1', 'T1'))],
        union: [{
          all: false,
          body: {
            kind: 'queryBody',
            sources: [objectSource('T2', 'Таблица2')],
            select: [selExpr(col('Поле2', 'T2'))],
          },
        }],
      }],
    };

    const result = generate(model);
    expect(result).toContain('ОБЪЕДИНИТЬ');
    expect(result).not.toContain('ОБЪЕДИНИТЬ ВСЕ');
  });

  it('generates UNION ALL in English', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('T1', 'Table1')],
        select: [selExpr(col('Field1', 'T1'))],
        union: [{
          all: true,
          body: {
            kind: 'queryBody',
            sources: [objectSource('T2', 'Table2')],
            select: [selExpr(col('Field2', 'T2'))],
          },
        }],
      }],
    };

    const result = generate(model, { language: 'EN' });
    expect(result).toContain('UNION ALL');
  });
});

// ---------------------------------------------------------------------------
// CASE/WHEN
// ---------------------------------------------------------------------------

describe('CASE/WHEN expression', () => {
  it('generates CASE with branches and ELSE in RU', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr({
          kind: 'case',
          branches: [
            {
              when: cmp(col('Статус', 'Т'), '=', lit('number', 1)),
              then: lit('string', 'Активный'),
            },
            {
              when: cmp(col('Статус', 'Т'), '=', lit('number', 2)),
              then: lit('string', 'Закрыт'),
            },
          ],
          elseExpr: lit('string', 'Неизвестно'),
        }, 'Описание')],
      }],
    };

    const result = generate(model);
    expect(result).toContain('ВЫБОР');
    expect(result).toContain('КОГДА Т.Статус = 1 ТОГДА "Активный"');
    expect(result).toContain('КОГДА Т.Статус = 2 ТОГДА "Закрыт"');
    expect(result).toContain('ИНАЧЕ "Неизвестно"');
    expect(result).toContain('КОНЕЦ');
  });

  it('generates CASE in English', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('T', 'Table')],
        select: [selExpr({
          kind: 'case',
          branches: [
            {
              when: cmp(col('Status', 'T'), '=', lit('number', 1)),
              then: lit('string', 'Active'),
            },
          ],
          elseExpr: lit('string', 'Unknown'),
        }, 'Description')],
      }],
    };

    const result = generate(model, { language: 'EN' });
    expect(result).toContain('CASE');
    expect(result).toContain('WHEN T.Status = 1 THEN "Active"');
    expect(result).toContain('ELSE "Unknown"');
    expect(result).toContain('END');
  });

  it('generates CASE without ELSE', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('T', 'Table')],
        select: [selExpr({
          kind: 'case',
          branches: [
            {
              when: cmp(col('X', 'T'), '>', lit('number', 0)),
              then: lit('string', 'Positive'),
            },
          ],
        })],
      }],
    };

    const result = generate(model);
    expect(result).toContain('ВЫБОР');
    expect(result).toContain('КОНЕЦ');
    expect(result).not.toContain('ИНАЧЕ');
  });
});

// ---------------------------------------------------------------------------
// Function localization
// ---------------------------------------------------------------------------

describe('Function localization', () => {
  it('localizes SUBSTRING to ПОДСТРОКА in RU mode', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr({
          kind: 'func',
          name: 'SUBSTRING',
          args: [col('Имя', 'Т'), lit('number', 1), lit('number', 10)],
        })],
      }],
    };

    const result = generate(model);
    expect(result).toContain('ПОДСТРОКА(Т.Имя, 1, 10)');
  });

  it('keeps SUBSTRING as SUBSTRING in EN mode', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('T', 'Table')],
        select: [selExpr({
          kind: 'func',
          name: 'SUBSTRING',
          args: [col('Name', 'T'), lit('number', 1), lit('number', 10)],
        })],
      }],
    };

    const result = generate(model, { language: 'EN' });
    expect(result).toContain('SUBSTRING(T.Name, 1, 10)');
  });

  it('localizes ISNULL to ЕСТЬNULL in RU mode', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr({
          kind: 'func',
          name: 'ISNULL',
          args: [col('Значение', 'Т'), lit('number', 0)],
        })],
      }],
    };

    const result = generate(model);
    expect(result).toContain('ЕСТЬNULL(Т.Значение, 0)');
  });

  it('localizes aggregate functions in RU', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [
          selExpr({ kind: 'func', name: 'SUM', args: [col('Сумма', 'Т')] }, 'Итого'),
          selExpr({ kind: 'func', name: 'AVG', args: [col('Цена', 'Т')] }, 'СрЦена'),
          selExpr({ kind: 'func', name: 'MIN', args: [col('Дата', 'Т')] }, 'НачДата'),
          selExpr({ kind: 'func', name: 'MAX', args: [col('Дата', 'Т')] }, 'КонДата'),
        ],
      }],
    };

    const result = generate(model);
    expect(result).toContain('СУММА(Т.Сумма)');
    expect(result).toContain('СРЕДНЕЕ(Т.Цена)');
    expect(result).toContain('МИНИМУМ(Т.Дата)');
    expect(result).toContain('МАКСИМУМ(Т.Дата)');
  });
});

// ---------------------------------------------------------------------------
// JOIN generation (all types)
// ---------------------------------------------------------------------------

describe('JOIN generation', () => {
  function makeJoinModel(joinType: 'inner' | 'left' | 'right' | 'full'): QueryModel {
    return {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [
          objectSource('Д', 'Документ.Заказ'),
          objectSource('Н', 'Справочник.Номенклатура'),
        ],
        joins: [{
          leftAlias: 'Д',
          rightAlias: 'Н',
          type: joinType,
          on: cmp(col('Номенклатура', 'Д'), '=', col('Ссылка', 'Н')),
        }],
        select: [
          selExpr(col('Ссылка', 'Д'), 'Заказ'),
          selExpr(col('Наименование', 'Н'), 'Товар'),
        ],
      }],
    };
  }

  it('generates INNER JOIN in RU', () => {
    const result = generate(makeJoinModel('inner'));
    expect(result).toContain('ВНУТРЕННЕЕ СОЕДИНЕНИЕ');
    expect(result).toContain('Справочник.Номенклатура КАК Н');
    expect(result).toContain('ПО Д.Номенклатура = Н.Ссылка');
  });

  it('generates LEFT OUTER JOIN in RU', () => {
    const result = generate(makeJoinModel('left'));
    expect(result).toContain('ЛЕВОЕ ВНЕШНЕЕ СОЕДИНЕНИЕ');
  });

  it('generates RIGHT OUTER JOIN in RU', () => {
    const result = generate(makeJoinModel('right'));
    expect(result).toContain('ПРАВОЕ ВНЕШНЕЕ СОЕДИНЕНИЕ');
  });

  it('generates FULL OUTER JOIN in RU', () => {
    const result = generate(makeJoinModel('full'));
    expect(result).toContain('ПОЛНОЕ ВНЕШНЕЕ СОЕДИНЕНИЕ');
  });

  it('generates INNER JOIN in EN', () => {
    const result = generate(makeJoinModel('inner'), { language: 'EN' });
    expect(result).toContain('INNER JOIN');
    expect(result).toContain('ON Д.Номенклатура = Н.Ссылка');
  });

  it('generates LEFT OUTER JOIN in EN', () => {
    const result = generate(makeJoinModel('left'), { language: 'EN' });
    expect(result).toContain('LEFT OUTER JOIN');
  });

  it('generates RIGHT OUTER JOIN in EN', () => {
    const result = generate(makeJoinModel('right'), { language: 'EN' });
    expect(result).toContain('RIGHT OUTER JOIN');
  });

  it('generates FULL OUTER JOIN in EN', () => {
    const result = generate(makeJoinModel('full'), { language: 'EN' });
    expect(result).toContain('FULL OUTER JOIN');
  });
});

// ---------------------------------------------------------------------------
// Boolean expression types
// ---------------------------------------------------------------------------

describe('Boolean expression types', () => {
  function wrapInQuery(where: BoolExpr): QueryModel {
    return {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(col('Поле', 'Т'))],
        where,
      }],
    };
  }

  it('generates IN expression with values', () => {
    const result = generate(wrapInQuery({
      kind: 'in',
      expr: col('Статус', 'Т'),
      values: [lit('number', 1), lit('number', 2), lit('number', 3)],
    }));
    expect(result).toContain('Т.Статус В (1, 2, 3)');
  });

  it('generates IN expression with subquery', () => {
    const result = generate(wrapInQuery({
      kind: 'in',
      expr: col('Ссылка', 'Т'),
      values: {
        kind: 'queryBody',
        sources: [objectSource('П', 'ПодТаблица')],
        select: [selExpr(col('Ссылка', 'П'))],
      },
    }));
    expect(result).toContain('Т.Ссылка В (');
    expect(result).toContain('ВЫБРАТЬ');
    expect(result).toContain('П.Ссылка');
  });

  it('generates BETWEEN expression', () => {
    const result = generate(wrapInQuery({
      kind: 'between',
      expr: col('Дата', 'Т'),
      from: param('НачДата'),
      to: param('КонДата'),
    }));
    expect(result).toContain('Т.Дата МЕЖДУ &НачДата И &КонДата');
  });

  it('generates REFS expression in RU', () => {
    const result = generate(wrapInQuery({
      kind: 'refCheck',
      expr: col('Ссылка', 'Т'),
      refType: 'Справочник.Номенклатура',
    }));
    expect(result).toContain('Т.Ссылка ССЫЛКА Справочник.Номенклатура');
  });

  it('generates REFS expression in EN', () => {
    const result = generate(wrapInQuery({
      kind: 'refCheck',
      expr: col('Ref', 'T'),
      refType: 'Catalog.Items',
    }), { language: 'EN' });
    expect(result).toContain('T.Ref REFS Catalog.Items');
  });

  it('generates IN HIERARCHY expression in RU', () => {
    const result = generate(wrapInQuery({
      kind: 'inHierarchy',
      expr: col('Ссылка', 'Т'),
      value: param('Группа'),
    }));
    expect(result).toContain('Т.Ссылка В ИЕРАРХИИ &Группа');
  });

  it('generates IN HIERARCHY expression in EN', () => {
    const result = generate(wrapInQuery({
      kind: 'inHierarchy',
      expr: col('Ref', 'T'),
      value: param('Group'),
    }), { language: 'EN' });
    expect(result).toContain('T.Ref IN HIERARCHY &Group');
  });

  it('generates NOT expression', () => {
    const result = generate(wrapInQuery({
      kind: 'not',
      item: cmp(col('Пометка', 'Т'), '=', lit('bool', true)),
    }));
    expect(result).toContain('НЕ Т.Пометка = ИСТИНА');
  });

  it('generates NOT with group (parenthesized)', () => {
    const result = generate(wrapInQuery({
      kind: 'not',
      item: boolGroup('or', [
        cmp(col('A', 'Т'), '=', lit('number', 1)),
        cmp(col('B', 'Т'), '=', lit('number', 2)),
      ]),
    }));
    expect(result).toContain('НЕ (Т.A = 1 ИЛИ Т.B = 2)');
  });

  it('generates EXISTS expression', () => {
    const result = generate(wrapInQuery({
      kind: 'exists',
      subquery: {
        kind: 'queryBody',
        sources: [objectSource('С', 'СубТаблица')],
        select: [selExpr(col('Ссылка', 'С'))],
      },
    }));
    expect(result).toContain('СУЩЕСТВУЕТ (');
    expect(result).toContain('ВЫБРАТЬ');
    expect(result).toContain('С.Ссылка');
  });

  it('generates EXISTS expression in EN', () => {
    const result = generate(wrapInQuery({
      kind: 'exists',
      subquery: {
        kind: 'queryBody',
        sources: [objectSource('S', 'SubTable')],
        select: [selExpr(col('Ref', 'S'))],
      },
    }), { language: 'EN' });
    expect(result).toContain('EXISTS (');
  });

  it('generates AND/OR groups', () => {
    const result = generate(wrapInQuery(
      boolGroup('and', [
        cmp(col('A', 'Т'), '=', lit('number', 1)),
        boolGroup('or', [
          cmp(col('B', 'Т'), '=', lit('number', 2)),
          cmp(col('C', 'Т'), '=', lit('number', 3)),
        ]),
      ]),
    ));
    expect(result).toContain('Т.A = 1 И (Т.B = 2 ИЛИ Т.C = 3)');
  });

  it('generates IS NULL comparison', () => {
    const result = generate(wrapInQuery(
      cmp(col('Поле', 'Т'), '=', lit('null')),
    ));
    expect(result).toContain('Т.Поле ЕСТЬ NULL');
  });

  it('generates IS NOT NULL comparison', () => {
    const result = generate(wrapInQuery(
      cmp(col('Поле', 'Т'), '<>', lit('null')),
    ));
    expect(result).toContain('Т.Поле ЕСТЬ НЕ NULL');
  });
});

// ---------------------------------------------------------------------------
// SELECT options
// ---------------------------------------------------------------------------

describe('SELECT options', () => {
  it('generates DISTINCT', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(col('Поле', 'Т'))],
        options: { distinct: true },
      }],
    };

    const result = generate(model);
    expect(result).toContain('ВЫБРАТЬ РАЗЛИЧНЫЕ');
  });

  it('generates TOP N', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(col('Поле', 'Т'))],
        options: { top: 10 },
      }],
    };

    const result = generate(model);
    expect(result).toContain('ВЫБРАТЬ ПЕРВЫЕ 10');
  });

  it('generates DISTINCT + TOP together', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(col('Поле', 'Т'))],
        options: { distinct: true, top: 5 },
      }],
    };

    const result = generate(model);
    expect(result).toContain('ВЫБРАТЬ РАЗЛИЧНЫЕ ПЕРВЫЕ 5');
  });

  it('generates FOR UPDATE', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(col('Поле', 'Т'))],
        options: { forUpdate: { mode: 'all' } },
      }],
    };

    const result = generate(model);
    expect(result).toContain('ДЛЯ ИЗМЕНЕНИЯ');
  });

  it('generates FOR UPDATE in EN', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('T', 'Table')],
        select: [selExpr(col('Field', 'T'))],
        options: { forUpdate: { mode: 'all' } },
      }],
    };

    const result = generate(model, { language: 'EN' });
    expect(result).toContain('FOR UPDATE');
  });

  it('generates AUTOORDER', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(col('Поле', 'Т'))],
        options: { autoOrder: true },
      }],
    };

    const result = generate(model);
    expect(result).toContain('АВТОУПОРЯДОЧИВАНИЕ');
  });

  it('generates AUTOORDER in EN', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('T', 'Table')],
        select: [selExpr(col('Field', 'T'))],
        options: { autoOrder: true },
      }],
    };

    const result = generate(model, { language: 'EN' });
    expect(result).toContain('AUTOORDER');
  });
});

// ---------------------------------------------------------------------------
// Wildcard select
// ---------------------------------------------------------------------------

describe('Wildcard select', () => {
  it('generates * wildcard', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [{ kind: 'wildcard' }],
      }],
    };

    const result = generate(model);
    expect(result).toContain('*');
  });

  it('generates Alias.* wildcard', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [{ kind: 'wildcard', sourceAlias: 'Т' }],
      }],
    };

    const result = generate(model);
    expect(result).toContain('Т.*');
  });
});

// ---------------------------------------------------------------------------
// Expression types
// ---------------------------------------------------------------------------

describe('Expression types', () => {
  function wrapExpr(expr: Expr): QueryModel {
    return {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(expr, 'Результат')],
      }],
    };
  }

  it('generates string literal', () => {
    const result = generate(wrapExpr(lit('string', 'Привет')));
    expect(result).toContain('"Привет"');
  });

  it('generates number literal', () => {
    const result = generate(wrapExpr(lit('number', 42)));
    expect(result).toContain('42');
  });

  it('generates boolean literal TRUE', () => {
    const result = generate(wrapExpr(lit('bool', true)));
    expect(result).toContain('ИСТИНА');
  });

  it('generates boolean literal FALSE', () => {
    const result = generate(wrapExpr(lit('bool', false)));
    expect(result).toContain('ЛОЖЬ');
  });

  it('generates NULL literal', () => {
    const result = generate(wrapExpr(lit('null')));
    expect(result).toContain('NULL');
  });

  it('generates date literal in RU', () => {
    const result = generate(wrapExpr(lit('date', '20230101')));
    expect(result).toContain("ДАТАВРЕМЯ(20230101)");
  });

  it('generates date literal in EN', () => {
    const result = generate(wrapExpr(lit('date', '20230101')), { language: 'EN' });
    expect(result).toContain("DATETIME(20230101)");
  });

  it('generates binary expression with correct precedence', () => {
    // (a + b) * c should produce (a + b) * c with parentheses
    const result = generate(wrapExpr({
      kind: 'bin',
      op: '*',
      left: {
        kind: 'bin',
        op: '+',
        left: col('A', 'Т'),
        right: col('B', 'Т'),
      },
      right: col('C', 'Т'),
    }));
    expect(result).toContain('(Т.A + Т.B) * Т.C');
  });

  it('does not add unnecessary parentheses for same-precedence', () => {
    // a + b + c should produce a + b + c without extra parens
    const result = generate(wrapExpr({
      kind: 'bin',
      op: '+',
      left: {
        kind: 'bin',
        op: '+',
        left: col('A', 'Т'),
        right: col('B', 'Т'),
      },
      right: col('C', 'Т'),
    }));
    expect(result).toContain('Т.A + Т.B + Т.C');
  });

  it('generates unary minus', () => {
    const result = generate(wrapExpr({
      kind: 'un',
      op: '-',
      expr: col('Сумма', 'Т'),
    }));
    expect(result).toContain('-Т.Сумма');
  });

  it('generates CAST expression in RU', () => {
    const result = generate(wrapExpr({
      kind: 'cast',
      expr: col('Значение', 'Т'),
      toType: { kind: 'primitive', name: 'number' },
    }));
    expect(result).toContain('ВЫРАЗИТЬ(Т.Значение КАК number)');
  });

  it('generates CAST expression in EN', () => {
    const result = generate(wrapExpr({
      kind: 'cast',
      expr: col('Value', 'T'),
      toType: { kind: 'ref', object: 'Catalog.Items' },
    }), { language: 'EN' });
    expect(result).toContain('CAST(T.Value AS Catalog.Items)');
  });

  it('generates subquery expression', () => {
    const result = generate(wrapExpr({
      kind: 'subquery',
      subquery: {
        kind: 'queryBody',
        sources: [objectSource('С', 'СубТаблица')],
        select: [selExpr(col('Значение', 'С'))],
      },
    }));
    expect(result).toContain('(');
    expect(result).toContain('ВЫБРАТЬ');
    expect(result).toContain('С.Значение');
    expect(result).toContain(')');
  });

  it('generates param reference', () => {
    const result = generate(wrapExpr(param('МойПараметр')));
    expect(result).toContain('&МойПараметр');
  });

  it('generates column with source alias', () => {
    const result = generate(wrapExpr(col('Поле', 'Т')));
    expect(result).toContain('Т.Поле');
  });

  it('generates column without source alias', () => {
    const result = generate(wrapExpr(col('Поле')));
    expect(result).toContain('Поле');
  });
});

// ---------------------------------------------------------------------------
// GROUP BY + HAVING
// ---------------------------------------------------------------------------

describe('GROUP BY + HAVING', () => {
  it('generates GROUP BY with HAVING', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [
          selExpr(col('Категория', 'Т'), 'Кат'),
          selExpr({ kind: 'func', name: 'SUM', args: [col('Сумма', 'Т')] }, 'Итого'),
        ],
        groupBy: [col('Категория', 'Т')],
        having: cmp(
          { kind: 'func', name: 'SUM', args: [col('Сумма', 'Т')] },
          '>',
          lit('number', 1000),
        ),
      }],
    };

    const result = generate(model);
    expect(result).toContain('СГРУППИРОВАТЬ ПО');
    expect(result).toContain('Т.Категория');
    expect(result).toContain('ИМЕЮЩИЕ');
    expect(result).toContain('СУММА(Т.Сумма) > 1000');
  });
});

// ---------------------------------------------------------------------------
// ORDER BY with direction
// ---------------------------------------------------------------------------

describe('ORDER BY', () => {
  it('generates ORDER BY with ASC and DESC', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(col('Дата', 'Т')), selExpr(col('Сумма', 'Т'))],
        orderBy: [
          { expr: col('Дата', 'Т'), direction: 'desc' },
          { expr: col('Сумма', 'Т'), direction: 'asc' },
        ],
      }],
    };

    const result = generate(model);
    expect(result).toContain('УПОРЯДОЧИТЬ ПО');
    expect(result).toContain('Т.Дата УБЫВ');
    expect(result).toContain('Т.Сумма ВОЗР');
  });
});

// ---------------------------------------------------------------------------
// TOTALS
// ---------------------------------------------------------------------------

describe('TOTALS', () => {
  it('generates TOTALS with aggregates and grouping', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Продажи')],
        select: [
          selExpr(col('Товар', 'Т')),
          selExpr(col('Сумма', 'Т')),
        ],
        totals: {
          totals: [
            { func: 'SUM', expr: col('Сумма', 'Т'), alias: 'Итого' },
          ],
          by: [col('Товар', 'Т')],
        },
      }],
    };

    const result = generate(model);
    expect(result).toContain('ИТОГИ');
    expect(result).toContain('СУММА(Т.Сумма) КАК Итого');
    expect(result).toContain('ПО');
    expect(result).toContain('Т.Товар');
  });
});

// ---------------------------------------------------------------------------
// Virtual table with params
// ---------------------------------------------------------------------------

describe('Virtual table source', () => {
  it('generates virtual table source with parameters', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [{
          alias: 'Ост',
          kind: 'virtual',
          object: 'РегистрНакопления.ОстаткиТоваров.Остатки',
          virtualParams: [
            { name: 'Период', value: param('Дата') },
          ],
        }],
        select: [selExpr(col('Количество', 'Ост'))],
      }],
    };

    const result = generate(model);
    expect(result).toContain('РегистрНакопления.ОстаткиТоваров.Остатки(Период = &Дата) КАК Ост');
  });
});

// ---------------------------------------------------------------------------
// Subquery source
// ---------------------------------------------------------------------------

describe('Subquery source', () => {
  it('generates a subquery in FROM', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [{
          alias: 'ПЗ',
          kind: 'subquery',
          subquery: {
            kind: 'queryBody',
            sources: [objectSource('Д', 'Документ.Заказ')],
            select: [selExpr(col('Ссылка', 'Д'), 'Док')],
          },
        }],
        select: [selExpr(col('Док', 'ПЗ'))],
      }],
    };

    const result = generate(model);
    expect(result).toContain('ИЗ');
    expect(result).toContain('(');
    expect(result).toContain('ВЫБРАТЬ');
    expect(result).toContain('Д.Ссылка КАК Док');
    expect(result).toContain(') КАК ПЗ');
  });
});

// ---------------------------------------------------------------------------
// Lowercase keywords option
// ---------------------------------------------------------------------------

describe('Lowercase keywords', () => {
  it('generates lowercase keywords when uppercase=false', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(col('Поле', 'Т'))],
      }],
    };

    const result = generate(model, { uppercase: false });
    expect(result).toContain('выбрать');
    expect(result).toContain('из');
    expect(result).toContain('как');
  });
});

// ---------------------------------------------------------------------------
// English mode full query
// ---------------------------------------------------------------------------

describe('English mode full query', () => {
  it('generates a complete English query', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('T', 'Catalog.Items')],
        select: [
          selExpr(col('Ref', 'T'), 'Item'),
          selExpr(col('Description', 'T'), 'Name'),
        ],
        where: cmp(col('IsGroup', 'T'), '=', lit('bool', false)),
        orderBy: [{ expr: col('Description', 'T'), direction: 'asc' }],
        options: { distinct: true, top: 100 },
      }],
    };

    const result = generate(model, { language: 'EN' });
    expect(result).toContain('SELECT DISTINCT TOP 100');
    expect(result).toContain('T.Ref AS Item');
    expect(result).toContain('T.Description AS Name');
    expect(result).toContain('FROM');
    expect(result).toContain('Catalog.Items AS T');
    expect(result).toContain('WHERE');
    expect(result).toContain('T.IsGroup = FALSE');
    expect(result).toContain('ORDER BY');
    expect(result).toContain('T.Description ASC');
  });
});

// ---------------------------------------------------------------------------
// FOR UPDATE with specific tables
// ---------------------------------------------------------------------------

describe('FOR UPDATE with specific tables', () => {
  it('generates FOR UPDATE with table list', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(col('Поле', 'Т'))],
        options: {
          forUpdate: { mode: 'specific', tables: ['Таблица1', 'Таблица2'] },
        },
      }],
    };

    const result = generate(model);
    expect(result).toContain('ДЛЯ ИЗМЕНЕНИЯ Таблица1, Таблица2');
  });
});

// ---------------------------------------------------------------------------
// LIKE comparison
// ---------------------------------------------------------------------------

describe('LIKE comparison', () => {
  it('generates ПОДОБНО in RU', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('Т', 'Таблица')],
        select: [selExpr(col('Поле', 'Т'))],
        where: cmp(col('Имя', 'Т'), 'like', lit('string', '%тест%')),
      }],
    };

    const result = generate(model);
    expect(result).toContain('Т.Имя ПОДОБНО "%тест%"');
  });

  it('generates LIKE in EN', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [objectSource('T', 'Table')],
        select: [selExpr(col('Field', 'T'))],
        where: cmp(col('Name', 'T'), 'like', lit('string', '%test%')),
      }],
    };

    const result = generate(model, { language: 'EN' });
    expect(result).toContain('T.Name LIKE "%test%"');
  });
});
