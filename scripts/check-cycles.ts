import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { findCycles, type ImportGraph } from './lib/cycle-core';

// 原因：只做报告，除非传入 --strict；先观察当前状态，再决定是否在 CI 阻断
const root = resolve(__dirname, '..');
const strict = process.argv.includes('--strict');
const scanDirs = ['src', 'config', 'scripts'];

function listSources(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === 'node_modules' ? [] : listSources(full);
    }
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [full] : [];
  });
}

const tsconfig = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(tsconfig.config, ts.sys, root).options;
const files = scanDirs.flatMap((dir) => listSources(join(root, dir)));
const fileSet = new Set(files);

// 原因：`import type` 与 `export type` 在编译后被擦除，不会形成运行时循环，因此不计入依赖边
function importSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers: string[] = [];
  source.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
      }
    }
  });
  return specifiers;
}

const graph = new Map<string, string[]>();
for (const file of files) {
  const edges: string[] = [];
  for (const specifier of importSpecifiers(file)) {
    const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
    const target = resolved?.resolvedFileName;
    if (target && fileSet.has(target)) {
      edges.push(relative(root, target));
    }
  }
  graph.set(relative(root, file), edges);
}

const cycles = findCycles(graph as ImportGraph);
if (cycles.length === 0) {
  process.stdout.write(`未发现循环依赖（已扫描 ${files.length} 个文件）。\n`);
} else {
  process.stdout.write(`发现 ${cycles.length} 组循环依赖（已扫描 ${files.length} 个文件）：\n`);
  for (const cycle of cycles) {
    process.stdout.write(`- ${cycle.join(' <-> ')}\n`);
  }
  if (strict) {
    process.exit(1);
  }
}
