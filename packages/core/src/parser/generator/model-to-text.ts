// =============================================================================
// QueryModel -> Text Generator (ТЗ §4.6)
// Converts a QueryModel AST back into 1C query text.
// =============================================================================

import type {
  QueryModel,
  QueryItem,
  QueryBody,
  DestroyTempTable,
  Source,
  Join,
  SelectItem,
  SelectExprItem,
  OrderByItem,
  TotalsSpec,
  TotalAggItem,
  Expr,
  ColumnRef,
  ParamRef,
  Literal,
  FuncCall,
  CastExpr,
  CaseExpr,
  BinaryExpr,
  UnaryExpr,
  SubqueryExpr,
  BoolExpr,
  CompareExpr,
  InExpr,
  BetweenExpr,
  RefCheckExpr,
  InHierarchyExpr,
  BoolGroup,
  NotExpr,
  ExistsExpr,
  TypeRef,
  VirtualParam,
  UnionItem,
} from '../../model/query-model.js';

import { localize } from '../../registry/function-names.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  language?: 'RU' | 'EN';
  indent?: string;
  uppercase?: boolean;
}

/** @deprecated Use generateText instead */
export interface GeneratorOptions {
  language?: 'RU' | 'EN';
  indent?: string;
  uppercase?: boolean;
}

export function generateText(model: QueryModel, options?: GenerateOptions): string {
  const ctx = new GeneratorContext(options);
  return ctx.generateModel(model);
}

/** @deprecated Use generateText instead */
export function generate(model: QueryModel, options?: GeneratorOptions): string {
  return generateText(model, options);
}

// ---------------------------------------------------------------------------
// Keyword tables
// ---------------------------------------------------------------------------

type KW =
  | 'SELECT' | 'DISTINCT' | 'TOP' | 'FROM' | 'AS' | 'WHERE'
  | 'AND' | 'OR' | 'NOT' | 'IN' | 'BETWEEN' | 'LIKE' | 'IS'
  | 'TRUE' | 'FALSE'
  | 'JOIN' | 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'OUTER' | 'ON'
  | 'GROUP_BY' | 'HAVING' | 'ORDER_BY' | 'ASC' | 'DESC'
  | 'UNION' | 'ALL' | 'INTO' | 'DROP'
  | 'CASE' | 'WHEN' | 'THEN' | 'ELSE' | 'END'
  | 'CAST' | 'CAST_AS' | 'REFS' | 'IN_HIERARCHY' | 'EXISTS'
  | 'FOR_UPDATE' | 'AUTOORDER' | 'TOTALS' | 'BY' | 'NULL'
  | 'OVERALL' | 'DATETIME';

const RU_KEYWORDS: Record<KW, string> = {
  SELECT: 'ВЫБРАТЬ',
  DISTINCT: 'РАЗЛИЧНЫЕ',
  TOP: 'ПЕРВЫЕ',
  FROM: 'ИЗ',
  AS: 'КАК',
  WHERE: 'ГДЕ',
  AND: 'И',
  OR: 'ИЛИ',
  NOT: 'НЕ',
  IN: 'В',
  BETWEEN: 'МЕЖДУ',
  LIKE: 'ПОДОБНО',
  IS: 'ЕСТЬ',
  TRUE: 'ИСТИНА',
  FALSE: 'ЛОЖЬ',
  JOIN: 'СОЕДИНЕНИЕ',
  INNER: 'ВНУТРЕННЕЕ',
  LEFT: 'ЛЕВОЕ',
  RIGHT: 'ПРАВОЕ',
  FULL: 'ПОЛНОЕ',
  OUTER: 'ВНЕШНЕЕ',
  ON: 'ПО',
  GROUP_BY: 'СГРУППИРОВАТЬ ПО',
  HAVING: 'ИМЕЮЩИЕ',
  ORDER_BY: 'УПОРЯДОЧИТЬ ПО',
  ASC: 'ВОЗР',
  DESC: 'УБЫВ',
  UNION: 'ОБЪЕДИНИТЬ',
  ALL: 'ВСЕ',
  INTO: 'ПОМЕСТИТЬ',
  DROP: 'УНИЧТОЖИТЬ',
  CASE: 'ВЫБОР',
  WHEN: 'КОГДА',
  THEN: 'ТОГДА',
  ELSE: 'ИНАЧЕ',
  END: 'КОНЕЦ',
  CAST: 'ВЫРАЗИТЬ',
  CAST_AS: 'КАК',
  REFS: 'ССЫЛКА',
  IN_HIERARCHY: 'В ИЕРАРХИИ',
  EXISTS: 'СУЩЕСТВУЕТ',
  FOR_UPDATE: 'ДЛЯ ИЗМЕНЕНИЯ',
  AUTOORDER: 'АВТОУПОРЯДОЧИВАНИЕ',
  TOTALS: 'ИТОГИ',
  BY: 'ПО',
  NULL: 'NULL',
  OVERALL: 'ОБЩИЕ',
  DATETIME: 'ДАТАВРЕМЯ',
};

const EN_KEYWORDS: Record<KW, string> = {
  SELECT: 'SELECT',
  DISTINCT: 'DISTINCT',
  TOP: 'TOP',
  FROM: 'FROM',
  AS: 'AS',
  WHERE: 'WHERE',
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  IN: 'IN',
  BETWEEN: 'BETWEEN',
  LIKE: 'LIKE',
  IS: 'IS',
  TRUE: 'TRUE',
  FALSE: 'FALSE',
  JOIN: 'JOIN',
  INNER: 'INNER',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  FULL: 'FULL',
  OUTER: 'OUTER',
  ON: 'ON',
  GROUP_BY: 'GROUP BY',
  HAVING: 'HAVING',
  ORDER_BY: 'ORDER BY',
  ASC: 'ASC',
  DESC: 'DESC',
  UNION: 'UNION',
  ALL: 'ALL',
  INTO: 'INTO',
  DROP: 'DROP',
  CASE: 'CASE',
  WHEN: 'WHEN',
  THEN: 'THEN',
  ELSE: 'ELSE',
  END: 'END',
  CAST: 'CAST',
  CAST_AS: 'AS',
  REFS: 'REFS',
  IN_HIERARCHY: 'IN HIERARCHY',
  EXISTS: 'EXISTS',
  FOR_UPDATE: 'FOR UPDATE',
  AUTOORDER: 'AUTOORDER',
  TOTALS: 'TOTALS',
  BY: 'BY',
  NULL: 'NULL',
  OVERALL: 'OVERALL',
  DATETIME: 'DATETIME',
};

// ---------------------------------------------------------------------------
// Aggregate function name localization
// ---------------------------------------------------------------------------

const AGG_RU: Record<string, string> = {
  SUM: 'СУММА',
  AVG: 'СРЕДНЕЕ',
  MIN: 'МИНИМУМ',
  MAX: 'МАКСИМУМ',
  COUNT: 'КОЛИЧЕСТВО',
};

function localizeAgg(name: string, lang: 'RU' | 'EN'): string {
  if (lang === 'EN') return name;
  return AGG_RU[name] ?? name;
}

// ---------------------------------------------------------------------------
// Generator Context
// ---------------------------------------------------------------------------

class GeneratorContext {
  private lang: 'RU' | 'EN';
  private explicitLang: boolean;
  private indentStr: string;
  private upper: boolean;
  private keywords: Record<KW, string>;
  private depth: number = 0;

  constructor(options?: GenerateOptions) {
    this.explicitLang = options?.language !== undefined;
    this.lang = options?.language ?? 'RU';
    this.indentStr = options?.indent ?? '  ';
    this.upper = options?.uppercase ?? true;
    this.keywords = this.lang === 'EN' ? EN_KEYWORDS : RU_KEYWORDS;
  }

  // -----------------------------------------------------------------------
  // Keyword emission
  // -----------------------------------------------------------------------

  private kw(key: KW): string {
    const raw = this.keywords[key];
    return this.upper ? raw : raw.toLowerCase();
  }

  private indent(): string {
    return this.indentStr.repeat(this.depth);
  }

  // -----------------------------------------------------------------------
  // Top-level
  // -----------------------------------------------------------------------

  generateModel(model: QueryModel): string {
    // Respect the language stored in the model if no explicit language was given
    if (model.meta?.language && !this.explicitLang && (model.meta.language === 'RU' || model.meta.language === 'EN')) {
      this.lang = model.meta.language;
      this.keywords = this.lang === 'EN' ? EN_KEYWORDS : RU_KEYWORDS;
    }
    return model.queries.map(q => this.generateQueryItem(q)).join(';\n\n');
  }

  private generateQueryItem(item: QueryItem): string {
    if (item.kind === 'destroyTempTable') {
      return this.generateDestroyTempTable(item);
    }
    return this.generateQueryBody(item);
  }

  private generateDestroyTempTable(dt: DestroyTempTable): string {
    return `${this.indent()}${this.kw('DROP')} ${dt.name}`;
  }

  // -----------------------------------------------------------------------
  // QueryBody (SELECT)
  // -----------------------------------------------------------------------

  private generateQueryBody(body: QueryBody): string {
    const parts: string[] = [];

    // SELECT clause
    parts.push(this.generateSelectClause(body));

    // INTO temp table (must come right after SELECT in 1C)
    if (body.intoTempTable) {
      parts.push(`${this.indent()}${this.kw('INTO')} ${body.intoTempTable.name}`);
    }

    // FROM clause
    if (body.sources.length > 0) {
      parts.push(this.generateFromClause(body));
    }

    // WHERE clause
    if (body.where) {
      parts.push(`${this.indent()}${this.kw('WHERE')}`);
      this.depth++;
      parts.push(`${this.indent()}${this.generateBoolExpr(body.where)}`);
      this.depth--;
    }

    // GROUP BY clause
    if (body.groupBy && body.groupBy.length > 0) {
      const exprs = body.groupBy.map(e => this.generateExpr(e)).join(', ');
      parts.push(`${this.indent()}${this.kw('GROUP_BY')}`);
      this.depth++;
      parts.push(`${this.indent()}${exprs}`);
      this.depth--;
    }

    // HAVING clause
    if (body.having) {
      parts.push(`${this.indent()}${this.kw('HAVING')}`);
      this.depth++;
      parts.push(`${this.indent()}${this.generateBoolExpr(body.having)}`);
      this.depth--;
    }

    // UNION clause
    if (body.union && body.union.length > 0) {
      for (const u of body.union) {
        parts.push('');
        parts.push(this.generateUnionItem(u));
      }
    }

    // ORDER BY clause
    if (body.orderBy && body.orderBy.length > 0) {
      parts.push(this.generateOrderByClause(body.orderBy));
    }

    // TOTALS clause
    if (body.totals) {
      parts.push(this.generateTotalsClause(body.totals));
    }

    // AUTOORDER
    if (body.options?.autoOrder) {
      parts.push(`${this.indent()}${this.kw('AUTOORDER')}`);
    }

    // FOR UPDATE
    if (body.options?.forUpdate) {
      const forUpdateStr = this.kw('FOR_UPDATE');
      if (body.options.forUpdate.mode === 'specific' && body.options.forUpdate.tables) {
        parts.push(`${this.indent()}${forUpdateStr} ${body.options.forUpdate.tables.join(', ')}`);
      } else {
        parts.push(`${this.indent()}${forUpdateStr}`);
      }
    }

    return parts.join('\n');
  }

  // -----------------------------------------------------------------------
  // SELECT clause
  // -----------------------------------------------------------------------

  private generateSelectClause(body: QueryBody): string {
    const selectParts: string[] = [this.kw('SELECT')];

    if (body.options?.distinct) {
      selectParts.push(this.kw('DISTINCT'));
    }

    if (body.options?.top !== undefined) {
      selectParts.push(`${this.kw('TOP')} ${body.options.top}`);
    }

    const header = `${this.indent()}${selectParts.join(' ')}`;
    this.depth++;
    const items = body.select.map(s => `${this.indent()}${this.generateSelectItem(s)}`).join(',\n');
    this.depth--;

    return `${header}\n${items}`;
  }

  private generateSelectItem(item: SelectItem): string {
    if (item.kind === 'wildcard') {
      return item.sourceAlias ? `${item.sourceAlias}.*` : '*';
    }
    const si = item as SelectExprItem;
    const exprStr = this.generateExpr(si.expr);
    if (si.alias) {
      return `${exprStr} ${this.kw('AS')} ${si.alias}`;
    }
    return exprStr;
  }

  // -----------------------------------------------------------------------
  // FROM clause
  // -----------------------------------------------------------------------

  private generateFromClause(body: QueryBody): string {
    const lines: string[] = [];

    // Build a map of sources by alias for join lookups
    const sourceMap = new Map<string, Source>();
    for (const s of body.sources) {
      sourceMap.set(s.alias, s);
    }

    // Find sources that appear as right side of a join
    const joinedRightAliases = new Set<string>();
    if (body.joins) {
      for (const j of body.joins) {
        joinedRightAliases.add(j.rightAlias);
      }
    }

    // Primary sources (not the right side of any join)
    const primarySources = body.sources.filter(s => !joinedRightAliases.has(s.alias));

    // If no primary sources found (shouldn't happen), use the first source
    const rootSources = primarySources.length > 0 ? primarySources : [body.sources[0]];

    lines.push(`${this.indent()}${this.kw('FROM')}`);
    this.depth++;

    const sourceParts: string[] = [];
    for (const src of rootSources) {
      sourceParts.push(this.generateSourceWithJoins(src, body.joins ?? [], sourceMap));
    }
    lines.push(sourceParts.join(',\n'));

    this.depth--;
    return lines.join('\n');
  }

  private generateSourceWithJoins(
    src: Source,
    joins: Join[],
    sourceMap: Map<string, Source>,
  ): string {
    const parts: string[] = [];
    parts.push(`${this.indent()}${this.generateSource(src)}`);

    // Find all joins where this source is the left side
    const myJoins = joins.filter(j => j.leftAlias === src.alias);
    for (const j of myJoins) {
      const rightSource = sourceMap.get(j.rightAlias);
      if (rightSource) {
        parts.push(this.generateJoin(j, rightSource, joins, sourceMap));
      }
    }

    return parts.join('\n');
  }

  private generateSource(src: Source): string {
    switch (src.kind) {
      case 'object':
        return `${src.object} ${this.kw('AS')} ${src.alias}`;
      case 'tempTable':
        return `${src.tempTableName} ${this.kw('AS')} ${src.alias}`;
      case 'virtual':
        if (src.virtualParams && src.virtualParams.length > 0) {
          const params = src.virtualParams.map(p => this.generateVirtualParam(p)).join(', ');
          return `${src.object}(${params}) ${this.kw('AS')} ${src.alias}`;
        }
        return `${src.object} ${this.kw('AS')} ${src.alias}`;
      case 'subquery': {
        const savedDepth = this.depth;
        this.depth++;
        const subquery = this.generateQueryBody(src.subquery!);
        this.depth = savedDepth;
        return `(\n${subquery}\n${this.indent()}) ${this.kw('AS')} ${src.alias}`;
      }
    }
  }

  private generateVirtualParam(p: VirtualParam): string {
    // Virtual table params in 1C are positional (numeric names from parser)
    // Only emit "name = value" for named params, just "value" for positional
    if (/^\d+$/.test(p.name)) {
      return this.generateExpr(p.value);
    }
    return `${p.name} = ${this.generateExpr(p.value)}`;
  }

  // -----------------------------------------------------------------------
  // JOIN clause
  // -----------------------------------------------------------------------

  private generateJoin(
    join: Join,
    rightSource: Source,
    allJoins: Join[],
    sourceMap: Map<string, Source>,
  ): string {
    const joinType = this.generateJoinType(join.type);
    const source = this.generateSource(rightSource);
    const on = this.generateBoolExpr(join.on);

    const parts: string[] = [];
    parts.push(`${this.indent()}${joinType} ${this.kw('JOIN')} ${source}`);
    parts.push(`${this.indent()}${this.kw('ON')} ${on}`);

    // Recursively add joins on the right source
    const childJoins = allJoins.filter(j => j.leftAlias === join.rightAlias);
    for (const cj of childJoins) {
      const childRight = sourceMap.get(cj.rightAlias);
      if (childRight) {
        parts.push(this.generateJoin(cj, childRight, allJoins, sourceMap));
      }
    }

    return parts.join('\n');
  }

  private generateJoinType(type: Join['type']): string {
    switch (type) {
      case 'inner':
        return this.kw('INNER');
      case 'left':
        return `${this.kw('LEFT')} ${this.kw('OUTER')}`;
      case 'right':
        return `${this.kw('RIGHT')} ${this.kw('OUTER')}`;
      case 'full':
        return `${this.kw('FULL')} ${this.kw('OUTER')}`;
    }
  }

  // -----------------------------------------------------------------------
  // ORDER BY clause
  // -----------------------------------------------------------------------

  private generateOrderByClause(items: OrderByItem[]): string {
    const exprs = items.map(i => {
      const e = this.generateExpr(i.expr);
      if (i.direction === 'desc') {
        return `${e} ${this.kw('DESC')}`;
      }
      if (i.direction === 'asc') {
        return `${e} ${this.kw('ASC')}`;
      }
      return e;
    }).join(', ');

    return `${this.indent()}${this.kw('ORDER_BY')}\n${this.indentStr.repeat(this.depth + 1)}${exprs}`;
  }

  // -----------------------------------------------------------------------
  // TOTALS clause
  // -----------------------------------------------------------------------

  private generateTotalsClause(spec: TotalsSpec): string {
    const parts: string[] = [];

    parts.push(`${this.indent()}${this.kw('TOTALS')}`);

    if (spec.totals && spec.totals.length > 0) {
      this.depth++;
      const aggParts = spec.totals.map(t => this.generateTotalAgg(t)).join(', ');
      parts.push(`${this.indent()}${aggParts}`);
      this.depth--;
    }

    if (spec.by && spec.by.length > 0) {
      const byExprs = spec.by.map(e => this.generateExpr(e)).join(', ');
      parts.push(`${this.indent()}${this.kw('BY')}`);
      this.depth++;
      parts.push(`${this.indent()}${byExprs}`);
      this.depth--;
    } else {
      parts.push(`${this.indent()}${this.kw('OVERALL')}`);
    }

    return parts.join('\n');
  }

  private generateTotalAgg(item: TotalAggItem): string {
    const funcName = localizeAgg(item.func, this.lang);
    const exprStr = this.generateExpr(item.expr);
    const distinctStr = item.distinct ? `${this.kw('DISTINCT')} ` : '';
    const result = `${funcName}(${distinctStr}${exprStr})`;
    if (item.alias) {
      return `${result} ${this.kw('AS')} ${item.alias}`;
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // UNION clause
  // -----------------------------------------------------------------------

  private generateUnionItem(item: UnionItem): string {
    const keyword = item.all
      ? `${this.kw('UNION')} ${this.kw('ALL')}`
      : this.kw('UNION');
    return `${keyword}\n\n${this.generateQueryBody(item.body)}`;
  }

  // -----------------------------------------------------------------------
  // Expressions (Expr)
  // -----------------------------------------------------------------------

  generateExpr(expr: Expr): string {
    switch (expr.kind) {
      case 'column':
        return this.generateColumnRef(expr);
      case 'param':
        return this.generateParamRef(expr);
      case 'literal':
        return this.generateLiteral(expr);
      case 'func':
        return this.generateFuncCall(expr);
      case 'cast':
        return this.generateCastExpr(expr);
      case 'case':
        return this.generateCaseExpr(expr);
      case 'bin':
        return this.generateBinaryExpr(expr);
      case 'un':
        return this.generateUnaryExpr(expr);
      case 'subquery':
        return this.generateSubqueryExpr(expr);
    }
  }

  private generateColumnRef(ref: ColumnRef): string {
    if (ref.sourceAlias) {
      return `${ref.sourceAlias}.${ref.name}`;
    }
    return ref.name;
  }

  private generateParamRef(ref: ParamRef): string {
    return `&${ref.name}`;
  }

  private generateLiteral(lit: Literal): string {
    switch (lit.litType) {
      case 'string':
        return `"${lit.value}"`;
      case 'number':
        return String(lit.value);
      case 'bool':
        return lit.value ? this.kw('TRUE') : this.kw('FALSE');
      case 'null':
        return this.kw('NULL');
      case 'date':
        return `${this.kw('DATETIME')}(${lit.value})`;
    }
  }

  private generateFuncCall(func: FuncCall): string {
    const name = localize(func.name.toUpperCase(), this.lang);
    const args = func.args.map(a => this.generateExpr(a)).join(', ');
    return `${name}(${args})`;
  }

  private generateCastExpr(cast: CastExpr): string {
    const exprStr = this.generateExpr(cast.expr);
    const typeStr = this.generateTypeRef(cast.toType);
    return `${this.kw('CAST')}(${exprStr} ${this.kw('CAST_AS')} ${typeStr})`;
  }

  private generateCaseExpr(caseExpr: CaseExpr): string {
    const parts: string[] = [];
    parts.push(this.kw('CASE'));
    for (const branch of caseExpr.branches) {
      const whenStr = this.generateBoolExpr(branch.when);
      const thenStr = this.generateExpr(branch.then);
      parts.push(`${this.kw('WHEN')} ${whenStr} ${this.kw('THEN')} ${thenStr}`);
    }
    if (caseExpr.elseExpr) {
      parts.push(`${this.kw('ELSE')} ${this.generateExpr(caseExpr.elseExpr)}`);
    }
    parts.push(this.kw('END'));
    return parts.join(' ');
  }

  private generateBinaryExpr(bin: BinaryExpr): string {
    const left = this.wrapBinaryOperand(bin.left, bin.op);
    const right = this.wrapBinaryOperand(bin.right, bin.op);
    return `${left} ${bin.op} ${right}`;
  }

  /**
   * Add parentheses around sub-expressions with lower precedence
   * to maintain correct operator grouping.
   */
  private wrapBinaryOperand(expr: Expr, parentOp: string): string {
    const inner = this.generateExpr(expr);
    if (expr.kind === 'bin') {
      const needsParens = this.precedence(expr.op) < this.precedence(parentOp);
      if (needsParens) {
        return `(${inner})`;
      }
    }
    return inner;
  }

  private precedence(op: string): number {
    switch (op) {
      case '+':
      case '-':
        return 1;
      case '*':
      case '/':
        return 2;
      default:
        return 0;
    }
  }

  private generateUnaryExpr(un: UnaryExpr): string {
    const inner = this.generateExpr(un.expr);
    if (un.expr.kind === 'bin') {
      return `${un.op}(${inner})`;
    }
    return `${un.op}${inner}`;
  }

  private generateSubqueryExpr(sq: SubqueryExpr): string {
    const savedDepth = this.depth;
    this.depth++;
    const body = this.generateQueryBody(sq.subquery);
    this.depth = savedDepth;
    return `(\n${body}\n${this.indent()})`;
  }

  // -----------------------------------------------------------------------
  // Boolean Expressions (BoolExpr)
  // -----------------------------------------------------------------------

  generateBoolExpr(expr: BoolExpr): string {
    switch (expr.kind) {
      case 'cmp':
        return this.generateCompareExpr(expr);
      case 'in':
        return this.generateInExpr(expr);
      case 'between':
        return this.generateBetweenExpr(expr);
      case 'refCheck':
        return this.generateRefCheckExpr(expr);
      case 'inHierarchy':
        return this.generateInHierarchyExpr(expr);
      case 'boolGroup':
        return this.generateBoolGroup(expr);
      case 'not':
        return this.generateNotExpr(expr);
      case 'exists':
        return this.generateExistsExpr(expr);
    }
  }

  private generateCompareExpr(cmp: CompareExpr): string {
    const left = this.generateExpr(cmp.left);
    const right = this.generateExpr(cmp.right);
    const op = this.generateCompareOp(cmp.op);

    // Handle IS NULL pattern
    if (cmp.op === '=' && cmp.right.kind === 'literal' && cmp.right.litType === 'null') {
      return `${left} ${this.kw('IS')} ${this.kw('NULL')}`;
    }
    if (cmp.op === '<>' && cmp.right.kind === 'literal' && cmp.right.litType === 'null') {
      return `${left} ${this.kw('IS')} ${this.kw('NOT')} ${this.kw('NULL')}`;
    }

    return `${left} ${op} ${right}`;
  }

  private generateCompareOp(op: CompareExpr['op']): string {
    switch (op) {
      case 'like':
        return this.kw('LIKE');
      default:
        return op;
    }
  }

  private generateInExpr(inExpr: InExpr): string {
    const exprStr = this.generateExpr(inExpr.expr);
    if (Array.isArray(inExpr.values)) {
      const vals = inExpr.values.map(v => this.generateExpr(v)).join(', ');
      return `${exprStr} ${this.kw('IN')} (${vals})`;
    } else {
      // Subquery
      const savedDepth = this.depth;
      this.depth++;
      const subquery = this.generateQueryBody(inExpr.values);
      this.depth = savedDepth;
      return `${exprStr} ${this.kw('IN')} (\n${subquery}\n${this.indent()})`;
    }
  }

  private generateBetweenExpr(bet: BetweenExpr): string {
    const exprStr = this.generateExpr(bet.expr);
    const fromStr = this.generateExpr(bet.from);
    const toStr = this.generateExpr(bet.to);
    return `${exprStr} ${this.kw('BETWEEN')} ${fromStr} ${this.kw('AND')} ${toStr}`;
  }

  private generateRefCheckExpr(ref: RefCheckExpr): string {
    const exprStr = this.generateExpr(ref.expr);
    return `${exprStr} ${this.kw('REFS')} ${ref.refType}`;
  }

  private generateInHierarchyExpr(ih: InHierarchyExpr): string {
    const exprStr = this.generateExpr(ih.expr);
    const valueStr = this.generateExpr(ih.value);
    return `${exprStr} ${this.kw('IN_HIERARCHY')} ${valueStr}`;
  }

  private generateBoolGroup(group: BoolGroup): string {
    const op = group.op === 'and' ? this.kw('AND') : this.kw('OR');
    const items = group.items.map(item => {
      const s = this.generateBoolExpr(item);
      // Wrap OR groups in parens when inside AND, for clarity
      if (group.op === 'and' && item.kind === 'boolGroup' && item.op === 'or') {
        return `(${s})`;
      }
      return s;
    });
    return items.join(` ${op} `);
  }

  private generateNotExpr(not: NotExpr): string {
    const inner = this.generateBoolExpr(not.item);
    if (not.item.kind === 'boolGroup') {
      return `${this.kw('NOT')} (${inner})`;
    }
    return `${this.kw('NOT')} ${inner}`;
  }

  private generateExistsExpr(exists: ExistsExpr): string {
    const savedDepth = this.depth;
    this.depth++;
    const subquery = this.generateQueryBody(exists.subquery);
    this.depth = savedDepth;
    return `${this.kw('EXISTS')} (\n${subquery}\n${this.indent()})`;
  }

  // -----------------------------------------------------------------------
  // Type References
  // -----------------------------------------------------------------------

  private generateTypeRef(typeRef: TypeRef): string {
    switch (typeRef.kind) {
      case 'primitive':
        return typeRef.name;
      case 'ref':
        return typeRef.object;
      case 'union':
        return typeRef.items.map(t => this.generateTypeRef(t)).join(', ');
    }
  }
}
