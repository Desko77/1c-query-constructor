// Static Query Analyzer Engine (ТЗ §8)

import type { QueryModel, QueryBody } from '../model/query-model.js';
import type { Diagnostic } from '../validator/diagnostic.js';
import type { MetadataProvider } from '../metadata/metadata-provider.js';
import type { QueryRule, AnalyzerContext } from './rule-types.js';
import { NullMetadataProvider } from '../metadata/null-metadata-provider.js';

export interface AnalyzerOptions {
  metadata?: MetadataProvider;
  ruleOverrides?: Record<string, 'info' | 'warn' | 'error' | 'off'>;
}

export function analyze(model: QueryModel, rules: QueryRule[], options?: AnalyzerOptions): Diagnostic[] {
  const metadata = options?.metadata ?? new NullMetadataProvider();
  const overrides = options?.ruleOverrides ?? {};
  const diagnostics: Diagnostic[] = [];

  for (let i = 0; i < model.queries.length; i++) {
    const item = model.queries[i];
    if (item.kind !== 'queryBody') continue;

    const ctx: AnalyzerContext = { metadata, queryIndex: i };

    for (const rule of rules) {
      const overrideSeverity = overrides[rule.id];
      if (overrideSeverity === 'off') continue;

      const ruleDiags = rule.evaluate(item, ctx);

      for (const d of ruleDiags) {
        diagnostics.push({
          ...d,
          severity: overrideSeverity ?? d.severity,
          code: rule.id,
        });
      }
    }

    // Also analyze union parts
    if (item.union) {
      for (const u of item.union) {
        analyzeQueryBody(u.body, rules, metadata, i, overrides, diagnostics);
      }
    }
  }

  return diagnostics;
}

function analyzeQueryBody(
  body: QueryBody,
  rules: QueryRule[],
  metadata: MetadataProvider,
  queryIndex: number,
  overrides: Record<string, 'info' | 'warn' | 'error' | 'off'>,
  diagnostics: Diagnostic[],
): void {
  const ctx: AnalyzerContext = { metadata, queryIndex };

  for (const rule of rules) {
    const overrideSeverity = overrides[rule.id];
    if (overrideSeverity === 'off') continue;

    const ruleDiags = rule.evaluate(body, ctx);
    for (const d of ruleDiags) {
      diagnostics.push({
        ...d,
        severity: overrideSeverity ?? d.severity,
        code: rule.id,
      });
    }
  }
}

/**
 * Load rule severity overrides from .querylintrc.json format.
 */
export function parseRuleConfig(config: Record<string, string>): Record<string, 'info' | 'warn' | 'error' | 'off'> {
  const result: Record<string, 'info' | 'warn' | 'error' | 'off'> = {};
  for (const [id, severity] of Object.entries(config)) {
    if (['info', 'warn', 'error', 'off'].includes(severity)) {
      result[id] = severity as 'info' | 'warn' | 'error' | 'off';
    }
  }
  return result;
}
