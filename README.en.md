# 1C Query Constructor

**English** | [Русский](README.md)

A toolkit for parsing, analyzing, and generating 1C:Enterprise query language. Includes a zero-dependency core library, a CLI tool, and a VS Code extension.

## Features

- **Bilingual parser** — full support for Russian and English query syntax (`ВЫБРАТЬ`/`SELECT`, `ИЗ`/`FROM`, `ГДЕ`/`WHERE`, etc.)
- **Round-trip** — text -> model -> text without losing formatting or comments
- **Static analysis** — 6 built-in rules (SQA-001..SQA-006) for detecting common issues
- **Type inference** — automatic type resolution for expressions, functions, CASE, CAST
- **Structural validation** — 20+ QueryModel integrity invariants
- **CLI** — formatting, linting, and parsing from the command line
- **VS Code** — extension with syntax highlighting, diagnostics, and visual query builder

## Project Structure

```
1c-query-constructor/
├── packages/
│   ├── core/          @1c-query/core — parser, generator, analyzer, validator
│   ├── cli/           @1c-query/cli  — CLI tool (1c-query)
│   └── vscode/        @1c-query/vscode — VS Code extension
├── corpus/            Test query corpus (.1cquery)
│   ├── valid/         20 valid queries
│   ├── invalid/       3 invalid queries
│   └── edge-cases/    2 complex edge cases
└── docs/              Documentation and plans
```

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm

### Install

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

## CLI

```
1c-query <command> [options] <file>
```

| Command    | Description                             |
|------------|-----------------------------------------|
| `parse`    | Parse `.1cquery` file to QueryModel JSON|
| `validate` | Structural validation of a query        |
| `lint`     | Static analysis (SQA-001..SQA-006)      |
| `format`   | Canonical query formatting              |

**Options:**

- `--format json|text` — output format (default: `text`)
- `--lang RU|EN` — language for the `format` command (default: `RU`)

**Examples:**

```bash
# Parse a query to JSON
1c-query parse corpus/valid/001-simple-select.1cquery

# Lint with JSON output
1c-query lint --format json corpus/valid/005-group-by-aggregates.1cquery

# Format in English
1c-query format --lang EN corpus/valid/001-simple-select.1cquery
```

**Exit codes:** `0` — OK, `1` — warnings, `2` — errors.

## Core (@1c-query/core)

### Parsing

```typescript
import { parseQuery } from '@1c-query/core';

const result = parseQuery(`
  SELECT Products.Description AS Name
  FROM Catalog.Products AS Products
`);

console.log(result.model);        // QueryModel
console.log(result.diagnostics);   // Diagnostic[]
```

### Text Generation

```typescript
import { parseQuery, generateText } from '@1c-query/core';

const { model } = parseQuery('SELECT * FROM Catalog.Products AS T');

// Generate in Russian
console.log(generateText(model, { language: 'RU' }));

// Generate in English
console.log(generateText(model, { language: 'EN' }));
```

### Validation

```typescript
import { parseQuery, validate } from '@1c-query/core';

const { model } = parseQuery('...');
const diagnostics = validate(model);
// [{ severity: 'error', code: 'V003', message: '...' }]
```

### Static Analysis

```typescript
import { parseQuery, analyze, allRules } from '@1c-query/core';

const { model } = parseQuery('SELECT * FROM Catalog.Products AS T');
const warnings = analyze(model, allRules());
// [{ severity: 'warn', code: 'SQA-001', message: 'SELECT * hides column list' }]
```

### Utility Functions

```typescript
import {
  cloneModel,           // Deep clone a QueryModel
  walkQueryBodies,      // Traverse all QueryBody nodes (including nested)
  collectParameters,    // Collect all parameters (&Param)
  canonicalize,         // "Подстрока" → "SUBSTRING"
  localize,             // "SUBSTRING" → "ПОДСТРОКА"
  inferSelectTypes,     // Infer types for SELECT list
} from '@1c-query/core';
```

## Analysis Rules

| Code     | Description                                     |
|----------|-------------------------------------------------|
| SQA-001  | `SELECT *` hides column list                    |
| SQA-002  | Cartesian product (CROSS JOIN)                  |
| SQA-003  | Redundant JOIN (joined table not used)          |
| SQA-004  | GROUP BY / SELECT conflict                      |
| SQA-005  | Unused parameter                                |
| SQA-006  | Undefined parameter (referenced but not declared)|

## VS Code Extension

The extension adds support for `.1cquery` files:

- Syntax highlighting and bracket matching
- Commands: **Open Query Constructor**, **Parse Query to JSON**, **Format Query**
- Visual query builder (Custom Editor)
- Configurable sync debounce, undo stack size, Smart Joins

## Supported Syntax

The parser supports the full 1C query syntax:

- `SELECT` with `DISTINCT`, `TOP N`, `ALLOWED`
- `FROM` — catalogs, documents, registers, virtual tables with parameters
- `JOIN` — `LEFT`, `RIGHT`, `FULL`, `INNER`
- `WHERE` — comparisons, `IN`, `BETWEEN`, `LIKE`, `IS NULL`, `IN HIERARCHY`, `REFS`
- `GROUP BY`, `HAVING`
- `ORDER BY`, `AUTOORDER`
- `UNION` / `UNION ALL`
- `TOTALS` — `SUM`, `COUNT`, `MIN`, `MAX`, `AVG`
- `INTO` — temporary tables
- `DROP` — destroy temporary tables
- `CASE` / `WHEN` / `THEN` / `ELSE`, `CAST`
- Batch queries via `;`
- Subqueries in `WHERE`, `IN`, `EXISTS`

All keywords work in both Russian and English — the parser auto-detects the language from the first keyword.

## Technology Stack

- **Language:** TypeScript (strict mode)
- **Monorepo:** pnpm workspaces
- **Testing:** Vitest + fast-check (property-based)
- **Linter:** ESLint 9 + typescript-eslint
- **Parser:** Hand-written recursive descent, zero external dependencies
- **UI:** React 18 + VS Code Webview API

## Current Status

Phase 6 of 11 complete. Implemented: parser, validator, analyzer, type inference, generator, CLI, VS Code extension skeleton.

See [docs/PLAN.md](docs/PLAN.md) for the full roadmap.

## License

[MIT](LICENSE)
