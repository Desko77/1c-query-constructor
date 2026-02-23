// @1c-query/core — public API

export type {
  QueryModel,
  QueryModelVersion,
  QueryBody,
  QueryItem,
  QueryMeta,
  QueryOptions,
  DestroyTempTable,
  UnionItem,
  Source,
  VirtualParam,
  Join,
  SelectItem,
  SelectExprItem,
  SelectWildcard,
  OrderByItem,
  TotalsSpec,
  TotalAggItem,
  AggFunc,
  ParameterSpec,
  TempTableSpec,
  TempTableSchema,
  Expr,
  ColumnRef,
  ParamRef,
  Literal,
  FuncCall,
  CastExpr,
  CaseExpr,
  SubqueryExpr,
  BinaryExpr,
  UnaryExpr,
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
} from './model/query-model.js';

export type {
  Diagnostic,
  DiagnosticSeverity,
  SourceRange,
} from './validator/diagnostic.js';

export type {
  MetadataProvider,
  MetadataTypeGroup,
  MetadataObject,
  MetadataField,
  VirtualTableInfo,
} from './metadata/metadata-provider.js';

export { NullMetadataProvider } from './metadata/null-metadata-provider.js';
