// Error recovery utilities for tolerant parsing of 1C query language
import { Token, TokenType } from '../lexer/token-types.js';
import type { Diagnostic, SourceRange } from '../../validator/diagnostic.js';

/**
 * Set of keyword token types that can also serve as identifiers in
 * certain contexts (column names, field names, alias names, etc.).
 * In 1C query language, most keywords are contextual — e.g. "Ссылка"
 * is both KW_REFS and a common field name.
 */
const KEYWORD_AS_IDENT = new Set<TokenType>([
  TokenType.KW_REFS,       // Ссылка / REFS — very common field name
  TokenType.KW_NULL,
  TokenType.KW_TRUE,
  TokenType.KW_FALSE,
  TokenType.KW_ASC,
  TokenType.KW_DESC,
  TokenType.KW_ALL,
  TokenType.KW_HIERARCHY,
  TokenType.KW_EXISTS,
  TokenType.KW_OUTER,
  TokenType.KW_INNER,
  TokenType.KW_LEFT,
  TokenType.KW_RIGHT,
  TokenType.KW_FULL,
  TokenType.KW_JOIN,
  TokenType.KW_ON,
  TokenType.KW_BY,
  TokenType.KW_DISTINCT,
  TokenType.KW_TOP,
  TokenType.KW_INTO,
  TokenType.KW_DESTROY,
  TokenType.KW_UPDATE,
  TokenType.KW_AUTOORDER,
  TokenType.KW_TOTALS,
  TokenType.KW_OVERALL,
  TokenType.KW_FOR,
  TokenType.KW_CAST,
  TokenType.KW_CASE,
  TokenType.KW_WHEN,
  TokenType.KW_THEN,
  TokenType.KW_ELSE,
  TokenType.KW_END,
  TokenType.KW_IS,
  TokenType.KW_NOT,
  TokenType.KW_AND,
  TokenType.KW_OR,
  TokenType.KW_IN,
  TokenType.KW_BETWEEN,
  TokenType.KW_LIKE,
  TokenType.KW_SELECT,
  TokenType.KW_FROM,
  TokenType.KW_WHERE,
  TokenType.KW_GROUP,
  TokenType.KW_HAVING,
  TokenType.KW_ORDER,
  TokenType.KW_UNION,
  TokenType.KW_AS,
]);

/**
 * Check if a token type can be used as an identifier.
 * This includes actual IDENTIFIER tokens plus keywords that
 * are contextually used as names/fields in 1C query language.
 */
export function isIdentLike(type: TokenType): boolean {
  return type === TokenType.IDENTIFIER || KEYWORD_AS_IDENT.has(type);
}

/**
 * TokenStream provides look-ahead, expectation, and error-recovery primitives
 * on top of a flat Token[] produced by the lexer.
 */
export class TokenStream {
  private tokens: Token[];
  private pos: number = 0;
  readonly diagnostics: Diagnostic[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  /** Current token (never goes past EOF). */
  peek(): Token {
    return this.pos < this.tokens.length
      ? this.tokens[this.pos]
      : this.tokens[this.tokens.length - 1]; // EOF
  }

  /** Look ahead by `offset` (0 = current). */
  lookAhead(offset: number): Token {
    const idx = this.pos + offset;
    return idx < this.tokens.length
      ? this.tokens[idx]
      : this.tokens[this.tokens.length - 1];
  }

  /** Consume the current token and return it. */
  advance(): Token {
    const tok = this.peek();
    if (tok.type !== TokenType.EOF) {
      this.pos++;
    }
    return tok;
  }

  /** True when we have reached EOF. */
  isEOF(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  /** Current position index (useful for backtracking). */
  getPos(): number {
    return this.pos;
  }

  /** Restore position (for backtracking). */
  setPos(pos: number): void {
    this.pos = pos;
  }

  // ── Checking ────────────────────────────────────────────────────────────

  /** Does current token match any of the given types? */
  check(...types: TokenType[]): boolean {
    return types.includes(this.peek().type);
  }

  /** Is the current token an identifier or a keyword usable as identifier? */
  checkIdentLike(): boolean {
    return isIdentLike(this.peek().type);
  }

  /** Does the current token match AND if so, consume it? */
  match(...types: TokenType[]): Token | undefined {
    if (types.includes(this.peek().type)) {
      return this.advance();
    }
    return undefined;
  }

  /**
   * If the current token is identifier-like, consume and return it.
   * Otherwise return undefined (does NOT record a diagnostic).
   */
  matchIdentLike(): Token | undefined {
    if (isIdentLike(this.peek().type)) {
      return this.advance();
    }
    return undefined;
  }

  // ── Expectation with error recovery ─────────────────────────────────────

  /**
   * Expect the current token to be of the given type.
   * If it matches, consume and return it.
   * If it doesn't, record a diagnostic and return undefined (don't consume).
   */
  expect(type: TokenType, context?: string): Token | undefined {
    if (this.peek().type === type) {
      return this.advance();
    }
    this.error(
      `Expected ${type}${context ? ' ' + context : ''}, got ${this.peek().type} ("${this.peek().text}")`,
      this.peek(),
    );
    return undefined;
  }

  /**
   * Expect an identifier-like token (IDENTIFIER or keyword usable as ident).
   * If it matches, consume and return it.
   * Otherwise, record a diagnostic and return undefined.
   */
  expectIdentLike(context?: string): Token | undefined {
    if (isIdentLike(this.peek().type)) {
      return this.advance();
    }
    this.error(
      `Expected identifier${context ? ' ' + context : ''}, got ${this.peek().type} ("${this.peek().text}")`,
      this.peek(),
    );
    return undefined;
  }

  // ── Skip / synchronisation ──────────────────────────────────────────────

  /**
   * Skip tokens until we hit one of the given synchronisation types (or EOF).
   * Does NOT consume the synchronisation token itself.
   */
  skipTo(...syncTypes: TokenType[]): void {
    while (!this.isEOF() && !syncTypes.includes(this.peek().type)) {
      this.advance();
    }
  }

  /**
   * Skip tokens until we hit one of the clause-level keywords that usually
   * start a new section (FROM, WHERE, GROUP, ORDER, HAVING, UNION, etc.)
   * or a statement boundary (SEMICOLON, EOF).
   */
  skipToNextClause(): void {
    this.skipTo(
      TokenType.KW_SELECT,
      TokenType.KW_FROM,
      TokenType.KW_WHERE,
      TokenType.KW_GROUP,
      TokenType.KW_HAVING,
      TokenType.KW_ORDER,
      TokenType.KW_UNION,
      TokenType.KW_INTO,
      TokenType.KW_FOR,
      TokenType.KW_TOTALS,
      TokenType.SEMICOLON,
      TokenType.RPAREN,
      TokenType.EOF,
    );
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────

  error(message: string, token?: Token): void {
    const range = this.rangeOf(token);
    this.diagnostics.push({
      severity: 'error',
      code: 'P001',
      message,
      range,
    });
  }

  warn(message: string, token?: Token): void {
    const range = this.rangeOf(token);
    this.diagnostics.push({
      severity: 'warn',
      code: 'P002',
      message,
      range,
    });
  }

  private rangeOf(token?: Token): SourceRange | undefined {
    const t = token ?? this.peek();
    return {
      start: t.range.start,
      end: t.range.end,
      line: t.range.line,
      col: t.range.col,
    };
  }
}
