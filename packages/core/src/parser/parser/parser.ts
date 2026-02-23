// =============================================================================
// Recursive-descent parser for the 1C query language
// Produces QueryModel from token stream, with tolerant error recovery.
// =============================================================================

import { tokenize } from '../lexer/tokenizer.js';
import { detectLanguage } from '../lexer/keywords.js';
import { TokenType } from '../lexer/token-types.js';
import { canonicalize } from '../../registry/function-names.js';
import type { Diagnostic } from '../../validator/diagnostic.js';
import { TokenStream, isIdentLike } from './error-recovery.js';

import type {
  QueryModel,
  QueryBody,
  QueryItem,
  QueryOptions,
  Source,
  Join,
  SelectItem,
  SelectExprItem,
  SelectWildcard,
  OrderByItem,
  Expr,
  BoolExpr,
  ColumnRef,
  ParamRef,
  Literal,
  FuncCall,
  CastExpr,
  CaseExpr,
  BinaryExpr,
  UnaryExpr,
  SubqueryExpr,
  CompareExpr,
  InExpr,
  BetweenExpr,
  RefCheckExpr,
  InHierarchyExpr,
  BoolGroup,
  NotExpr,
  ExistsExpr,
  DestroyTempTable,
  VirtualParam,
  TotalsSpec,
  TotalAggItem,
  AggFunc,
  TypeRef,
} from '../../model/query-model.js';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ParseResult {
  model: QueryModel;
  diagnostics: Diagnostic[];
}

/**
 * Parse a 1C query language string into a QueryModel.
 * Tolerant: never throws on invalid input, records diagnostics instead.
 */
export function parseQuery(input: string): ParseResult {
  return parse(input);
}

export function parse(input: string): ParseResult {
  const tokens = tokenize(input);
  const stream = new TokenStream(tokens);
  const lang = detectLanguage(input);

  const queries: QueryItem[] = [];

  while (!stream.isEOF()) {
    // skip stray semicolons between statements
    while (stream.match(TokenType.SEMICOLON)) { /* skip */ }
    if (stream.isEOF()) break;

    if (stream.check(TokenType.KW_DESTROY)) {
      queries.push(parseDestroyTempTable(stream));
    } else if (stream.check(TokenType.KW_SELECT)) {
      queries.push(parseQueryBodyTopLevel(stream));
    } else {
      stream.error(`Unexpected token "${stream.peek().text}", expected SELECT or DESTROY`);
      stream.advance();
    }
  }

  // If nothing was parsed, provide an empty query body
  if (queries.length === 0) {
    queries.push(emptyQueryBody());
  }

  const model: QueryModel = {
    version: '1.0',
    meta: { language: lang },
    queries,
  };

  return { model, diagnostics: stream.diagnostics };
}

// ─── Destroy Temp Table ───────────────────────────────────────────────────────

function parseDestroyTempTable(s: TokenStream): DestroyTempTable {
  s.expect(TokenType.KW_DESTROY);
  const nameTok = s.expectIdentLike('for temp table name');
  return {
    kind: 'destroyTempTable',
    name: nameTok?.text ?? '',
  };
}

// ─── QueryBody (top level — handles UNION chains) ────────────────────────────

function parseQueryBodyTopLevel(s: TokenStream): QueryBody {
  const body = parseQueryBody(s);

  // Handle UNION / UNION ALL chains
  while (s.check(TokenType.KW_UNION)) {
    if (!body.union) body.union = [];
    s.advance(); // consume UNION
    const all = !!s.match(TokenType.KW_ALL);
    if (!s.check(TokenType.KW_SELECT)) {
      s.error('Expected SELECT after UNION');
      break;
    }
    const unionBody = parseQueryBody(s);
    body.union.push({ body: unionBody, all });
  }

  return body;
}

// ─── QueryBody (single SELECT statement) ──────────────────────────────────────

function parseQueryBody(s: TokenStream): QueryBody {
  const body: QueryBody = {
    kind: 'queryBody',
    sources: [],
    select: [],
  };

  // SELECT
  if (!s.expect(TokenType.KW_SELECT, 'to start query')) {
    s.skipToNextClause();
    return body;
  }

  // Options: DISTINCT, TOP N
  const options = parseQueryOptions(s);
  if (options) body.options = options;

  // Select list
  body.select = parseSelectList(s);

  // INTO temp table (ПОМЕСТИТЬ)
  if (s.check(TokenType.KW_INTO)) {
    s.advance();
    const nameTok = s.expectIdentLike('for temp table name');
    body.intoTempTable = { name: nameTok?.text ?? '' };
  }

  // FROM clause
  if (s.check(TokenType.KW_FROM)) {
    s.advance();
    body.sources = parseSourceList(s);
  }

  // JOIN clauses
  const joins = parseJoins(s, body.sources);
  if (joins.length > 0) body.joins = joins;

  // WHERE clause
  if (s.check(TokenType.KW_WHERE)) {
    s.advance();
    body.where = parseBoolExpr(s);
  }

  // GROUP BY (Russian: СГРУППИРОВАТЬ ПО — ПО maps to KW_ON)
  if (s.check(TokenType.KW_GROUP)) {
    s.advance();
    if (!s.match(TokenType.KW_BY)) s.match(TokenType.KW_ON);
    body.groupBy = parseExprList(s);
  }

  // HAVING
  if (s.check(TokenType.KW_HAVING)) {
    s.advance();
    body.having = parseBoolExpr(s);
  }

  // ORDER BY (Russian: УПОРЯДОЧИТЬ ПО — ПО maps to KW_ON)
  if (s.check(TokenType.KW_ORDER)) {
    s.advance();
    if (!s.match(TokenType.KW_BY)) s.match(TokenType.KW_ON);
    body.orderBy = parseOrderByList(s);
  }

  // TOTALS
  if (s.check(TokenType.KW_TOTALS)) {
    body.totals = parseTotals(s);
  }

  // AUTOORDER
  if (s.check(TokenType.KW_AUTOORDER)) {
    s.advance();
    if (!body.options) body.options = {};
    body.options.autoOrder = true;
  }

  // FOR UPDATE
  if (s.check(TokenType.KW_FOR)) {
    s.advance();
    s.expect(TokenType.KW_UPDATE, 'after FOR');
    if (!body.options) body.options = {};
    body.options.forUpdate = { mode: 'all' };
  }

  return body;
}

// ─── Query Options ────────────────────────────────────────────────────────────

function parseQueryOptions(s: TokenStream): QueryOptions | undefined {
  let opts: QueryOptions | undefined;

  if (s.check(TokenType.KW_DISTINCT)) {
    s.advance();
    if (!opts) opts = {};
    opts.distinct = true;
  }

  if (s.check(TokenType.KW_TOP)) {
    s.advance();
    const numTok = s.expect(TokenType.NUMBER_LITERAL, 'after TOP');
    if (!opts) opts = {};
    opts.top = numTok ? parseInt(numTok.text, 10) : 0;
  }

  return opts;
}

// ─── SELECT list ──────────────────────────────────────────────────────────────

function parseSelectList(s: TokenStream): SelectItem[] {
  const items: SelectItem[] = [];

  // Handle empty select (error recovery)
  if (isClauseStart(s) || s.isEOF()) {
    s.error('Empty SELECT list');
    return items;
  }

  items.push(parseSelectItem(s));
  while (s.match(TokenType.COMMA)) {
    items.push(parseSelectItem(s));
  }
  return items;
}

function parseSelectItem(s: TokenStream): SelectItem {
  // Wildcard: *
  if (s.check(TokenType.STAR)) {
    s.advance();
    return { kind: 'wildcard' } as SelectWildcard;
  }

  // Alias.* wildcard — first token is identifier-like, then DOT, then STAR
  if (
    s.checkIdentLike() &&
    s.lookAhead(1).type === TokenType.DOT &&
    s.lookAhead(2).type === TokenType.STAR
  ) {
    const alias = s.advance().text;
    s.advance(); // dot
    s.advance(); // star
    return { kind: 'wildcard', sourceAlias: alias } as SelectWildcard;
  }

  // Regular expression with optional alias
  const expr = parseExpr(s);
  let alias: string | undefined;
  if (s.match(TokenType.KW_AS)) {
    const aliasTok = s.expectIdentLike('for column alias');
    alias = aliasTok?.text;
  }

  const item: SelectExprItem = { kind: 'selectExpr', expr };
  if (alias) item.alias = alias;
  return item;
}

// ─── FROM / Source list ───────────────────────────────────────────────────────

function parseSourceList(s: TokenStream): Source[] {
  const sources: Source[] = [];
  sources.push(parseSource(s));
  while (s.match(TokenType.COMMA)) {
    sources.push(parseSource(s));
  }
  return sources;
}

function parseSource(s: TokenStream): Source {
  // Subquery source: (SELECT ...)
  if (s.check(TokenType.LPAREN)) {
    return parseSubquerySource(s);
  }

  // Object or virtual table: IdentLike (.IdentLike)* optionally followed by (params)
  const nameParts: string[] = [];

  if (!s.checkIdentLike()) {
    s.error('Expected source name (identifier)');
    return { alias: '', kind: 'object', object: '' };
  }

  nameParts.push(s.advance().text);
  while (s.check(TokenType.DOT) && isIdentLike(s.lookAhead(1).type)) {
    s.advance(); // dot
    nameParts.push(s.advance().text);
  }

  const fullName = nameParts.join('.');

  // Check for virtual table params: (params)
  let virtualParams: VirtualParam[] | undefined;
  if (s.check(TokenType.LPAREN)) {
    virtualParams = parseVirtualTableParams(s);
  }

  // Alias: КАК/AS IdentLike
  let alias = nameParts[nameParts.length - 1]; // default alias = last part
  if (s.match(TokenType.KW_AS)) {
    const aliasTok = s.expectIdentLike('for source alias');
    if (aliasTok) alias = aliasTok.text;
  }

  // Determine kind
  if (virtualParams) {
    return { alias, kind: 'virtual', object: fullName, virtualParams };
  }

  // Single-part name → tempTable; multi-part → object
  if (nameParts.length === 1) {
    return { alias, kind: 'tempTable', tempTableName: fullName };
  }

  return { alias, kind: 'object', object: fullName };
}

function parseSubquerySource(s: TokenStream): Source {
  s.expect(TokenType.LPAREN);
  const subquery = parseQueryBodyTopLevel(s);
  s.expect(TokenType.RPAREN, 'to close subquery source');

  let alias = '';
  if (s.match(TokenType.KW_AS)) {
    const aliasTok = s.expectIdentLike('for subquery alias');
    if (aliasTok) alias = aliasTok.text;
  }

  return { alias, kind: 'subquery', subquery };
}

function parseVirtualTableParams(s: TokenStream): VirtualParam[] {
  const params: VirtualParam[] = [];
  s.expect(TokenType.LPAREN);

  let idx = 0;
  if (!s.check(TokenType.RPAREN)) {
    const value = parseVirtualParamValue(s);
    params.push({ name: String(idx++), value });
    while (s.match(TokenType.COMMA)) {
      const v = parseVirtualParamValue(s);
      params.push({ name: String(idx++), value: v });
    }
  }

  s.expect(TokenType.RPAREN, 'to close virtual table parameters');
  return params;
}

function parseVirtualParamValue(s: TokenStream): Expr {
  // Virtual table params can be empty (just commas)
  if (s.check(TokenType.COMMA) || s.check(TokenType.RPAREN)) {
    return { kind: 'literal', litType: 'null', value: null } as Literal;
  }
  return parseExpr(s);
}

// ─── JOIN ─────────────────────────────────────────────────────────────────────

function parseJoins(s: TokenStream, sources: Source[]): Join[] {
  const joins: Join[] = [];

  while (isJoinStart(s)) {
    joins.push(parseJoin(s, sources));
  }

  return joins;
}

function isJoinStart(s: TokenStream): boolean {
  const t = s.peek().type;
  return (
    t === TokenType.KW_INNER ||
    t === TokenType.KW_LEFT ||
    t === TokenType.KW_RIGHT ||
    t === TokenType.KW_FULL ||
    t === TokenType.KW_JOIN
  );
}

function parseJoin(s: TokenStream, sources: Source[]): Join {
  let joinType: 'inner' | 'left' | 'right' | 'full' = 'inner';

  if (s.match(TokenType.KW_INNER)) {
    joinType = 'inner';
  } else if (s.match(TokenType.KW_LEFT)) {
    joinType = 'left';
    s.match(TokenType.KW_OUTER);
  } else if (s.match(TokenType.KW_RIGHT)) {
    joinType = 'right';
    s.match(TokenType.KW_OUTER);
  } else if (s.match(TokenType.KW_FULL)) {
    joinType = 'full';
    s.match(TokenType.KW_OUTER);
  }

  s.expect(TokenType.KW_JOIN, 'in JOIN clause');

  // Parse right source
  const rightSource = parseSource(s);
  sources.push(rightSource);

  // ON condition
  s.expect(TokenType.KW_ON, 'in JOIN clause');
  const on = parseBoolExpr(s);

  // leftAlias: the previous source (or first source)
  const leftAlias = sources.length >= 2 ? sources[sources.length - 2].alias : '';

  return {
    leftAlias,
    rightAlias: rightSource.alias,
    type: joinType,
    on,
  };
}

// ─── ORDER BY ─────────────────────────────────────────────────────────────────

function parseOrderByList(s: TokenStream): OrderByItem[] {
  const items: OrderByItem[] = [];
  items.push(parseOrderByItem(s));
  while (s.match(TokenType.COMMA)) {
    items.push(parseOrderByItem(s));
  }
  return items;
}

function parseOrderByItem(s: TokenStream): OrderByItem {
  const expr = parseExpr(s);
  let direction: 'asc' | 'desc' | undefined;
  if (s.match(TokenType.KW_ASC)) {
    direction = 'asc';
  } else if (s.match(TokenType.KW_DESC)) {
    direction = 'desc';
  }
  const item: OrderByItem = { expr };
  if (direction) item.direction = direction;
  return item;
}

// ─── TOTALS ───────────────────────────────────────────────────────────────────

function parseTotals(s: TokenStream): TotalsSpec {
  s.expect(TokenType.KW_TOTALS);

  const spec: TotalsSpec = {};

  // Parse aggregate list before ПО/BY (if not immediately ПО/BY or ОБЩИЕ)
  if (!s.check(TokenType.KW_ON) && !s.check(TokenType.KW_OVERALL) && !s.check(TokenType.KW_BY)) {
    spec.totals = parseTotalAggList(s);
  }

  // ПО / BY (in Russian, TOTALS uses ПО which maps to KW_ON)
  if (s.match(TokenType.KW_ON) || s.match(TokenType.KW_BY)) {
    spec.by = parseExprList(s);
  }

  // ОБЩИЕ / OVERALL
  if (s.match(TokenType.KW_OVERALL)) {
    // overall flag
  }

  return spec;
}

function parseTotalAggList(s: TokenStream): TotalAggItem[] {
  const items: TotalAggItem[] = [];
  items.push(parseTotalAggItem(s));
  while (s.match(TokenType.COMMA)) {
    items.push(parseTotalAggItem(s));
  }
  return items;
}

function parseTotalAggItem(s: TokenStream): TotalAggItem {
  // Expect: AggFunc(expr) [AS alias]
  const funcName = resolveAggFunc(s.peek().text);
  if (funcName && s.checkIdentLike() && s.lookAhead(1).type === TokenType.LPAREN) {
    s.advance(); // consume function name
    s.expect(TokenType.LPAREN);
    const expr = parseExpr(s);
    s.expect(TokenType.RPAREN);
    let alias: string | undefined;
    if (s.match(TokenType.KW_AS)) {
      alias = s.expectIdentLike()?.text;
    }
    return { func: funcName, expr, alias };
  }

  // Fallback: just parse as expression
  const expr = parseExpr(s);
  return { func: 'SUM', expr };
}

function resolveAggFunc(text: string): AggFunc | undefined {
  const upper = text.toUpperCase();
  switch (upper) {
    case 'СУММА': case 'SUM': return 'SUM';
    case 'СРЕДНЕЕ': case 'AVG': return 'AVG';
    case 'МИНИМУМ': case 'MIN': return 'MIN';
    case 'МАКСИМУМ': case 'MAX': return 'MAX';
    case 'КОЛИЧЕСТВО': case 'COUNT': return 'COUNT';
    default: return undefined;
  }
}

// ─── Expression List ──────────────────────────────────────────────────────────

function parseExprList(s: TokenStream): Expr[] {
  const exprs: Expr[] = [];
  exprs.push(parseExpr(s));
  while (s.match(TokenType.COMMA)) {
    exprs.push(parseExpr(s));
  }
  return exprs;
}

// =============================================================================
// Expression Parsing (precedence climbing)
// =============================================================================

function parseExpr(s: TokenStream): Expr {
  return parseAdditive(s);
}

function parseAdditive(s: TokenStream): Expr {
  let left = parseMultiplicative(s);
  while (s.check(TokenType.PLUS) || s.check(TokenType.MINUS)) {
    const op = s.advance().type === TokenType.PLUS ? '+' : '-';
    const right = parseMultiplicative(s);
    left = { kind: 'bin', op, left, right } as BinaryExpr;
  }
  return left;
}

function parseMultiplicative(s: TokenStream): Expr {
  let left = parseUnary(s);
  while (s.check(TokenType.STAR) || s.check(TokenType.SLASH)) {
    const op = s.advance().type === TokenType.STAR ? '*' : '/';
    const right = parseUnary(s);
    left = { kind: 'bin', op, left, right } as BinaryExpr;
  }
  return left;
}

function parseUnary(s: TokenStream): Expr {
  if (s.check(TokenType.PLUS) || s.check(TokenType.MINUS)) {
    const op = s.advance().type === TokenType.PLUS ? '+' : '-';
    const expr = parseUnary(s);
    return { kind: 'un', op, expr } as UnaryExpr;
  }
  return parsePrimary(s);
}

function parsePrimary(s: TokenStream): Expr {
  const tok = s.peek();

  // Number literal
  if (tok.type === TokenType.NUMBER_LITERAL) {
    s.advance();
    const num = parseFloat(tok.text);
    return { kind: 'literal', litType: 'number', value: num } as Literal;
  }

  // String literal
  if (tok.type === TokenType.STRING_LITERAL) {
    s.advance();
    const raw = tok.text;
    const inner = raw.substring(1, raw.length - 1).replace(/''/g, "'").replace(/""/g, '"');
    return { kind: 'literal', litType: 'string', value: inner } as Literal;
  }

  // Date literal
  if (tok.type === TokenType.DATE_LITERAL) {
    s.advance();
    return { kind: 'literal', litType: 'date', value: tok.text } as Literal;
  }

  // Boolean literals
  if (tok.type === TokenType.KW_TRUE) {
    s.advance();
    return { kind: 'literal', litType: 'bool', value: true } as Literal;
  }
  if (tok.type === TokenType.KW_FALSE) {
    s.advance();
    return { kind: 'literal', litType: 'bool', value: false } as Literal;
  }

  // NULL
  if (tok.type === TokenType.KW_NULL) {
    s.advance();
    return { kind: 'literal', litType: 'null', value: null } as Literal;
  }

  // Parameter: &Name
  if (tok.type === TokenType.PARAMETER) {
    s.advance();
    const name = tok.text.startsWith('&') ? tok.text.slice(1) : tok.text;
    return { kind: 'param', name } as ParamRef;
  }

  // Parenthesized expression or subquery
  if (tok.type === TokenType.LPAREN) {
    if (s.lookAhead(1).type === TokenType.KW_SELECT) {
      s.advance(); // consume (
      const subquery = parseQueryBodyTopLevel(s);
      s.expect(TokenType.RPAREN, 'to close subquery');
      return { kind: 'subquery', subquery } as SubqueryExpr;
    }
    s.advance(); // consume (
    const expr = parseExpr(s);
    s.expect(TokenType.RPAREN, 'to close parenthesized expression');
    return expr;
  }

  // CASE expression
  if (tok.type === TokenType.KW_CASE) {
    return parseCaseExpr(s);
  }

  // CAST expression (ВЫРАЗИТЬ)
  if (tok.type === TokenType.KW_CAST) {
    return parseCastExpr(s);
  }

  // EXISTS (as expression context)
  if (tok.type === TokenType.KW_EXISTS) {
    s.advance();
    s.expect(TokenType.LPAREN);
    const subquery = parseQueryBodyTopLevel(s);
    s.expect(TokenType.RPAREN, 'to close EXISTS subquery');
    return { kind: 'subquery', subquery } as SubqueryExpr;
  }

  // Identifier or keyword-as-identifier: could be column ref, function call, dotted name
  if (isIdentLike(tok.type)) {
    return parseIdentifierExpr(s);
  }

  // KW_DISTINCT — can appear inside COUNT(DISTINCT ...)
  if (tok.type === TokenType.KW_DISTINCT) {
    s.advance();
    return parseExpr(s);
  }

  // Error recovery: unexpected token
  s.error(`Unexpected token "${tok.text}" in expression`);
  s.advance();
  return { kind: 'literal', litType: 'null', value: null } as Literal;
}

// ─── Identifier-based expressions ─────────────────────────────────────────────

function parseIdentifierExpr(s: TokenStream): Expr {
  const tok = s.advance(); // consume identifier-like token
  const name = tok.text;

  // Check if this is a function call: Name(
  if (s.check(TokenType.LPAREN)) {
    return parseFunctionCall(s, name);
  }

  // Check for dotted column reference: Alias.Field or Alias.Field.SubField...
  if (s.check(TokenType.DOT)) {
    const parts = [name];
    while (s.check(TokenType.DOT) && isIdentLike(s.lookAhead(1).type)) {
      s.advance(); // dot
      parts.push(s.advance().text);
    }
    // If there's a function call after dots: Source.Method()
    if (s.check(TokenType.LPAREN)) {
      const fullName = parts.join('.');
      return parseFunctionCall(s, fullName);
    }
    // First part is sourceAlias, rest joined as name
    if (parts.length === 2) {
      return { kind: 'column', sourceAlias: parts[0], name: parts[1] } as ColumnRef;
    }
    const sourceAlias = parts[0];
    const fieldName = parts.slice(1).join('.');
    return { kind: 'column', sourceAlias, name: fieldName } as ColumnRef;
  }

  // Plain identifier — column without alias
  return { kind: 'column', name } as ColumnRef;
}

function parseFunctionCall(s: TokenStream, name: string): Expr {
  s.expect(TokenType.LPAREN);

  const canonName = canonicalize(name);
  const args: Expr[] = [];
  // Handle DISTINCT inside aggregate functions: COUNT(DISTINCT expr)
  if (s.check(TokenType.KW_DISTINCT)) {
    s.advance(); // consume DISTINCT modifier
  }

  if (!s.check(TokenType.RPAREN)) {
    args.push(parseExpr(s));
    while (s.match(TokenType.COMMA)) {
      args.push(parseExpr(s));
    }
  }
  s.expect(TokenType.RPAREN, 'to close function call');
  return { kind: 'func', name: canonName, args } as FuncCall;
}

// ─── CASE expression ─────────────────────────────────────────────────────────

function parseCaseExpr(s: TokenStream): CaseExpr {
  s.expect(TokenType.KW_CASE);

  const branches: { when: BoolExpr; then: Expr }[] = [];

  while (s.check(TokenType.KW_WHEN)) {
    s.advance(); // WHEN
    const when = parseBoolExpr(s);
    s.expect(TokenType.KW_THEN, 'in CASE expression');
    const then = parseExpr(s);
    branches.push({ when, then });
  }

  let elseExpr: Expr | undefined;
  if (s.match(TokenType.KW_ELSE)) {
    elseExpr = parseExpr(s);
  }

  s.expect(TokenType.KW_END, 'to close CASE expression');

  const result: CaseExpr = { kind: 'case', branches };
  if (elseExpr) result.elseExpr = elseExpr;
  return result;
}

// ─── CAST expression ─────────────────────────────────────────────────────────

function parseCastExpr(s: TokenStream): CastExpr {
  s.expect(TokenType.KW_CAST);
  s.expect(TokenType.LPAREN);
  const expr = parseExpr(s);
  s.expect(TokenType.KW_AS, 'in CAST expression');

  const toType = parseTypeRef(s);

  s.expect(TokenType.RPAREN, 'to close CAST expression');
  return { kind: 'cast', expr, toType };
}

function parseTypeRef(s: TokenStream): TypeRef {
  const nameTok = s.expectIdentLike('for type name');
  const typeName = nameTok?.text ?? 'unknown';

  // Check for precision/length in parentheses
  if (s.check(TokenType.LPAREN)) {
    s.advance(); // (
    while (!s.check(TokenType.RPAREN) && !s.isEOF()) {
      s.advance();
    }
    s.expect(TokenType.RPAREN);
  }

  // Map known type names
  const upper = typeName.toUpperCase();
  switch (upper) {
    case 'СТРОКА': case 'STRING': return { kind: 'primitive', name: 'string' };
    case 'ЧИСЛО': case 'NUMBER': return { kind: 'primitive', name: 'number' };
    case 'ДАТА': case 'DATE': return { kind: 'primitive', name: 'date' };
    case 'БУЛЕВО': case 'BOOLEAN': return { kind: 'primitive', name: 'bool' };
    default:
      if (s.check(TokenType.DOT)) {
        const parts = [typeName];
        while (s.check(TokenType.DOT) && isIdentLike(s.lookAhead(1).type)) {
          s.advance();
          parts.push(s.advance().text);
        }
        return { kind: 'ref', object: parts.join('.') };
      }
      return { kind: 'ref', object: typeName };
  }
}

// =============================================================================
// Boolean Expression Parsing
// =============================================================================

function parseBoolExpr(s: TokenStream): BoolExpr {
  return parseOr(s);
}

function parseOr(s: TokenStream): BoolExpr {
  const items: BoolExpr[] = [parseAnd(s)];
  while (s.check(TokenType.KW_OR)) {
    s.advance();
    items.push(parseAnd(s));
  }
  if (items.length === 1) return items[0];
  return { kind: 'boolGroup', op: 'or', items } as BoolGroup;
}

function parseAnd(s: TokenStream): BoolExpr {
  const items: BoolExpr[] = [parseNot(s)];
  while (s.check(TokenType.KW_AND)) {
    s.advance();
    items.push(parseNot(s));
  }
  if (items.length === 1) return items[0];
  return { kind: 'boolGroup', op: 'and', items } as BoolGroup;
}

function parseNot(s: TokenStream): BoolExpr {
  if (s.match(TokenType.KW_NOT)) {
    const item = parseNot(s);
    return { kind: 'not', item } as NotExpr;
  }
  return parseComparison(s);
}

function parseComparison(s: TokenStream): BoolExpr {
  // EXISTS (SELECT ...)
  if (s.check(TokenType.KW_EXISTS)) {
    s.advance();
    s.expect(TokenType.LPAREN);
    const subquery = parseQueryBodyTopLevel(s);
    s.expect(TokenType.RPAREN, 'to close EXISTS');
    return { kind: 'exists', subquery } as ExistsExpr;
  }

  // Parse the left-hand expression
  const left = parseExpr(s);

  // IS [NOT] NULL
  if (s.check(TokenType.KW_IS)) {
    s.advance();
    const negated = !!s.match(TokenType.KW_NOT);
    s.expect(TokenType.KW_NULL, 'after IS');
    if (negated) {
      return {
        kind: 'not',
        item: {
          kind: 'cmp',
          op: '=',
          left,
          right: { kind: 'literal', litType: 'null', value: null },
        },
      } as NotExpr;
    }
    return {
      kind: 'cmp',
      op: '=',
      left,
      right: { kind: 'literal', litType: 'null', value: null },
    } as CompareExpr;
  }

  // ССЫЛКА / REFS
  if (s.check(TokenType.KW_REFS)) {
    s.advance();
    const parts: string[] = [];
    const nameTok = s.expectIdentLike('for REFS type');
    if (nameTok) parts.push(nameTok.text);
    while (s.check(TokenType.DOT) && isIdentLike(s.lookAhead(1).type)) {
      s.advance();
      parts.push(s.advance().text);
    }
    return { kind: 'refCheck', expr: left, refType: parts.join('.') } as RefCheckExpr;
  }

  // IN (could be IN values, IN subquery, or IN HIERARCHY)
  if (s.check(TokenType.KW_IN)) {
    return parseInExpr(s, left, false);
  }

  // BETWEEN ... AND ...
  if (s.check(TokenType.KW_BETWEEN)) {
    s.advance();
    const from = parseExpr(s);
    s.expect(TokenType.KW_AND, 'in BETWEEN expression');
    const to = parseExpr(s);
    return { kind: 'between', expr: left, from, to } as BetweenExpr;
  }

  // LIKE / ПОДОБНО
  if (s.check(TokenType.KW_LIKE)) {
    s.advance();
    const right = parseExpr(s);
    return { kind: 'cmp', op: 'like', left, right } as CompareExpr;
  }

  // Comparison operators
  const compOp = matchComparisonOp(s);
  if (compOp) {
    const right = parseExpr(s);
    return { kind: 'cmp', op: compOp, left, right } as CompareExpr;
  }

  // No boolean operator found — treat the expression itself as a boolean
  // This handles cases like "Ном.Проведен" used as a boolean directly
  return {
    kind: 'cmp',
    op: '<>',
    left,
    right: { kind: 'literal', litType: 'bool', value: false },
  } as CompareExpr;
}

function parseInExpr(s: TokenStream, left: Expr, negated: boolean): BoolExpr {
  s.expect(TokenType.KW_IN);

  // Check for IN HIERARCHY / В ИЕРАРХИИ
  if (s.check(TokenType.KW_HIERARCHY)) {
    s.advance();
    let value: Expr;
    if (s.check(TokenType.LPAREN)) {
      s.advance();
      value = parseExpr(s);
      s.expect(TokenType.RPAREN);
    } else {
      value = parseExpr(s);
    }
    const hier: InHierarchyExpr = { kind: 'inHierarchy', expr: left, value };
    if (negated) return { kind: 'not', item: hier } as NotExpr;
    return hier;
  }

  // Regular IN — must have parenthesized list or subquery
  s.expect(TokenType.LPAREN, 'after IN');

  // Check if it's a subquery
  if (s.check(TokenType.KW_SELECT)) {
    const subquery = parseQueryBodyTopLevel(s);
    s.expect(TokenType.RPAREN, 'to close IN subquery');
    const inExpr: InExpr = { kind: 'in', expr: left, values: subquery };
    if (negated) return { kind: 'not', item: inExpr } as NotExpr;
    return inExpr;
  }

  // Value list
  const values: Expr[] = [];
  if (!s.check(TokenType.RPAREN)) {
    values.push(parseExpr(s));
    while (s.match(TokenType.COMMA)) {
      values.push(parseExpr(s));
    }
  }
  s.expect(TokenType.RPAREN, 'to close IN list');

  const inExpr: InExpr = { kind: 'in', expr: left, values };
  if (negated) return { kind: 'not', item: inExpr } as NotExpr;
  return inExpr;
}

function matchComparisonOp(s: TokenStream): CompareExpr['op'] | undefined {
  const t = s.peek().type;
  switch (t) {
    case TokenType.EQ: s.advance(); return '=';
    case TokenType.NEQ: s.advance(); return '<>';
    case TokenType.GT: s.advance(); return '>';
    case TokenType.GTE: s.advance(); return '>=';
    case TokenType.LT: s.advance(); return '<';
    case TokenType.LTE: s.advance(); return '<=';
    default: return undefined;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isClauseStart(s: TokenStream): boolean {
  const t = s.peek().type;
  return (
    t === TokenType.KW_FROM ||
    t === TokenType.KW_INTO ||
    t === TokenType.KW_WHERE ||
    t === TokenType.KW_GROUP ||
    t === TokenType.KW_HAVING ||
    t === TokenType.KW_ORDER ||
    t === TokenType.KW_UNION ||
    t === TokenType.KW_FOR ||
    t === TokenType.KW_TOTALS ||
    t === TokenType.KW_AUTOORDER ||
    t === TokenType.SEMICOLON ||
    t === TokenType.EOF ||
    t === TokenType.RPAREN
  );
}

function emptyQueryBody(): QueryBody {
  return {
    kind: 'queryBody',
    sources: [],
    select: [],
  };
}

// Re-export for convenience
export { TokenStream } from './error-recovery.js';
