#!/usr/bin/env node
/**
 * Moves top-level statements of App() in apps/web/src/App.tsx into a feature hook, using the TypeScript
 * checker to find what the moved code needs from App (typed inputs) and what App needs back (outputs).
 * Inputs declared later in App than the moved code are passed through a late-bound ref, so closures keep
 * reading the same values at the same time as before. Usage:
 *   node tools/refactor/extract-feature.mjs <feature-dir> <HookName> <from-to>[,<from-to>...]
 *   e.g. node tools/refactor/extract-feature.mjs viewLinks ViewLinks 1657-1798
 */
import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const [, , featureDir, hookName, rangesArg] = process.argv;
const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const web = join(root, 'apps/web');
const appPath = join(web, 'src/App.tsx');
const outDir = join(web, 'src/features', featureDir);
const outPath = join(outDir, `use${hookName}.ts`);
const ranges = rangesArg.split(',').map((r) => r.split('-').map(Number));

const cfg = ts.getParsedCommandLineOfConfigFile(join(web, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } });
const program = ts.createProgram(cfg.fileNames, cfg.options);
const checker = program.getTypeChecker();
const sf = program.getSourceFile(appPath);
const text = sf.getFullText();
const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

// App's body
let app;
sf.forEachChild(function find(n) {
  if (!app && (ts.isFunctionDeclaration(n) || ts.isVariableStatement(n)) && n.getText(sf).includes('function App')) app = ts.isFunctionDeclaration(n) ? n : null;
});
if (!app) sf.forEachChild((n) => { if (ts.isFunctionDeclaration(n) && n.name?.text === 'App') app = n; });
const body = app.body.statements;
const inRange = (st) => ranges.some(([a, b]) => lineOf(st.getStart(sf)) >= a && lineOf(st.getStart(sf)) <= b);
const moved = body.filter(inRange);
if (!moved.length) throw new Error('No statements in the ranges.');
const movedSet = new Set(moved);
const topOf = (node) => { let n = node; while (n && n.parent !== app.body) n = n.parent; return n; };

// names declared by a statement
function declared(st) {
  const out = [];
  const bind = (b) => { if (ts.isIdentifier(b)) out.push(b); else b.elements?.forEach((e) => !ts.isOmittedExpression(e) && bind(e.name)); };
  if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => bind(d.name));
  if (ts.isFunctionDeclaration(st) && st.name) out.push(st.name);
  return out;
}
const movedDecl = new Map(); // symbol -> name
for (const st of moved) for (const id of declared(st)) movedDecl.set(checker.getSymbolAtLocation(id), id.text);

// every name App's own statements declare (variables, functions, destructured names): only these can be inputs
const appDecl = new Map();
for (const st of body) for (const id of declared(st)) appDecl.set(checker.getSymbolAtLocation(id), st);
// App's own parameters (e.g. { start }) are inputs too, available from the first line
const PARAM = { param: true };
for (const p of app.parameters) {
  const bind = (b) => { if (ts.isIdentifier(b)) appDecl.set(checker.getSymbolAtLocation(b), PARAM); else b.elements?.forEach((e) => !ts.isOmittedExpression(e) && bind(e.name)); };
  bind(p.name);
}
const symOf = (id) => {
  if (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) return checker.getShorthandAssignmentValueSymbol(id.parent);
  return checker.getSymbolAtLocation(id);
};
const firstIndex = body.indexOf(moved[0]);

// walk the moved code: inputs from App, imports
const deps = new Map(); // name -> { sym, decl, late }
const imports = new Map(); // module -> Map(name -> { kind, typeOnly, local })
const lateRefs = []; // { id, name }
function visitMoved(n) {
  if (ts.isIdentifier(n)) {
    const s = symOf(n);
    const d = s?.declarations?.[0];
    if (d && d.getSourceFile() === sf) {
      if (ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d)) {
        const decl = ts.isImportSpecifier(d) ? d.parent.parent.parent : ts.isImportClause(d) ? d.parent : d.parent.parent;
        const mod = decl.moduleSpecifier.text;
        const m = imports.get(mod) ?? new Map();
        const typeOnly = decl.importClause?.isTypeOnly || (ts.isImportSpecifier(d) && d.isTypeOnly);
        const kind = ts.isImportSpecifier(d) ? 'named' : ts.isImportClause(d) ? 'default' : 'namespace';
        const imported = ts.isImportSpecifier(d) ? (d.propertyName ?? d.name).text : n.text;
        m.set(n.text, { kind, typeOnly: !!typeOnly, imported });
        imports.set(mod, m);
      } else {
        const top = appDecl.get(s);
        if (top && !movedSet.has(top)) {
          const late = top !== PARAM && body.indexOf(top) > firstIndex;
          deps.set(n.text, { sym: s, decl: d, late });
          if (late) lateRefs.push({ id: n, name: n.text });
        }
      }
    }
  }
  n.forEachChild(visitMoved);
}
moved.forEach(visitMoved);

// outputs: moved names used elsewhere in App
const exportsSet = new Set();
function visitRest(n) {
  if (ts.isIdentifier(n)) {
    const s = symOf(n);
    if (s && movedDecl.has(s)) exportsSet.add(movedDecl.get(s));
  }
  n.forEachChild(visitRest);
}
body.filter((st) => !movedSet.has(st)).forEach(visitRest);

// types of the inputs
const rel = (abs) => {
  let r = relative(outDir, abs).replace(/\\/g, '/').replace(/\.(d\.)?tsx?$/, '');
  return r.startsWith('.') ? r : './' + r;
};
function typeText(name, info) {
  const d = info.decl;
  // a value from an imported hook or function: ReturnType<typeof f>
  if (ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.initializer && ts.isCallExpression(d.initializer) && ts.isIdentifier(d.initializer.expression)) {
    const cs = checker.getSymbolAtLocation(d.initializer.expression)?.declarations?.[0];
    if (cs && ts.isImportSpecifier(cs) && cs.parent.parent.parent.moduleSpecifier.text !== 'react') {
      const mod = cs.parent.parent.parent.moduleSpecifier.text;
      const m = imports.get(mod) ?? new Map();
      if (!m.has(d.initializer.expression.text)) m.set(d.initializer.expression.text, { kind: 'named', typeOnly: true, imported: (cs.propertyName ?? cs.name).text });
      imports.set(mod, m);
      return `ReturnType<typeof ${d.initializer.expression.text}>`;
    }
  }
  // inputs are values handed around, not constants: literal types widen ('a' | 'b' -> string), as TypeScript
  // widens them in the objects hooks return
  // (only anonymous ones: a named type such as DisplayStyle stays itself)
  const raw = checker.getTypeOfSymbolAtLocation(info.sym, d);
  const t = raw.aliasSymbol ? raw : checker.getBaseTypeOfLiteralType(raw);
  let s = checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType | ts.TypeFormatFlags.WriteArrowStyleSignature);
  s = s.replace(/import\("([^"]+)"\)/g, (_, p) => {
    const nm = /node_modules\/(?:@types\/)?((?:@[^/]+\/)?[^/]+)/.exec(p);
    if (nm) return `import('${nm[1] === 'react' ? 'react' : nm[1]}')`;
    const pk = /packages\/(engine|ui)\/src\/index$/.exec(p);
    if (pk) return `import('@shanku/${pk[1]}')`;
    return `import('${rel(p)}')`;
  });
  return s;
}

// build the hook file
const edits = []; // edits on the moved text: late references
const lateNames = [...new Set(lateRefs.map((r) => r.name))];
const early = [...deps.keys()].filter((k) => !deps.get(k).late).sort();
let movedText = '';
for (const st of moved) {
  const start = st.getFullStart();
  let chunk = text.slice(start, st.getEnd());
  const refs = lateRefs.filter((r) => r.id.getStart(sf) >= start && r.id.getEnd() <= st.getEnd()).sort((a, b) => b.id.getStart(sf) - a.id.getStart(sf));
  for (const r of refs) {
    const a = r.id.getStart(sf) - start, b = r.id.getEnd() - start;
    const shorthand = ts.isShorthandPropertyAssignment(r.id.parent) && r.id.parent.name === r.id;
    chunk = chunk.slice(0, a) + (shorthand ? `${r.name}: late.current.${r.name}` : `late.current.${r.name}`) + chunk.slice(b);
  }
  movedText += chunk;
}
const lateNamesEarly = [...new Set(lateRefs.map((r) => r.name))];
const typeOf = new Map([...deps.keys()].map((n) => [n, typeText(n, deps.get(n))]));
const importLines = [...imports.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mod, names]) => {
  const spec = mod.startsWith('.') ? rel(resolve(dirname(appPath), mod)) : mod;
  const def = [...names.entries()].find(([, v]) => v.kind === 'default');
  const ns = [...names.entries()].find(([, v]) => v.kind === 'namespace');
  const named = [...names.entries()].filter(([, v]) => v.kind === 'named').map(([local, v]) => `${v.typeOnly ? 'type ' : ''}${v.imported === local ? local : `${v.imported} as ${local}`}`);
  const parts = [];
  if (def) parts.push(def[0]);
  if (ns) parts.push(`* as ${ns[0]}`);
  if (named.length) parts.push(`{ ${named.join(', ')} }`);
  return `import ${parts.join(', ')} from '${spec}';`;
});
const lateIface = lateNames.length ? `\n/** Values App declares after this feature: read through a ref, in callbacks and effects only. */\nexport interface ${hookName}Late {\n${lateNames.map((n) => `  ${n}: ${typeOf.get(n)};`).join('\n')}\n}\n` : '';
const depsIface = `export interface ${hookName}Deps {\n${early.map((n) => `  ${n}: ${typeOf.get(n)};`).join('\n')}${lateNames.length ? `\n  late: { current: ${hookName}Late };` : ''}\n}`;
const outs = [...exportsSet].sort();
const file = `${importLines.join('\n')}\n${lateIface}\n${depsIface}\n\nexport function use${hookName}(deps: ${hookName}Deps) {\n  const { ${[...early, ...(lateNames.length ? ['late'] : [])].join(', ')} } = deps;\n${movedText.replace(/^\n/, '')}\n\n  return { ${outs.join(', ')} };\n}\n`;
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, file);

// App: the call where the first statement was, the others removed
const lateVar = `${hookName[0].toLowerCase()}${hookName.slice(1)}Late`;
const call = `\n${lateNames.length ? `  const ${lateVar} = useRef({} as ${hookName}Late);\n` : ''}  const { ${outs.join(', ')} } = use${hookName}({ ${[...early, ...(lateNames.length ? [`late: ${lateVar}`] : [])].join(', ')} });`;
let out = text;
const spans = moved.map((st) => [st.getFullStart(), st.getEnd()]).sort((a, b) => b[0] - a[0]);
spans.forEach(([a, b], i) => { out = out.slice(0, a) + (i === spans.length - 1 ? call : '') + out.slice(b); });
if (lateNames.length) {
  // assign the late values just before App's JSX
  const idx = out.lastIndexOf('\n  return (');
  out = out.slice(0, idx) + `\n  ${lateVar}.current = { ${lateNames.join(', ')} };` + out.slice(idx);
}
const hookImport = `import { use${hookName}${lateNames.length ? `, type ${hookName}Late` : ''} } from './features/${featureDir}/use${hookName}';\n`;
const lastImport = out.lastIndexOf('\nimport ');
const eol = out.indexOf('\n', out.indexOf(';', lastImport) );
out = out.slice(0, eol + 1) + hookImport + out.slice(eol + 1);
writeFileSync(appPath, out);
console.log(JSON.stringify({ hook: outPath.replace(root + '/', ''), moved: moved.length, inputs: early.length, late: lateNames, outputs: outs.length }));
