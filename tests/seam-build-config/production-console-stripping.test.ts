import path from 'node:path';
import { transformSync } from '@babel/core';

const SAMPLE = [
  "console.log('debug-line');",
  "console.info('info-line');",
  "console.warn('warn-line');",
  "console.error('error-line');",
].join('\n');

// 原因：babel-preset-expo 按 caller 判断目标平台；@types/babel__core 的 TransformCaller 未声明 platform，
// 经变量传入以绕过对象字面量的多余属性检查，运行时行为不变
const METRO_CALLER = { name: 'metro', platform: 'android' };

function compileWithVariant(variant: string): string {
  const previous = process.env.APP_VARIANT;
  process.env.APP_VARIANT = variant;
  try {
    const result = transformSync(SAMPLE, {
      filename: 'sample.js',
      babelrc: false,
      configFile: path.resolve(__dirname, '../../babel.config.js'),
      caller: METRO_CALLER,
    });
    return result?.code ?? '';
  } finally {
    if (previous === undefined) {
      delete process.env.APP_VARIANT;
    } else {
      process.env.APP_VARIANT = previous;
    }
  }
}

describe('Seam: production-only console stripping at compile time', () => {
  it('removes console.log and console.info but keeps warn and error in production', () => {
    const code = compileWithVariant('production');

    expect(code).not.toContain('debug-line');
    expect(code).not.toContain('info-line');
    expect(code).toContain('warn-line');
    expect(code).toContain('error-line');
  });

  it('keeps every console call in staging and development', () => {
    for (const variant of ['staging', 'development']) {
      const code = compileWithVariant(variant);

      expect(code).toContain('debug-line');
      expect(code).toContain('info-line');
    }
  });

  it('does not leak the production result into a later non-production compile (cache isolation)', () => {
    compileWithVariant('production');

    expect(compileWithVariant('staging')).toContain('debug-line');
  });
});
