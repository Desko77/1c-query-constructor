/**
 * Data-driven registry for bilingual 1C query function names (RU ↔ EN).
 *
 * All canonical forms are stored in EN UPPER CASE.
 * The registry supports bidirectional lookup and case-insensitive matching.
 */

/** Mapping table: RU name → EN canonical (both stored UPPER). */
const FUNCTION_MAP: ReadonlyArray<[ru: string, en: string]> = [
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

/**
 * Lookup: UPPER name (RU or EN) → EN canonical.
 * Populated from FUNCTION_MAP at module load time.
 */
const toCanonical = new Map<string, string>();

/**
 * Lookup: EN canonical → RU name (both UPPER).
 * Populated from FUNCTION_MAP at module load time.
 */
const toRussian = new Map<string, string>();

// Build lookup maps from the declarative table.
for (const [ru, en] of FUNCTION_MAP) {
  toCanonical.set(ru, en);
  toCanonical.set(en, en);
  toRussian.set(en, ru);
}

/**
 * Convert any known function name (RU or EN, any case) to EN UPPER canonical form.
 *
 * Unknown names are returned as-is, uppercased.
 *
 * @example
 * canonicalize('подстрока')  // => 'SUBSTRING'
 * canonicalize('Substring')  // => 'SUBSTRING'
 * canonicalize('ПОДСТРОКА')  // => 'SUBSTRING'
 * canonicalize('unknown')    // => 'UNKNOWN'
 */
export function canonicalize(name: string): string {
  const upper = name.toUpperCase();
  return toCanonical.get(upper) ?? upper;
}

/**
 * Convert an EN UPPER canonical function name to the requested language.
 *
 * If the canonical name is not found in the registry, it is returned as-is.
 *
 * @example
 * localize('SUBSTRING', 'RU') // => 'ПОДСТРОКА'
 * localize('SUBSTRING', 'EN') // => 'SUBSTRING'
 */
export function localize(canonical: string, lang: 'RU' | 'EN'): string {
  if (lang === 'EN') {
    return canonical;
  }
  return toRussian.get(canonical) ?? canonical;
}

/**
 * Check whether a name (in any language or case) is a known 1C query function.
 *
 * @example
 * isKnownFunction('подстрока')           // => true
 * isKnownFunction('SUBSTRING')            // => true
 * isKnownFunction('МОЯНЕИЗВЕСТНАЯФУНКЦИЯ') // => false
 */
export function isKnownFunction(name: string): boolean {
  return toCanonical.has(name.toUpperCase());
}
