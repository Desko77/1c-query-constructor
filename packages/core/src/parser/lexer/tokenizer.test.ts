import { describe, it, expect } from 'vitest';
import { tokenize } from './tokenizer.js';
import { TokenType } from './token-types.js';
import { detectLanguage } from './keywords.js';

/** Helper: extract only non-EOF token types from a token array */
function types(input: string): TokenType[] {
  return tokenize(input)
    .filter((t) => t.type !== TokenType.EOF)
    .map((t) => t.type);
}

/** Helper: extract only non-EOF token texts from a token array */
function texts(input: string): string[] {
  return tokenize(input)
    .filter((t) => t.type !== TokenType.EOF)
    .map((t) => t.text);
}

describe('Tokenizer', () => {
  describe('simple SELECT query in Russian', () => {
    it('should tokenize ВЫБРАТЬ * ИЗ Справочник.Номенклатура', () => {
      const tokens = tokenize('ВЫБРАТЬ * ИЗ Справочник.Номенклатура');
      const significant = tokens.filter((t) => t.type !== TokenType.EOF);

      expect(significant.map((t) => t.type)).toEqual([
        TokenType.KW_SELECT,
        TokenType.STAR,
        TokenType.KW_FROM,
        TokenType.IDENTIFIER,
        TokenType.DOT,
        TokenType.IDENTIFIER,
      ]);
      expect(significant[0].text).toBe('ВЫБРАТЬ');
      expect(significant[2].text).toBe('ИЗ');
      expect(significant[3].text).toBe('Справочник');
      expect(significant[5].text).toBe('Номенклатура');
    });

    it('should tokenize a Russian query with WHERE clause', () => {
      const input = 'ВЫБРАТЬ Наименование ИЗ Товары ГДЕ Цена > 100';
      const toks = types(input);
      expect(toks).toEqual([
        TokenType.KW_SELECT,
        TokenType.IDENTIFIER,
        TokenType.KW_FROM,
        TokenType.IDENTIFIER,
        TokenType.KW_WHERE,
        TokenType.IDENTIFIER,
        TokenType.GT,
        TokenType.NUMBER_LITERAL,
      ]);
    });
  });

  describe('simple SELECT query in English', () => {
    it('should tokenize SELECT * FROM Catalog.Items', () => {
      const tokens = tokenize('SELECT * FROM Catalog.Items');
      const significant = tokens.filter((t) => t.type !== TokenType.EOF);

      expect(significant.map((t) => t.type)).toEqual([
        TokenType.KW_SELECT,
        TokenType.STAR,
        TokenType.KW_FROM,
        TokenType.IDENTIFIER,
        TokenType.DOT,
        TokenType.IDENTIFIER,
      ]);
      expect(significant[0].text).toBe('SELECT');
      expect(significant[2].text).toBe('FROM');
    });

    it('should tokenize SELECT with WHERE, AND', () => {
      const input = 'SELECT Name FROM Items WHERE Price > 100 AND Active = TRUE';
      const toks = types(input);
      expect(toks).toEqual([
        TokenType.KW_SELECT,
        TokenType.IDENTIFIER,
        TokenType.KW_FROM,
        TokenType.IDENTIFIER,
        TokenType.KW_WHERE,
        TokenType.IDENTIFIER,
        TokenType.GT,
        TokenType.NUMBER_LITERAL,
        TokenType.KW_AND,
        TokenType.IDENTIFIER,
        TokenType.EQ,
        TokenType.KW_TRUE,
      ]);
    });
  });

  describe('all operator tokens', () => {
    it('should tokenize all single-character operators', () => {
      const input = '. , ; ( ) * + - / =';
      const toks = types(input);
      expect(toks).toEqual([
        TokenType.DOT,
        TokenType.COMMA,
        TokenType.SEMICOLON,
        TokenType.LPAREN,
        TokenType.RPAREN,
        TokenType.STAR,
        TokenType.PLUS,
        TokenType.MINUS,
        TokenType.SLASH,
        TokenType.EQ,
      ]);
    });

    it('should tokenize multi-character operators', () => {
      const input = '<> >= <= > < =';
      const toks = types(input);
      expect(toks).toEqual([
        TokenType.NEQ,
        TokenType.GTE,
        TokenType.LTE,
        TokenType.GT,
        TokenType.LT,
        TokenType.EQ,
      ]);
    });

    it('should tokenize < followed by non-operator', () => {
      const input = '<5';
      const toks = types(input);
      expect(toks).toEqual([TokenType.LT, TokenType.NUMBER_LITERAL]);
    });
  });

  describe('string literals', () => {
    it('should tokenize single-quoted strings', () => {
      const input = "'hello world'";
      const tokens = tokenize(input);
      const significant = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(significant).toHaveLength(1);
      expect(significant[0].type).toBe(TokenType.STRING_LITERAL);
      expect(significant[0].text).toBe("'hello world'");
    });

    it('should tokenize double-quoted strings', () => {
      const input = '"hello"';
      const tokens = tokenize(input);
      const significant = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(significant).toHaveLength(1);
      expect(significant[0].type).toBe(TokenType.STRING_LITERAL);
      expect(significant[0].text).toBe('"hello"');
    });

    it('should handle escaped single quotes (doubled)', () => {
      const input = "'it''s a test'";
      const tokens = tokenize(input);
      const significant = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(significant).toHaveLength(1);
      expect(significant[0].type).toBe(TokenType.STRING_LITERAL);
      expect(significant[0].text).toBe("'it''s a test'");
    });

    it('should handle escaped double quotes (doubled)', () => {
      const input = '"say ""hello"""';
      const tokens = tokenize(input);
      const significant = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(significant).toHaveLength(1);
      expect(significant[0].type).toBe(TokenType.STRING_LITERAL);
      expect(significant[0].text).toBe('"say ""hello"""');
    });

    it('should produce ERROR token for unterminated string', () => {
      const input = "'unterminated";
      const tokens = tokenize(input);
      const significant = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(significant).toHaveLength(1);
      expect(significant[0].type).toBe(TokenType.ERROR);
    });
  });

  describe('number literals', () => {
    it('should tokenize integer numbers', () => {
      const input = '42';
      const toks = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(toks).toHaveLength(1);
      expect(toks[0].type).toBe(TokenType.NUMBER_LITERAL);
      expect(toks[0].text).toBe('42');
    });

    it('should tokenize decimal numbers', () => {
      const input = '3.14';
      const toks = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(toks).toHaveLength(1);
      expect(toks[0].type).toBe(TokenType.NUMBER_LITERAL);
      expect(toks[0].text).toBe('3.14');
    });

    it('should tokenize number followed by dot as separate tokens when dot is not followed by digit', () => {
      const input = '42.Поле';
      const toks = types(input);
      // 42 is a number, . is DOT, Поле is IDENTIFIER
      expect(toks).toEqual([
        TokenType.NUMBER_LITERAL,
        TokenType.DOT,
        TokenType.IDENTIFIER,
      ]);
    });

    it('should tokenize zero', () => {
      const input = '0';
      const toks = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(toks[0].type).toBe(TokenType.NUMBER_LITERAL);
      expect(toks[0].text).toBe('0');
    });
  });

  describe('parameter tokens', () => {
    it('should tokenize parameter &Период', () => {
      const input = '&Период';
      const toks = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(toks).toHaveLength(1);
      expect(toks[0].type).toBe(TokenType.PARAMETER);
      expect(toks[0].text).toBe('&Период');
    });

    it('should tokenize parameter &Name', () => {
      const input = '&Name';
      const toks = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(toks).toHaveLength(1);
      expect(toks[0].type).toBe(TokenType.PARAMETER);
      expect(toks[0].text).toBe('&Name');
    });

    it('should tokenize parameters in context', () => {
      const input = 'ГДЕ Цена > &МинЦена И Дата = &ДатаОтчёта';
      const toks = types(input);
      expect(toks).toEqual([
        TokenType.KW_WHERE,
        TokenType.IDENTIFIER,
        TokenType.GT,
        TokenType.PARAMETER,
        TokenType.KW_AND,
        TokenType.IDENTIFIER,
        TokenType.EQ,
        TokenType.PARAMETER,
      ]);
    });
  });

  describe('comment preservation as trivia', () => {
    it('should attach comment to next token as leading trivia', () => {
      const input = '// This is a comment\nSELECT';
      const tokens = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.KW_SELECT);
      expect(tokens[0].leadingTrivia).toBeDefined();
      expect(tokens[0].leadingTrivia!.length).toBe(2); // comment + newline
      expect(tokens[0].leadingTrivia![0].kind).toBe('comment');
      expect(tokens[0].leadingTrivia![0].text).toBe('// This is a comment');
      expect(tokens[0].leadingTrivia![1].kind).toBe('newline');
    });

    it('should attach whitespace as trivia', () => {
      const input = '  SELECT';
      const tokens = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.KW_SELECT);
      expect(tokens[0].leadingTrivia).toBeDefined();
      expect(tokens[0].leadingTrivia![0].kind).toBe('whitespace');
      expect(tokens[0].leadingTrivia![0].text).toBe('  ');
    });

    it('should attach trailing trivia (comment at end) to EOF', () => {
      const input = 'SELECT // comment';
      const tokens = tokenize(input);
      const eof = tokens[tokens.length - 1];
      expect(eof.type).toBe(TokenType.EOF);
      expect(eof.leadingTrivia).toBeDefined();
      const comment = eof.leadingTrivia!.find((t) => t.kind === 'comment');
      expect(comment).toBeDefined();
      expect(comment!.text).toBe('// comment');
    });
  });

  describe('language auto-detection', () => {
    it('should detect Russian when first keyword is Russian', () => {
      expect(detectLanguage('ВЫБРАТЬ * ИЗ Таблица')).toBe('RU');
    });

    it('should detect English when first keyword is English', () => {
      expect(detectLanguage('SELECT * FROM Table')).toBe('EN');
    });

    it('should default to RU when no keywords found', () => {
      expect(detectLanguage('НечтоНезнакомое')).toBe('RU');
    });

    it('should detect based on first keyword even with identifiers before', () => {
      // Identifiers are not keywords, so detection finds the first keyword
      expect(detectLanguage('MyTable SELECT')).toBe('EN');
    });

    it('should detect Russian for ПОМЕСТИТЬ', () => {
      expect(detectLanguage('ПОМЕСТИТЬ Таблица')).toBe('RU');
    });
  });

  describe('Cyrillic identifiers', () => {
    it('should tokenize Cyrillic identifiers', () => {
      const input = 'Справочник';
      const toks = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(toks).toHaveLength(1);
      expect(toks[0].type).toBe(TokenType.IDENTIFIER);
      expect(toks[0].text).toBe('Справочник');
    });

    it('should tokenize mixed Cyrillic-number identifiers', () => {
      const input = 'Поле1';
      const toks = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(toks).toHaveLength(1);
      expect(toks[0].type).toBe(TokenType.IDENTIFIER);
      expect(toks[0].text).toBe('Поле1');
    });

    it('should tokenize identifiers starting with underscore', () => {
      const input = '_ВнутреннееИмя';
      const toks = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(toks).toHaveLength(1);
      expect(toks[0].type).toBe(TokenType.IDENTIFIER);
      expect(toks[0].text).toBe('_ВнутреннееИмя');
    });

    it('should distinguish Cyrillic keywords from identifiers', () => {
      const input = 'ВЫБРАТЬ Справочник';
      const toks = types(input);
      expect(toks).toEqual([TokenType.KW_SELECT, TokenType.IDENTIFIER]);
    });
  });

  describe('date literal', () => {
    it('should tokenize ДАТАВРЕМЯ(2024,1,1)', () => {
      const input = 'ДАТАВРЕМЯ(2024,1,1)';
      const toks = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(toks).toHaveLength(1);
      expect(toks[0].type).toBe(TokenType.DATE_LITERAL);
      expect(toks[0].text).toBe('ДАТАВРЕМЯ(2024,1,1)');
    });

    it('should tokenize DATETIME(2024,1,1,12,0,0)', () => {
      const input = 'DATETIME(2024,1,1,12,0,0)';
      const toks = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(toks).toHaveLength(1);
      expect(toks[0].type).toBe(TokenType.DATE_LITERAL);
      expect(toks[0].text).toBe('DATETIME(2024,1,1,12,0,0)');
    });

    it('should tokenize date literal in a WHERE clause', () => {
      const input = 'ГДЕ Дата > ДАТАВРЕМЯ(2024,6,15)';
      const toks = types(input);
      expect(toks).toEqual([
        TokenType.KW_WHERE,
        TokenType.IDENTIFIER,
        TokenType.GT,
        TokenType.DATE_LITERAL,
      ]);
    });
  });

  describe('line and column tracking', () => {
    it('should track line and column for single-line input', () => {
      const input = 'SELECT *';
      const tokens = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(tokens[0].range.line).toBe(1);
      expect(tokens[0].range.col).toBe(1);
      // STAR is at position 7 (0-indexed), col=8 (1-indexed)
      expect(tokens[1].range.line).toBe(1);
      expect(tokens[1].range.col).toBe(8);
    });

    it('should track line and column across newlines', () => {
      const input = 'SELECT\n*';
      const tokens = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      expect(tokens[0].range.line).toBe(1);
      expect(tokens[0].range.col).toBe(1);
      expect(tokens[1].range.line).toBe(2);
      expect(tokens[1].range.col).toBe(1);
    });
  });

  describe('case insensitivity for keywords', () => {
    it('should recognize lowercase keywords', () => {
      const input = 'select * from Table';
      const toks = types(input);
      expect(toks).toEqual([
        TokenType.KW_SELECT,
        TokenType.STAR,
        TokenType.KW_FROM,
        TokenType.IDENTIFIER,
      ]);
    });

    it('should recognize mixed-case keywords', () => {
      const input = 'Select Distinct';
      const toks = types(input);
      expect(toks).toEqual([TokenType.KW_SELECT, TokenType.KW_DISTINCT]);
    });

    it('should recognize lowercase Russian keywords', () => {
      const input = 'выбрать различные';
      const toks = types(input);
      expect(toks).toEqual([TokenType.KW_SELECT, TokenType.KW_DISTINCT]);
    });
  });

  describe('EOF token', () => {
    it('should always produce an EOF token at the end', () => {
      const tokens = tokenize('');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.EOF);
    });

    it('should produce EOF after all other tokens', () => {
      const tokens = tokenize('SELECT');
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
    });
  });

  describe('complex query', () => {
    it('should tokenize a full complex Russian query', () => {
      const input = `ВЫБРАТЬ
  Товары.Наименование КАК Имя,
  СУММА(Товары.Цена) КАК ИтогоЦена
ИЗ
  Справочник.Товары КАК Товары
ГДЕ
  Товары.Цена > &МинЦена
СГРУППИРОВАТЬ ПО
  Товары.Наименование`;

      const tokens = tokenize(input).filter((t) => t.type !== TokenType.EOF);
      // Just check that tokenization completes without errors and has the right structure
      expect(tokens.length).toBeGreaterThan(0);

      // Check there are no ERROR tokens
      const errors = tokens.filter((t) => t.type === TokenType.ERROR);
      expect(errors).toHaveLength(0);

      // Check first token
      expect(tokens[0].type).toBe(TokenType.KW_SELECT);
      expect(tokens[0].text).toBe('ВЫБРАТЬ');
    });
  });
});
