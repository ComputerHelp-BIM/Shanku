#!/usr/bin/env node
/** Removes unused imports (only those; no reordering) from the given files, with TypeScript's own organizer. */
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const web = join(root, 'apps/web');
const cfg = ts.getParsedCommandLineOfConfigFile(join(web, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const files = process.argv.slice(2).map((f) => resolve(f));
const versions = new Map();
const host = {
  getScriptFileNames: () => [...new Set([...cfg.fileNames, ...files])],
  getScriptVersion: (f) => String(versions.get(f) ?? 0),
  getScriptSnapshot: (f) => (ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)) : undefined),
  getCurrentDirectory: () => web,
  getCompilationSettings: () => cfg.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory, directoryExists: ts.sys.directoryExists, getDirectories: ts.sys.getDirectories,
};
const ls = ts.createLanguageService(host);
for (const f of files) {
  // the project's style: spaces after commas and inside braces, single quotes, semicolons
  const format = { ...ts.getDefaultFormatCodeSettings('\n'), indentSize: 2, tabSize: 2, convertTabsToSpaces: true, insertSpaceAfterCommaDelimiter: true, insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true, semicolons: ts.SemicolonPreference.Insert };
  const changes = ls.organizeImports({ type: 'file', fileName: f, mode: ts.OrganizeImportsMode.RemoveUnused }, format, { quotePreference: 'single' });
  let text = readFileSync(f, 'utf8');
  const edits = changes.flatMap((c) => c.textChanges).sort((a, b) => b.span.start - a.span.start);
  for (const e of edits) text = text.slice(0, e.span.start) + e.newText + text.slice(e.span.start + e.span.length);
  writeFileSync(f, text);
  versions.set(f, (versions.get(f) ?? 0) + 1);
  console.log(`${f.replace(root + '/', '')}: ${edits.length} import edit(s)`);
}
