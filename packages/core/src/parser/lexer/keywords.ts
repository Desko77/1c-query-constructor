// Full RU↔EN keyword mapping table for 1C query language
import { TokenType } from './token-types.js';

/**
 * Map of uppercase keyword text → TokenType.
 * Includes both Russian and English variants.
 */
const KEYWORD_MAP: ReadonlyMap<string, TokenType> = new Map<string, TokenType>([
  // ВЫБРАТЬ / SELECT
  ['ВЫБРАТЬ', TokenType.KW_SELECT],
  ['SELECT', TokenType.KW_SELECT],

  // РАЗЛИЧНЫЕ / DISTINCT
  ['РАЗЛИЧНЫЕ', TokenType.KW_DISTINCT],
  ['DISTINCT', TokenType.KW_DISTINCT],

  // ПЕРВЫЕ / TOP
  ['ПЕРВЫЕ', TokenType.KW_TOP],
  ['TOP', TokenType.KW_TOP],

  // ИЗ / FROM
  ['ИЗ', TokenType.KW_FROM],
  ['FROM', TokenType.KW_FROM],

  // КАК / AS
  ['КАК', TokenType.KW_AS],
  ['AS', TokenType.KW_AS],

  // ГДЕ / WHERE
  ['ГДЕ', TokenType.KW_WHERE],
  ['WHERE', TokenType.KW_WHERE],

  // И / AND
  ['И', TokenType.KW_AND],
  ['AND', TokenType.KW_AND],

  // ИЛИ / OR
  ['ИЛИ', TokenType.KW_OR],
  ['OR', TokenType.KW_OR],

  // НЕ / NOT
  ['НЕ', TokenType.KW_NOT],
  ['NOT', TokenType.KW_NOT],

  // В / IN
  ['В', TokenType.KW_IN],
  ['IN', TokenType.KW_IN],

  // МЕЖДУ / BETWEEN
  ['МЕЖДУ', TokenType.KW_BETWEEN],
  ['BETWEEN', TokenType.KW_BETWEEN],

  // ПОДОБНО / LIKE
  ['ПОДОБНО', TokenType.KW_LIKE],
  ['LIKE', TokenType.KW_LIKE],

  // ЕСТЬ / IS
  ['ЕСТЬ', TokenType.KW_IS],
  ['IS', TokenType.KW_IS],

  // NULL
  ['NULL', TokenType.KW_NULL],

  // ИСТИНА / TRUE
  ['ИСТИНА', TokenType.KW_TRUE],
  ['TRUE', TokenType.KW_TRUE],

  // ЛОЖЬ / FALSE
  ['ЛОЖЬ', TokenType.KW_FALSE],
  ['FALSE', TokenType.KW_FALSE],

  // СОЕДИНЕНИЕ / JOIN
  ['СОЕДИНЕНИЕ', TokenType.KW_JOIN],
  ['JOIN', TokenType.KW_JOIN],

  // ВНУТРЕННЕЕ / INNER
  ['ВНУТРЕННЕЕ', TokenType.KW_INNER],
  ['INNER', TokenType.KW_INNER],

  // ЛЕВОЕ / LEFT
  ['ЛЕВОЕ', TokenType.KW_LEFT],
  ['LEFT', TokenType.KW_LEFT],

  // ПРАВОЕ / RIGHT
  ['ПРАВОЕ', TokenType.KW_RIGHT],
  ['RIGHT', TokenType.KW_RIGHT],

  // ПОЛНОЕ / FULL
  ['ПОЛНОЕ', TokenType.KW_FULL],
  ['FULL', TokenType.KW_FULL],

  // ВНЕШНЕЕ / OUTER
  ['ВНЕШНЕЕ', TokenType.KW_OUTER],
  ['OUTER', TokenType.KW_OUTER],

  // ПО / ON
  ['ПО', TokenType.KW_ON],
  ['ON', TokenType.KW_ON],

  // СГРУППИРОВАТЬ / GROUP (also ГРУППИРОВАТЬ)
  ['СГРУППИРОВАТЬ', TokenType.KW_GROUP],
  ['ГРУППИРОВАТЬ', TokenType.KW_GROUP],
  ['GROUP', TokenType.KW_GROUP],

  // BY
  ['BY', TokenType.KW_BY],

  // ИМЕЮЩИЕ / HAVING
  ['ИМЕЮЩИЕ', TokenType.KW_HAVING],
  ['HAVING', TokenType.KW_HAVING],

  // УПОРЯДОЧИТЬ / ORDER (also ПОРЯДОК)
  ['УПОРЯДОЧИТЬ', TokenType.KW_ORDER],
  ['ПОРЯДОК', TokenType.KW_ORDER],
  ['ORDER', TokenType.KW_ORDER],

  // ВОЗР / ASC
  ['ВОЗР', TokenType.KW_ASC],
  ['ASC', TokenType.KW_ASC],

  // УБЫВ / DESC
  ['УБЫВ', TokenType.KW_DESC],
  ['DESC', TokenType.KW_DESC],

  // ОБЪЕДИНИТЬ / UNION
  ['ОБЪЕДИНИТЬ', TokenType.KW_UNION],
  ['UNION', TokenType.KW_UNION],

  // ВСЕ / ALL
  ['ВСЕ', TokenType.KW_ALL],
  ['ALL', TokenType.KW_ALL],

  // ПОМЕСТИТЬ / INTO
  ['ПОМЕСТИТЬ', TokenType.KW_INTO],
  ['INTO', TokenType.KW_INTO],

  // УНИЧТОЖИТЬ / DESTROY / DROP
  ['УНИЧТОЖИТЬ', TokenType.KW_DESTROY],
  ['DESTROY', TokenType.KW_DESTROY],
  ['DROP', TokenType.KW_DESTROY],

  // ВЫБОР / CASE
  ['ВЫБОР', TokenType.KW_CASE],
  ['CASE', TokenType.KW_CASE],

  // КОГДА / WHEN
  ['КОГДА', TokenType.KW_WHEN],
  ['WHEN', TokenType.KW_WHEN],

  // ТОГДА / THEN
  ['ТОГДА', TokenType.KW_THEN],
  ['THEN', TokenType.KW_THEN],

  // ИНАЧЕ / ELSE
  ['ИНАЧЕ', TokenType.KW_ELSE],
  ['ELSE', TokenType.KW_ELSE],

  // КОНЕЦ / END
  ['КОНЕЦ', TokenType.KW_END],
  ['END', TokenType.KW_END],

  // ВЫРАЗИТЬ / CAST
  ['ВЫРАЗИТЬ', TokenType.KW_CAST],
  ['CAST', TokenType.KW_CAST],

  // ССЫЛКА / REFS
  ['ССЫЛКА', TokenType.KW_REFS],
  ['REFS', TokenType.KW_REFS],

  // ИЕРАРХИИ / HIERARCHY
  ['ИЕРАРХИИ', TokenType.KW_HIERARCHY],
  ['HIERARCHY', TokenType.KW_HIERARCHY],

  // СУЩЕСТВУЕТ / EXISTS
  ['СУЩЕСТВУЕТ', TokenType.KW_EXISTS],
  ['EXISTS', TokenType.KW_EXISTS],

  // ДЛЯ / FOR
  ['ДЛЯ', TokenType.KW_FOR],
  ['FOR', TokenType.KW_FOR],

  // ИЗМЕНЕНИЯ / UPDATE
  ['ИЗМЕНЕНИЯ', TokenType.KW_UPDATE],
  ['UPDATE', TokenType.KW_UPDATE],

  // АВТОУПОРЯДОЧИВАНИЕ / AUTOORDER
  ['АВТОУПОРЯДОЧИВАНИЕ', TokenType.KW_AUTOORDER],
  ['AUTOORDER', TokenType.KW_AUTOORDER],

  // ИТОГИ / TOTALS
  ['ИТОГИ', TokenType.KW_TOTALS],
  ['TOTALS', TokenType.KW_TOTALS],

  // ОБЩИЕ / OVERALL
  ['ОБЩИЕ', TokenType.KW_OVERALL],
  ['OVERALL', TokenType.KW_OVERALL],
]);

/** Set of Russian keywords (uppercase) for language detection */
const RUSSIAN_KEYWORDS: ReadonlySet<string> = new Set([
  'ВЫБРАТЬ', 'РАЗЛИЧНЫЕ', 'ПЕРВЫЕ', 'ИЗ', 'КАК', 'ГДЕ',
  'И', 'ИЛИ', 'НЕ', 'В', 'МЕЖДУ', 'ПОДОБНО', 'ЕСТЬ',
  'ИСТИНА', 'ЛОЖЬ', 'СОЕДИНЕНИЕ', 'ВНУТРЕННЕЕ', 'ЛЕВОЕ',
  'ПРАВОЕ', 'ПОЛНОЕ', 'ВНЕШНЕЕ', 'ПО', 'СГРУППИРОВАТЬ',
  'ГРУППИРОВАТЬ', 'ИМЕЮЩИЕ', 'УПОРЯДОЧИТЬ', 'ПОРЯДОК',
  'ВОЗР', 'УБЫВ', 'ОБЪЕДИНИТЬ', 'ВСЕ', 'ПОМЕСТИТЬ',
  'УНИЧТОЖИТЬ', 'ВЫБОР', 'КОГДА', 'ТОГДА', 'ИНАЧЕ',
  'КОНЕЦ', 'ВЫРАЗИТЬ', 'ССЫЛКА', 'ИЕРАРХИИ', 'СУЩЕСТВУЕТ',
  'ДЛЯ', 'ИЗМЕНЕНИЯ', 'АВТОУПОРЯДОЧИВАНИЕ', 'ИТОГИ', 'ОБЩИЕ',
]);

/** Set of English keywords (uppercase) for language detection */
const ENGLISH_KEYWORDS: ReadonlySet<string> = new Set([
  'SELECT', 'DISTINCT', 'TOP', 'FROM', 'AS', 'WHERE',
  'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS',
  'NULL', 'TRUE', 'FALSE', 'JOIN', 'INNER', 'LEFT',
  'RIGHT', 'FULL', 'OUTER', 'ON', 'GROUP', 'BY',
  'HAVING', 'ORDER', 'ASC', 'DESC', 'UNION', 'ALL',
  'INTO', 'DESTROY', 'DROP', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'CAST', 'REFS', 'HIERARCHY', 'EXISTS',
  'FOR', 'UPDATE', 'AUTOORDER', 'TOTALS', 'OVERALL',
]);

/**
 * Look up a keyword by text (case-insensitive).
 * Returns the corresponding TokenType if found, otherwise undefined.
 */
export function lookupKeyword(text: string): TokenType | undefined {
  return KEYWORD_MAP.get(text.toUpperCase());
}

/**
 * Detect the language of the query by finding the first recognized keyword.
 * Scans through whitespace-separated words, returning 'RU' or 'EN' based
 * on the first keyword match. Defaults to 'RU' if no keywords are found.
 */
export function detectLanguage(text: string): 'RU' | 'EN' {
  // Split on whitespace and punctuation to find word tokens
  const words = text.match(/[a-zA-Zа-яА-ЯёЁ_][a-zA-Zа-яА-ЯёЁ0-9_]*/g);
  if (!words) return 'RU';

  for (const word of words) {
    const upper = word.toUpperCase();
    if (RUSSIAN_KEYWORDS.has(upper)) return 'RU';
    if (ENGLISH_KEYWORDS.has(upper)) return 'EN';
  }

  return 'RU';
}
