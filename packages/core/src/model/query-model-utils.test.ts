import { describe, it, expect } from 'vitest';
import type { QueryModel, QueryBody } from './query-model.js';
import {
  cloneModel,
  walkQueryBodies,
  collectParameters,
  collectParamRefs,
  getSourceAliases,
  findSource,
  getQueryBody,
} from './query-model-utils.js';

const minimalBody: QueryBody = {
  kind: 'queryBody',
  sources: [{ alias: 'Ном', kind: 'object', object: 'Справочник.Номенклатура' }],
  select: [{ kind: 'selectExpr', expr: { kind: 'column', sourceAlias: 'Ном', name: 'Ссылка' } }],
};

const minimalModel: QueryModel = {
  version: '1.0',
  queries: [minimalBody],
};

describe('cloneModel', () => {
  it('creates a deep copy', () => {
    const clone = cloneModel(minimalModel);
    expect(clone).toEqual(minimalModel);
    expect(clone).not.toBe(minimalModel);
    expect(clone.queries[0]).not.toBe(minimalModel.queries[0]);
  });
});

describe('walkQueryBodies', () => {
  it('yields the single body', () => {
    const bodies = Array.from(walkQueryBodies(minimalModel));
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toBe(minimalBody);
  });

  it('yields union parts', () => {
    const unionBody: QueryBody = {
      kind: 'queryBody',
      sources: [{ alias: 'Т', kind: 'object', object: 'Справочник.Товары' }],
      select: [{ kind: 'selectExpr', expr: { kind: 'column', name: 'Ссылка' } }],
    };
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        ...minimalBody,
        union: [{ all: true, body: unionBody }],
      }],
    };
    const bodies = Array.from(walkQueryBodies(model));
    expect(bodies).toHaveLength(2);
  });

  it('yields subqueries from sources', () => {
    const subquery: QueryBody = {
      kind: 'queryBody',
      sources: [{ alias: 'Внутр', kind: 'object', object: 'Документ.Счет' }],
      select: [{ kind: 'selectExpr', expr: { kind: 'column', name: 'Ссылка' } }],
    };
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [{ alias: 'Под', kind: 'subquery', subquery }],
        select: [{ kind: 'selectExpr', expr: { kind: 'column', sourceAlias: 'Под', name: 'Ссылка' } }],
      }],
    };
    const bodies = Array.from(walkQueryBodies(model));
    expect(bodies).toHaveLength(2);
  });

  it('skips destroyTempTable items', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [
        minimalBody,
        { kind: 'destroyTempTable', name: 'ВТ' },
      ],
    };
    const bodies = Array.from(walkQueryBodies(model));
    expect(bodies).toHaveLength(1);
  });
});

describe('collectParameters', () => {
  it('collects parameters from body', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        ...minimalBody,
        parameters: [
          { name: 'Период', source: 'inferred' },
          { name: 'Склад', source: 'manual' },
        ],
      }],
    };
    const params = collectParameters(model);
    expect(params).toHaveLength(2);
    expect(params.map(p => p.name)).toEqual(['Период', 'Склад']);
  });
});

describe('collectParamRefs', () => {
  it('finds parameter references in WHERE', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        ...minimalBody,
        where: {
          kind: 'cmp',
          op: '=',
          left: { kind: 'column', sourceAlias: 'Ном', name: 'Ссылка' },
          right: { kind: 'param', name: 'МойПараметр' },
        },
      }],
    };
    const refs = collectParamRefs(model);
    expect(refs).toContain('МойПараметр');
  });

  it('finds parameter references in virtual table params', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{
        kind: 'queryBody',
        sources: [{
          alias: 'Ост',
          kind: 'virtual',
          object: 'РегистрНакопления.ТоварыНаСкладах.Остатки',
          virtualParams: [{ name: 'Период', value: { kind: 'param', name: 'НаДату' } }],
        }],
        select: [{ kind: 'selectExpr', expr: { kind: 'column', sourceAlias: 'Ост', name: 'КоличествоОстаток' } }],
      }],
    };
    const refs = collectParamRefs(model);
    expect(refs).toContain('НаДату');
  });
});

describe('getSourceAliases', () => {
  it('returns alias list', () => {
    expect(getSourceAliases(minimalBody)).toEqual(['Ном']);
  });
});

describe('findSource', () => {
  it('finds by alias', () => {
    const found = findSource(minimalBody, 'Ном');
    expect(found).toBeDefined();
    expect(found!.object).toBe('Справочник.Номенклатура');
  });

  it('returns undefined for missing alias', () => {
    expect(findSource(minimalBody, 'Missing')).toBeUndefined();
  });
});

describe('getQueryBody', () => {
  it('returns QueryBody at index', () => {
    const body = getQueryBody(minimalModel, 0);
    expect(body).toBe(minimalBody);
  });

  it('returns undefined for destroyTempTable', () => {
    const model: QueryModel = {
      version: '1.0',
      queries: [{ kind: 'destroyTempTable', name: 'ВТ' }],
    };
    expect(getQueryBody(model, 0)).toBeUndefined();
  });

  it('returns undefined for out of bounds', () => {
    expect(getQueryBody(minimalModel, 5)).toBeUndefined();
  });
});
