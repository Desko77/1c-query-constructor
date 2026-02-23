// =============================================================================
// Integration / Round-trip tests
// text → parse → model → generate → re-parse → compare models
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseQuery } from './parser/parser/parser.js';
import { generateText } from './parser/generator/model-to-text.js';
import { validate } from './validator/validator.js';
import { analyze, parseRuleConfig } from './analyzer/analyzer.js';
import { allRules } from './analyzer/rules/index.js';
import type { QueryModel, QueryBody, Expr, BoolExpr, SelectItem } from './model/query-model.js';

const CORPUS_DIR = join(__dirname, '../../../corpus/valid');

// ---------------------------------------------------------------------------
// Helper: deep-compare two QueryModels ignoring trivia, order of some fields
// ---------------------------------------------------------------------------

function stripTrivia(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripTrivia);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // Skip trivia/metadata fields that don't affect semantics
      if (k === 'trivia' || k === 'range' || k === 'sourceRange') continue;
      result[k] = stripTrivia(v);
    }
    return result;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Round-trip tests for all corpus files
// ---------------------------------------------------------------------------

describe('Round-trip: text → parse → generate → re-parse', () => {
  const files = readdirSync(CORPUS_DIR).filter(f => f.endsWith('.1cquery')).sort();

  for (const file of files) {
    it(`should round-trip ${file}`, () => {
      const text = readFileSync(join(CORPUS_DIR, file), 'utf-8');

      // Step 1: Parse original text
      const result1 = parseQuery(text);
      // Allow minor diagnostics but no crash
      expect(result1.model).toBeDefined();
      expect(result1.model.queries.length).toBeGreaterThanOrEqual(1);

      // Step 2: Generate text from model
      const generated = generateText(result1.model);
      expect(generated.length).toBeGreaterThan(0);

      // Step 3: Re-parse generated text
      const result2 = parseQuery(generated);
      expect(result2.model).toBeDefined();
      expect(result2.model.queries.length).toBe(result1.model.queries.length);

      // Step 4: Compare models (strip trivia for comparison)
      const m1 = stripTrivia(result1.model);
      const m2 = stripTrivia(result2.model);
      expect(m2).toEqual(m1);
    });
  }
});

// ---------------------------------------------------------------------------
// Specific round-trip tests for key constructs
// ---------------------------------------------------------------------------

describe('Round-trip: specific constructs', () => {
  it('should round-trip simple SELECT with WHERE and ORDER BY', () => {
    const text = `ВЫБРАТЬ
  Ном.Ссылка КАК Номенклатура,
  Ном.Наименование КАК Наименование
ИЗ
  Справочник.Номенклатура КАК Ном
ГДЕ
  Ном.ЭтоГруппа = ЛОЖЬ
УПОРЯДОЧИТЬ ПО
  Ном.Наименование ВОЗР`;

    const r1 = parseQuery(text);
    const gen = generateText(r1.model);
    const r2 = parseQuery(gen);
    expect(stripTrivia(r2.model)).toEqual(stripTrivia(r1.model));
  });

  it('should round-trip batch query with temp table', () => {
    const text = `ВЫБРАТЬ Док.Ссылка КАК Документ, Док.Дата КАК Дата
ПОМЕСТИТЬ ВТ_Документы
ИЗ Документ.РеализацияТоваровУслуг КАК Док;

ВЫБРАТЬ КОЛИЧЕСТВО(ВТ.Документ) КАК КолВо
ИЗ ВТ_Документы КАК ВТ;

УНИЧТОЖИТЬ ВТ_Документы`;

    const r1 = parseQuery(text);
    expect(r1.model.queries.length).toBe(3);
    const gen = generateText(r1.model);
    expect(gen).toContain('ПОМЕСТИТЬ');
    expect(gen).toContain('УНИЧТОЖИТЬ');
    const r2 = parseQuery(gen);
    expect(r2.model.queries.length).toBe(3);
    expect(stripTrivia(r2.model)).toEqual(stripTrivia(r1.model));
  });

  it('should round-trip UNION ALL', () => {
    const text = `ВЫБРАТЬ "Реализация" КАК ТипДокумента, Реал.Сумма КАК Сумма
ИЗ Документ.РеализацияТоваровУслуг КАК Реал

ОБЪЕДИНИТЬ ВСЕ

ВЫБРАТЬ "Поступление", Пост.Сумма
ИЗ Документ.ПоступлениеТоваровУслуг КАК Пост`;

    const r1 = parseQuery(text);
    const gen = generateText(r1.model);
    expect(gen.toUpperCase()).toContain('ОБЪЕДИНИТЬ');
    const r2 = parseQuery(gen);
    expect(stripTrivia(r2.model)).toEqual(stripTrivia(r1.model));
  });

  it('should round-trip CASE/WHEN/CAST', () => {
    const text = `ВЫБРАТЬ
  ВЫБОР
    КОГДА Ном.ЭтоГруппа = ИСТИНА ТОГДА "Группа"
    ИНАЧЕ "Элемент"
  КОНЕЦ КАК Тип,
  ВЫРАЗИТЬ(Ном.Наименование КАК СТРОКА(100)) КАК Имя
ИЗ
  Справочник.Номенклатура КАК Ном`;

    const r1 = parseQuery(text);
    const gen = generateText(r1.model);
    const r2 = parseQuery(gen);
    expect(stripTrivia(r2.model)).toEqual(stripTrivia(r1.model));
  });

  it('should round-trip English syntax', () => {
    const text = `SELECT DISTINCT
  Products.Ref AS Product,
  Products.Description AS Name
FROM
  Catalog.Products AS Products
WHERE
  Products.DeletionMark = FALSE
ORDER BY
  Products.Description ASC`;

    const r1 = parseQuery(text);
    expect(r1.model.meta.language).toBe('EN');
    const gen = generateText(r1.model);
    const r2 = parseQuery(gen);
    expect(stripTrivia(r2.model)).toEqual(stripTrivia(r1.model));
  });

  it('should round-trip GROUP BY with HAVING', () => {
    const text = `ВЫБРАТЬ
  Прод.Номенклатура КАК Номенклатура,
  СУММА(Прод.Сумма) КАК ОбщаяСумма
ИЗ
  РегистрНакопления.Продажи КАК Прод
СГРУППИРОВАТЬ ПО
  Прод.Номенклатура
ИМЕЮЩИЕ
  СУММА(Прод.Сумма) > 1000`;

    const r1 = parseQuery(text);
    const gen = generateText(r1.model);
    const r2 = parseQuery(gen);
    expect(stripTrivia(r2.model)).toEqual(stripTrivia(r1.model));
  });

  it('should round-trip JOIN with ON condition', () => {
    const text = `ВЫБРАТЬ
  Док.Ссылка КАК Документ,
  Товары.Номенклатура КАК Номенклатура
ИЗ
  Документ.Реализация КАК Док
  ЛЕВОЕ СОЕДИНЕНИЕ Документ.Реализация.Товары КАК Товары
  ПО Док.Ссылка = Товары.Ссылка`;

    const r1 = parseQuery(text);
    const gen = generateText(r1.model);
    const r2 = parseQuery(gen);
    expect(stripTrivia(r2.model)).toEqual(stripTrivia(r1.model));
  });

  it('should round-trip subquery in FROM', () => {
    const text = `ВЫБРАТЬ
  Под.Ссылка КАК Ссылка
ИЗ
  (ВЫБРАТЬ Т.Ссылка ИЗ Документ.Реализация КАК Т) КАК Под`;

    const r1 = parseQuery(text);
    const gen = generateText(r1.model);
    const r2 = parseQuery(gen);
    expect(stripTrivia(r2.model)).toEqual(stripTrivia(r1.model));
  });
});

// ---------------------------------------------------------------------------
// Parse → Validate pipeline tests
// ---------------------------------------------------------------------------

describe('Parse → Validate pipeline', () => {
  it('should parse and validate a correct query with no errors', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном
ИЗ Справочник.Номенклатура КАК Ном`;

    const { model, diagnostics: parseDiag } = parseQuery(text);
    const valDiag = validate(model);
    const errors = [...parseDiag, ...valDiag].filter(d => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('should detect HAVING without GROUP BY', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном
ИЗ Справочник.Номенклатура КАК Ном
ИМЕЮЩИЕ Ном.Ссылка > 0`;

    const { model } = parseQuery(text);
    const valDiag = validate(model);
    const havingError = valDiag.find(d => d.message.toLowerCase().includes('having') || d.message.toLowerCase().includes('group'));
    expect(havingError).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Parse → Analyze pipeline tests
// ---------------------------------------------------------------------------

describe('Parse → Analyze pipeline', () => {
  it('should detect SELECT * warning', () => {
    const text = `ВЫБРАТЬ *
ИЗ Справочник.Номенклатура КАК Ном`;

    const { model } = parseQuery(text);
    const rules = allRules();
    const diags = analyze(model, rules);
    const wildcardWarn = diags.find(d => d.code === 'SQA-001');
    expect(wildcardWarn).toBeDefined();
  });

  it('should not warn on specific columns', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном
ИЗ Справочник.Номенклатура КАК Ном`;

    const { model } = parseQuery(text);
    const rules = allRules();
    const diags = analyze(model, rules);
    const wildcardWarn = diags.find(d => d.code === 'SQA-001');
    expect(wildcardWarn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: parse → validate → analyze → generate
// ---------------------------------------------------------------------------

describe('Full pipeline', () => {
  const files = readdirSync(CORPUS_DIR).filter(f => f.endsWith('.1cquery')).sort();

  for (const file of files) {
    it(`should run full pipeline on ${file}`, () => {
      const text = readFileSync(join(CORPUS_DIR, file), 'utf-8');

      // Parse
      const { model, diagnostics: parseDiag } = parseQuery(text);
      expect(model).toBeDefined();

      // Validate
      const valDiag = validate(model);
      // Just ensure no crash

      // Analyze
      const rules = allRules();
      const analyzerDiag = analyze(model, rules);
      // Just ensure no crash

      // Generate
      const generated = generateText(model);
      expect(generated.length).toBeGreaterThan(0);

      // Total diagnostics count (informational — we just check the pipeline works)
      const totalDiag = [...parseDiag, ...valDiag, ...analyzerDiag];
      // No requirement on count, just that pipeline completes
      expect(totalDiag).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// Performance smoke test
// ---------------------------------------------------------------------------

describe('Performance', () => {
  it('should parse a medium query in under 100ms', () => {
    // Build a ~200 line query
    const lines: string[] = ['ВЫБРАТЬ'];
    for (let i = 0; i < 50; i++) {
      lines.push(`  Т.Поле${i} КАК Поле${i}${i < 49 ? ',' : ''}`);
    }
    lines.push('ИЗ');
    lines.push('  Справочник.Номенклатура КАК Т');
    lines.push('ГДЕ');
    for (let i = 0; i < 20; i++) {
      lines.push(`  ${i > 0 ? 'И ' : ''}Т.Поле${i} > ${i}`);
    }
    lines.push('УПОРЯДОЧИТЬ ПО');
    for (let i = 0; i < 10; i++) {
      lines.push(`  Т.Поле${i} ВОЗР${i < 9 ? ',' : ''}`);
    }

    const text = lines.join('\n');

    const start = performance.now();
    const { model } = parseQuery(text);
    const generated = generateText(model);
    const elapsed = performance.now() - start;

    expect(model.queries.length).toBe(1);
    expect(generated.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100); // 100ms threshold
  });
});
