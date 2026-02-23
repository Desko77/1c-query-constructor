# План разработки: Конструктор запросов 1С v1.5

## Контекст

Проект представляет собой VS Code расширение + CLI для визуального построения запросов 1С. Текущее состояние — только спецификация (ТЗ v1.5 CLEAN rev.H), код отсутствует. Архитектура: monorepo с тремя пакетами (`core`, `vscode`, `cli`). Ядро — hand-written recursive descent парсер на TypeScript с нулевыми внешними зависимостями, QueryModel как единственный источник истины, round-trip text↔model.

---

## Фаза 0 — Инициализация репозитория (последовательно, 1 агент)

**Цель:** Создать структуру monorepo, настроить tooling, определить контракты между пакетами.

**Задачи:**
1. Инициализация monorepo (npm/pnpm workspaces)
   - `package.json` (root) с workspaces: `packages/*`
   - `packages/core/package.json` — `@1c-query/core`
   - `packages/vscode/package.json` — `@1c-query/vscode`
   - `packages/cli/package.json` — `@1c-query/cli`
2. `tsconfig.base.json` + tsconfig для каждого пакета (strict mode)
3. `.gitignore`, `.editorconfig`, `.prettierrc`
4. Настройка тестового фреймворка (vitest)
5. ESLint конфигурация
6. CI pipeline (GitHub Actions): lint → build → test
7. Структура директорий по ТЗ §3.4

**Результат:** Пустой, но полностью настроенный monorepo, все пакеты компилируются, тесты запускаются.

---

## Фаза 1 — Контракты и типы (последовательно, 1 агент)

**Цель:** Определить все общие типы и интерфейсы, которые являются контрактами для параллельной разработки.

**Задачи:**
1. `packages/core/src/model/query-model.ts` — все TypeScript интерфейсы QueryModel v1.0 (ТЗ §4.2 целиком: QueryModel, QueryBody, Source, Join, SelectItem, Expr, BoolExpr, TypeRef и т.д.)
2. `packages/core/src/parser/ast/ast-types.ts` — типы AST-узлов с trivia (ТЗ §5.3: AstNode, TriviaItem, AstNodeType)
3. `packages/core/src/parser/lexer/token-types.ts` — enum типов токенов
4. `packages/core/src/metadata/metadata-provider.ts` — интерфейс MetadataProvider (ТЗ §3.1)
5. `packages/core/src/validator/diagnostic.ts` — тип Diagnostic
6. `packages/core/src/analyzer/rule-types.ts` — интерфейс QueryRule (ТЗ §8.1)
7. `packages/vscode/src/protocol/messages.ts` — протокол WebView↔Host (ТЗ §7.2: HostToWebViewMessage, WebViewToHostMessage, QueryModelPatch)
8. Автогенерация JSON Schema из TS типов → `schemas/1c-querymodel-1.0.json`

**Результат:** Все контрактные типы зафиксированы. Можно начинать параллельную разработку.

---

## Фаза 2 — Параллельная разработка ядра (5 агентов параллельно)

После Фаз 0-1 все контрактные типы определены. Пять потоков работают параллельно:

### Агент A: Лексер + Таблицы ключевых слов
**Файлы:**
- `packages/core/src/parser/lexer/keywords.ts` — полная таблица RU↔EN ключевых слов (ВЫБРАТЬ/SELECT, ИЗ/FROM, ГДЕ/WHERE, СОЕДИНЕНИЕ/JOIN, и т.д.)
- `packages/core/src/parser/lexer/tokenizer.ts` — основной лексер
- `packages/core/src/parser/ast/source-range.ts` — отслеживание позиций
- `packages/core/src/parser/ast/trivia.ts` — логика привязки trivia (ТЗ §5.4)

**Тесты:**
- Токенизация RU и EN ключевых слов
- Литералы (строки, числа, даты `ДАТАВРЕМЯ(2024,1,1)`)
- Параметры (`&Имя`)
- Комментарии (однострочные `//`, сохранение как trivia)
- Whitespace как trivia
- Автоопределение языка по первому ключевому слову

**Зависимости:** Только token-types.ts из Фазы 1

---

### Агент B: Function Name Registry
**Файлы:**
- `packages/core/src/registry/function-names.ts` — data-driven маппинг RU↔EN (ТЗ §4.5, полная таблица ~30 функций)
- `canonicalize(name: string): string` — любой регистр RU/EN → EN UPPER
- `localize(canonical: string, lang: "RU" | "EN"): string` — обратный маппинг

**Тесты:**
- Каноникализация всех функций из таблицы §4.5
- Регистронезависимость (`подстрока` → `SUBSTRING`, `Substring` → `SUBSTRING`)
- Локализация обратно в RU
- Неизвестная функция → возвращает как есть

**Зависимости:** Нет (полностью независимый модуль)

---

### Агент C: Валидатор (структурная валидация QueryModel)
**Файлы:**
- `packages/core/src/validator/validator.ts` — основной валидатор
- `packages/core/src/validator/invariants.ts` — все инварианты из ТЗ §4.7

**Правила валидации (ТЗ §4.7):**
- `queries.length >= 1`
- Уникальность `Source.alias` внутри QueryBody
- Консистентность `Source.kind` → обязательные поля
- `Join.leftAlias`/`rightAlias` → существующий Source.alias
- `select.length >= 1`
- HAVING без GROUP BY → error
- UNION: одинаковое количество select items
- `orderBy`/`totals` только в корневом QueryBody (не в union)
- Temp table lifecycle (создание → использование → уничтожение)
- `options.top > 0`
- `forUpdate.mode === "specific"` → tables не пуст

**Тесты:**
- По одному тесту на каждый инвариант (позитивный + негативный)
- Degraded mode policy (ТЗ §4.8): error vs warn vs info

**Зависимости:** Только query-model.ts и diagnostic.ts из Фазы 1

---

### Агент D: NullMetadataProvider + Базовые утилиты Core
**Файлы:**
- `packages/core/src/metadata/null-metadata-provider.ts` — для Degraded Mode (все методы → empty/null)
- `packages/core/src/model/migration.ts` — `migrate()` и `validate()` (ТЗ §4.4)
- `packages/core/src/model/query-model-utils.ts` — утилиты: клонирование, обход, поиск параметров
- `packages/core/src/index.ts` — публичный API core пакета

**Зависимости:** Только типы из Фазы 1

---

### Агент E: Corpus — сбор тестовых запросов
**Файлы:**
- `corpus/valid/` — минимум 50 валидных запросов 1С (разной сложности)
- `corpus/invalid/` — 20 невалидных запросов (синтаксические ошибки)
- `corpus/edge-cases/` — edge cases из ТЗ §4.7 (HAVING без GROUP BY, вложенные подзапросы, пакеты с временными таблицами, UNION, ССЫЛКА, В ИЕРАРХИИ)
- Формат: по одному файлу `.1cquery` на запрос + ожидаемый `.json` (QueryModel)

**Источники:** Примеры из ТЗ §4.6 (4 примера) + типовые запросы 1С (БП, ERP, УТ)

**Зависимости:** Нет

---

## Фаза 3 — Парсер (2 агента параллельно, зависят от Фазы 2A)

После готовности лексера два агента строят парсер параллельно:

### Агент F: Парсер — основные конструкции
**Файлы:**
- `packages/core/src/parser/parser/parser.ts` — точка входа, `parseQuery()`
- `packages/core/src/parser/parser/parse-select.ts` — SELECT clause (РАЗЛИЧНЫЕ, ПЕРВЫЕ N, поля, *, Alias.*)
- `packages/core/src/parser/parser/parse-from.ts` — FROM (object, virtual, subquery, tempTable) + JOIN
- `packages/core/src/parser/parser/parse-where.ts` — WHERE / HAVING
- `packages/core/src/parser/parser/parse-expressions.ts` — выражения: арифметика, функции, CASE, CAST, литералы, параметры, подзапросы
- `packages/core/src/parser/parser/error-recovery.ts` — tolerant parsing (пропуск до `;`, `)`, ключевого слова)

**Конструкции:** SELECT, FROM, WHERE, HAVING, GROUP BY, ORDER BY, JOIN (INNER/LEFT/RIGHT/FULL), подзапросы, все BoolExpr (CompareExpr, InExpr, BetweenExpr, RefCheckExpr, InHierarchyExpr, ExistsExpr, BoolGroup, NotExpr)

**Тесты:**
- Парсинг всех 4 примеров из ТЗ §4.6
- Tolerant parsing: partial AST при ошибках, без crash
- Корпус-тесты из Фазы 2E

---

### Агент G: Парсер — пакеты, UNION, временные таблицы + AST-to-Model Mapper
**Файлы:**
- `packages/core/src/parser/parser/parse-union.ts` — ОБЪЕДИНИТЬ / ОБЪЕДИНИТЬ ВСЕ
- `packages/core/src/parser/parser/parse-packet.ts` — пакетные запросы (разделение по `;`), ПОМЕСТИТЬ, УНИЧТОЖИТЬ
- `packages/core/src/parser/mapper/ast-to-model.ts` — конвертация AST → QueryModel
- `packages/core/src/parser/mapper/canonicalize.ts` — каноникализация имён функций через Registry (Агент B)

**Тесты:**
- Пакетный запрос (пример 3 из §4.6)
- UNION ALL (пример 4 из §4.6)
- Временные таблицы: ПОМЕСТИТЬ + использование + УНИЧТОЖИТЬ
- Round-trip: text → AST → QueryModel → проверка полей

**Зависимости:** Лексер (Агент A), Function Registry (Агент B), parser.ts (Агент F — базовая структура)

---

## Фаза 4 — Генератор + Type Inference (3 агента параллельно, зависят от Фаз 2-3)

### Агент H: Генератор (QueryModel → text)
**Файлы:**
- `packages/core/src/parser/generator/model-to-text.ts` — основная генерация
- `packages/core/src/parser/generator/formatter.ts` — canonical formatting
- `packages/core/src/parser/generator/trivia-emitter.ts` — сохранение trivia при генерации

**Режимы (ТЗ §5.4):**
- `preserve` — оригинальный whitespace
- `canonical` — стандартное форматирование, комментарии сохраняются

**Тесты:**
- Round-trip: text → parse → QueryModel → generate → text (идентичный результат)
- Canonical formatting
- Генерация всех конструкций: SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, UNION, пакеты
- Локализация имён функций (EN UPPER → RU при meta.language = "RU")

**Зависимости:** QueryModel типы, Function Registry (Агент B)

---

### Агент I: Type Inference Engine
**Файлы:**
- `packages/core/src/type-inference/type-inference.ts` — основной движок
- `packages/core/src/type-inference/rules.ts` — правила вывода из ТЗ §6.2

**Правила (ТЗ §6.2):**
- ColumnRef → тип из метаданных / схемы временной таблицы
- ParamRef → из контекста сравнения
- Literal → по litType
- FuncCall(SUM/COUNT/AVG) → number; MIN/MAX → typeof(expr)
- ISNULL → union; SUBSTRING → string; YEAR/MONTH/DAY → number
- CaseExpr → union всех веток
- BinaryExpr → number / string
- Вывод типов временных таблиц (ТЗ §6.3)

**Архитектура (ТЗ §18.2):**
- Post-order traversal
- Memoization
- Кэш схем временных таблиц
- Depth guard + visited set (защита от циклов)

**Тесты:**
- По одному тесту на каждое правило из §6.2
- Unknown fallback (§6.4)
- Вывод типов для временных таблиц

**Зависимости:** QueryModel типы, MetadataProvider интерфейс

---

### Агент J: Static Analyzer (6 правил MVP)
**Файлы:**
- `packages/core/src/analyzer/analyzer.ts` — движок анализатора
- `packages/core/src/analyzer/rules/sqa-001-select-wildcard.ts` — SELECT * → warn
- `packages/core/src/analyzer/rules/sqa-002-cross-join.ts` — CROSS JOIN → warn
- `packages/core/src/analyzer/rules/sqa-003-redundant-join.ts` — неиспользуемый JOIN → warn
- `packages/core/src/analyzer/rules/sqa-004-groupby-conflict.ts` — GROUP BY conflict → error
- `packages/core/src/analyzer/rules/sqa-005-unused-param.ts` — неиспользуемый параметр → info
- `packages/core/src/analyzer/rules/sqa-006-undefined-param.ts` — параметр без определения → warn
- `packages/core/src/analyzer/config.ts` — загрузка `.querylintrc.json`

**Тесты:**
- Каждое правило: срабатывание + несрабатывание
- Конфигурация: override severity, выключение правила

**Зависимости:** QueryModel типы, Diagnostic

---

## Фаза 5 — CLI + VS Code Extension (3 агента параллельно, зависят от Фаз 3-4)

### Агент K: CLI
**Файлы:**
- `packages/cli/src/index.ts` — точка входа
- `packages/cli/src/commands/parse.ts` — `1c-query parse <file>` → QueryModel JSON
- `packages/cli/src/commands/validate.ts` — `1c-query validate <file>`
- `packages/cli/src/commands/lint.ts` — `1c-query lint <file>`
- `packages/cli/src/commands/format.ts` — `1c-query format <file>`
- `packages/cli/src/metadata/cli-metadata-provider.ts` — CLIMetadataProvider (NullMetadataProvider для MVP)

**Exit codes (ТЗ §9.2):** 0 = OK, 1 = Warnings, 2 = Errors
**Output (ТЗ §9.3):** `--format json` и `--format text`

**Тесты:**
- Каждая команда с валидным и невалидным входом
- Exit codes
- JSON и text output

**Зависимости:** Core полностью (парсер, валидатор, анализатор, генератор)

---

### Агент L: VS Code Extension — Extension Host
**Файлы:**
- `packages/vscode/src/extension.ts` — activate/deactivate, команды
- `packages/vscode/src/webview/webview-provider.ts` — создание WebView, postMessage обработка
- `packages/vscode/src/metadata/vscode-metadata-provider.ts` — XML/MDO загрузка + Worker Threads + LRU-кэш + lazy loading (MVP: NullMetadataProvider fallback)
- `packages/vscode/src/settings/settings.ts` — настройки из ТЗ §11
- `packages/vscode/src/sync/state-manager.ts` — синхронизация WebView↔Editor, debounce 300ms, undo/redo стек

**Протокол (ТЗ §7.2):**
- Обработка всех WebViewToHostMessage
- Отправка всех HostToWebViewMessage
- applyPatch → применение QueryModelPatch → регенерация текста

**Зависимости:** Core, протокол из Фазы 1

---

### Агент M: VS Code Extension — WebView UI (React)
**Файлы:**
- `packages/vscode/src/ui/App.tsx` — корневой компонент, табы
- `packages/vscode/src/ui/tabs/TablesFields.tsx` — Таблицы и поля (дерево метаданных, выбор таблиц, полей, псевдонимов)
- `packages/vscode/src/ui/tabs/Joins.tsx` — Связи (тип JOIN, условие ON, Smart Join подсказки)
- `packages/vscode/src/ui/tabs/Conditions.tsx` — Условия (дерево И/ИЛИ/НЕ, операторы, параметры)
- `packages/vscode/src/ui/tabs/Grouping.tsx` — Группировка (поля GROUP BY, агрегатные функции)
- `packages/vscode/src/ui/tabs/Parameters.tsx` — Параметры (автодетект, переименование, тип, defaultValue, usageCount — макет из §7.1.5)
- `packages/vscode/src/ui/components/` — общие компоненты (ExprEditor, BoolExprTree, FieldPicker)
- `packages/vscode/src/ui/hooks/useQueryModel.ts` — хук для работы с QueryModel и отправки patch

**Зависимости:** Протокол из Фазы 1, React, VS Code Webview API

---

## Фаза 6 — Интеграция и стабилизация (последовательно, 2 агента)

### Агент N: Интеграция + Round-trip тесты
- Интеграция всех модулей
- End-to-end тесты: текст запроса → парсинг → QueryModel → генерация → идентичный текст
- Корпус-тесты на полном pipeline (≥200 запросов)
- Performance benchmarks: parse 500 строк ≤200ms, parse 200 строк ≤100ms
- Bundle size check: парсер ≤500KB, extension ≤25MB

### Агент O: Degraded Mode + Error scenarios
- Тесты без метаданных (NullMetadataProvider)
- Tolerant parsing: корпус невалидных запросов → partial AST, без crash
- Degraded Mode policy (ТЗ §4.8): корректные severity в зависимости от наличия метаданных
- Fuzz-тесты (fast-check): случайные QueryModel → generate → parse → сравнение

---

## Граф зависимостей

```
Фаза 0 (repo setup)
    │
    ▼
Фаза 1 (типы и контракты)
    │
    ├──► Агент A (лексер)
    ├──► Агент B (function registry)    ── параллельно
    ├──► Агент C (валидатор)
    ├──► Агент D (null metadata + utils)
    └──► Агент E (corpus)
              │
              ▼
    ┌─────────┴──────────┐
    ▼                    ▼
Агент F (парсер:     Агент G (парсер:
 основные)            пакеты+mapper)     ── параллельно
    │                    │               (зависят от A, B)
    └────────┬───────────┘
             │
    ┌────────┼────────────┐
    ▼        ▼            ▼
Агент H   Агент I      Агент J
(генератор)(type inf.)  (analyzer)       ── параллельно
    │        │            │
    └────────┼────────────┘
             │
    ┌────────┼────────────┐
    ▼        ▼            ▼
Агент K   Агент L      Агент M
(CLI)     (ext. host)  (WebView UI)      ── параллельно
    │        │            │
    └────────┼────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
Агент N           Агент O
(интеграция)    (degraded mode)          ── параллельно
```

---

## Верификация (как проверить, что всё работает)

1. **Unit-тесты:** `npm test` в каждом пакете, покрытие >90% для парсера
2. **Round-trip:** Все 4 примера из ТЗ §4.6 проходят text→model→text
3. **Корпус:** ≥200 запросов из `corpus/valid/` проходят parse + round-trip
4. **CLI:** `1c-query parse corpus/valid/example1.1cquery` возвращает валидный JSON
5. **Валидатор:** Все инварианты §4.7 проверены тестами
6. **Performance:** `npm run bench` — parse 500 строк ≤200ms
7. **Bundle:** `npm run build` — парсер ≤500KB minified
8. **Lint:** `1c-query lint corpus/valid/` — все 6 правил работают
9. **Extension:** `code --extensionDevelopmentPath=packages/vscode` — открывается WebView с 5 вкладками

---

## Максимальный параллелизм по фазам

| Фаза | Параллельных агентов | Описание |
|------|---------------------|----------|
| 0    | 1                   | Repo setup |
| 1    | 1                   | Типы/контракты |
| 2    | **5**               | Лексер, Registry, Валидатор, Utils, Corpus |
| 3    | **2**               | Парсер (основные + пакеты/mapper) |
| 4    | **3**               | Генератор, Type Inference, Analyzer |
| 5    | **3**               | CLI, Extension Host, WebView UI |
| 6    | **2**               | Интеграция, Degraded Mode |

**Итого (Этапы 0-1):** 15 агентов (A–O), максимум 5 параллельных.

---

## Фаза 7 — Этап 2: Расширенные вкладки UI (4 агента параллельно)

**Зависимости:** Фазы 5-6 завершены, MVP стабилен.

### Агент P: Вкладки — Порядок + Итоги
**Файлы:**
- `packages/vscode/src/ui/tabs/OrderBy.tsx` — ORDER BY: поля, направление (ASC/DESC), drag-and-drop
- `packages/vscode/src/ui/tabs/Totals.tsx` — ИТОГИ: агрегатные поля, группировочные поля
- Обновление QueryModelPatch для orderBy/totals операций

### Агент Q: Вкладки — Объединения + Пакет запросов
**Файлы:**
- `packages/vscode/src/ui/tabs/Unions.tsx` — ОБЪЕДИНИТЬ / ОБЪЕДИНИТЬ ВСЕ: управление частями union, сопоставление колонок
- `packages/vscode/src/ui/tabs/QueryPacket.tsx` — Пакет запросов: список запросов, временные таблицы, УНИЧТОЖИТЬ, визуальное отображение lifecycle

### Агент R: Smart Joins + Join Graph
**Файлы:**
- `packages/core/src/smart-joins/smart-join-engine.ts` — алгоритм из §18.3 (FK match=100, Name match=70, Heuristic=40)
- `packages/vscode/src/ui/components/JoinGraph.tsx` — визуализация графа связей (SVG/Canvas)
- Интеграция с вкладкой Joins (автоподсказки)

### Агент S: EDT (.mdo) + CodeLens + BSL LS
**Файлы:**
- `packages/vscode/src/metadata/mdo-parser.ts` — парсинг формата EDT (.mdo) для метаданных
- `packages/vscode/src/codelens/query-codelens-provider.ts` — CodeLens для 1С запросов в .bsl файлах
- `packages/vscode/src/integration/bsl-ls-client.ts` — интеграция с BSL Language Server (опционально)
- Performance regression тесты (CI benchmarks из §13.4)

---

## Фаза 8 — Этап 2: Вкладка «Дополнительно» + Performance (1 агент)

### Агент T: Вкладка «Дополнительно» + Performance benchmarks
**Файлы:**
- `packages/vscode/src/ui/tabs/Advanced.tsx` — DISTINCT, TOP N, FOR UPDATE, AUTOORDER, ПОМЕСТИТЬ
- `packages/core/benchmarks/` — benchmark suite (vitest bench)
  - Parse 500 строк (cold ≤200ms, warm ≤120ms)
  - Parse 200 строк ≤100ms
  - Round-trip 200 строк <300ms
  - Генерация текста ≤100ms
  - Метаданные warm ≤500ms
- CI gate: fail на превышении порогов

---

## Фаза 9 — Этап 3: AI модуль (2 агента параллельно)

**Зависимости:** Этап 2 завершён, стабильный core pipeline.

### Агент U: AI Service — Generate + Improve
**Файлы:**
- `packages/core/src/ai/ai-service.ts` — абстрактный AI Service
- `packages/core/src/ai/prompt-builder.ts` — формирование промптов с метаданными и QueryModel schema
- `packages/core/src/ai/response-validator.ts` — 3-этапная валидация (§10.2): JSON Schema → Metadata → Semantic
- `packages/core/src/ai/confidence-scoring.ts` — confidence: 0-100, порог minConfidence (§10.5)
- `packages/core/src/ai/sanitizer.ts` — маскировка литералов (ai.maskLiterals), whitelist имён метаданных (§10.4)
- `packages/core/src/ai/providers/anthropic-provider.ts` — Anthropic API
- `packages/core/src/ai/providers/openai-provider.ts` — OpenAI API
- `packages/core/src/ai/providers/local-provider.ts` — локальный LLM (Ollama и т.д.)

**Режимы (§10.3):**
- Generate: текст на рус/англ + метаданные → QueryModel JSON
- Improve: существующий QueryModel → улучшенный QueryModel
- AST-first с text-first fallback (§10.1)

**Тесты:**
- Валидация pipeline (невалидный JSON, несуществующие таблицы)
- Sanitization (маскировка, whitelist)
- Confidence scoring
- Fallback text→parse→model

### Агент V: AI Integration — Explain + Refactor + VS Code UI
**Файлы:**
- `packages/core/src/ai/explain.ts` — Explain: QueryModel → человекочитаемое описание
- `packages/core/src/ai/refactor.ts` — Refactor: предложения по улучшению
- `packages/vscode/src/ui/components/AiPanel.tsx` — UI панель AI (Generate, Improve, Explain, Refactor)
- `packages/vscode/src/ai/ai-command-handler.ts` — обработка AI-команд, rate limiting (ai.rateLimitPerMinute)
- `packages/core/src/ai/diff.ts` — минимальный semantic diff для AI preview

---

## Фаза 10 — Этап 3: MCP + Run Query + Шаблоны + Локализация (3 агента параллельно)

### Агент W: MCP интеграция
**Файлы:**
- `packages/vscode/src/mcp/mcp-client.ts` — MCP клиент для метаданных
- `packages/vscode/src/mcp/mcp-metadata-provider.ts` — MetadataProvider через MCP
- `packages/vscode/src/settings/security.ts` — белый список MCP-серверов (security.mcp.allowedEndpoints), таймаут (security.connectionTimeoutMs)

### Агент X: Run Query + Parameter Presets
**Файлы:**
- `packages/vscode/src/run-query/query-executor.ts` — выполнение запросов (read-only, только SELECT, таймаут)
- `packages/vscode/src/run-query/result-viewer.ts` — отображение результатов
- `packages/vscode/src/ui/tabs/Parameters.tsx` — расширение: runtimeValue, быстрый выбор из метаданных, сохранение наборов значений (аналог Postman environments)
- `packages/vscode/src/run-query/param-presets.ts` — хранение наборов значений параметров

### Агент Y: Шаблоны + Локализация
**Файлы:**
- `packages/core/src/templates/` — 2-3 MVP шаблона типовых запросов (остатки, документы, регистры)
- `packages/vscode/src/i18n/` — локализация EN/RU
- `packages/vscode/package.nls.json` + `package.nls.ru.json` — строки расширения
- Quick Start документация (`docs/user-guide/`)

---

## Фаза 11 — Финальная стабилизация (1 агент)

### Агент Z: E2E + Marketplace
- Полный E2E проход по всем этапам
- Корпус-тесты ≥300 запросов
- Property-based тесты (fast-check)
- Fuzz-тесты парсера
- Extension packaging + проверка Marketplace-требований
- Финальная документация (Quick Start, ADR-001, ADR-002, ADR-003)

---

## Обновлённый граф зависимостей (все этапы)

```
Фаза 0 (repo setup)
    │
    ▼
Фаза 1 (типы/контракты)
    │
    ├──► A (лексер) ──┐
    ├──► B (registry)  │
    ├──► C (валидатор)  ├── Фаза 2 (5 параллельных)
    ├──► D (utils)     │
    └──► E (corpus) ──┘
              │
    ┌─────────┴──────────┐
    ▼                    ▼
    F (парсер core)    G (парсер пакеты)  ── Фаза 3 (2 параллельных)
    └────────┬───────────┘
    ┌────────┼────────────┐
    ▼        ▼            ▼
    H         I           J               ── Фаза 4 (3 параллельных)
  (генератор)(type inf.) (analyzer)
    └────────┼────────────┘
    ┌────────┼────────────┐
    ▼        ▼            ▼
    K        L            M               ── Фаза 5 (3 параллельных)
   (CLI)   (ext.host)  (WebView UI)
    └────────┼────────────┘
    ┌────────┴────────┐
    ▼                 ▼
    N                 O                   ── Фаза 6 (2 параллельных)
  (интеграция)      (degraded)
             │
    ┌────────┼────────┬──────────┐
    ▼        ▼        ▼          ▼
    P        Q        R          S        ── Фаза 7 (4 параллельных)
  (order/   (union/  (smart    (EDT/
   totals)  packet)   joins)    codelens)
             │
             ▼
             T                            ── Фаза 8 (1 агент)
          (advanced + benchmarks)
             │
    ┌────────┴────────┐
    ▼                 ▼
    U                 V                   ── Фаза 9 (2 параллельных)
  (AI service)      (AI UI)
             │
    ┌────────┼────────────┐
    ▼        ▼            ▼
    W        X            Y               ── Фаза 10 (3 параллельных)
  (MCP)    (Run Query)  (templates/i18n)
             │
             ▼
             Z                            ── Фаза 11 (финал)
          (E2E + Marketplace)
```

## Итого по всем этапам

| Фаза | Этап ТЗ | Параллельных | Агенты |
|------|---------|-------------|--------|
| 0    | 0       | 1           | (setup) |
| 1    | 0       | 1           | (типы) |
| 2    | 0-1     | **5**       | A–E |
| 3    | 1       | **2**       | F–G |
| 4    | 1       | **3**       | H–J |
| 5    | 1       | **3**       | K–M |
| 6    | 1       | **2**       | N–O |
| 7    | 2       | **4**       | P–S |
| 8    | 2       | 1           | T |
| 9    | 3       | **2**       | U–V |
| 10   | 3       | **3**       | W–Y |
| 11   | 3       | 1           | Z |

**Всего: 26 агентов (A–Z), максимум 5 параллельных.**

## Технологический стек (выбранный)

- **Package manager:** pnpm workspaces
- **Test framework:** vitest (+ fast-check для property-based)
- **Bundler:** esbuild (парсер + extension)
- **Linter:** ESLint + typescript-eslint
- **CI:** GitHub Actions
- **UI:** React 18 + VS Code Webview API
- **Editor:** Monaco Editor (встроен в WebView)
