// @1c-query/core — public API

// Model types
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

// Diagnostics
export type {
  Diagnostic,
  DiagnosticSeverity,
  SourceRange,
} from './validator/diagnostic.js';

// Metadata
export type {
  MetadataProvider,
  MetadataTypeGroup,
  MetadataObject,
  MetadataField,
  VirtualTableInfo,
} from './metadata/metadata-provider.js';

export { NullMetadataProvider } from './metadata/null-metadata-provider.js';

// Parser
export { parseQuery } from './parser/parser/parser.js';
export type { ParseResult } from './parser/parser/parser.js';

// Generator
export { generateText } from './parser/generator/model-to-text.js';
export type { GenerateOptions } from './parser/generator/model-to-text.js';

// Validator
export { validate } from './validator/validator.js';

// Analyzer
export { analyze, parseRuleConfig } from './analyzer/analyzer.js';
export type { AnalyzerOptions } from './analyzer/analyzer.js';
export type { QueryRule, AnalyzerContext } from './analyzer/rule-types.js';
export { allRules } from './analyzer/rules/index.js';

// Type Inference
export { inferExprType, inferSelectTypes, createInferenceContext, buildTempTableSchemas } from './type-inference/type-inference.js';
export type { InferenceContext } from './type-inference/type-inference.js';

// Model utilities
export {
  cloneModel,
  walkQueryBodies,
  collectParameters,
  collectParamRefs,
  getSourceAliases,
  findSource,
  getQueryBody,
} from './model/query-model-utils.js';

// Migration
export { migrate, validateSchema } from './model/migration.js';

// Function registry
export { canonicalize, localize, isKnownFunction } from './registry/function-names.js';
