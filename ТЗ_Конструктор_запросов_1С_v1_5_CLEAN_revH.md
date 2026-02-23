# ТЗ: Конструктор запросов 1С для VS Code  
## Версия 1.5 CLEAN rev.G (Production-ready)  
**Дата:** Февраль 2026  
**Статус:** Каноничная редакция для старта разработки

### Changelog rev.G (относительно rev.F)
- **BinaryExpr.op**: удалены `"%"` и `"||"` (не существуют в языке запросов 1С)
- **OrderByItem.nulls**: удалено (NULLS FIRST/LAST не поддерживается языком 1С)
- **QueryModelPatch**: добавлено определение (протокол WebView, §7.2)
- **§7 нумерация**: исправлена (7.1.5 inline вместо redirect на 7.5)
- **§16–17 приложения**: §16 переработан в Quick Reference Card, §17 удалён (дублировал §6)

### Changelog rev.E (относительно rev.D)
- **Парсер**: переход с ANTLR на hand-written recursive descent (TypeScript)
- **Грамматика**: fork `1c-syntax/bsl-parser` как read-only reference + CI-мониторинг изменений upstream
- **Trivia Strategy**: формализована (leading + trailing trivia), правила привязки и поведение при редактировании
- **Архитектура парсера**: лексер, парсер, AST-узлы с trivia, tolerant parsing — подробная схема
- **Spike**: обновлены acceptance criteria (без ANTLR runtime, bundle парсера ≤ 500 KB)
- **Структура**: детальная структура `/packages/core/src/parser/`

### Changelog rev.D (относительно rev.C)
- **Вкладка «Параметры»**: возвращена в MVP (P0) как полноценный редактор, не read-only витрина
- **ParameterSpec**: уточнена семантика полей `runtimeValue`, `manualType`, `usageLocations`
- **UI раздел 7**: добавлено подробное описание вкладки «Параметры» (7.1.5)
- **Spike**: добавлен пункт 0 — проверка грамматики языка запросов (выделение из BSL Parser)
- **Round-trip trivia**: добавлен ADR-002 как open question в раздел 5
- **AI**: зарезервирован text-first fallback (10.6)
- **Function Registry**: помечена как расширяемая, добавлены пропущенные функции
- **Benchmarks**: согласованы числа NFR и CI (12.1 / 13.4)
- **Структура репозитория**: добавлен раздел 3.4

### Changelog rev.C (относительно rev.B)
- **forUpdate**: разрешён конфликт 4.2 vs 15.2 — принят объектный формат `{ mode, tables? }`
- **Архитектура**: добавлен MetadataProvider interface (3.1) и AST-to-Model Mapper
- **Раздел 4.8**: семантические правила и edge cases интегрированы из бывшего раздела 15
- **UNION + orderBy**: формализовано — orderBy/totals только в корневом QueryBody
- **UNION + intoTempTable**: формализовано — применяется к объединённому результату
- **Temp table lifecycle**: добавлены правила порядка (до создания, после уничтожения)
- **Edge cases**: HAVING без GROUP BY, select.length ≥ 1, maxSubqueryDepth, Degraded Mode policy
- **Протокол WebView**: добавлена TypeScript-типизация
- **Настройки**: добавлена таблица настроек расширения

### Changelog rev.B (относительно CLEAN rev.A)
- **QueryModel**: `body`+`packet?` заменено на симметричный `queries: QueryBody[]`
- **QueryBody**: добавлен `options` (distinct, top, forUpdate, autoOrder)
- **QueryBody**: добавлен `union` (ОБЪЕДИНИТЬ / ОБЪЕДИНИТЬ ВСЕ)
- **Source**: добавлены kind `"subquery"` и `"tempTable"`, поле `subquery?: QueryBody`
- **SelectItem**: добавлена поддержка wildcard (`*`, `Таблица.*`)
- **BoolExpr**: добавлены `RefCheckExpr` (ССЫЛКА) и `InHierarchyExpr` (В ИЕРАРХИИ)
- **CompareExpr**: разделён на `CompareExpr`, `InExpr`, `BetweenExpr` для type safety
- **AggFunc**: добавлен флаг `distinct` для COUNT(РАЗЛИЧНЫЕ ...)
- **FuncCall**: canonical EN UPPER form для имён функций (маппинг RU↔EN)
- **Пакет**: добавлен `DestroyTempTable` (УНИЧТОЖИТЬ)
- **Инварианты**: добавлены правила для HAVING, union, options
- **meta.origin**: помечен как transient
- **Примеры**: обновлены под новую структуру, добавлен пример 4 (UNION + DISTINCT + ССЫЛКА)
- **JSON Schema**: помечен как генерируемый из TypeScript (мастер — TS)

---

# 1. Введение
## 1.1 Назначение
Документ определяет требования к расширению VS Code «Конструктор запросов 1С» версии 1.5 (production-ready).

## 1.2 Цели версии 1.5
- Задать **единую каноничную архитектуру**: Query Core Library + VS Code Extension + CLI.
- Формально определить **QueryModel** (TypeScript + JSON Schema) как Single Source of Truth.
- Зафиксировать **Decision Gate** по парсеру через Spike и ADR.
- Обеспечить MVP-функционал: визуальный конструктор (5 вкладок), базовый линтер, базовый CLI, AI Generate/Improve, Degraded Mode.

---

# 2. Scope версии 1.5
## 2.1 Входит
- Parser + tolerant parsing (partial AST)
- QueryModel + generator (round-trip)
- UI (MVP вкладки): Таблицы/Поля, Связи, Условия, Группировка, Параметры
- Static Query Analyzer (базовый набор правил)
- CLI: parse/validate/lint/format (минимальный)
- AI: Generate/Improve (AST-first)
- Degraded Mode + Error scenarios
- ADR-process + Corpus spec + Spike acceptance criteria

## 2.2 Не входит (перенос в 1.6+)
- Workspace Intelligence (SQLite индекс и графы по проекту)
- Полный Semantic Diff Engine (расширенный)
- Advanced Performance Intelligence (Online Explain Plan)
- Template Engine как библиотека шаблонов (кроме 1–2 MVP шаблонов при наличии времени)

---

# 3. Архитектура системы
## 3.1 Query Core Library (обязательный базовый слой)
Core не зависит от VS Code API и переиспользуется в CLI и Extension.
Состав:
- Parser + AST (+ trivia)
- **AST-to-Model Mapper** (AST → QueryModel, включая canonicalization имён функций)
- QueryModel (типизированный)
- Generator (QueryModel → text, с учётом trivia для round-trip)
- Validator (syntax/semantic)
- Type Inference Engine (MVP)
- Static Analyzer Engine (rules)
- Minimal semantic diff (internal support for AI preview)
- **Function Name Registry** (canonical ↔ RU ↔ EN mapping)
- **MetadataProvider** (abstract interface — контракт для внешних источников метаданных)

```ts
/** Abstract metadata contract. Core Library зависит ТОЛЬКО от этого интерфейса. */
export interface MetadataProvider {
  /** Получить список корневых типов (Справочники, Документы, Регистры...). */
  getRootTypes(): Promise<MetadataTypeGroup[]>;
  
  /** Получить объект метаданных по полному пути. */
  getObject(objectPath: string): Promise<MetadataObject | null>;
  
  /** Получить поля объекта (реквизиты, табличные части, стандартные реквизиты). */
  getFields(objectPath: string): Promise<MetadataField[]>;
  
  /** Получить виртуальные таблицы объекта (Остатки, Обороты и т.д.). */
  getVirtualTables(objectPath: string): Promise<VirtualTableInfo[]>;
  
  /** Проверить существование объекта. */
  exists(objectPath: string): Promise<boolean>;
}
```

Реализации MetadataProvider:
- **VSCodeMetadataProvider** (в Extension Layer): XML/MDO + Worker Threads + LRU-кэш + lazy loading + FileSystemWatcher
- **CLIMetadataProvider** (в CLI Layer): Context Pack (`.1cqueryctx`) или XML-выгрузка (синхронный)
- **NullMetadataProvider** (в Core): для Degraded Mode (все методы возвращают empty/null)

## 3.2 VS Code Extension Layer
- WebView UI (React) + Monaco Editor
- Команды VS Code, настройки, SecretStorage
- Интеграция с BSL LS (опционально)

## 3.3 CLI Layer
- Команды parse/validate/lint/format
- Exit codes и JSON output для CI
- Поддержка Context Pack (опционально в 1.5, обязательно в 1.6)

## 3.4 Структура репозитория (monorepo)
```
/packages
  /core              — Query Core Library (npm package, 0 VS Code deps)
  /vscode            — VS Code Extension (WebView UI, команды, настройки)
  /cli               — CLI tool (Node.js)
/schemas             — JSON Schema (автогенерация из TS)
/corpus              — тестовые запросы (/valid, /invalid, /edge-cases)
/docs
  /adr               — Architecture Decision Records
  /user-guide        — Quick Start, руководство пользователя
/spike               — Spike-прототип (grammar, benchmarks)
package.json         — workspace root (npm workspaces / pnpm workspaces)
tsconfig.base.json   — общая TS-конфигурация
```

Зависимости: `@1c-query/vscode` → `@1c-query/core`, `@1c-query/cli` → `@1c-query/core`. Core не имеет внешних runtime-зависимостей (парсер hand-written).

---

# 4. Модель данных: QueryModel (КРИТИЧЕСКИЙ РАЗДЕЛ)

## 4.1 Принципы
- QueryModel — **единственный источник истины** для UI/CLI/AI.
- QueryModel отделяет **семантику** от форматирования.
- Форматирование и trivia допускаются в `meta`, но не влияют на семантику.
- QueryModel версионируется (`version`) и поддерживает миграции.
- **Имена функций** хранятся в canonical (EN UPPER) форме. Маппинг RU↔EN — в Function Name Registry Core Library.
- **`meta.origin`** — transient-данные тулинга, не участвуют в сравнениях и семантическом diff.

## 4.2 TypeScript интерфейсы (v1.0)
```ts
// =============================================================================
// QueryModel v1.0 rev.B (v1.5 CLEAN)
// Мастер-определение. JSON Schema ГЕНЕРИРУЕТСЯ из этих типов автоматически.
// =============================================================================

export type QueryModelVersion = "1.0";

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface QueryModel {
  version: QueryModelVersion;

  /** Tooling metadata. Transient — does NOT affect semantics or comparison. */
  meta?: QueryMeta;

  /**
   * Ordered list of queries in the packet.
   * Single query: queries.length === 1.
   * Batch (пакетный запрос): queries.length > 1, separated by ";".
   */
  queries: QueryItem[];
}

/** A single item in the query packet: either a SELECT query or a DESTROY temp table. */
export type QueryItem =
  | QueryBody
  | DestroyTempTable;

/** УНИЧТОЖИТЬ <name> */
export interface DestroyTempTable {
  kind: "destroyTempTable";
  name: string;
}

// ---------------------------------------------------------------------------
// Meta (transient, tooling-only)
// ---------------------------------------------------------------------------

/** Additional info used by tooling; must NOT affect semantics. */
export interface QueryMeta {
  /** Original language of keywords: RU, EN, or MIXED. */
  language?: "RU" | "EN" | "MIXED";

  /**
   * Source file info for workspace indexing.
   * TRANSIENT: not used in semantic comparison or diff.
   */
  origin?: { uri?: string; lineStart?: number; lineEnd?: number };

  /** Formatting mode chosen by user. */
  formatting?: { mode: "preserve" | "canonical" };
}

// ---------------------------------------------------------------------------
// QueryBody — a single SELECT statement
// ---------------------------------------------------------------------------

/** A single query body (SELECT statement). */
export interface QueryBody {
  kind: "queryBody";

  /** Query-level options: РАЗЛИЧНЫЕ, ПЕРВЫЕ N, ДЛЯ ИЗМЕНЕНИЯ, АВТОУПОРЯДОЧИВАНИЕ. */
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

  /** Temporary table target: ПОМЕСТИТЬ <name> */
  intoTempTable?: TempTableSpec;

  /**
   * UNION support: ОБЪЕДИНИТЬ / ОБЪЕДИНИТЬ ВСЕ.
   * Each item unites with the current query in order.
   */
  union?: UnionItem[];
}

export interface QueryOptions {
  /** РАЗЛИЧНЫЕ / DISTINCT */
  distinct?: boolean;

  /** ПЕРВЫЕ N / TOP N */
  top?: number;

  /**
   * ДЛЯ ИЗМЕНЕНИЯ / FOR UPDATE.
   * mode="all" — all tables locked; mode="specific" — only listed tables.
   */
  forUpdate?: { mode: "all" | "specific"; tables?: string[] };

  /** АВТОУПОРЯДОЧИВАНИЕ / AUTOORDER */
  autoOrder?: boolean;
}

export interface UnionItem {
  body: QueryBody;
  /** false = ОБЪЕДИНИТЬ (removes duplicates), true = ОБЪЕДИНИТЬ ВСЕ (keeps all) */
  all: boolean;
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

export interface Source {
  /** Alias used in query, e.g., Номенклатура, Товары, Т1 */
  alias: string;

  /** Source kind. */
  kind: "object" | "virtual" | "subquery" | "tempTable";

  /**
   * 1C object path. Required for kind="object" and kind="virtual".
   * E.g. "Справочник.Номенклатура", "РегистрНакопления.ТоварыНаСкладах.Остатки"
   */
  object?: string;

  /** Subquery body. Required for kind="subquery". */
  subquery?: QueryBody;

  /** Temp table name. Required for kind="tempTable". */
  tempTableName?: string;

  /** Virtual table parameters (e.g., Остатки(&Период)). Only for kind="virtual". */
  virtualParams?: VirtualParam[];
}

export interface VirtualParam {
  name: string;           // e.g. "Период", "ПериодНачало"
  value: Expr;            // expression, including parameters &Период
}

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

export interface Join {
  leftAlias: string;
  rightAlias: string;

  type: "inner" | "left" | "right" | "full";

  on: BoolExpr;

  /** Optional: derived by SmartJoin scoring for explanation. Transient. */
  hint?: { score?: number; reason?: string };
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

/** A single item in SELECT clause. */
export type SelectItem = SelectExprItem | SelectWildcard;

export interface SelectExprItem {
  kind: "selectExpr";
  expr: Expr;
  alias?: string;
}

/** Represents SELECT * or SELECT Alias.* */
export interface SelectWildcard {
  kind: "wildcard";
  /** If set, represents Alias.* (e.g., Ном.*). If absent, represents *. */
  sourceAlias?: string;
}

// ---------------------------------------------------------------------------
// OrderBy
// ---------------------------------------------------------------------------

export interface OrderByItem {
  expr: Expr;
  direction?: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export interface TotalsSpec {
  by?: Expr[];                 // ИТОГИ ПО <expr,...>
  totals?: TotalAggItem[];     // ИТОГИ <agg,...>
}

export interface TotalAggItem {
  func: AggFunc;
  /** For COUNT(РАЗЛИЧНЫЕ expr) — set distinct: true. */
  distinct?: boolean;
  expr: Expr;
  alias?: string;
}

export type AggFunc = "SUM" | "AVG" | "MIN" | "MAX" | "COUNT";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface ParameterSpec {
  name: string;                 // "Период", without '&'
  inferredType?: TypeRef;       // inferred by Type Inference Engine
  /** Manual override of inferred type (set by user in Parameters tab). */
  manualType?: TypeRef;
  required?: boolean;
  /** Default value for tooling/testing (editable in Parameters tab). */
  defaultValue?: Literal;
  /**
   * Runtime value for Run Query (Этап 3).
   * Set by user in Parameters tab before executing query.
   * NOT serialized to exported QueryModel.
   */
  runtimeValue?: Literal;
  /** User-provided description/comment for the parameter. */
  description?: string;
  used?: boolean;               // tooling flag: true if parameter appears in query body
  source?: "manual" | "inferred";
  /** Number of usages in the query (computed by parser). */
  usageCount?: number;
  /** Locations where parameter is used (for "go to usage" in UI). */
  usageLocations?: { queryIndex: number; context: string }[];
}

// ---------------------------------------------------------------------------
// Temp Tables
// ---------------------------------------------------------------------------

export interface TempTableSpec {
  name: string;                 // name after ПОМЕСТИТЬ
  schema?: TempTableSchema;     // inferred schema (optional in MVP)
}

export interface TempTableSchema {
  columns: { name: string; type?: TypeRef; nullable?: boolean }[];
}

// ---------------------------------------------------------------------------
// Expressions (Expr)
// ---------------------------------------------------------------------------

/** Typed expression model (value-producing). */
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
  kind: "column";
  /** Optional alias prefix. If absent, resolver may infer from context. */
  sourceAlias?: string;
  name: string;
}

export interface ParamRef {
  kind: "param";
  name: string; // without '&'
}

export interface Literal {
  kind: "literal";
  litType: "string" | "number" | "bool" | "date" | "null";
  value: string | number | boolean | null;
}

export interface FuncCall {
  kind: "func";
  /**
   * Canonical (EN UPPER) function name: "SUBSTRING", "BEGINOFPERIOD", "ISNULL", etc.
   * Mapping from RU names (ПОДСТРОКА, НАЧАЛОПЕРИОДА, ЕСТЬNULL) is handled
   * by Function Name Registry in Core Library.
   */
  name: string;
  args: Expr[];
}

export interface CastExpr {
  kind: "cast";
  expr: Expr;
  toType: TypeRef;
}

export interface CaseExpr {
  kind: "case";
  branches: { when: BoolExpr; then: Expr }[];
  elseExpr?: Expr;
}

export interface SubqueryExpr {
  kind: "subquery";
  subquery: QueryBody;
}

/** Arithmetic binary expression. Concatenation of strings uses "+" (resolved by Type Inference). */
export interface BinaryExpr {
  kind: "bin";
  op: "+" | "-" | "*" | "/";
  left: Expr;
  right: Expr;
}

export interface UnaryExpr {
  kind: "un";
  op: "+" | "-";
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

/** Simple comparison: =, <>, >, >=, <, <=, LIKE */
export interface CompareExpr {
  kind: "cmp";
  op: "=" | "<>" | ">" | ">=" | "<" | "<=" | "like";
  left: Expr;
  right: Expr;
}

/** IN (...) or IN (subquery) */
export interface InExpr {
  kind: "in";
  expr: Expr;
  /** List of values or a single subquery. */
  values: Expr[] | QueryBody;
}

/** BETWEEN ... AND ... */
export interface BetweenExpr {
  kind: "between";
  expr: Expr;
  from: Expr;
  to: Expr;
}

/**
 * ССЫЛКА / REFS — type check operator specific to 1C query language.
 * Example: ГДЕ Регистратор ССЫЛКА Документ.Реализация
 */
export interface RefCheckExpr {
  kind: "refCheck";
  expr: Expr;
  /** 1C object type path, e.g. "Документ.РеализацияТоваровУслуг" */
  refType: string;
}

/**
 * В ИЕРАРХИИ / IN HIERARCHY — hierarchical query specific to 1C.
 * Example: ГДЕ Номенклатура В ИЕРАРХИИ (&Группа)
 */
export interface InHierarchyExpr {
  kind: "inHierarchy";
  expr: Expr;
  /** Value to check hierarchy against (typically a parameter or literal). */
  value: Expr;
}

export interface BoolGroup {
  kind: "boolGroup";
  op: "and" | "or";
  items: BoolExpr[];
}

export interface NotExpr {
  kind: "not";
  item: BoolExpr;
}

export interface ExistsExpr {
  kind: "exists";
  subquery: QueryBody;
}

// ---------------------------------------------------------------------------
// Type References (used by inference & validation)
// ---------------------------------------------------------------------------

export type TypeRef =
  | { kind: "primitive"; name: "string" | "number" | "bool" | "date" | "uuid" | "any" | "unknown" }
  | { kind: "ref"; object: string }   // e.g. "СправочникСсылка.Номенклатура"
  | { kind: "union"; items: TypeRef[] };
```

## 4.3 JSON Schema

> **ВАЖНО**: JSON Schema **генерируется автоматически** из TypeScript-интерфейсов (раздел 4.2) при помощи `ts-json-schema-generator` или аналогичного инструмента. TypeScript является мастером. Ручное редактирование JSON Schema запрещено.
>
> Сгенерированная schema публикуется в `/schemas/1c-querymodel-1.0.json` и используется:
> - AI-модулем для JSON Schema Validation (pipeline этап 1)
> - CLI для валидации экспортированных моделей
> - CI для regression-тестов

Команда генерации:
```bash
npx ts-json-schema-generator --path src/model/query-model.ts --type QueryModel -o schemas/1c-querymodel-1.0.json
```

CI-тест:
```bash
# Проверка что schema актуальна (нет drift)
npx ts-json-schema-generator --path src/model/query-model.ts --type QueryModel | diff - schemas/1c-querymodel-1.0.json
```

## 4.4 Правила версионирования и миграции
- `version` — строка (SemVer-like), старт: `"1.0"`.
- При изменении схемы:
  - backward-compatible расширения → minor (`1.1`)
  - breaking changes → major (`2.0`)
- Core обязан предоставлять:
  - `migrate(model: any): QueryModel` (последовательные миграции)
  - `validate(model: any): Diagnostic[]` (schema + semantic)

## 4.5 Нормализация имён функций (Function Name Registry)

Язык запросов 1С поддерживает двуязычные имена функций. Для обеспечения однозначности в QueryModel принята **EN UPPER canonical form**:

| RU (исходный код) | EN canonical (QueryModel) |
|---|---|
| ПОДСТРОКА | SUBSTRING |
| НАЧАЛОПЕРИОДА | BEGINOFPERIOD |
| КОНЕЦПЕРИОДА | ENDOFPERIOD |
| ДОБАВИТЬКДАТЕ | DATEADD |
| РАЗНОСТЬДАТ | DATEDIFF |
| ДАТАВРЕМЯ | DATETIME |
| ГОД | YEAR |
| КВАРТАЛ | QUARTER |
| МЕСЯЦ | MONTH |
| ДЕНЬГОДА | DAYOFYEAR |
| ДЕНЬ | DAY |
| НЕДЕЛЯ | WEEK |
| ДЕНЬНЕДЕЛИ | WEEKDAY |
| ЧАС | HOUR |
| МИНУТА | MINUTE |
| СЕКУНДА | SECOND |
| ВЫРАЗИТЬ | CAST |
| ЕСТЬNULL | ISNULL |
| ПРЕДСТАВЛЕНИЕ | PRESENTATION |
| ПРЕДСТАВЛЕНИЕССЫЛКИ | REFPRESENTATION |
| ТИПЗНАЧЕНИЯ | VALUETYPE |
| ТИП | TYPE |
| ЗНАЧЕНИЕ | VALUE |
| КОЛИЧЕСТВО | COUNT |
| СУММА | SUM |
| МИНИМУМ | MIN |
| МАКСИМУМ | MAX |
| СРЕДНЕЕ | AVG |

> **Расширяемость**: таблица не является исчерпывающей. Новые версии платформы 1С могут добавлять функции. Registry реализуется как data-driven mapping (JSON/TS map), а не hardcoded switch. При обновлении грамматики (см. процесс обновления в PRODUCTION-версии ТЗ) registry расширяется параллельно.

> **Ключевые слова vs функции**: операторы `ПОДОБНО` (LIKE), `ЕСТЬ NULL` (IS NULL), `ССЫЛКА` (REFS), `В ИЕРАРХИИ` (IN HIERARCHY), `В` (IN), `МЕЖДУ` (BETWEEN) — это **не функции**, а операторы. Они представлены отдельными узлами BoolExpr и не проходят через Function Name Registry. Двуязычность ключевых слов обрабатывается на уровне лексера парсера (таблица маппинга RU↔EN).

Core Library предоставляет:
- `canonicalize(name: string): string` — RU/EN в любом регистре → EN UPPER
- `localize(canonical: string, lang: "RU" | "EN"): string` — обратный маппинг для генерации текста
- Маппинг расширяется при обновлении грамматики (см. процесс обновления грамматики в PRODUCTION-версии ТЗ).

## 4.6 Примеры QueryModel

### Пример 1: простой SELECT + WHERE + параметр
```
ВЫБРАТЬ
  Ном.Ссылка КАК Номенклатура,
  Ном.Наименование КАК Наименование
ИЗ
  Справочник.Номенклатура КАК Ном
ГДЕ
  Ном.ЭтоГруппа = ЛОЖЬ
  И Ном.Наименование ПОДОБНО &Поиск
УПОРЯДОЧИТЬ ПО
  Ном.Наименование ВОЗР
```
```json
{
  "version": "1.0",
  "meta": {
    "language": "RU",
    "formatting": { "mode": "preserve" }
  },
  "queries": [
    {
      "kind": "queryBody",
      "sources": [
        { "alias": "Ном", "object": "Справочник.Номенклатура", "kind": "object" }
      ],
      "select": [
        {
          "kind": "selectExpr",
          "expr": { "kind": "column", "sourceAlias": "Ном", "name": "Ссылка" },
          "alias": "Номенклатура"
        },
        {
          "kind": "selectExpr",
          "expr": { "kind": "column", "sourceAlias": "Ном", "name": "Наименование" },
          "alias": "Наименование"
        }
      ],
      "where": {
        "kind": "boolGroup",
        "op": "and",
        "items": [
          {
            "kind": "cmp",
            "op": "=",
            "left": { "kind": "column", "sourceAlias": "Ном", "name": "ЭтоГруппа" },
            "right": { "kind": "literal", "litType": "bool", "value": false }
          },
          {
            "kind": "cmp",
            "op": "like",
            "left": { "kind": "column", "sourceAlias": "Ном", "name": "Наименование" },
            "right": { "kind": "param", "name": "Поиск" }
          }
        ]
      },
      "parameters": [
        { "name": "Поиск", "inferredType": { "kind": "primitive", "name": "string" }, "required": true, "source": "inferred" }
      ],
      "orderBy": [
        { "expr": { "kind": "column", "sourceAlias": "Ном", "name": "Наименование" }, "direction": "asc" }
      ]
    }
  ]
}
```

### Пример 2: виртуальная таблица регистра + JOIN + параметр периода
```
ВЫБРАТЬ
  Ост.Склад КАК Склад,
  Ном.Наименование КАК Номенклатура,
  Ост.КоличествоОстаток КАК Остаток
ИЗ
  РегистрНакопления.ТоварыНаСкладах.Остатки(&НаДату) КАК Ост
  ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Номенклатура КАК Ном
  ПО Ост.Номенклатура = Ном.Ссылка
ГДЕ
  Ост.КоличествоОстаток > 0
```
```json
{
  "version": "1.0",
  "meta": { "language": "RU", "formatting": { "mode": "canonical" } },
  "queries": [
    {
      "kind": "queryBody",
      "sources": [
        {
          "alias": "Ост",
          "object": "РегистрНакопления.ТоварыНаСкладах.Остатки",
          "kind": "virtual",
          "virtualParams": [
            { "name": "Период", "value": { "kind": "param", "name": "НаДату" } }
          ]
        },
        { "alias": "Ном", "object": "Справочник.Номенклатура", "kind": "object" }
      ],
      "joins": [
        {
          "leftAlias": "Ост",
          "rightAlias": "Ном",
          "type": "left",
          "on": {
            "kind": "cmp", "op": "=",
            "left": { "kind": "column", "sourceAlias": "Ост", "name": "Номенклатура" },
            "right": { "kind": "column", "sourceAlias": "Ном", "name": "Ссылка" }
          },
          "hint": { "score": 100, "reason": "FK match: Ост.Номенклатура → Ном.Ссылка" }
        }
      ],
      "select": [
        { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Ост", "name": "Склад" }, "alias": "Склад" },
        { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Ном", "name": "Наименование" }, "alias": "Номенклатура" },
        { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Ост", "name": "КоличествоОстаток" }, "alias": "Остаток" }
      ],
      "where": {
        "kind": "cmp", "op": ">",
        "left": { "kind": "column", "sourceAlias": "Ост", "name": "КоличествоОстаток" },
        "right": { "kind": "literal", "litType": "number", "value": 0 }
      },
      "parameters": [
        { "name": "НаДату", "inferredType": { "kind": "primitive", "name": "date" }, "required": true, "source": "manual" }
      ]
    }
  ]
}
```

### Пример 3: пакет запросов + временная таблица + УНИЧТОЖИТЬ
```
ВЫБРАТЬ Док.Ссылка КАК Документ, Док.Дата КАК Дата
ПОМЕСТИТЬ ВТ_Документы
ИЗ Документ.РеализацияТоваровУслуг КАК Док;

ВЫБРАТЬ КОЛИЧЕСТВО(ВТ.Документ) КАК КолВо
ИЗ ВТ_Документы КАК ВТ;

УНИЧТОЖИТЬ ВТ_Документы
```
```json
{
  "version": "1.0",
  "meta": { "language": "RU" },
  "queries": [
    {
      "kind": "queryBody",
      "sources": [
        { "alias": "Док", "object": "Документ.РеализацияТоваровУслуг", "kind": "object" }
      ],
      "select": [
        { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Док", "name": "Ссылка" }, "alias": "Документ" },
        { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Док", "name": "Дата" }, "alias": "Дата" }
      ],
      "intoTempTable": { "name": "ВТ_Документы" }
    },
    {
      "kind": "queryBody",
      "sources": [
        { "alias": "ВТ", "kind": "tempTable", "tempTableName": "ВТ_Документы" }
      ],
      "select": [
        {
          "kind": "selectExpr",
          "expr": { "kind": "func", "name": "COUNT", "args": [{ "kind": "column", "sourceAlias": "ВТ", "name": "Документ" }] },
          "alias": "КолВо"
        }
      ]
    },
    {
      "kind": "destroyTempTable",
      "name": "ВТ_Документы"
    }
  ]
}
```

### Пример 4: РАЗЛИЧНЫЕ + ОБЪЕДИНИТЬ ВСЕ + ССЫЛКА + В ИЕРАРХИИ + подзапрос в ИЗ
```
ВЫБРАТЬ РАЗЛИЧНЫЕ
  Движ.Регистратор КАК Документ,
  Движ.Номенклатура КАК Номенклатура
ИЗ
  РегистрНакопления.ТоварыНаСкладах КАК Движ
ГДЕ
  Движ.Регистратор ССЫЛКА Документ.РеализацияТоваровУслуг
  И Движ.Номенклатура В ИЕРАРХИИ (&ГруппаНоменклатуры)

ОБЪЕДИНИТЬ ВСЕ

ВЫБРАТЬ РАЗЛИЧНЫЕ
  Под.Ссылка,
  Под.Номенклатура
ИЗ
  (ВЫБРАТЬ Т.Ссылка, Т.Номенклатура ИЗ Документ.ПоступлениеТоваров.Товары КАК Т) КАК Под
```
```json
{
  "version": "1.0",
  "meta": { "language": "RU" },
  "queries": [
    {
      "kind": "queryBody",
      "options": { "distinct": true },
      "sources": [
        { "alias": "Движ", "object": "РегистрНакопления.ТоварыНаСкладах", "kind": "object" }
      ],
      "select": [
        { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Движ", "name": "Регистратор" }, "alias": "Документ" },
        { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Движ", "name": "Номенклатура" }, "alias": "Номенклатура" }
      ],
      "where": {
        "kind": "boolGroup",
        "op": "and",
        "items": [
          {
            "kind": "refCheck",
            "expr": { "kind": "column", "sourceAlias": "Движ", "name": "Регистратор" },
            "refType": "Документ.РеализацияТоваровУслуг"
          },
          {
            "kind": "inHierarchy",
            "expr": { "kind": "column", "sourceAlias": "Движ", "name": "Номенклатура" },
            "value": { "kind": "param", "name": "ГруппаНоменклатуры" }
          }
        ]
      },
      "parameters": [
        { "name": "ГруппаНоменклатуры", "inferredType": { "kind": "ref", "object": "СправочникСсылка.Номенклатура" }, "required": true, "source": "manual" }
      ],
      "union": [
        {
          "all": true,
          "body": {
            "kind": "queryBody",
            "options": { "distinct": true },
            "sources": [
              {
                "alias": "Под",
                "kind": "subquery",
                "subquery": {
                  "kind": "queryBody",
                  "sources": [
                    { "alias": "Т", "object": "Документ.ПоступлениеТоваров.Товары", "kind": "object" }
                  ],
                  "select": [
                    { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Т", "name": "Ссылка" } },
                    { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Т", "name": "Номенклатура" } }
                  ]
                }
              }
            ],
            "select": [
              { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Под", "name": "Ссылка" } },
              { "kind": "selectExpr", "expr": { "kind": "column", "sourceAlias": "Под", "name": "Номенклатура" } }
            ]
          }
        }
      ]
    }
  ]
}
```

## 4.7 Инварианты модели (для валидатора)

### Структурные инварианты
- `queries` содержит ≥ 1 элемент.
- Каждый `QueryBody` имеет `kind: "queryBody"`.
- Каждый `DestroyTempTable` имеет `kind: "destroyTempTable"`.
- Каждый `Source.alias` уникален в рамках `QueryBody`.
- `Join.leftAlias` и `Join.rightAlias` ссылаются на существующие `Source.alias`.
- `SelectItem.alias` (если задан) уникален в рамках `select`.
- `ParameterSpec.name` уникален в рамках всего пакета (`queries`).
- `select.length >= 1` (хотя бы одно поле выборки).

### Source consistency
- `kind: "object"` → `object` обязателен.
- `kind: "virtual"` → `object` обязателен, `virtualParams` допустимы.
- `kind: "subquery"` → `subquery` обязателен, `object` отсутствует.
- `kind: "tempTable"` → `tempTableName` обязателен, `object` отсутствует.

### GROUP BY / HAVING
- При наличии `groupBy`: каждый `SelectExprItem.expr` должен быть агрегатом или входить в `groupBy`. (MVP: warning, не error.)
- `having` допустим **только** при наличии `groupBy`. Иначе — **error**.
- Выражения в `having` могут ссылаться только на агрегатные функции или поля из `groupBy`.
- `SELECT *` (wildcard) при наличии `groupBy` — **error**.
- `SELECT Alias.*` при наличии `groupBy` — **error** в MVP (потенциально допустимо если все поля агрегированы, но это сложная проверка).

### UNION
- Все QueryBody в цепочке `union` должны иметь одинаковое количество `select` items. Несовпадение — **error**.
- Если типы колонок различаются между частями union — попытка построить `TypeRef.union`. Если несовместимы (primitive vs ref) — **error**.
- `orderBy` и `totals` разрешены **только** в корневом QueryBody (к которому прикреплён `union`). Они применяются к результату **после** всех union. В `union[].body` поля `orderBy` и `totals` должны быть `undefined` — иначе **error**.
- `options.top` применяется к каждому `QueryBody` независимо.
- `options.distinct` в каждой части union — обрабатывается независимо до объединения.
- Алиасы источников уникальны в рамках **одного** QueryBody, не всей цепочки union (каждая часть — свой scope).
- `intoTempTable` в QueryBody с `union` применяется к **объединённому результату**. Временная таблица создаётся один раз из финального результата.

### Options
- `options.top` — целое число > 0.
- `options.forUpdate.mode === "specific"` → `tables` обязателен, каждый элемент ссылается на существующий `Source.alias`.

### Temp table lifecycle
- Temp table может быть создана только через `intoTempTable`.
- Temp table доступна для чтения только в `queries[N]` где N > индекса запроса, создавшего её. Использование до создания — **error**.
- `DestroyTempTable`:
  - Должен ссылаться на существующую (ранее созданную и не уничтоженную) temp table.
  - Повторное уничтожение — **error**.
  - Уничтожение внутри subquery запрещено — **error**.
- Повторное создание temp table с тем же именем без уничтожения — **error**.
- Использование temp table после `DestroyTempTable` — **error**.
- Область видимости temp table — весь пакет (`queries`). Temp table из пакета доступна внутри subquery этого же пакета.
- `intoTempTable.name` валидируется по правилам 1С идентификаторов (латиница/кириллица/подчёркивание/цифры, начинается не с цифры).

### RefCheckExpr (ССЫЛКА)
- `refType` должен быть canonical 1C object path (например, `Документ.РеализацияТоваровУслуг`).
- Допустимы только прикладные объекты (Документ.*, Справочник.*, ПланВидовХарактеристик.* и т.д.).
- Проверяется существование в metadata (если доступна). Без metadata — **warn**.
- Результат выражения: `{ kind: "primitive", name: "bool" }`.

### InHierarchyExpr (В ИЕРАРХИИ)
- Результат: `{ kind: "primitive", name: "bool" }`.
- `expr` должен быть ссылочного типа (`TypeRef.ref`).
- `value` должен быть совместимым ссылочным типом.
- Несовместимость: **error** при наличии metadata, **warn** в degraded mode.

### Subquery depth
- Soft limit: `maxSubqueryDepth` (по умолчанию 5). При превышении — **warn**.
- Применяется рекурсивно: Source.subquery, InExpr.values (QueryBody), ExistsExpr, SubqueryExpr.

## 4.8 Error vs Warning Policy (Degraded Mode Mapping)

| Ситуация | С метаданными | Без метаданных |
|---|---|---|
| Нарушение структуры модели | error | error |
| GROUP BY conflict | error | warn (если inference = unknown) |
| HAVING без GROUP BY | error | error |
| SELECT * | warn | warn |
| Несовместимые типы в UNION | error | info |
| RefCheck на несуществующий тип | error | warn |
| InHierarchy на не-ссылочный тип | error | warn |
| Inference fallback (unknown) | — | info |
| Temp table used before creation | error | error |
| Temp table used after destroy | error | error |
| Subquery depth > limit | warn | warn |

---

# 5. Парсер

## 5.1 Решение: Hand-written Recursive Descent

В v1.5 принято решение **отказаться от ANTLR** в пользу hand-written recursive descent парсера на TypeScript.

**Обоснование:**

| Критерий | ANTLR (генерируемый) | Hand-written |
|---|---|---|
| Bundle size | +200–500 KB (runtime) | 0 внешних зависимостей |
| Tolerant parsing | Требует настройки error recovery | Нативный контроль: парсер сам решает, что пропустить и где продолжить |
| Trivia (комментарии, пробелы) | Hidden channel + нетривиальная привязка | Нативный: лексер собирает trivia и привязывает к узлам при создании |
| Отладка | Сгенерированный код, stack trace через visitor/listener | Обычный TypeScript, стандартная отладка |
| CI/Build | Требует генерации (Java toolchain или antlr-ng) | Только TypeScript, ничего не генерируется |
| Двуязычность (RU/EN) | Описывается в .g4, но удваивает грамматику | Таблица маппинга ключевых слов в лексере |
| Обновление грамматики | Правка .g4 + регенерация | Правка кода парсера |
| Примеры в индустрии | ANTLR-based SQL парсеры | TypeScript compiler, Babel, Prettier, ESLint — все hand-written |

**Язык запросов 1С** достаточно компактен для hand-written подхода: ~20 конструкций верхнего уровня, предсказуемая грамматика без контекстно-зависимых неоднозначностей, LL(1) в большинстве правил (один-два токена lookahead).

## 5.2 Грамматика BSL Parser как спецификация (fork-based мониторинг)

Грамматика из проекта `1c-syntax/bsl-parser` (ANTLR .g4) используется **не для генерации кода**, а как верифицированная сообществом спецификация языка.

### Схема использования:

```
┌──────────────────────────────┐
│  1c-syntax/bsl-parser        │  ← upstream (ANTLR .g4)
│  (community-maintained)      │
└──────────────┬───────────────┘
               │ GitHub fork
               ▼
┌──────────────────────────────┐
│  1c-query/bsl-grammar-ref    │  ← fork (read-only reference)
│                              │
│  CI:                         │
│  - sync upstream weekly      │
│  - diff → detect changes     │
│  - create issue on change    │
└──────────────┬───────────────┘
               │ manual review
               ▼
┌──────────────────────────────┐
│  @1c-query/core              │  ← hand-written parser
│  /src/parser/                │     обновляется вручную
└──────────────────────────────┘
```

### CI-автоматизация форка:

```yaml
# .github/workflows/grammar-sync.yml (в форке bsl-grammar-ref)
name: Grammar Sync
on:
  schedule:
    - cron: '0 8 * * 1'  # каждый понедельник
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Fetch upstream
        run: |
          git remote add upstream https://github.com/1c-syntax/bsl-parser.git
          git fetch upstream main
      - name: Check for grammar changes
        id: diff
        run: |
          DIFF=$(git diff HEAD..upstream/main -- "*.g4" | head -500)
          if [ -n "$DIFF" ]; then
            echo "changed=true" >> $GITHUB_OUTPUT
            echo "$DIFF" > grammar-diff.txt
          fi
      - name: Create issue on change
        if: steps.diff.outputs.changed == 'true'
        uses: JasonEtco/create-an-issue@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          filename: .github/GRAMMAR_UPDATE_TEMPLATE.md
```

### Что мониторится:
- Изменения в `.g4` файлах грамматики (новые ключевые слова, конструкции)
- Release notes 1c-syntax/bsl-parser
- Соответствие: каждая конструкция в .g4 должна иметь аналог в hand-written парсере

### Процесс обновления при изменении upstream:
1. CI форка создаёт issue «Grammar updated: [diff summary]».
2. Разработчик анализирует diff: новая конструкция или исправление?
3. Обновляет hand-written парсер + добавляет тесты в corpus.
4. Обновляет QueryModel (если нужны новые узлы).
5. Прогоняет corpus-тесты, проверяет round-trip.

## 5.3 Архитектура парсера

```
┌────────────────────────────────────────────────────────────────┐
│  Input: query text (string)                                    │
│                                                                │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────────┐ │
│  │  Lexer   │───>│  Token       │───>│  Parser               │ │
│  │          │    │  Stream      │    │  (recursive descent)  │ │
│  │ - RU/EN  │    │  + trivia    │    │  - tolerant mode      │ │
│  │   keywords│    │  attachment  │    │  - error recovery     │ │
│  │ - literals│    │              │    │  - partial AST        │ │
│  └──────────┘    └──────────────┘    └───────────┬───────────┘ │
│                                                  │             │
│                                          ┌───────▼───────────┐ │
│                                          │  CST / AST        │ │
│                                          │  + leadingTrivia   │ │
│                                          │  + trailingTrivia  │ │
│                                          │  + source ranges   │ │
│                                          └───────┬───────────┘ │
│                                                  │             │
│                                          ┌───────▼───────────┐ │
│                                          │  AST-to-Model     │ │
│                                          │  Mapper            │ │
│                                          │  - canonicalization│ │
│                                          │  - param detection │ │
│                                          └───────┬───────────┘ │
│                                                  │             │
│                                          ┌───────▼───────────┐ │
│                                          │  QueryModel       │ │
│                                          └───────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Лексер (Tokenizer)
- Таблица ключевых слов RU↔EN (ВЫБРАТЬ/SELECT, ИЗ/FROM, ГДЕ/WHERE...).
- Автоопределение языка по первому ключевому слову.
- Токены: keyword, identifier, literal (string, number, date), operator, punctuation, parameter (&Name), comment, whitespace.
- Trivia (комментарии + whitespace) собирается в отдельный массив и привязывается к следующему значимому токену (leading trivia).

### Парсер (Recursive Descent)
- Каждая конструкция языка — отдельная функция: `parseQuery()`, `parseSelect()`, `parseFrom()`, `parseJoin()`, `parseWhere()`, `parseGroupBy()`, и т.д.
- **Tolerant parsing**: при ошибке парсер записывает `Diagnostic`, пропускает токены до следующей известной конструкции (`;`, `)`, ключевое слово), и продолжает.
- Результат: AST + массив `Diagnostic[]`.
- Partial AST: даже при ошибках возвращается дерево с `ErrorNode` в местах ошибок.

### AST-узлы с trivia и source ranges
```ts
interface AstNode {
  type: AstNodeType;
  /** Source range for error reporting and navigation. */
  range: { start: number; end: number; line: number; col: number };
  /** Leading trivia: comments and whitespace BEFORE this node. */
  leadingTrivia?: TriviaItem[];
  /** Trailing trivia: inline comment AFTER this node on same line. */
  trailingTrivia?: TriviaItem[];
  children: AstNode[];
}

interface TriviaItem {
  kind: "comment" | "whitespace" | "newline";
  text: string;
  range: { start: number; end: number };
}
```

## 5.4 Триvia Strategy (ADR-002)

### Правила привязки:
- **Leading trivia**: все комментарии и пробелы **перед** токеном привязываются к нему как `leadingTrivia`.
- **Trailing trivia**: inline-комментарий **после** токена на той же строке (`Поле1, // важное поле`) привязывается как `trailingTrivia` к предшествующему токену.
- **Правило пустой строки**: если между trailing trivia предыдущего узла и следующим узлом есть пустая строка — trivia после пустой строки считается leading trivia следующего узла.

### Поведение при редактировании через визуальный конструктор:
- **Удаление узла**: leading trivia переносится к следующему узлу. Trailing trivia удаляется.
- **Добавление узла**: новый узел создаётся без trivia.
- **Перемещение узла (drag-and-drop)**: trivia перемещается вместе с узлом.

### Генерация текста (round-trip):
- Generator обходит AST и выводит: leading trivia → текст узла → trailing trivia.
- В режиме `preserve`: используется оригинальный whitespace.
- В режиме `canonical`: trivia-комментарии сохраняются, whitespace заменяется стандартным форматированием.

## 5.5 Spike Acceptance Criteria

0. **Лексер**: корректно токенизирует RU и EN ключевые слова, литералы, параметры, комментарии.
1. **Парсер**: покрывает ≥ 95% corpus (≥ 300 реальных запросов).
2. **Tolerant parsing**: partial AST при ошибке, без crash.
3. **Trivia**: комментарии сохраняются через round-trip на ≥ 90% corpus-запросов с комментариями.
4. **Производительность**: cold parse 500 строк ≤ 200 мс (согласовано с NFR 12.1).
5. **Memory**: ≤ 150 MB при нагрузочном тесте.
6. **Bundle**: парсер (без внешних runtime) ≤ 500 KB minified.

По результатам Spike оформляются:
- **ADR-001**: подтверждение hand-written подхода (или откат к ANTLR если Spike провален)
- **ADR-002**: финализация trivia strategy

## 5.6 Временная фиксация
```
Parser: Hand-written recursive descent (TypeScript)
Grammar reference: fork of 1c-syntax/bsl-parser (.g4 as spec)
Target Node version: 18+
Bundler: esbuild
TypeScript strict mode: enabled
```

## 5.7 Структура парсера в репозитории

```
/packages/core/src/parser/
  /lexer/
    tokenizer.ts       — main tokenizer
    keywords.ts        — RU↔EN keyword table
    token-types.ts     — token type enum
  /parser/
    parser.ts          — recursive descent entry point
    parse-select.ts    — SELECT clause
    parse-from.ts      — FROM + JOIN
    parse-where.ts     — WHERE / HAVING
    parse-expressions.ts — expressions, conditions, functions
    parse-union.ts     — UNION
    parse-packet.ts    — batch queries, temp tables
    error-recovery.ts  — tolerant parsing strategies
  /ast/
    ast-types.ts       — AST node types
    trivia.ts          — trivia attachment logic
    source-range.ts    — position tracking
  /mapper/
    ast-to-model.ts    — AST → QueryModel conversion
    canonicalize.ts    — RU→EN function name mapping
  /generator/
    model-to-text.ts   — QueryModel → text
    formatter.ts       — canonical formatting
    trivia-emitter.ts  — trivia preservation in output
```

---

# 6. Type Inference Engine (MVP)

## 6.1 Назначение
Статический вывод типов выражений и полей для обеспечения подсказок, валидации и корректной семантики в пакетных запросах (временные таблицы).

## 6.2 Правила вывода (MVP)

| Выражение | Правило вывода типа |
|---|---|
| `ColumnRef` | Тип берётся из метаданных Source (object → metadata, tempTable → inferred schema) |
| `ParamRef` | Выводится из контекста сравнения (если `&Период = Дата` → date) |
| `Literal` | По `litType` |
| `FuncCall(SUM, expr)` | → number |
| `FuncCall(COUNT, expr)` | → number |
| `FuncCall(MIN/MAX, expr)` | → typeof(expr) |
| `FuncCall(AVG, expr)` | → number |
| `FuncCall(ISNULL, expr, default)` | → typeof(expr) ∪ typeof(default) |
| `FuncCall(SUBSTRING, ...)` | → string |
| `FuncCall(YEAR/MONTH/DAY/..., expr)` | → number |
| `FuncCall(BEGINOFPERIOD/ENDOFPERIOD, ...)` | → date |
| `CastExpr(expr, toType)` | → toType |
| `CaseExpr` | → union(typeof(then₁), typeof(then₂), ..., typeof(else)) |
| `BinaryExpr(+/-/*//, ...)` | → number (для арифметики), string (для конкатенации) |

## 6.3 Вывод типов временных таблиц
При обработке `intoTempTable`:
- Имена колонок берутся из `select[].alias` (или `select[].expr.name` для ColumnRef без alias).
- Типы берутся из Type Inference для каждого `select[].expr`.
- Результат записывается в `TempTableSchema` и доступен последующим запросам пакета.

## 6.4 Стратегия Unknown
Если тип не выводим — присваивается `{ kind: "primitive", name: "unknown" }` + диагностика `info`.

---

# 7. UI (MVP)

## 7.1 Вкладки MVP
| Вкладка | Содержимое | Приоритет |
|---|---|---|
| Таблицы и поля | Дерево метаданных, выбор таблиц, полей, псевдонимов, drag-and-drop | P0 |
| Связи | Тип JOIN, условие, Smart Join подсказки | P0 |
| Условия | Дерево И/ИЛИ/НЕ, операторы, параметры | P0 |
| Группировка | Поля группировки, автоопределение агрегатов | P0 |
| Параметры | Обнаружение, типизация, редактирование, заполнение значений (см. 7.1.5) | P0 |

### 7.1.5 Вкладка «Параметры» (подробно)

Вкладка «Параметры» — **полноценный редактор**, а не read-only витрина. Это ключевой инструмент для работы с параметризованными запросами (а параметры есть практически в каждом реальном запросе 1С).

#### Автоматическое обнаружение (read-only часть)
- Парсер автоматически обнаруживает все `&Параметр` в тексте запроса.
- Type Inference выводит тип из контекста использования (например, `&Период` в сравнении с полем типа `Дата` → тип `date`).
- Для каждого параметра показывается: количество использований, контекст использования (в каком условии/поле).
- Предупреждения: неиспользуемые параметры (определены, но не встречаются в запросе), параметры без определения (встречаются в запросе, но не были добавлены сознательно).

#### Редактирование (MVP)
| Действие | Описание | Влияние на QueryModel |
|---|---|---|
| **Переименовать** | Изменение имени параметра. Обновляет **все** вхождения `&СтароеИмя` → `&НовоеИмя` в запросе. | Обновление `name` во всех `ParamRef` + `ParameterSpec` |
| **Задать тип вручную** | Если inference ошибся или тип не выводим — разработчик указывает тип. | Запись в `manualType` (приоритет над `inferredType`) |
| **Задать значение по умолчанию** | Значение для тестирования и для подсказки потребителю запроса. | Запись в `defaultValue` |
| **Пометить обязательным** | Флаг обязательности. Влияет на валидацию. | Запись в `required` |
| **Добавить описание** | Текстовый комментарий к параметру. | Запись в `description` |
| **Удалить неиспользуемый** | Удаление параметра, который не встречается в теле запроса. | Удаление из `parameters[]` |
| **Перейти к месту использования** | Клик → фокус на соответствующее место в текстовом/визуальном редакторе. | — (навигация) |

#### Run Query integration (Этап 3)
| Действие | Описание |
|---|---|
| **Заполнить значение для выполнения** | Перед Run Query разработчик заполняет `runtimeValue` для каждого обязательного параметра. |
| **Быстрый выбор из метаданных** | Для ссылочных типов — выбор значения из списка объектов (через MCP или Connection Manager). |
| **Сохранить набор значений** | Набор значений параметров сохраняется локально для повторного использования (аналогично Postman). |
| **Валидация перед выполнением** | Проверка: все обязательные параметры заполнены, типы совместимы. |

#### Макет
```
┌─────────────────────────────────────────────────────────────────┐
│ Параметры запроса                              [+ Добавить]     │
├──────────┬──────────┬──────────┬───────────┬──────────┬─────────┤
│ Имя      │ Тип      │ По умолч.│ Обяз.     │ Исп-й    │         │
├──────────┼──────────┼──────────┼───────────┼──────────┼─────────┤
│ &Период  │ Дата  [▼]│ 01.01.26 │ ☑         │ 3        │ [✎][🗑] │
│ &Склад   │ Спр.Скл↗│          │ ☐         │ 1        │ [✎][🗑] │
│ &Поиск   │ Строка   │ "%"      │ ☐         │ 2        │ [✎][🗑] │
├──────────┴──────────┴──────────┴───────────┴──────────┴─────────┤
│ ⚠ Параметр &Фильтр определён, но не используется в запросе     │
└─────────────────────────────────────────────────────────────────┘
```

## 7.2 Протокол WebView ↔ Extension Host
Взаимодействие через postMessage API. Парсер — только в Extension Host.

| Сообщение | Направление | Описание |
|---|---|---|
| init | Host → WebView | metadata + queryModel + settings |
| parseText | WebView → Host | Запрос парсинга текста |
| parseResult | Host → WebView | QueryModel + Diagnostic[] |
| applyPatch | WebView → Host | Изменение из визуального конструктора |
| modelUpdated | Host → WebView | Обновлённая модель + текст |
| diagnostics | Host → WebView | Ошибки и предупреждения |
| requestMetadata | WebView → Host | Lazy load узла метаданных |
| metadataLoaded | Host → WebView | Дочерние узлы |
| insertToEditor | WebView → Host | Вставка текста в VS Code |

TypeScript-типизация протокола:
```ts
/** Messages from Extension Host → WebView */
export type HostToWebViewMessage =
  | { type: "init"; model: QueryModel; metadata: MetadataTree; settings: ExtensionSettings }
  | { type: "parseResult"; model: QueryModel; diagnostics: Diagnostic[] }
  | { type: "modelUpdated"; model: QueryModel; text: string }
  | { type: "diagnostics"; diagnostics: Diagnostic[] }
  | { type: "metadataLoaded"; parentPath: string; children: MetadataNode[] };

/** Messages from WebView → Extension Host */
export type WebViewToHostMessage =
  | { type: "parseText"; text: string }
  | { type: "applyPatch"; patch: QueryModelPatch }
  | { type: "requestMetadata"; parentPath: string }
  | { type: "insertToEditor"; text: string; mode: "insert" | "replace" | "clipboard" };

/** Incremental update from visual constructor to QueryModel. */
export type QueryModelPatch =
  | { op: "addSource"; queryIndex: number; source: Source }
  | { op: "removeSource"; queryIndex: number; alias: string }
  | { op: "updateSource"; queryIndex: number; alias: string; changes: Partial<Source> }
  | { op: "addJoin"; queryIndex: number; join: Join }
  | { op: "removeJoin"; queryIndex: number; leftAlias: string; rightAlias: string }
  | { op: "updateJoin"; queryIndex: number; leftAlias: string; rightAlias: string; changes: Partial<Join> }
  | { op: "addSelectItem"; queryIndex: number; item: SelectItem; position?: number }
  | { op: "removeSelectItem"; queryIndex: number; index: number }
  | { op: "updateSelectItem"; queryIndex: number; index: number; item: SelectItem }
  | { op: "reorderSelectItems"; queryIndex: number; fromIndex: number; toIndex: number }
  | { op: "updateWhere"; queryIndex: number; where: BoolExpr | null }
  | { op: "updateGroupBy"; queryIndex: number; groupBy: Expr[] | null }
  | { op: "updateHaving"; queryIndex: number; having: BoolExpr | null }
  | { op: "updateOptions"; queryIndex: number; options: Partial<QueryOptions> }
  | { op: "renameParameter"; oldName: string; newName: string }
  | { op: "updateParameter"; name: string; changes: Partial<ParameterSpec> }
  | { op: "removeParameter"; name: string };
```

## 7.3 Синхронизация состояния
- Debounce: парсинг через 300 мс после последнего изменения (настраивается).
- Dirty state + commit после парсинга.
- Undo/Redo: стек до 50 состояний.
- Conflict resolution: приоритет последнего действия пользователя.

## 7.4 Degraded Mode
| Сценарий | Поведение |
|---|---|
| Без метаданных | Парсинг и форматирование работают. Smart Joins и Type Inference отключены. |
| Без AI | Визуальный конструктор и линтер работают полностью. |
| Без BSL LS | Контекстная навигация отключена. Расширение не падает. |
| Без подключения к серверу 1С | Run Query и Online Explain недоступны. Статические функции работают. |
| Corrupt/partial metadata | Доступные объекты загружаются, недоступные — пропускаются с warning. |
| Memory limit (>512 MB) | Предупреждение пользователю, принудительная очистка LRU-кэшей. |

---

# 8. Static Query Analyzer (MVP)

## 8.1 Rule Model
```ts
interface QueryRule {
  id: string;
  title: string;
  description: string;
  severity: "info" | "warn" | "error";
  evaluate(model: QueryBody, ctx: AnalyzerContext): Diagnostic[];
}
```

## 8.2 Базовые правила MVP
| ID | Правило | Severity |
|---|---|---|
| SQA-001 | SELECT * (wildcard) | warn |
| SQA-002 | CROSS JOIN (нет условия) | warn |
| SQA-003 | Redundant JOIN (таблица не используется в select/where) | warn |
| SQA-004 | GROUP BY conflict (поле без агрегата) | error |
| SQA-005 | Неиспользуемый параметр | info |
| SQA-006 | Параметр без определения | warn |

## 8.3 Конфигурация
Файл `.querylintrc.json` в корне проекта:
```json
{
  "rules": {
    "SQA-001": "warn",
    "SQA-002": "error",
    "SQA-003": "off"
  }
}
```

---

# 9. CLI (MVP)

## 9.1 Команды
| Команда | Описание |
|---|---|
| `1c-query parse <file>` | Парсинг → вывод QueryModel JSON |
| `1c-query validate <file>` | Синтаксическая + семантическая валидация |
| `1c-query lint <file>` | Запуск Static Analyzer |
| `1c-query format <file>` | Canonical formatting |

## 9.2 Exit Codes
- 0 — OK
- 1 — Warnings (при `--fail-on-warnings`)
- 2 — Errors

## 9.3 Output
- `--format json` — JSON для CI
- `--format text` — человекочитаемый (по умолчанию)

---

# 10. AI (MVP)

## 10.1 Принцип: AST-first
LLM генерирует JSON в формате QueryModel, не сырой текст запроса.

**Fallback: text-first**. Если LLM не может сгенерировать валидный QueryModel JSON (например, из-за сложности модели или ограничений контекстного окна), допускается fallback-режим:
1. LLM генерирует текст запроса на языке запросов 1С.
2. Текст проходит через Parser → QueryModel.
3. Валидация QueryModel по стандартному pipeline (10.2).

Выбор стратегии (AST-first vs text-first) определяется AI Service на основе сложности запроса и доступного контекстного окна. AST-first остаётся приоритетным для простых и средних запросов.

## 10.2 Pipeline валидации
1. JSON Schema Validation (автоматически сгенерированная schema)
2. Metadata Validation (существование таблиц/полей)
3. Semantic Validation (типы, совместимость JOIN, GROUP BY)

## 10.3 Режимы MVP
| Режим | Вход | Выход |
|---|---|---|
| Generate | Текст на рус/англ + метаданные | QueryModel JSON |
| Improve | Существующий QueryModel | Улучшенный QueryModel |

Режимы Explain и Refactor запланированы на Этап 3 (раздел 14).

## 10.4 Threat Model (AI-specific)
| Угроза | Митигация |
|---|---|
| Prompt injection через имена метаданных | Sanitization: имена метаданных проходят whitelist (alphanum + кириллица + подчёркивание) |
| Утечка конфиденциальных данных | ai.maskLiterals=true, ai.metadata.excludePatterns, AI отключён по умолчанию |
| Невалидный JSON от LLM | Трёхэтапная валидация (10.2), fallback с сообщением пользователю |
| Hallucination (несуществующие таблицы/поля) | Metadata Validation (этап 2) отсеивает несуществующие объекты |

## 10.5 Confidence Scoring
AI-ответ сопровождается `confidence: number (0–100)`. Механизм: LLM генерирует score в отдельном поле JSON-ответа как self-assessment. Ниже порога `ai.minConfidence` (по умолчанию 60) — предупреждение пользователю «AI не уверен в результате, проверьте вручную».

> **Ограничение**: self-assessment LLM не является объективной метрикой. В будущих версиях (1.6+) рассматривается валидационный scoring на основе результатов Metadata Validation.

---

# 11. Настройки расширения

Все настройки доступны через VS Code Settings с префиксом `1cQueryConstructor`:

| Настройка | Тип / Умолчание | Описание |
|---|---|---|
| `preserveFormatting` | boolean / true | Сохранять авторское форматирование |
| `formattingMode` | enum / preserve | preserve \| canonical |
| `metadata.source` | enum / auto | auto \| xml \| mdo \| mcp |
| `metadata.cachePath` | string / .vscode/1c-query-cache | Путь к кэшу |
| `metadata.autoRefresh` | boolean / true | Автообновление при изменении файлов |
| `sync.debounceMs` | number / 300 | Задержка парсинга (мс) |
| `sync.undoStackSize` | number / 50 | Размер стека Undo/Redo |
| `ai.enabled` | boolean / false | Включить AI-модуль |
| `ai.provider` | enum / anthropic | anthropic \| openai \| local |
| `ai.localEndpoint` | string / http://localhost:11434 | Адрес локального LLM |
| `ai.maxTokens` | number / 4096 | Максимальный размер контекста |
| `ai.maskLiterals` | boolean / true | Маскировать литералы в промптах |
| `ai.minConfidence` | number / 60 | Минимальный порог уверенности AI |
| `ai.rateLimitPerMinute` | number / 10 | Лимит AI-запросов в минуту |
| `ai.metadata.excludePatterns` | string[] / [Secret,Salary,Password] | Исключение таблиц из промпта |
| `performance.workerThreads` | number / 2 | Worker Threads для метаданных |
| `performance.maxMetadataObjects` | number / 50000 | Лимит объектов (OOM защита) |
| `performance.astCacheSize` | number / 20 | LRU-кэш AST |
| `performance.maxParallelParsing` | number / 3 | Параллельные парсинги |
| `smartJoins.enabled` | boolean / true | Авто-предложение связей |
| `smartJoins.minScore` | number / 40 | Минимальный score |
| `logging.level` | enum / info | debug \| info \| warn \| error |
| `security.mcp.allowedEndpoints` | string[] / [] | Белый список MCP-серверов |
| `security.connectionTimeoutMs` | number / 30000 | Таймаут подключений |

---

# 12. Нефункциональные требования

## 12.1 Производительность
- Открытие конструктора: ≤ 1 с (с кэшированными метаданными)
- Парсинг запроса до 500 строк: ≤ 200 мс
- Генерация текста из QueryModel: ≤ 100 мс
- Загрузка метаданных (10 000 объектов): ≤ 5 с (cold), ≤ 500 мс (warm)

## 12.2 Совместимость
| Параметр | Требование |
|---|---|
| VS Code | ≥ 1.85.0 |
| Node.js | ≥ 18.x |
| Платформа 1С | 8.3.10+ (базовая), 8.3.15+ (полная) |
| ОС | Windows 10+, macOS 12+, Linux (Ubuntu 20.04+) |
| BSL Language Server | ≥ 0.20.0 (опционально) |

## 12.3 Безопасность
- AI-модуль отключён по умолчанию.
- Данные не передаются на внешние серверы без явного согласия.
- Workspace Trust: ограниченный режим (только просмотр, без AI/MCP).
- Run Query: только ВЫБРАТЬ, read-only, таймаут.
- MCP: белый список (`security.mcp.allowedEndpoints`).

## 12.4 Extension size
- Bundle ≤ 25 MB (CI gate).

---

# 13. Тестирование

## 13.1 Unit-тесты
- Парсер: покрытие > 90% конструкций.
- Round-trip: text → QueryModel → text = идентичный результат.
- Type Inference: корректный вывод для всех правил (6.2).
- Validator: проверка всех инвариантов (4.7).

## 13.2 Corpus-тесты
- ≥ 300 реальных запросов (50+ из БП, 50+ из ERP, 30+ из УТ).
- Каждый проверяется на round-trip.
- Каждый — snapshot-тест QueryModel JSON.

## 13.3 Fuzz / property-based
- fast-check: случайные QueryModel → генерация → парсинг → сравнение.
- Fuzz парсера: мутации корректных запросов → отсутствие crash.

## 13.4 CI Benchmarks
| Метрика | Порог (p95) | Действие | Ссылка на NFR |
|---|---|---|---|
| Парсинг 500 строк | ≤ 200 мс | Fail CI | NFR 12.1 |
| Парсинг 200 строк | ≤ 100 мс | Fail CI | — |
| Round-trip 200 строк | < 300 мс | Warning | — |
| Генерация текста 200 строк | ≤ 100 мс | Warning | NFR 12.1 |
| Метаданные (warm) | ≤ 500 мс | Fail CI | NFR 12.1 |
| Метаданные (cold, 10k объектов) | ≤ 5 с | Warning | NFR 12.1 |
| Память Extension Host | < 512 MB | Warning | — |

---

# 14. Дорожная карта

## Этап 0 — Подготовка (3–4 недели)
- Spike: hand-written парсер, grammar validation (ADR-001, ADR-002)
- Spike: проверка trivia preservation (ADR-002)
- Сбор corpus (≥ 300 запросов)
- Финализация JSON Schema (автогенерация из TS)
- Базовая структура репозитория (monorepo), CI

## Этап 1 — MVP (12–16 недель)
- Парсер + tolerant parsing
- QueryModel + генератор + round-trip
- Metadata Service (XML выгрузка, lazy loading, Worker Threads)
- WebView UI: 5 вкладок (Таблицы/Поля, Связи, Условия, Группировка, Параметры)
- Вкладка «Параметры»: автодетект, переименование, ручной тип, defaultValue
- Синхронизация визуальный ↔ текстовый
- Базовая интеграция с VS Code (команда, контекстное меню, вставка)
- Базовый линтер (6 правил)
- CLI: parse/validate/lint/format

## Этап 2 — Расширенная функциональность (8–10 недель)
- Вкладки: Порядок, Итоги, Объединения, Дополнительно, Пакет запросов
- Smart Joins
- Join Graph Visualization
- Формат EDT (.mdo)
- CodeLens, BSL LS интеграция
- Performance regression тесты

## Этап 3 — Продвинутые возможности (6–8 недель)
- AI-модуль: Generate, Improve, Explain, Refactor
- MCP-интеграция
- Run Query (read-only) + заполнение значений параметров во вкладке «Параметры»
- Сохранение наборов значений параметров (аналог Postman environments)
- Шаблоны типовых запросов
- Локализация EN/RU

---

# 15. Критерии приёмки

## 15.1 Этап 0 (Definition of Done)
- Грамматика языка запросов 1С выделена из BSL Parser и парсит базовые конструкции.
- ADR-001 (runtime) и ADR-002 (trivia strategy) оформлены.
- Corpus ≥ 300 запросов собран и структурирован.
- JSON Schema генерируется из TS без drift.
- Monorepo структура, CI pipeline: lint + build + test.

## 15.2 MVP (Этап 1)
- Конструктор открывается < 1 с.
- 5 вкладок MVP функциональны (включая Параметры с редактированием).
- Round-trip стабилен на ≥ 200 corpus-тестах.
- Парсер ≥ 95% corpus.
- Парсинг 500 строк ≤ 200 мс.
- Линтер: 6 правил, unit-тесты ≥ 80%.
- CLI: parse/validate/lint/format с корректными exit codes.
- Memory ≤ 150 MB на 500 строках.
- Extension size ≤ 25 MB.
- Quick Start документация.

## 15.3 Этап 2
- Все вкладки штатного конструктора реализованы.
- 10 000 объектов без деградации.
- Опубликовано в VS Code Marketplace.

## 15.4 Этап 3
- AI Generate + Improve работают.
- MCP-интеграция для метаданных.
- Локализация EN/RU.




# 16. Приложение A — Quick Reference Card

## 16.1 Файлы-источники истины

| Артефакт | Путь | Генерируется? |
|---|---|---|
| TypeScript модель (мастер) | `packages/core/src/model/query-model.ts` | Нет (ручной) |
| JSON Schema | `packages/core/schema/query-model.schema.json` | Да (из TS) |
| Function Name Registry | `packages/core/src/registry/function-names.ts` | Нет (ручной) |
| Keyword Table (RU↔EN) | `packages/core/src/parser/lexer/keywords.ts` | Нет (ручной) |

## 16.2 Все kind-дискриминанты модели

| Тип | kind | Описание |
|---|---|---|
| QueryBody | `"queryBody"` | SELECT-запрос |
| DestroyTempTable | `"destroyTempTable"` | УНИЧТОЖИТЬ |
| SelectExprItem | `"selectExpr"` | Обычное поле выборки |
| SelectWildcard | `"wildcard"` | `*` или `Alias.*` |
| ColumnRef | `"column"` | Ссылка на поле |
| ParamRef | `"param"` | Параметр `&Имя` |
| Literal | `"literal"` | Литерал |
| FuncCall | `"func"` | Вызов функции |
| CastExpr | `"cast"` | ВЫРАЗИТЬ |
| CaseExpr | `"case"` | ВЫБОР / КОГДА |
| BinaryExpr | `"bin"` | Арифметика `+ - * /` |
| UnaryExpr | `"un"` | Унарный `+ -` |
| SubqueryExpr | `"subquery"` | Подзапрос как выражение |
| CompareExpr | `"cmp"` | `= <> > >= < <= LIKE` |
| InExpr | `"in"` | В (...) |
| BetweenExpr | `"between"` | МЕЖДУ ... И |
| RefCheckExpr | `"refCheck"` | ССЫЛКА |
| InHierarchyExpr | `"inHierarchy"` | В ИЕРАРХИИ |
| BoolGroup | `"boolGroup"` | И / ИЛИ |
| NotExpr | `"not"` | НЕ |
| ExistsExpr | `"exists"` | СУЩЕСТВУЕТ (подзапрос) |

## 16.3 Source.kind mapping

| kind | Обязательные поля | Пример |
|---|---|---|
| `"object"` | `object` | Справочник.Номенклатура |
| `"virtual"` | `object`, `virtualParams?` | РегистрНакопления.ТоварыНаСкладах.Остатки(&Период) |
| `"subquery"` | `subquery` | (ВЫБРАТЬ ... ИЗ ...) КАК Под |
| `"tempTable"` | `tempTableName` | ВТ_Документы |

## 16.4 TypeRef variants

| kind | Поля | Пример |
|---|---|---|
| `"primitive"` | `name`: string / number / bool / date / uuid / any / unknown | `{ kind: "primitive", name: "date" }` |
| `"ref"` | `object`: путь объекта 1С | `{ kind: "ref", object: "СправочникСсылка.Номенклатура" }` |
| `"union"` | `items`: TypeRef[] | `{ kind: "union", items: [...] }` |

## 16.5 Минимальный валидный QueryModel

```json
{
  "version": "1.0",
  "queries": [
    {
      "kind": "queryBody",
      "sources": [
        { "alias": "Ном", "kind": "object", "object": "Справочник.Номенклатура" }
      ],
      "select": [
        {
          "kind": "selectExpr",
          "expr": { "kind": "column", "sourceAlias": "Ном", "name": "Ссылка" }
        }
      ]
    }
  ]
}
```




---

# 18. Дополнительные уточнения (rev.H preparation notes)

## 18.1 Performance NFR — уточнение cold vs warm parse

Производительность парсинга фиксируется в двух режимах:

| Режим | Условие | Требование |
|-------|----------|------------|
| Cold parse | Первый запуск парсера (без кэша, JIT не прогрет) | ≤ 200 мс для 500 строк |
| Warm parse | Повторный парсинг в рамках сессии | ≤ 120 мс для 500 строк |

CI-бенчмарк измеряет оба режима отдельно.

---

## 18.2 Type Inference — архитектурные уточнения

В реализации Engine должны быть предусмотрены:

- Обход AST в topological порядке (post-order traversal).
- Memoization вычисленных типов для предотвращения повторных вычислений.
- Кэш схем временных таблиц внутри AnalyzerContext.
- Защита от циклических зависимостей (depth guard + visited set).

Детализация алгоритма будет оформлена в ADR-003 (Type Inference Architecture).

---

## 18.3 Smart Join (MVP Algorithm)

Минимальная стратегия Smart Join:

1. Exact FK match:
   - Поле типа ref → объект с совпадающим `.Ссылка`
2. Совпадение имени поля:
   - `Номенклатура` → `Справочник.Номенклатура.Ссылка`
3. При равенстве нескольких кандидатов:
   - Выбор по максимальному score:
     - FK match = 100
     - Name match = 70
     - Heuristic match = 40
4. Если score < 50 → не предлагать автосвязь.

Алгоритм должен быть детерминированным.

Полная версия Smart Join scoring переносится в 1.6.
