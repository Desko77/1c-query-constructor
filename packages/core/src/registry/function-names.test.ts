import { describe, it, expect } from 'vitest';
import { canonicalize, localize, isKnownFunction } from './function-names';

/**
 * Complete mapping table from the spec (ТЗ §4.5).
 * Each entry: [RU, EN canonical]
 */
const FULL_MAPPING: Array<[string, string]> = [
  ['ПОДСТРОКА', 'SUBSTRING'],
  ['НАЧАЛОПЕРИОДА', 'BEGINOFPERIOD'],
  ['КОНЕЦПЕРИОДА', 'ENDOFPERIOD'],
  ['ДОБАВИТЬКДАТЕ', 'DATEADD'],
  ['РАЗНОСТЬДАТ', 'DATEDIFF'],
  ['ДАТАВРЕМЯ', 'DATETIME'],
  ['ГОД', 'YEAR'],
  ['КВАРТАЛ', 'QUARTER'],
  ['МЕСЯЦ', 'MONTH'],
  ['ДЕНЬГОДА', 'DAYOFYEAR'],
  ['ДЕНЬ', 'DAY'],
  ['НЕДЕЛЯ', 'WEEK'],
  ['ДЕНЬНЕДЕЛИ', 'WEEKDAY'],
  ['ЧАС', 'HOUR'],
  ['МИНУТА', 'MINUTE'],
  ['СЕКУНДА', 'SECOND'],
  ['ВЫРАЗИТЬ', 'CAST'],
  ['ЕСТЬNULL', 'ISNULL'],
  ['ПРЕДСТАВЛЕНИЕ', 'PRESENTATION'],
  ['ПРЕДСТАВЛЕНИЕССЫЛКИ', 'REFPRESENTATION'],
  ['ТИПЗНАЧЕНИЯ', 'VALUETYPE'],
  ['ТИП', 'TYPE'],
  ['ЗНАЧЕНИЕ', 'VALUE'],
  ['КОЛИЧЕСТВО', 'COUNT'],
  ['СУММА', 'SUM'],
  ['МИНИМУМ', 'MIN'],
  ['МАКСИМУМ', 'MAX'],
  ['СРЕДНЕЕ', 'AVG'],
];

describe('function-names registry', () => {
  // ── canonicalize ──────────────────────────────────────────────────

  describe('canonicalize', () => {
    describe('maps every RU name to EN canonical', () => {
      for (const [ru, en] of FULL_MAPPING) {
        it(`${ru} → ${en}`, () => {
          expect(canonicalize(ru)).toBe(en);
        });
      }
    });

    describe('maps every EN name to itself (canonical)', () => {
      for (const [, en] of FULL_MAPPING) {
        it(`${en} → ${en}`, () => {
          expect(canonicalize(en)).toBe(en);
        });
      }
    });

    describe('case insensitivity', () => {
      it('lowercase RU: подстрока → SUBSTRING', () => {
        expect(canonicalize('подстрока')).toBe('SUBSTRING');
      });

      it('mixed-case EN: Substring → SUBSTRING', () => {
        expect(canonicalize('Substring')).toBe('SUBSTRING');
      });

      it('uppercase RU: ПОДСТРОКА → SUBSTRING', () => {
        expect(canonicalize('ПОДСТРОКА')).toBe('SUBSTRING');
      });

      it('lowercase EN: substring → SUBSTRING', () => {
        expect(canonicalize('substring')).toBe('SUBSTRING');
      });

      it('lowercase RU for aggregate: сумма → SUM', () => {
        expect(canonicalize('сумма')).toBe('SUM');
      });

      it('mixed-case EN for aggregate: Sum → SUM', () => {
        expect(canonicalize('Sum')).toBe('SUM');
      });

      it('lowercase RU with mixed script: естьnull → ISNULL', () => {
        expect(canonicalize('естьnull')).toBe('ISNULL');
      });
    });

    describe('unknown function names', () => {
      it('returns unknown RU name uppercased', () => {
        expect(canonicalize('МОЯНЕИЗВЕСТНАЯФУНКЦИЯ')).toBe('МОЯНЕИЗВЕСТНАЯФУНКЦИЯ');
      });

      it('returns unknown EN name uppercased', () => {
        expect(canonicalize('myUnknownFunc')).toBe('MYUNKNOWNFUNC');
      });

      it('returns empty string for empty input', () => {
        expect(canonicalize('')).toBe('');
      });
    });
  });

  // ── localize ──────────────────────────────────────────────────────

  describe('localize', () => {
    describe('EN → RU for every mapping', () => {
      for (const [ru, en] of FULL_MAPPING) {
        it(`${en} (RU) → ${ru}`, () => {
          expect(localize(en, 'RU')).toBe(ru);
        });
      }
    });

    describe('EN → EN returns canonical unchanged', () => {
      for (const [, en] of FULL_MAPPING) {
        it(`${en} (EN) → ${en}`, () => {
          expect(localize(en, 'EN')).toBe(en);
        });
      }
    });

    it('returns canonical as-is for unknown name with lang=RU', () => {
      expect(localize('UNKNOWNFUNC', 'RU')).toBe('UNKNOWNFUNC');
    });

    it('returns canonical as-is for unknown name with lang=EN', () => {
      expect(localize('UNKNOWNFUNC', 'EN')).toBe('UNKNOWNFUNC');
    });
  });

  // ── isKnownFunction ──────────────────────────────────────────────

  describe('isKnownFunction', () => {
    it('recognizes RU names (uppercase)', () => {
      expect(isKnownFunction('ПОДСТРОКА')).toBe(true);
      expect(isKnownFunction('КОЛИЧЕСТВО')).toBe(true);
    });

    it('recognizes RU names (lowercase)', () => {
      expect(isKnownFunction('подстрока')).toBe(true);
      expect(isKnownFunction('среднее')).toBe(true);
    });

    it('recognizes EN names (uppercase)', () => {
      expect(isKnownFunction('SUBSTRING')).toBe(true);
      expect(isKnownFunction('AVG')).toBe(true);
    });

    it('recognizes EN names (lowercase)', () => {
      expect(isKnownFunction('substring')).toBe(true);
      expect(isKnownFunction('avg')).toBe(true);
    });

    it('recognizes EN names (mixed case)', () => {
      expect(isKnownFunction('SubString')).toBe(true);
    });

    it('returns false for unknown names', () => {
      expect(isKnownFunction('МОЯНЕИЗВЕСТНАЯФУНКЦИЯ')).toBe(false);
      expect(isKnownFunction('RANDOMFUNC')).toBe(false);
      expect(isKnownFunction('')).toBe(false);
    });

    describe('recognizes all mapped functions', () => {
      for (const [ru, en] of FULL_MAPPING) {
        it(`knows ${ru}`, () => {
          expect(isKnownFunction(ru)).toBe(true);
        });
        it(`knows ${en}`, () => {
          expect(isKnownFunction(en)).toBe(true);
        });
      }
    });
  });
});
