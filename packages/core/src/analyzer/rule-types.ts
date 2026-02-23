// Static Query Analyzer rule interface (ТЗ §8.1)

import type { QueryBody } from '../model/query-model.js';
import type { Diagnostic } from '../validator/diagnostic.js';
import type { MetadataProvider } from '../metadata/metadata-provider.js';

export interface AnalyzerContext {
  metadata: MetadataProvider;
  queryIndex: number;
}

export interface QueryRule {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warn' | 'error';
  evaluate(model: QueryBody, ctx: AnalyzerContext): Diagnostic[];
}
