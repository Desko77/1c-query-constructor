// Token types for the 1C query language lexer

export enum TokenType {
  // Keywords (represented by their canonical form)
  KW_SELECT = 'KW_SELECT',
  KW_DISTINCT = 'KW_DISTINCT',
  KW_TOP = 'KW_TOP',
  KW_FROM = 'KW_FROM',
  KW_AS = 'KW_AS',
  KW_WHERE = 'KW_WHERE',
  KW_AND = 'KW_AND',
  KW_OR = 'KW_OR',
  KW_NOT = 'KW_NOT',
  KW_IN = 'KW_IN',
  KW_BETWEEN = 'KW_BETWEEN',
  KW_LIKE = 'KW_LIKE',
  KW_IS = 'KW_IS',
  KW_NULL = 'KW_NULL',
  KW_TRUE = 'KW_TRUE',
  KW_FALSE = 'KW_FALSE',
  KW_JOIN = 'KW_JOIN',
  KW_INNER = 'KW_INNER',
  KW_LEFT = 'KW_LEFT',
  KW_RIGHT = 'KW_RIGHT',
  KW_FULL = 'KW_FULL',
  KW_OUTER = 'KW_OUTER',
  KW_ON = 'KW_ON',
  KW_GROUP = 'KW_GROUP',
  KW_BY = 'KW_BY',
  KW_HAVING = 'KW_HAVING',
  KW_ORDER = 'KW_ORDER',
  KW_ASC = 'KW_ASC',
  KW_DESC = 'KW_DESC',
  KW_UNION = 'KW_UNION',
  KW_ALL = 'KW_ALL',
  KW_INTO = 'KW_INTO',       // ПОМЕСТИТЬ
  KW_DESTROY = 'KW_DESTROY', // УНИЧТОЖИТЬ
  KW_CASE = 'KW_CASE',
  KW_WHEN = 'KW_WHEN',
  KW_THEN = 'KW_THEN',
  KW_ELSE = 'KW_ELSE',
  KW_END = 'KW_END',
  KW_CAST = 'KW_CAST',
  KW_REFS = 'KW_REFS',             // ССЫЛКА
  KW_HIERARCHY = 'KW_HIERARCHY',   // ИЕРАРХИИ
  KW_EXISTS = 'KW_EXISTS',
  KW_FOR = 'KW_FOR',
  KW_UPDATE = 'KW_UPDATE',
  KW_AUTOORDER = 'KW_AUTOORDER',
  KW_TOTALS = 'KW_TOTALS',
  KW_OVERALL = 'KW_OVERALL',       // ОБЩИЕ

  // Literals
  STRING_LITERAL = 'STRING_LITERAL',
  NUMBER_LITERAL = 'NUMBER_LITERAL',
  DATE_LITERAL = 'DATE_LITERAL',

  // Identifiers and parameters
  IDENTIFIER = 'IDENTIFIER',
  PARAMETER = 'PARAMETER', // &Name

  // Operators
  DOT = 'DOT',
  COMMA = 'COMMA',
  SEMICOLON = 'SEMICOLON',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  STAR = 'STAR',
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  SLASH = 'SLASH',
  EQ = 'EQ',
  NEQ = 'NEQ',
  GT = 'GT',
  GTE = 'GTE',
  LT = 'LT',
  LTE = 'LTE',

  // Special
  EOF = 'EOF',
  ERROR = 'ERROR',
}

export interface TriviaItem {
  kind: 'comment' | 'whitespace' | 'newline';
  text: string;
  range: { start: number; end: number };
}

export interface Token {
  type: TokenType;
  text: string;
  range: { start: number; end: number; line: number; col: number };
  leadingTrivia?: TriviaItem[];
  trailingTrivia?: TriviaItem[];
}
