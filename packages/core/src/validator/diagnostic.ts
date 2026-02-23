// Diagnostic type — shared across Parser, Validator, Analyzer, UI, CLI

export type DiagnosticSeverity = 'error' | 'warn' | 'info';

export interface SourceRange {
  start: number;
  end: number;
  line: number;
  col: number;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  range?: SourceRange;
  suggestion?: string;
}
