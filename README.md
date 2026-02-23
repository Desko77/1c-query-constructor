# 1C Query Constructor

Инструментарий для парсинга, анализа и генерации запросов языка 1С:Предприятие. Включает ядро с нулевыми внешними зависимостями, CLI-утилиту и расширение для VS Code.

## Возможности

- **Двуязычный парсер** — полная поддержка русского и английского синтаксиса запросов 1С (`ВЫБРАТЬ`/`SELECT`, `ИЗ`/`FROM`, `ГДЕ`/`WHERE` и т.д.)
- **Round-trip** — текст &rarr; модель &rarr; текст без потери информации
- **Статический анализ** — 6 встроенных правил (SQA-001..SQA-006) для обнаружения типичных проблем
- **Вывод типов** — автоматическое определение типов выражений через арифметику, функции, CASE, CAST
- **Структурная валидация** — 20+ инвариантов целостности QueryModel
- **CLI** — форматирование, линтинг и парсинг из командной строки
- **VS Code** — расширение с подсветкой синтаксиса, диагностиками и визуальным конструктором

## Структура проекта

```
1c-query-constructor/
├── packages/
│   ├── core/          @1c-query/core — парсер, генератор, анализатор, валидатор
│   ├── cli/           @1c-query/cli  — CLI-утилита (1c-query)
│   └── vscode/        @1c-query/vscode — расширение VS Code
├── corpus/            Набор тестовых запросов (.1cquery)
│   ├── valid/         20 корректных запросов
│   ├── invalid/       3 некорректных запроса
│   └── edge-cases/    2 сложных пограничных случая
└── docs/              Документация и планы
```

## Быстрый старт

### Требования

- Node.js >= 18
- pnpm

### Установка

```bash
pnpm install
```

### Сборка

```bash
pnpm build
```

### Тесты

```bash
pnpm test
```

## CLI

```
1c-query <command> [options] <file>
```

| Команда    | Описание                                |
|------------|-----------------------------------------|
| `parse`    | Парсинг `.1cquery` в QueryModel JSON    |
| `validate` | Структурная валидация запроса            |
| `lint`     | Статический анализ (SQA-001..SQA-006)   |
| `format`   | Каноническое форматирование запроса      |

**Опции:**

- `--format json|text` — формат вывода (по умолчанию: `text`)
- `--lang RU|EN` — язык для команды `format` (по умолчанию: `RU`)

**Примеры:**

```bash
# Парсинг запроса в JSON
1c-query parse corpus/valid/001-simple-select.1cquery

# Линтинг с JSON-выводом
1c-query lint --format json corpus/valid/005-group-by-aggregates.1cquery

# Форматирование на английском
1c-query format --lang EN corpus/valid/001-simple-select.1cquery
```

**Коды выхода:** `0` — OK, `1` — предупреждения, `2` — ошибки.

## Ядро (@1c-query/core)

### Парсинг

```typescript
import { parseQuery } from '@1c-query/core';

const result = parseQuery(`
  ВЫБРАТЬ Ном.Наименование КАК Имя
  ИЗ Справочник.Номенклатура КАК Ном
`);

console.log(result.model);        // QueryModel
console.log(result.diagnostics);   // Diagnostic[]
```

### Генерация текста

```typescript
import { parseQuery, generateText } from '@1c-query/core';

const { model } = parseQuery('ВЫБРАТЬ * ИЗ Справочник.Номенклатура КАК Т');

// Генерация на русском (по умолчанию)
console.log(generateText(model));

// Генерация на английском
console.log(generateText(model, { language: 'EN' }));
```

### Валидация

```typescript
import { parseQuery, validate } from '@1c-query/core';

const { model } = parseQuery('...');
const diagnostics = validate(model);
// [{ severity: 'error', code: 'V003', message: '...' }]
```

### Статический анализ

```typescript
import { parseQuery, analyze, allRules } from '@1c-query/core';

const { model } = parseQuery('ВЫБРАТЬ * ИЗ Справочник.Номенклатура КАК Т');
const warnings = analyze(model, allRules());
// [{ severity: 'warn', code: 'SQA-001', message: 'SELECT * hides column list' }]
```

### Вспомогательные функции

```typescript
import {
  cloneModel,           // Глубокое клонирование модели
  walkQueryBodies,      // Обход всех QueryBody (включая вложенные)
  collectParameters,    // Сбор всех параметров (&Param)
  canonicalize,         // "Подстрока" → "SUBSTRING"
  localize,             // "SUBSTRING" → "Подстрока"
  inferSelectTypes,     // Вывод типов SELECT-списка
} from '@1c-query/core';
```

## Правила анализа

| Код      | Описание                                       |
|----------|------------------------------------------------|
| SQA-001  | `SELECT *` скрывает список колонок              |
| SQA-002  | Декартово произведение (CROSS JOIN)             |
| SQA-003  | Избыточное соединение (JOIN без использования)  |
| SQA-004  | Конфликт GROUP BY и SELECT                     |
| SQA-005  | Неиспользуемый параметр                        |
| SQA-006  | Неопределённый параметр (ссылка без объявления) |

## Расширение VS Code

Расширение добавляет поддержку файлов `.1cquery`:

- Подсветка синтаксиса и скобок
- Команды: **Open Query Constructor**, **Parse Query to JSON**, **Format Query**
- Визуальный конструктор запросов (Custom Editor)
- Настраиваемый debounce синхронизации, размер undo-стека, Smart Joins

## Поддерживаемый синтаксис

Парсер поддерживает полный синтаксис запросов 1С:

- `ВЫБРАТЬ` / `SELECT` с `РАЗЛИЧНЫЕ`, `ПЕРВЫЕ N`, `РАЗРЕШЕННЫЕ`
- `ИЗ` / `FROM` — справочники, документы, регистры, виртуальные таблицы с параметрами
- `СОЕДИНЕНИЕ` / `JOIN` — `ЛЕВОЕ`, `ПРАВОЕ`, `ПОЛНОЕ`, `ВНУТРЕННЕЕ`
- `ГДЕ` / `WHERE` — сравнения, `В`, `МЕЖДУ`, `ПОДОБНО`, `ЕСТЬ NULL`, `В ИЕРАРХИИ`, `ССЫЛКА`
- `СГРУППИРОВАТЬ ПО` / `GROUP BY`, `ИМЕЮЩИЕ` / `HAVING`
- `УПОРЯДОЧИТЬ ПО` / `ORDER BY`, `АВТОУПОРЯДОЧИВАНИЕ` / `AUTOORDER`
- `ОБЪЕДИНИТЬ` / `UNION` (с `ВСЕ` / `ALL`)
- `ИТОГИ` / `TOTALS` — `СУММА`, `КОЛИЧЕСТВО`, `МИНИМУМ`, `МАКСИМУМ`, `СРЕДНЕЕ`
- `ПОМЕСТИТЬ` / `INTO` — временные таблицы
- `УНИЧТОЖИТЬ` / `DROP` — удаление временных таблиц
- `ВЫБОР` / `CASE`, `ВЫРАЗИТЬ` / `CAST`
- Пакетные запросы (batch) через `;`
- Подзапросы в `WHERE`, `IN`, `EXISTS`

## Лицензия

[MIT](LICENSE)
