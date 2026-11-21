/**
 * @module config/with-android-release-signing
 * 职责：在 `android/app/build.gradle` 幂等注入由环境变量驱动的 release 签名配置，替换 Expo 模板默认的 debug 密钥签名。
 * 边界：只写入「在 Gradle 运行时读取环境变量」的代码，密钥、口令绝不在预构建期写入文件；production 变体缺少签名配置时，
 * 仅在 release 打包任务被调度时失败，不影响 `assembleDebug`。
 */
import { withAppBuildGradle, type ConfigPlugin } from 'expo/config-plugins';

export interface AndroidReleaseSigningPluginProps {
  /** production 变体为 true：缺少签名配置时 release 打包直接失败，绝不回退到 debug 密钥 */
  required: boolean;
}

// 原因：变量名集中声明，Gradle 脚本与文档、测试共用同一份清单，避免漂移
export const ANDROID_SIGNING_ENV_NAMES = [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
] as const;

const SIGNING_BEGIN_MARKER = '// @enterprise-rn-release-signing-begin';
const SIGNING_END_MARKER = '// @enterprise-rn-release-signing-end';
const REQUIRED_FLAG = 'project.ext.enterpriseReleaseSigningRequired';
const REQUIRED_FLAG_LINE = /^project\.ext\.enterpriseReleaseSigningRequired = (true|false)$/m;

// 原因：Expo 模板里 release 构建类型以 `release {` 开头；只在该块内替换签名行，避免误改 debug 构建类型
const RELEASE_BUILD_TYPE_BLOCK =
  /(buildTypes\s*\{[\s\S]*?\n[ \t]*release\s*\{[\s\S]*?)(signingConfig signingConfigs\.debug)/;
const SIGNING_CONFIGS_ANCHOR = /signingConfigs\s*\{/;
const ANDROID_BLOCK_ANCHOR = /^android\s*\{/m;

function buildSigningConfigBlock(): string {
  const [pathName, passwordName, aliasName, keyPasswordName] = ANDROID_SIGNING_ENV_NAMES;
  return [
    `        ${SIGNING_BEGIN_MARKER}`,
    '        release {',
    // 原因：优先读环境变量，其次读 ~/.gradle/gradle.properties，便于自建 Mac 与 CI 两种注入方式
    `            def keystorePath = System.getenv('${pathName}') ?: findProperty('${pathName}')`,
    '            if (keystorePath) {',
    '                storeFile file(keystorePath)',
    `                storePassword System.getenv('${passwordName}') ?: findProperty('${passwordName}')`,
    `                keyAlias System.getenv('${aliasName}') ?: findProperty('${aliasName}')`,
    `                keyPassword System.getenv('${keyPasswordName}') ?: findProperty('${keyPasswordName}')`,
    '            }',
    '        }',
    `        ${SIGNING_END_MARKER}`,
  ].join('\n');
}

// 原因：「是否必须签名」只由这一行决定，重复预构建切换变体时只改这一行，不会残留上一个变体的行为
function buildRequiredFlagBlock(required: boolean): string {
  return [
    SIGNING_BEGIN_MARKER,
    '// 原因：production 为 true 时，release 打包任务缺少签名配置会直接失败，绝不回退 debug 密钥',
    `${REQUIRED_FLAG} = ${required}`,
    SIGNING_END_MARKER,
    '',
    '',
  ].join('\n');
}

function buildSigningGuard(): string {
  const names = ANDROID_SIGNING_ENV_NAMES.map((name) => `'${name}'`).join(', ');
  return [
    '',
    SIGNING_BEGIN_MARKER,
    '// 原因：在任务图确定后才校验，只拦截 release 打包任务，assembleDebug 不受影响；报错信息只列变量名，绝不输出取值',
    'gradle.taskGraph.whenReady { graph ->',
    '    def releaseTaskScheduled = graph.allTasks.any { task ->',
    "        task.path.startsWith(':app:') && task.name ==~ /^(assemble|bundle|package)\\w*Release$/",
    '    }',
    `    if (${REQUIRED_FLAG} && releaseTaskScheduled) {`,
    `        def missing = [${names}].findAll { name ->`,
    '            !(System.getenv(name) ?: findProperty(name))',
    '        }',
    '        if (!missing.isEmpty()) {',
    '            throw new GradleException(',
    "                'production release signing is not configured. Missing: ' + missing.join(', ') +",
    "                '. Refusing to sign a production build with the debug keystore.'",
    '            )',
    '        }',
    '    }',
    '}',
    SIGNING_END_MARKER,
    '',
  ].join('\n');
}

const MISSING_ANCHOR_MESSAGE =
  'Cannot inject Android release signing: the expected app/build.gradle anchors ' +
  '(android block, signingConfigs, release buildType) were not found. The Expo template changed; ' +
  'update config/with-android-release-signing.ts instead of shipping a debug-signed production build.';

// 原因：纯函数便于 seam 测试；production 下找不到锚点必须抛错，否则模板升级后会静默回到 debug 签名
export function injectAndroidReleaseSigning(
  buildGradleContents: string,
  { required }: AndroidReleaseSigningPluginProps,
): string {
  if (buildGradleContents.includes(SIGNING_BEGIN_MARKER)) {
    // 原因：不带 --clean 的二次预构建会复用已注入的文件，必须把「是否必须签名」更新为当前变体的取值
    if (!REQUIRED_FLAG_LINE.test(buildGradleContents)) {
      if (required) {
        throw new Error(MISSING_ANCHOR_MESSAGE);
      }
      return buildGradleContents;
    }
    return buildGradleContents.replace(REQUIRED_FLAG_LINE, `${REQUIRED_FLAG} = ${required}`);
  }

  const hasAnchors =
    ANDROID_BLOCK_ANCHOR.test(buildGradleContents) &&
    SIGNING_CONFIGS_ANCHOR.test(buildGradleContents) &&
    RELEASE_BUILD_TYPE_BLOCK.test(buildGradleContents);

  if (!hasAnchors) {
    if (required) {
      throw new Error(MISSING_ANCHOR_MESSAGE);
    }
    return buildGradleContents;
  }

  const withFlag = buildGradleContents.replace(
    ANDROID_BLOCK_ANCHOR,
    (match) => `${buildRequiredFlagBlock(required)}${match}`,
  );
  const withSigningConfig = withFlag.replace(
    SIGNING_CONFIGS_ANCHOR,
    (match) => `${match}\n${buildSigningConfigBlock()}`,
  );
  // 原因：非 production 在未提供密钥时回退 debug 签名以便测试包照常出；production 固定使用 release 签名，由任务图守卫保证配置齐全
  const releaseSigningExpression = `signingConfig ${REQUIRED_FLAG} || signingConfigs.release.storeFile != null ? signingConfigs.release : signingConfigs.debug`;
  const withReleaseSigning = withSigningConfig.replace(
    RELEASE_BUILD_TYPE_BLOCK,
    (_match, prefix: string) => `${prefix}${releaseSigningExpression}`,
  );

  return `${withReleaseSigning}${buildSigningGuard()}`;
}

export const withAndroidReleaseSigning: ConfigPlugin<AndroidReleaseSigningPluginProps> = (
  initialConfig,
  props,
) =>
  withAppBuildGradle(initialConfig, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      // 原因：Kotlin DSL 暂不支持注入；production 下静默跳过会回到 debug 签名，必须失败
      if (props.required) {
        throw new Error(
          'Cannot inject Android release signing: app/build.gradle is not Groovy. ' +
            'Add support in config/with-android-release-signing.ts before building production.',
        );
      }
      return modConfig;
    }
    modConfig.modResults.contents = injectAndroidReleaseSigning(
      modConfig.modResults.contents,
      props,
    );
    return modConfig;
  });

export default withAndroidReleaseSigning;
