import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appIdentity } from '@root/app.identity';
import { resolveExpoConfig } from '@root/config/expo-config-resolver';
import {
  ANDROID_SIGNING_ENV_NAMES,
  injectAndroidReleaseSigning,
  withAndroidReleaseSigning,
} from '@root/config/with-android-release-signing';

// 原因：只替换 withAppBuildGradle，让插件拿到一份 Kotlin DSL 的 build.gradle，其余 expo/config-plugins 导出保持真实
jest.mock('expo/config-plugins', () => ({
  ...jest.requireActual('expo/config-plugins'),
  withAppBuildGradle: (
    config: object,
    action: (c: { modResults: { language: string; contents: string } }) => object,
  ) => action({ ...config, modResults: { language: 'kt', contents: '' } }),
}));

// 原因：夹具取自 Expo 官方 bare 模板的原始 app/build.gradle，用来在模板升级后第一时间发现锚点失效
const templateBuildGradle = readFileSync(
  join(__dirname, 'fixtures', 'expo-template-app-build.gradle'),
  'utf8',
);

const validBaseEnv = {
  EXPO_PUBLIC_API_BASE_URL: 'https://api.acme.cn',
  EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.acme.cn/privacy',
  EXPO_PUBLIC_USER_AGREEMENT_URL: 'https://legal.acme.cn/terms',
};

// 原因：signingConfigs 与 buildTypes 里各有一个 release 块，这里只取 buildTypes 内的那个
function releaseBuildTypeBody(contents: string): string {
  const buildTypesStart = contents.indexOf('buildTypes {');
  const start = contents.slice(buildTypesStart).search(/\n\s*release\s*\{/) + buildTypesStart;
  return contents.slice(start, start + 600);
}

describe('Seam: Android release signing is env-driven and never silently debug-signed', () => {
  it('starts from a template whose release build type is signed with the debug keystore', () => {
    expect(releaseBuildTypeBody(templateBuildGradle)).toContain(
      'signingConfig signingConfigs.debug',
    );
  });

  it('wires the production release build type to the injected release config and marks signing as required', () => {
    const output = injectAndroidReleaseSigning(templateBuildGradle, { required: true });

    expect(releaseBuildTypeBody(output)).toContain('signingConfigs.release : signingConfigs.debug');
    expect(output).toContain('project.ext.enterpriseReleaseSigningRequired = true');
    expect(output).toContain('gradle.taskGraph.whenReady');
  });

  it('guards production release tasks with a late, name-only failure that leaves assembleDebug alone', () => {
    const output = injectAndroidReleaseSigning(templateBuildGradle, { required: true });

    expect(output).toContain('gradle.taskGraph.whenReady');
    expect(output).toContain('GradleException');
    expect(output).toContain('Refusing to sign a production build with the debug keystore');
    for (const name of ANDROID_SIGNING_ENV_NAMES) {
      expect(output).toContain(`'${name}'`);
    }
    // 原因：配置阶段不得因缺少密钥而抛错，否则 assembleDebug 与 PR 构建都会被误伤
    // 原因：签名配置块和 buildTypes 里的 release 行都在配置阶段执行，二者都不得抛错；抛错只允许出现在 taskGraph 回调里
    const configurationPart = output.slice(0, output.indexOf('gradle.taskGraph.whenReady'));
    expect(configurationPart).not.toContain('throw');
    expect(output.slice(output.indexOf('gradle.taskGraph.whenReady'))).toContain(
      'throw new GradleException',
    );
  });

  it('gates the guard on the required flag and matches every release packaging task name', () => {
    const output = injectAndroidReleaseSigning(templateBuildGradle, { required: true });
    const guardCondition = output.match(/if \((project\.ext\.\w+) && releaseTaskScheduled\)/);
    const taskPattern = output.match(/task\.name ==~ \/(.+)\/\n/);

    expect(guardCondition?.[1]).toBe('project.ext.enterpriseReleaseSigningRequired');
    const patternSource = taskPattern?.[1];
    expect(patternSource).toBeDefined();
    // 原因：Groovy 的 ==~ 是整串匹配，等价于 JS 的 ^...$；这里用同一个正则核对任务名
    const matcher = new RegExp((patternSource ?? '').replace(/\\\\/g, '\\'));
    for (const name of [
      'assembleRelease',
      'bundleRelease',
      'packageRelease',
      'assembleProductionRelease',
    ]) {
      expect(matcher.test(name)).toBe(true);
    }
    for (const name of ['assembleDebug', 'bundleDebug', 'lintRelease']) {
      expect(matcher.test(name)).toBe(false);
    }
    // 原因：库模块的 bundleLib...Release 任务名同样会命中，必须靠 :app: 路径前缀排除
    expect(matcher.test('bundleLibRuntimeToJarRelease')).toBe(true);
    expect(output).toContain("task.path.startsWith(':app:')");
  });

  it('only reads credentials at Gradle runtime and never writes literal secrets', () => {
    const output = injectAndroidReleaseSigning(templateBuildGradle, { required: true });

    expect(output).toContain("System.getenv('ANDROID_KEYSTORE_PASSWORD')");
    expect(output).toContain("findProperty('ANDROID_KEYSTORE_PASSWORD')");
    const originalSecrets = templateBuildGradle.match(/(storePassword|keyPassword) '[^']*'/g) ?? [];
    const outputSecrets = output.match(/(storePassword|keyPassword) '[^']*'/g) ?? [];
    expect(outputSecrets).toEqual(originalSecrets);
  });

  it('lets non-production variants fall back to debug signing only when no release keystore is provided', () => {
    const output = injectAndroidReleaseSigning(templateBuildGradle, { required: false });

    expect(releaseBuildTypeBody(output)).toContain(
      'signingConfigs.release.storeFile != null ? signingConfigs.release : signingConfigs.debug',
    );
    expect(output).toContain('project.ext.enterpriseReleaseSigningRequired = false');
  });

  it('is idempotent', () => {
    for (const required of [true, false]) {
      const once = injectAndroidReleaseSigning(templateBuildGradle, { required });
      expect(injectAndroidReleaseSigning(once, { required })).toBe(once);
    }
  });

  it('re-targets the required flag when prebuild reruns on an existing file without --clean', () => {
    const staging = injectAndroidReleaseSigning(templateBuildGradle, { required: false });
    const stagingThenProduction = injectAndroidReleaseSigning(staging, { required: true });
    expect(stagingThenProduction).toContain('project.ext.enterpriseReleaseSigningRequired = true');
    expect(stagingThenProduction).not.toContain(
      'project.ext.enterpriseReleaseSigningRequired = false',
    );
    expect(stagingThenProduction).toBe(
      injectAndroidReleaseSigning(templateBuildGradle, { required: true }),
    );

    const production = injectAndroidReleaseSigning(templateBuildGradle, { required: true });
    const productionThenStaging = injectAndroidReleaseSigning(production, { required: false });
    expect(productionThenStaging).toBe(
      injectAndroidReleaseSigning(templateBuildGradle, { required: false }),
    );
  });

  it('fails in production when an injected file has lost its required flag line', () => {
    const injected = injectAndroidReleaseSigning(templateBuildGradle, { required: false });
    const broken = injected.replace(/^project\.ext\.enterpriseReleaseSigningRequired = .*$/m, '');

    expect(() => injectAndroidReleaseSigning(broken, { required: true })).toThrow(
      /Cannot inject Android release signing/,
    );
  });

  it('refuses production builds when app/build.gradle is not Groovy and ignores other variants', () => {
    const config = { name: 'x', slug: 'x' };

    expect(() => withAndroidReleaseSigning(config, { required: true })).toThrow(/not Groovy/);
    expect(() => withAndroidReleaseSigning(config, { required: false })).not.toThrow();
  });

  it('fails loudly in production when the template anchors disappear, instead of shipping a debug-signed build', () => {
    const changedTemplate = templateBuildGradle.replace(
      /signingConfig signingConfigs\.debug/g,
      'signingConfig null',
    );

    expect(() => injectAndroidReleaseSigning(changedTemplate, { required: true })).toThrow(
      /Cannot inject Android release signing/,
    );
    expect(injectAndroidReleaseSigning(changedTemplate, { required: false })).toBe(changedTemplate);
  });

  it('requires release signing only for the production variant in the resolved Expo config', () => {
    const signingPluginFor = (variant: string) =>
      resolveExpoConfig(appIdentity, { ...validBaseEnv, APP_VARIANT: variant }).plugins?.find(
        (plugin) => Array.isArray(plugin) && plugin[0] === './config/with-android-release-signing',
      );

    expect(signingPluginFor('production')).toEqual([
      './config/with-android-release-signing',
      { required: true },
    ]);
    expect(signingPluginFor('staging')).toEqual([
      './config/with-android-release-signing',
      { required: false },
    ]);
    expect(signingPluginFor('development')).toEqual([
      './config/with-android-release-signing',
      { required: false },
    ]);
  });

  it('keeps the capability manifest sanitizer as the first plugin', () => {
    const plugins = resolveExpoConfig(appIdentity, {
      ...validBaseEnv,
      APP_VARIANT: 'production',
    }).plugins;

    expect(Array.isArray(plugins?.[0]) && plugins?.[0][0]).toBe(
      './config/with-capability-manifest-sanitizer',
    );
  });
});
