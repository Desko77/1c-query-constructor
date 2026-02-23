// AST node types with trivia and source ranges (ТЗ §5.3)

import type { TriviaItem } from '../lexer/token-types.js';

export type AstNodeType =
  | 'Query'
  | 'QueryBody'
  | 'SelectClause'
  | 'SelectItem'
  | 'FromClause'
  | 'Source'
  | 'JoinClause'
  | 'WhereClause'
  | 'GroupByClause'
  | 'HavingClause'
  | 'OrderByClause'
  | 'OrderByItem'
  | 'UnionClause'
  | 'TotalsClause'
  | 'IntoTempTable'
  | 'DestroyTempTable'
  | 'Expression'
  | 'BoolExpression'
  | 'FunctionCall'
  | 'CaseExpression'
  | 'CastExpression'
  | 'Identifier'
  | 'Literal'
  | 'Parameter'
  | 'Error';

export interface SourceRange {
  start: number;
  end: number;
  line: number;
  col: number;
}

export interface AstNode {
  type: AstNodeType;
  range: SourceRange;
  leadingTrivia?: TriviaItem[];
  trailingTrivia?: TriviaItem[];
  children: AstNode[];
  /** Raw text of the token/keyword, preserved for round-trip */
  text?: string;
  /** Additional data specific to node type */
  data?: Record<string, unknown>;
}
