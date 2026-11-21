import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  deriveDefaultAndroidPackage,
  deriveDefaultScheme,
  deriveDefaultSlug,
  initializeAppInstance,
  parseInitCliArgs,
} from './lib/init-app-core';

const USAGE_TEXT = `
用法: pnpm init-app [选项]

不传必填参数时自动进入交互式问答模式；传入参数时支持非交互自动化执行：
  --name <名称>              应用展示名称（如 "星辰物流助手"）
  --slug <短标识>            项目英文短标识（如 "star-logistics"）
  --bundle-id <包名>         iOS Bundle Identifier（如 "com.star.logistics"）
  --android-package <包名>   Android Application ID（默认由 bundle-id 派生）
  --scheme <协议头>          Deep Link URL Scheme（默认由 slug 派生）
  --api-url <URL>            生产环境后端接口基础地址（默认 https://api.example.com）
  --privacy-url <URL>        隐私政策网页地址
  --terms-url <URL>          用户协议网页地址
  --clean-starter            一键移除示例动态流与能力实验室演示切片，仅保留纯净主壳
  --skip-git                 跳过 Git origin -> template-upstream 远端重命名
  -h, --help                 查看帮助说明
`.trim();

async function askWithDefault(
  rl: readline.Interface,
  promptLabel: string,
  defaultValue: string,
): Promise<string> {
  const answer = (await rl.question(`${promptLabel} (${defaultValue}): `)).trim();
  return answer || defaultValue;
}

async function main(): Promise<void> {
  const parsed = parseInitCliArgs(process.argv.slice(2));
  if (parsed.help) {
    console.info(USAGE_TEXT);
    return;
  }

  const projectRoot = path.resolve(__dirname, '..');
  let displayName = parsed.displayName;
  let iosBundleIdentifier = parsed.iosBundleIdentifier;
  let slug = parsed.slug;
  let androidPackage = parsed.androidPackage;
  let scheme = parsed.scheme;
  let apiBaseUrl = parsed.apiBaseUrl;
  let cleanStarter = parsed.cleanStarter;

  if (!displayName || !iosBundleIdentifier) {
    const rl = readline.createInterface({ input, output });
    try {
      displayName = await askWithDefault(rl, '1. 应用展示名称', displayName ?? '我的企业应用');
      const suggestedSlug = slug ?? deriveDefaultSlug(displayName);
      slug = await askWithDefault(rl, '2. 项目短标识 Slug', suggestedSlug);
      iosBundleIdentifier = await askWithDefault(
        rl,
        '3. iOS Bundle Identifier',
        iosBundleIdentifier ?? `com.company.${slug.replace(/-/g, '')}`,
      );
      androidPackage = await askWithDefault(
        rl,
        '4. Android Application ID',
        androidPackage ?? deriveDefaultAndroidPackage(iosBundleIdentifier),
      );
      scheme = await askWithDefault(
        rl,
        '5. Deep Link URL Scheme',
        scheme ?? deriveDefaultScheme(slug),
      );
      apiBaseUrl = await askWithDefault(
        rl,
        '6. 生产环境 API 基础地址',
        apiBaseUrl ?? 'https://api.example.com',
      );
      if (!parsed.cleanStarter) {
        const cleanAns = (await rl.question('7. 是否移除演示业务切片以进入纯净开发模式? (y/N): '))
          .trim()
          .toLowerCase();
        cleanStarter = cleanAns === 'y' || cleanAns === 'yes';
      }
    } finally {
      rl.close();
    }
  }

  const resolvedSlug = slug ?? deriveDefaultSlug(displayName);
  const resolvedAndroidPkg = androidPackage ?? deriveDefaultAndroidPackage(iosBundleIdentifier);
  const resolvedScheme = scheme ?? deriveDefaultScheme(resolvedSlug);
  const resolvedApiUrl = apiBaseUrl ?? 'https://api.example.com';

  const summary = initializeAppInstance({
    projectRoot,
    displayName,
    slug: resolvedSlug,
    iosBundleIdentifier,
    androidPackage: resolvedAndroidPkg,
    scheme: resolvedScheme,
    apiBaseUrl: resolvedApiUrl,
    privacyPolicyUrl: parsed.privacyPolicyUrl,
    userAgreementUrl: parsed.userAgreementUrl,
    cleanStarter,
    skipGit: parsed.skipGit,
  });

  console.info('\n✅ 派生应用初始化完成!');
  console.info(`   更新文件数: ${summary.updatedFiles.length}`);
  if (summary.removedPaths.length > 0) {
    console.info(`   已清理演示目录/文件: ${summary.removedPaths.join(', ')}`);
  }
  console.info(
    `   Git 远端处理: ${
      summary.gitRemoteResult.action === 'renamed'
        ? '已将 origin 重命名为 template-upstream'
        : `跳过 (${summary.gitRemoteResult.reason ?? '无需变更'})`
    }`,
  );
  console.info('\n下一步可执行: pnpm verify && pnpm ios (或 pnpm android)');
}

main().catch((err: unknown) => {
  console.error('\n❌ 初始化失败:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
