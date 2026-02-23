// =============================================================================
// Structural invariant checks for QueryModel (ТЗ §4.7)
// =============================================================================

import type {
  QueryModel,
  QueryItem,
  QueryBody,
  SelectItem,
} from '../model/query-model.js';
import type { Diagnostic } from './diagnostic.js';

// ---------------------------------------------------------------------------
// ValidatorOptions
// ---------------------------------------------------------------------------

export interface ValidatorOptions {
  /** Whether metadata is available (reserved for future semantic checks). */
  hasMetadata?: boolean;
  /** Maximum allowed nesting depth for subqueries. Default: Infinity. */
  maxSubqueryDepth?: number;
}

// ---------------------------------------------------------------------------
// Internal context carried through recursive validation
// ---------------------------------------------------------------------------

interface Ctx {
  diags: Diagnostic[];
  opts: Required<ValidatorOptions>;
  /** Temp-table lifecycle tracking: name → 'created' | 'destroyed' */
  tempTables: Map<string, 'created' | 'destroyed'>;
  /** All parameter names seen across the whole packet */
  paramNames: Set<string>;
  /** Current subquery depth */
  subqueryDepth: number;
}

function defaults(opts?: ValidatorOptions): Required<ValidatorOptions> {
  return {
    hasMetadata: opts?.hasMetadata ?? false,
    maxSubqueryDepth: opts?.maxSubqueryDepth ?? Infinity,
  };
}

// ---------------------------------------------------------------------------
// Helper to push a diagnostic
// ---------------------------------------------------------------------------

function err(ctx: Ctx, code: string, message: string): void {
  ctx.diags.push({ severity: 'error', code, message });
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export function checkInvariants(
  model: QueryModel,
  opts?: ValidatorOptions,
): Diagnostic[] {
  const ctx: Ctx = {
    diags: [],
    opts: defaults(opts),
    tempTables: new Map(),
    paramNames: new Set(),
    subqueryDepth: 0,
  };

  // --- Root-level: queries.length >= 1 ---
  if (!model.queries || model.queries.length < 1) {
    err(ctx, 'E001', 'QueryModel must have at least one query');
    return ctx.diags; // nothing else to validate
  }

  // First pass: collect all parameter names for duplicate detection across whole packet
  collectAllParams(ctx, model);

  // Second pass: validate each query item sequentially (order matters for temp tables)
  for (const item of model.queries) {
    checkQueryItem(ctx, item);
  }

  return ctx.diags;
}

// ---------------------------------------------------------------------------
// Collect all params across packet for duplicate-name detection
// ---------------------------------------------------------------------------

function collectAllParams(ctx: Ctx, model: QueryModel): void {
  const seen = new Map<string, number>();

  function collect(body: QueryBody): void {
    if (body.parameters) {
      for (const p of body.parameters) {
        const count = (seen.get(p.name) ?? 0) + 1;
        seen.set(p.name, count);
      }
    }
    // recurse into subqueries inside sources
    if (body.sources) {
      for (const src of body.sources) {
        if (src.subquery) collect(src.subquery);
      }
    }
    // recurse into union parts
    if (body.union) {
      for (const u of body.union) {
        collect(u.body);
      }
    }
  }

  for (const item of model.queries) {
    if (item.kind === 'queryBody') {
      collect(item);
    }
  }

  for (const [name, count] of seen) {
    if (count > 1) {
      err(ctx, 'E006', `Duplicate parameter name: ${name}`);
    }
    ctx.paramNames.add(name);
  }
}

// ---------------------------------------------------------------------------
// Dispatch QueryItem
// ---------------------------------------------------------------------------

function checkQueryItem(ctx: Ctx, item: QueryItem): void {
  if (item.kind === 'queryBody') {
    checkQueryBody(ctx, item, false);
  } else if (item.kind === 'destroyTempTable') {
    checkDestroyTempTable(ctx, item.name);
  } else {
    err(ctx, 'E002', `Unknown query item kind: ${(item as any).kind}`);
  }
}

// ---------------------------------------------------------------------------
// DestroyTempTable
// ---------------------------------------------------------------------------

function checkDestroyTempTable(ctx: Ctx, name: string): void {
  const state = ctx.tempTables.get(name);
  if (state === undefined) {
    err(ctx, 'E020', `DESTROY of non-existent temp table: ${name}`);
  } else if (state === 'destroyed') {
    err(ctx, 'E021', `Double DESTROY of temp table: ${name}`);
  } else {
    ctx.tempTables.set(name, 'destroyed');
  }
}

// ---------------------------------------------------------------------------
// QueryBody (isUnionPart = true when validating body inside UnionItem)
// ---------------------------------------------------------------------------

function checkQueryBody(
  ctx: Ctx,
  body: QueryBody,
  isUnionPart: boolean,
): void {
  // kind check
  if (body.kind !== 'queryBody') {
    err(ctx, 'E002', `Expected kind 'queryBody', got '${body.kind}'`);
  }

  // select.length >= 1
  if (!body.select || body.select.length < 1) {
    err(ctx, 'E007', 'SELECT must have at least one item');
  }

  // Subquery depth
  if (ctx.subqueryDepth > ctx.opts.maxSubqueryDepth) {
    err(
      ctx,
      'E030',
      `Subquery depth ${ctx.subqueryDepth} exceeds maximum ${ctx.opts.maxSubqueryDepth}`,
    );
  }

  // Source alias uniqueness
  checkSourceAliases(ctx, body);

  // Join references
  checkJoins(ctx, body);

  // Select alias uniqueness
  checkSelectAliases(ctx, body);

  // Source consistency
  checkSources(ctx, body);

  // GROUP BY / HAVING
  checkGroupByHaving(ctx, body);

  // Options
  checkOptions(ctx, body);

  // Union
  if (body.union && body.union.length > 0) {
    checkUnion(ctx, body);
  }

  // Union-part constraints: no orderBy / totals inside union parts
  if (isUnionPart) {
    if (body.orderBy && body.orderBy.length > 0) {
      err(ctx, 'E015', 'ORDER BY not allowed in UNION part');
    }
    if (body.totals) {
      err(ctx, 'E016', 'TOTALS not allowed in UNION part');
    }
  }

  // Temp table creation via intoTempTable
  if (body.intoTempTable) {
    const ttName = body.intoTempTable.name;
    const state = ctx.tempTables.get(ttName);
    if (state === 'created') {
      err(ctx, 'E022', `Double creation of temp table: ${ttName}`);
    } else {
      ctx.tempTables.set(ttName, 'created');
    }
  }

  // Temp table usage in sources
  if (body.sources) {
    for (const src of body.sources) {
      if (src.kind === 'tempTable' && src.tempTableName) {
        const state = ctx.tempTables.get(src.tempTableName);
        if (state === undefined) {
          err(
            ctx,
            'E023',
            `Temp table used before creation: ${src.tempTableName}`,
          );
        } else if (state === 'destroyed') {
          err(
            ctx,
            'E024',
            `Temp table used after DESTROY: ${src.tempTableName}`,
          );
        }
      }
    }
  }

  // Recurse into subquery sources
  if (body.sources) {
    for (const src of body.sources) {
      if (src.subquery) {
        ctx.subqueryDepth++;
        checkQueryBody(ctx, src.subquery, false);
        ctx.subqueryDepth--;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Source alias uniqueness
// ---------------------------------------------------------------------------

function checkSourceAliases(ctx: Ctx, body: QueryBody): void {
  if (!body.sources) return;
  const seen = new Set<string>();
  for (const src of body.sources) {
    if (seen.has(src.alias)) {
      err(ctx, 'E003', `Duplicate source alias: ${src.alias}`);
    }
    seen.add(src.alias);
  }
}

// ---------------------------------------------------------------------------
// Join references
// ---------------------------------------------------------------------------

function checkJoins(ctx: Ctx, body: QueryBody): void {
  if (!body.joins || !body.sources) return;
  const aliases = new Set(body.sources.map((s) => s.alias));
  for (const join of body.joins) {
    if (!aliases.has(join.leftAlias)) {
      err(ctx, 'E004', `Join references unknown alias: ${join.leftAlias}`);
    }
    if (!aliases.has(join.rightAlias)) {
      err(ctx, 'E004', `Join references unknown alias: ${join.rightAlias}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Select alias uniqueness
// ---------------------------------------------------------------------------

function checkSelectAliases(ctx: Ctx, body: QueryBody): void {
  if (!body.select) return;
  const seen = new Set<string>();
  for (const item of body.select) {
    if (item.kind === 'selectExpr' && item.alias) {
      if (seen.has(item.alias)) {
        err(ctx, 'E005', `Duplicate select alias: ${item.alias}`);
      }
      seen.add(item.alias);
    }
  }
}

// ---------------------------------------------------------------------------
// Source consistency
// ---------------------------------------------------------------------------

function checkSources(ctx: Ctx, body: QueryBody): void {
  if (!body.sources) return;
  for (const src of body.sources) {
    switch (src.kind) {
      case 'object':
        if (!src.object) {
          err(
            ctx,
            'E010',
            "Source with kind 'object' must have 'object' field",
          );
        }
        break;
      case 'virtual':
        if (!src.object) {
          err(
            ctx,
            'E011',
            "Source with kind 'virtual' must have 'object' field",
          );
        }
        break;
      case 'subquery':
        if (!src.subquery) {
          err(
            ctx,
            'E012',
            "Source with kind 'subquery' must have 'subquery' field",
          );
        }
        if (src.object) {
          err(
            ctx,
            'E012',
            "Source with kind 'subquery' must not have 'object' field",
          );
        }
        break;
      case 'tempTable':
        if (!src.tempTableName) {
          err(
            ctx,
            'E013',
            "Source with kind 'tempTable' must have 'tempTableName' field",
          );
        }
        if (src.object) {
          err(
            ctx,
            'E013',
            "Source with kind 'tempTable' must not have 'object' field",
          );
        }
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// GROUP BY / HAVING
// ---------------------------------------------------------------------------

function checkGroupByHaving(ctx: Ctx, body: QueryBody): void {
  const hasGroupBy = body.groupBy && body.groupBy.length > 0;

  // HAVING without GROUP BY
  if (body.having && !hasGroupBy) {
    err(ctx, 'E008', 'HAVING requires GROUP BY');
  }

  // SELECT * with GROUP BY
  if (hasGroupBy && body.select) {
    for (const item of body.select) {
      if (item.kind === 'wildcard') {
        err(ctx, 'E009', 'Wildcard SELECT not allowed with GROUP BY');
        break; // one error is enough
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

function checkOptions(ctx: Ctx, body: QueryBody): void {
  if (!body.options) return;

  // top > 0
  if (body.options.top !== undefined && body.options.top <= 0) {
    err(ctx, 'E017', 'TOP must be a positive integer');
  }

  // forUpdate.mode === 'specific' → tables non-empty, referencing existing aliases
  if (body.options.forUpdate && body.options.forUpdate.mode === 'specific') {
    const tables = body.options.forUpdate.tables;
    if (!tables || tables.length === 0) {
      err(
        ctx,
        'E018',
        "forUpdate mode 'specific' requires non-empty 'tables' array",
      );
    } else {
      const aliases = new Set((body.sources ?? []).map((s) => s.alias));
      for (const t of tables) {
        if (!aliases.has(t)) {
          err(
            ctx,
            'E019',
            `forUpdate references unknown source alias: ${t}`,
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// UNION
// ---------------------------------------------------------------------------

function checkUnion(ctx: Ctx, body: QueryBody): void {
  if (!body.union) return;
  const mainCount = countSelectItems(body.select);

  for (const u of body.union) {
    // Validate the union part body itself
    checkQueryBody(ctx, u.body, true);

    // Check select count consistency
    const partCount = countSelectItems(u.body.select);
    if (partCount !== mainCount) {
      err(
        ctx,
        'E014',
        `UNION parts have different select counts: ${mainCount} vs ${partCount}`,
      );
    }
  }
}

function countSelectItems(select: SelectItem[] | undefined): number {
  return select ? select.length : 0;
}
