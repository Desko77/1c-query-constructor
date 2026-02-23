// =============================================================================
// QueryModel v1.0 (ТЗ v1.5 CLEAN rev.H, §4.2)
// Master definition. JSON Schema is GENERATED from these types automatically.
// =============================================================================

export type QueryModelVersion = '1.0';

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface QueryModel {
  version: QueryModelVersion;
  meta?: QueryMeta;
  queries: QueryItem[];
}

export type QueryItem = QueryBody | DestroyTempTable;

export interface DestroyTempTable {
  kind: 'destroyTempTable';
  name: string;
}

// ---------------------------------------------------------------------------
// Meta (transient, tooling-only)
// ---------------------------------------------------------------------------

export interface QueryMeta {
  language?: 'RU' | 'EN' | 'MIXED';
  origin?: { uri?: string; lineStart?: number; lineEnd?: number };
  formatting?: { mode: 'preserve' | 'canonical' };
}

// ---------------------------------------------------------------------------
// QueryBody — a single SELECT statement
// ---------------------------------------------------------------------------

export interface QueryBody {
  kind: 'queryBody';
  options?: QueryOptions;
  sources: Source[];
  joins?: Join[];
  select: SelectItem[];
  where?: BoolExpr;
  groupBy?: Expr[];
  having?: BoolExpr;
  orderBy?: OrderByItem[];
  totals?: TotalsSpec;
  parameters?: ParameterSpec[];
  intoTempTable?: TempTableSpec;
  union?: UnionItem[];
}

export interface QueryOptions {
  distinct?: boolean;
  top?: number;
  forUpdate?: { mode: 'all' | 'specific'; tables?: string[] };
  autoOrder?: boolean;
}

export interface UnionItem {
  body: QueryBody;
  all: boolean;
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

export interface Source {
  alias: string;
  kind: 'object' | 'virtual' | 'subquery' | 'tempTable';
  object?: string;
  subquery?: QueryBody;
  tempTableName?: string;
  virtualParams?: VirtualParam[];
}

export interface VirtualParam {
  name: string;
  value: Expr;
}

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

export interface Join {
  leftAlias: string;
  rightAlias: string;
  type: 'inner' | 'left' | 'right' | 'full';
  on: BoolExpr;
  hint?: { score?: number; reason?: string };
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export type SelectItem = SelectExprItem | SelectWildcard;

export interface SelectExprItem {
  kind: 'selectExpr';
  expr: Expr;
  alias?: string;
}

export interface SelectWildcard {
  kind: 'wildcard';
  sourceAlias?: string;
}

// ---------------------------------------------------------------------------
// OrderBy
// ---------------------------------------------------------------------------

export interface OrderByItem {
  expr: Expr;
  direction?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export interface TotalsSpec {
  by?: Expr[];
  totals?: TotalAggItem[];
}

export interface TotalAggItem {
  func: AggFunc;
  distinct?: boolean;
  expr: Expr;
  alias?: string;
}

export type AggFunc = 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT';

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface ParameterSpec {
  name: string;
  inferredType?: TypeRef;
  manualType?: TypeRef;
  required?: boolean;
  defaultValue?: Literal;
  runtimeValue?: Literal;
  description?: string;
  used?: boolean;
  source?: 'manual' | 'inferred';
  usageCount?: number;
  usageLocations?: { queryIndex: number; context: string }[];
}

// ---------------------------------------------------------------------------
// Temp Tables
// ---------------------------------------------------------------------------

export interface TempTableSpec {
  name: string;
  schema?: TempTableSchema;
}

export interface TempTableSchema {
  columns: { name: string; type?: TypeRef; nullable?: boolean }[];
}

// ---------------------------------------------------------------------------
// Expressions (Expr)
// ---------------------------------------------------------------------------

export type Expr =
  | ColumnRef
  | ParamRef
  | Literal
  | FuncCall
  | CastExpr
  | CaseExpr
  | BinaryExpr
  | UnaryExpr
  | SubqueryExpr;

export interface ColumnRef {
  kind: 'column';
  sourceAlias?: string;
  name: string;
}

export interface ParamRef {
  kind: 'param';
  name: string;
}

export interface Literal {
  kind: 'literal';
  litType: 'string' | 'number' | 'bool' | 'date' | 'null';
  value: string | number | boolean | null;
}

export interface FuncCall {
  kind: 'func';
  name: string;
  args: Expr[];
}

export interface CastExpr {
  kind: 'cast';
  expr: Expr;
  toType: TypeRef;
}

export interface CaseExpr {
  kind: 'case';
  branches: { when: BoolExpr; then: Expr }[];
  elseExpr?: Expr;
}

export interface SubqueryExpr {
  kind: 'subquery';
  subquery: QueryBody;
}

export interface BinaryExpr {
  kind: 'bin';
  op: '+' | '-' | '*' | '/';
  left: Expr;
  right: Expr;
}

export interface UnaryExpr {
  kind: 'un';
  op: '+' | '-';
  expr: Expr;
}

// ---------------------------------------------------------------------------
// Boolean Expressions (BoolExpr) — used in WHERE, HAVING, ON
// ---------------------------------------------------------------------------

export type BoolExpr =
  | CompareExpr
  | InExpr
  | BetweenExpr
  | RefCheckExpr
  | InHierarchyExpr
  | BoolGroup
  | NotExpr
  | ExistsExpr;

export interface CompareExpr {
  kind: 'cmp';
  op: '=' | '<>' | '>' | '>=' | '<' | '<=' | 'like';
  left: Expr;
  right: Expr;
}

export interface InExpr {
  kind: 'in';
  expr: Expr;
  values: Expr[] | QueryBody;
}

export interface BetweenExpr {
  kind: 'between';
  expr: Expr;
  from: Expr;
  to: Expr;
}

export interface RefCheckExpr {
  kind: 'refCheck';
  expr: Expr;
  refType: string;
}

export interface InHierarchyExpr {
  kind: 'inHierarchy';
  expr: Expr;
  value: Expr;
}

export interface BoolGroup {
  kind: 'boolGroup';
  op: 'and' | 'or';
  items: BoolExpr[];
}

export interface NotExpr {
  kind: 'not';
  item: BoolExpr;
}

export interface ExistsExpr {
  kind: 'exists';
  subquery: QueryBody;
}

// ---------------------------------------------------------------------------
// Type References (used by inference & validation)
// ---------------------------------------------------------------------------

export type TypeRef =
  | { kind: 'primitive'; name: 'string' | 'number' | 'bool' | 'date' | 'uuid' | 'any' | 'unknown' }
  | { kind: 'ref'; object: string }
  | { kind: 'union'; items: TypeRef[] };
