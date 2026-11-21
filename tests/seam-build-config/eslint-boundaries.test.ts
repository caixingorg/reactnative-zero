import { ESLint } from 'eslint';
import eslintConfig from '@root/eslint.config.js';

describe('Seam 2: Four-layer unidirectional dependency & strict typing lint guardrails', () => {
  // 原因：Jest 运行在未开启 --experimental-vm-modules 的沙箱中，显式传入项目真实 eslint.config.js 以绕过动态 import() 加载器限制
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: eslintConfig,
  });

  it('blocks Template Core from importing Feature Slice, Shared Layer, Route Shell, or root app.identity via both aliases and relative paths', async () => {
    const [aliasResult] = await eslint.lintText(
      `import { SettingsScreen } from '@/features/settings';\nimport { appIdentity } from '@root/app.identity';\nexport const x = [SettingsScreen, appIdentity];\n`,
      { filePath: 'src/core/illegal-import.ts' },
    );

    const aliasViolations =
      aliasResult?.messages.filter(
        (msg) =>
          msg.ruleId === 'no-restricted-imports' || msg.ruleId === 'import/no-restricted-paths',
      ) ?? [];
    expect(aliasViolations.length).toBeGreaterThanOrEqual(2);

    const [relativeResult] = await eslint.lintText(
      `import { SettingsScreen } from '../features/settings';\nimport { appIdentity } from '../../app.identity';\nexport const y = [SettingsScreen, appIdentity];\n`,
      { filePath: 'src/core/illegal-relative.ts' },
    );

    const relativeViolations =
      relativeResult?.messages.filter((msg) => msg.ruleId === 'import/no-restricted-paths') ?? [];
    expect(relativeViolations.length).toBeGreaterThanOrEqual(2);
  });

  it('blocks Shared Layer from importing Feature Slice or Route Shell via relative paths or aliases', async () => {
    const [sharedResult] = await eslint.lintText(
      `import { SettingsScreen } from '../features/settings';\nexport const ref = SettingsScreen;\n`,
      { filePath: 'src/shared/illegal-shared.ts' },
    );

    const violations =
      sharedResult?.messages.filter(
        (msg) =>
          msg.ruleId === 'no-restricted-imports' || msg.ruleId === 'import/no-restricted-paths',
      ) ?? [];
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it('blocks cross-slice private deep imports via both aliases and relative climbs', async () => {
    const [aliasFeatureResult] = await eslint.lintText(
      `import { SettingsScreen } from '@/features/settings/screens/SettingsScreen';\nexport const screenRef = SettingsScreen;\n`,
      { filePath: 'src/features/orders/illegal-cross-slice.ts' },
    );
    expect(aliasFeatureResult?.messages.some((msg) => msg.ruleId === 'no-restricted-imports')).toBe(
      true,
    );

    const [relativeFeatureResult] = await eslint.lintText(
      `import { SettingsScreen } from '../../settings/screens/SettingsScreen';\nexport const screenRef = SettingsScreen;\n`,
      { filePath: 'src/features/orders/screens/IllegalRelativeScreen.ts' },
    );
    expect(
      relativeFeatureResult?.messages.some((msg) => msg.ruleId === 'no-restricted-imports'),
    ).toBe(true);
  });

  it('blocks Route Shell and tests from bypassing Feature Slice public index barrels', async () => {
    const [appResult] = await eslint.lintText(
      `import { SettingsScreen } from '@/features/settings/screens/SettingsScreen';\nexport default SettingsScreen;\n`,
      { filePath: 'src/app/illegal-deep-route.tsx' },
    );
    expect(appResult?.messages.some((msg) => msg.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('blocks Template Core runtime and permission coordinator from coupling to removable Capability Modules', async () => {
    const [runtimeResult] = await eslint.lintText(
      `import { useCameraCapability } from '../capabilities/camera';\nexport const ref = useCameraCapability;\n`,
      { filePath: 'src/core/runtime/illegal-capability-coupling.ts' },
    );
    expect(runtimeResult?.messages.some((msg) => msg.ruleId === 'import/no-restricted-paths')).toBe(
      true,
    );
  });

  it('blocks explicit any usage across TypeScript files', async () => {
    const [anyResult] = await eslint.lintText(
      `export function unsafeParse(payload: any): string { return String(payload); }\n`,
      { filePath: 'src/core/unsafe.ts' },
    );

    const anyMessages =
      anyResult?.messages.filter((msg) => msg.ruleId === '@typescript-eslint/no-explicit-any') ??
      [];
    expect(anyMessages).toHaveLength(1);
  });

  it('blocks process.env.NODE_ENV test-branch sniffing inside src/ production files', async () => {
    const [nodeEnvResult] = await eslint.lintText(
      `export const isTest = process.env.NODE_ENV === 'test';\n`,
      { filePath: 'src/core/illegal-node-env.ts' },
    );

    const violations =
      nodeEnvResult?.messages.filter((msg) => msg.ruleId === 'no-restricted-syntax') ?? [];
    expect(violations).toHaveLength(1);
  });
});
