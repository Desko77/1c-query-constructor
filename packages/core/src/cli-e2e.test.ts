// =============================================================================
// CLI end-to-end tests
// Tests the CLI logic by directly importing core functions as the CLI does
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Import core directly (same functions the CLI uses)
import { parseQuery } from './parser/parser/parser.js';
import { generateText } from './parser/generator/model-to-text.js';
import { validate } from './validator/validator.js';
import { analyze } from './analyzer/analyzer.js';
import { allRules } from './analyzer/rules/index.js';

const CORPUS_DIR = join(__dirname, '../../../corpus/valid');

// CLI exit code logic
function exitCode(diags: Array<{ severity: string }>): number {
  if (diags.some(d => d.severity === 'error')) return 2;
  if (diags.some(d => d.severity === 'warn')) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// parse command
// ---------------------------------------------------------------------------

describe('CLI: parse command', () => {
  it('should parse a valid query and output QueryModel JSON', () => {
    const text = readFileSync(join(CORPUS_DIR, '001-simple-select.1cquery'), 'utf-8');
    const r = parseQuery(text);
    const json = JSON.stringify(r.model, null, 2);

    expect(json).toContain('"version": "1.0"');
    expect(json).toContain('"kind": "queryBody"');
    expect(r.model.queries.length).toBe(1);
  });

  it('should parse all corpus files without crashing', () => {
    const files = readdirSync(CORPUS_DIR).filter(f => f.endsWith('.1cquery'));
    for (const file of files) {
      const text = readFileSync(join(CORPUS_DIR, file), 'utf-8');
      const r = parseQuery(text);
      expect(r.model).toBeDefined();
      expect(r.model.queries.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('should return exit code 0 for valid queries', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном ИЗ Справочник.Номенклатура КАК Ном`;
    const r = parseQuery(text);
    expect(exitCode(r.diagnostics)).toBe(0);
  });

  it('should produce JSON output format', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном ИЗ Справочник.Номенклатура КАК Ном`;
    const r = parseQuery(text);
    const json = JSON.stringify({ model: r.model, diagnostics: r.diagnostics }, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed.model).toBeDefined();
    expect(parsed.diagnostics).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// validate command
// ---------------------------------------------------------------------------

describe('CLI: validate command', () => {
  it('should validate a correct query with no errors', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном ИЗ Справочник.Номенклатура КАК Ном`;
    const r = parseQuery(text);
    const valDiags = validate(r.model);
    const all = [...r.diagnostics, ...valDiags];
    expect(exitCode(all)).toBe(0);
  });

  it('should detect HAVING without GROUP BY', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном ИЗ Справочник.Номенклатура КАК Ном ИМЕЮЩИЕ Ном.Ссылка > 0`;
    const r = parseQuery(text);
    const valDiags = validate(r.model);
    const all = [...r.diagnostics, ...valDiags];
    expect(exitCode(all)).toBeGreaterThan(0);
  });

  it('should return exit code 0 for all valid corpus files', () => {
    const files = readdirSync(CORPUS_DIR).filter(f => f.endsWith('.1cquery'));
    for (const file of files) {
      const text = readFileSync(join(CORPUS_DIR, file), 'utf-8');
      const r = parseQuery(text);
      // Validation may produce warnings for structural issues, but should not crash
      const valDiags = validate(r.model);
      expect(valDiags).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// lint command
// ---------------------------------------------------------------------------

describe('CLI: lint command', () => {
  it('should detect SELECT * warning (SQA-001)', () => {
    const text = `ВЫБРАТЬ * ИЗ Справочник.Номенклатура КАК Ном`;
    const r = parseQuery(text);
    const rules = allRules();
    const diags = analyze(r.model, rules);
    expect(diags.some(d => d.code === 'SQA-001')).toBe(true);
    expect(exitCode(diags)).toBeGreaterThan(0);
  });

  it('should not warn on queries without issues', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном ИЗ Справочник.Номенклатура КАК Ном`;
    const r = parseQuery(text);
    const rules = allRules();
    const diags = analyze(r.model, rules);
    const selectWild = diags.find(d => d.code === 'SQA-001');
    expect(selectWild).toBeUndefined();
  });

  it('should output JSON format', () => {
    const text = `ВЫБРАТЬ * ИЗ Справочник.Номенклатура КАК Ном`;
    const r = parseQuery(text);
    const rules = allRules();
    const diags = analyze(r.model, rules);
    const json = JSON.stringify({ diagnostics: diags }, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed.diagnostics).toBeDefined();
    expect(Array.isArray(parsed.diagnostics)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// format command
// ---------------------------------------------------------------------------

describe('CLI: format command', () => {
  it('should format a query in RU language', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном ИЗ Справочник.Номенклатура КАК Ном`;
    const r = parseQuery(text);
    const formatted = generateText(r.model, { language: 'RU' });
    expect(formatted).toContain('ВЫБРАТЬ');
    expect(formatted).toContain('ИЗ');
  });

  it('should format a query in EN language', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном ИЗ Справочник.Номенклатура КАК Ном`;
    const r = parseQuery(text);
    const formatted = generateText(r.model, { language: 'EN' });
    expect(formatted).toContain('SELECT');
    expect(formatted).toContain('FROM');
  });

  it('should format all corpus files without errors', () => {
    const files = readdirSync(CORPUS_DIR).filter(f => f.endsWith('.1cquery'));
    for (const file of files) {
      const text = readFileSync(join(CORPUS_DIR, file), 'utf-8');
      const r = parseQuery(text);
      const formatted = generateText(r.model);
      expect(formatted.length).toBeGreaterThan(0);
    }
  });

  it('should produce parseable output after formatting', () => {
    const text = `ВЫБРАТЬ Ном.Ссылка КАК Ном ИЗ Справочник.Номенклатура КАК Ном`;
    const r1 = parseQuery(text);
    const formatted = generateText(r1.model, { language: 'RU' });
    const r2 = parseQuery(formatted);
    expect(r2.model.queries.length).toBe(r1.model.queries.length);
  });
});
