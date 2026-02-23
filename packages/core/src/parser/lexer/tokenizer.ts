// Main lexer for the 1C query language
import { Token, TokenType, TriviaItem } from './token-types.js';
import { lookupKeyword } from './keywords.js';

/**
 * Check if a character code is an ASCII digit (0-9).
 */
function isDigit(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0x30 && code <= 0x39; // '0'..'9'
}

/**
 * Check if a character is a valid identifier start (letter, underscore, Cyrillic).
 */
function isIdentStart(ch: string): boolean {
  if (ch === '_') return true;
  const code = ch.charCodeAt(0);
  // ASCII letters
  if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) return true;
  // Cyrillic: А-Я (0x410-0x42F), а-я (0x430-0x44F), Ё (0x401), ё (0x451)
  if ((code >= 0x410 && code <= 0x44F) || code === 0x401 || code === 0x451) return true;
  return false;
}

/**
 * Check if a character is a valid identifier continuation (letter, digit, underscore, Cyrillic).
 */
function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

/**
 * Check if a character is whitespace (space, tab) but NOT newline.
 */
function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r';
}

/**
 * Tokenize a 1C query language input string into an array of tokens.
 * Whitespace, newlines, and comments are collected as trivia and attached
 * to the leading trivia of the next significant token.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let col = 1;
  let pendingTrivia: TriviaItem[] = [];

  function peek(): string {
    return pos < input.length ? input[pos] : '';
  }

  function peekAt(offset: number): string {
    const idx = pos + offset;
    return idx < input.length ? input[idx] : '';
  }

  function advance(): string {
    const ch = input[pos];
    pos++;
    if (ch === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  }

  function makeToken(type: TokenType, text: string, startPos: number, startLine: number, startCol: number): Token {
    const token: Token = {
      type,
      text,
      range: {
        start: startPos,
        end: pos,
        line: startLine,
        col: startCol,
      },
    };
    if (pendingTrivia.length > 0) {
      token.leadingTrivia = pendingTrivia;
      pendingTrivia = [];
    }
    return token;
  }

  function scanWhitespace(): void {
    const startPos = pos;
    while (pos < input.length && isWhitespace(peek())) {
      advance();
    }
    pendingTrivia.push({
      kind: 'whitespace',
      text: input.slice(startPos, pos),
      range: { start: startPos, end: pos },
    });
  }

  function scanNewline(): void {
    const startPos = pos;
    advance(); // consume '\n'
    pendingTrivia.push({
      kind: 'newline',
      text: input.slice(startPos, pos),
      range: { start: startPos, end: pos },
    });
  }

  function scanComment(): void {
    const startPos = pos;
    // Skip '//'
    advance();
    advance();
    while (pos < input.length && peek() !== '\n') {
      advance();
    }
    pendingTrivia.push({
      kind: 'comment',
      text: input.slice(startPos, pos),
      range: { start: startPos, end: pos },
    });
  }

  function scanString(quote: string): Token {
    const startPos = pos;
    const startLine = line;
    const startCol = col;
    advance(); // skip opening quote

    let value = quote;
    while (pos < input.length) {
      const ch = peek();
      if (ch === quote) {
        advance();
        // Check for escaped quote (doubled quote, e.g., '' or "")
        if (peek() === quote) {
          value += quote + quote;
          advance();
        } else {
          value = input.slice(startPos, pos);
          return makeToken(TokenType.STRING_LITERAL, value, startPos, startLine, startCol);
        }
      } else {
        value += ch;
        advance();
      }
    }
    // Unterminated string — return what we have as an error
    return makeToken(TokenType.ERROR, input.slice(startPos, pos), startPos, startLine, startCol);
  }

  function scanNumber(): Token {
    const startPos = pos;
    const startLine = line;
    const startCol = col;

    while (pos < input.length && isDigit(peek())) {
      advance();
    }
    // Check for decimal point
    if (peek() === '.' && isDigit(peekAt(1))) {
      advance(); // consume '.'
      while (pos < input.length && isDigit(peek())) {
        advance();
      }
    }

    return makeToken(TokenType.NUMBER_LITERAL, input.slice(startPos, pos), startPos, startLine, startCol);
  }

  function scanIdentOrKeyword(): Token {
    const startPos = pos;
    const startLine = line;
    const startCol = col;

    while (pos < input.length && isIdentPart(peek())) {
      advance();
    }

    const text = input.slice(startPos, pos);
    const upper = text.toUpperCase();

    // Check for date literals: ДАТАВРЕМЯ(...) or DATETIME(...)
    if ((upper === 'ДАТАВРЕМЯ' || upper === 'DATETIME') && peek() === '(') {
      // Consume entire date literal including parenthesized content
      advance(); // skip '('
      let depth = 1;
      while (pos < input.length && depth > 0) {
        const ch = peek();
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        advance();
      }
      return makeToken(TokenType.DATE_LITERAL, input.slice(startPos, pos), startPos, startLine, startCol);
    }

    // Check if the word is a keyword
    const kwType = lookupKeyword(text);
    if (kwType !== undefined) {
      return makeToken(kwType, text, startPos, startLine, startCol);
    }

    return makeToken(TokenType.IDENTIFIER, text, startPos, startLine, startCol);
  }

  function scanParameter(): Token {
    const startPos = pos;
    const startLine = line;
    const startCol = col;
    advance(); // skip '&'

    while (pos < input.length && isIdentPart(peek())) {
      advance();
    }

    return makeToken(TokenType.PARAMETER, input.slice(startPos, pos), startPos, startLine, startCol);
  }

  // Main scanning loop
  while (pos < input.length) {
    const ch = peek();

    // Newline
    if (ch === '\n') {
      scanNewline();
      continue;
    }

    // Whitespace (non-newline)
    if (isWhitespace(ch)) {
      scanWhitespace();
      continue;
    }

    // Comments: // to end of line
    if (ch === '/' && peekAt(1) === '/') {
      scanComment();
      continue;
    }

    // String literals
    if (ch === "'" || ch === '"') {
      tokens.push(scanString(ch));
      continue;
    }

    // Number literals
    if (isDigit(ch)) {
      tokens.push(scanNumber());
      continue;
    }

    // Identifiers and keywords (including Cyrillic)
    if (isIdentStart(ch)) {
      tokens.push(scanIdentOrKeyword());
      continue;
    }

    // Parameters (&Name)
    if (ch === '&') {
      tokens.push(scanParameter());
      continue;
    }

    // Operators and punctuation
    const startPos = pos;
    const startLine = line;
    const startCol = col;

    switch (ch) {
      case '.':
        advance();
        tokens.push(makeToken(TokenType.DOT, '.', startPos, startLine, startCol));
        break;
      case ',':
        advance();
        tokens.push(makeToken(TokenType.COMMA, ',', startPos, startLine, startCol));
        break;
      case ';':
        advance();
        tokens.push(makeToken(TokenType.SEMICOLON, ';', startPos, startLine, startCol));
        break;
      case '(':
        advance();
        tokens.push(makeToken(TokenType.LPAREN, '(', startPos, startLine, startCol));
        break;
      case ')':
        advance();
        tokens.push(makeToken(TokenType.RPAREN, ')', startPos, startLine, startCol));
        break;
      case '*':
        advance();
        tokens.push(makeToken(TokenType.STAR, '*', startPos, startLine, startCol));
        break;
      case '+':
        advance();
        tokens.push(makeToken(TokenType.PLUS, '+', startPos, startLine, startCol));
        break;
      case '-':
        advance();
        tokens.push(makeToken(TokenType.MINUS, '-', startPos, startLine, startCol));
        break;
      case '/':
        // Not a comment (already handled above), so it's division
        advance();
        tokens.push(makeToken(TokenType.SLASH, '/', startPos, startLine, startCol));
        break;
      case '=':
        advance();
        tokens.push(makeToken(TokenType.EQ, '=', startPos, startLine, startCol));
        break;
      case '<':
        advance();
        if (peek() === '>') {
          advance();
          tokens.push(makeToken(TokenType.NEQ, '<>', startPos, startLine, startCol));
        } else if (peek() === '=') {
          advance();
          tokens.push(makeToken(TokenType.LTE, '<=', startPos, startLine, startCol));
        } else {
          tokens.push(makeToken(TokenType.LT, '<', startPos, startLine, startCol));
        }
        break;
      case '>':
        advance();
        if (peek() === '=') {
          advance();
          tokens.push(makeToken(TokenType.GTE, '>=', startPos, startLine, startCol));
        } else {
          tokens.push(makeToken(TokenType.GT, '>', startPos, startLine, startCol));
        }
        break;
      default:
        // Unknown character — emit an error token
        advance();
        tokens.push(makeToken(TokenType.ERROR, ch, startPos, startLine, startCol));
        break;
    }
  }

  // Emit EOF token with any remaining trivia
  const eofToken: Token = {
    type: TokenType.EOF,
    text: '',
    range: {
      start: pos,
      end: pos,
      line,
      col,
    },
  };
  if (pendingTrivia.length > 0) {
    eofToken.leadingTrivia = pendingTrivia;
  }
  tokens.push(eofToken);

  return tokens;
}
