#!/usr/bin/env node
/* global __dirname */
/**
 * 原因：在无 macOS 模拟器的 Linux CI 节点上静态校验所有 Maestro E2E YAML 的基本结构与 runFlow 引用完整性，提前拦截断链与格式错误
 */
const fs = require('node:fs');
const path = require('node:path');

const maestroRoot = path.resolve(__dirname, '..', '.maestro');

function collectYamlFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectYamlFiles(fullPath));
    } else if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

if (!fs.existsSync(maestroRoot)) {
  console.error('[verify-maestro-flows] Missing .maestro directory.');
  process.exit(1);
}

const files = collectYamlFiles(maestroRoot);
if (files.length === 0) {
  console.error('[verify-maestro-flows] No Maestro YAML files found under .maestro/.');
  process.exit(1);
}

const errors = [];

for (const filePath of files) {
  const relPath = path.relative(process.cwd(), filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  if (!lines.some((line) => line.trim().startsWith('appId:'))) {
    errors.push(`${relPath}: missing required header field "appId:"`);
  }
  if (!lines.some((line) => line.trim() === '---')) {
    errors.push(`${relPath}: missing Maestro frontmatter separator "---"`);
  }

  const FORBIDDEN_LEGACY_STRINGS = ['业务动态列表', '能力实验室'];
  for (const legacyStr of FORBIDDEN_LEGACY_STRINGS) {
    if (content.includes(legacyStr)) {
      errors.push(
        `${relPath}: contains obsolete v1 UI selector "${legacyStr}" removed from current 4-tab shell`,
      );
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*-\s*runFlow:\s*['"]?([^'"#\s]+)['"]?/);
    if (match) {
      const targetFlow = path.resolve(path.dirname(filePath), match[1]);
      if (!fs.existsSync(targetFlow)) {
        errors.push(`${relPath}:${i + 1}: referenced runFlow target not found -> ${match[1]}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('[verify-maestro-flows] Validation failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

console.log(`[verify-maestro-flows] Verified ${files.length} Maestro flow files cleanly.`);
