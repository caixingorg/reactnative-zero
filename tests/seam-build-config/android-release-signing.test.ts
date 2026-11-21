import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appIdentity } from '@root/app.identity';
import { resolveExpoConfig } from '@root/config/expo-config-resolver';
import {
  ANDROID_SIGNING_ENV_NAMES,
  injectAndroidReleaseSigning,
} from '@root/config/with-android-release-signing';

// 原因：夹具取自 Expo 官方 bare 模板的原始 app/build.gradle，用来在模板升级后第一时间发现锚点失效
const templateBuildGradle = readFileSync(
  join(__dirname, 'fixtures', 'expo-template-app-build.gradle'),
  'utf8',
);

const validBaseEnv = {
  EXPO_PUBLIC_API_BASE_URL: 'https://api.example.com',
  EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.example.com/privacy',
  EXPO_PUBLIC_USER_AGREEMENT_URL: 'https://legal.example.com/terms',
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

  it('signs the production release build type with the injected release config instead of debug', () => {
    const output = injectAndroidReleaseSigning(templateBuildGradle, { required: true });

    expect(releaseBuildTypeBody(output)).toContain('signingConfig signingConfigs.release');
    expect(releaseBuildTypeBody(output)).not.toContain('signingConfigs.debug');
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
    const beginMarker = '// @enterprise-rn-release-signing-begin';
    const endMarker = '// @enterprise-rn-release-signing-end';
    const configurationBlock = output.slice(
      output.indexOf(beginMarker),
      output.indexOf(endMarker) + endMarker.length,
    );
    expect(configurationBlock).not.toContain('throw');
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
    expect(output).not.toContain('gradle.taskGraph.whenReady');
  });

  it('is idempotent', () => {
    for (const required of [true, false]) {
      const once = injectAndroidReleaseSigning(templateBuildGradle, { required });
      expect(injectAndroidReleaseSigning(once, { required })).toBe(once);
    }
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
