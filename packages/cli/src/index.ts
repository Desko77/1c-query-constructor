#!/usr/bin/env node
// CLI entry point for 1C Query Constructor (ТЗ §9)
// Exit codes: 0 = OK, 1 = Warnings, 2 = Errors

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const command = args[0];

interface DiagLike { severity: string; code: string; message: string; range?: { line: number; col: number } }

function showHelp(): void {
  console.log(`1c-query — CLI for 1C Query Constructor

Usage:  1c-query <command> [options] <file>

Commands:
  parse      Parse .1cquery file → QueryModel JSON
  validate   Structural validation of a query
  lint       Static analysis rules (SQA-001..SQA-006)
  format     Canonical formatting of a query

Options:
  --format json|text   Output format (default: text)
  --lang RU|EN         Language for format command (default: RU)
  -h, --help           Show this help

Exit codes:  0 = OK, 1 = Warnings, 2 = Errors`);
}

function readInput(filePath: string): string {
  const abs = resolve(filePath);
  try {
    return readFileSync(abs, 'utf-8');
  } catch {
    console.error(`Error: Cannot read file "${abs}"`);
    process.exit(2);
    return '';
  }
}

function opt(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function fileArg(): string {
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) { i++; continue; }
    return a;
  }
  console.error('Error: No input file specified');
  process.exit(2);
  return '';
}

function exitCode(diags: DiagLike[]): number {
  if (diags.some(d => d.severity === 'error')) return 2;
  if (diags.some(d => d.severity === 'warn')) return 1;
  return 0;
}

function fmtDiag(d: DiagLike): string {
  const loc = d.range ? `:${d.range.line}:${d.range.col}` : '';
  return `[${d.severity}] ${d.code}${loc}: ${d.message}`;
}

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  const fmt = opt('format') ?? 'text';
  const file = fileArg();
  const text = readInput(file);

  // Lazy-load core
  const core = await import('@1c-query/core');

  switch (command) {
    case 'parse': {
      const r = core.parseQuery(text);
      if (fmt === 'json') {
        console.log(JSON.stringify({ model: r.model, diagnostics: r.diagnostics }, null, 2));
      } else {
        console.log(JSON.stringify(r.model, null, 2));
        if (r.diagnostics.length > 0) {
          console.error('\nDiagnostics:');
          r.diagnostics.forEach((d: DiagLike) => console.error('  ' + fmtDiag(d)));
        }
      }
      process.exit(exitCode(r.diagnostics));
      break;
    }

    case 'validate': {
      const r = core.parseQuery(text);
      const all: DiagLike[] = [...r.diagnostics, ...core.validate(r.model)];
      if (fmt === 'json') {
        console.log(JSON.stringify({ diagnostics: all }, null, 2));
      } else if (all.length === 0) {
        console.log('No issues found.');
      } else {
        all.forEach(d => console.log(fmtDiag(d)));
      }
      process.exit(exitCode(all));
      break;
    }

    case 'lint': {
      const r = core.parseQuery(text);
      const diags: DiagLike[] = core.analyze(r.model, core.allRules());
      if (fmt === 'json') {
        console.log(JSON.stringify({ diagnostics: diags }, null, 2));
      } else if (diags.length === 0) {
        console.log('No lint issues found.');
      } else {
        diags.forEach(d => console.log(fmtDiag(d)));
      }
      process.exit(exitCode(diags));
      break;
    }

    case 'format': {
      const lang = (opt('lang') ?? 'RU') as 'RU' | 'EN';
      const r = core.parseQuery(text);
      console.log(core.generateText(r.model, { language: lang }));
      process.exit(exitCode(r.diagnostics));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exit(2);
});
