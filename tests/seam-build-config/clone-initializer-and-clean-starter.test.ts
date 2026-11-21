import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import {
  buildImWebhookPayload,
  executeInternalDistribution,
  parseDistributeCliArgs,
  type DistributeHttpRequest,
} from '@root/scripts/lib/distribute-core';
import {
  initializeAppInstance,
  parseInitCliArgs,
  type GitCommandResult,
  type GitCommandRunner,
} from '@root/scripts/lib/init-app-core';

const REPO_ROOT = path.resolve(__dirname, '../..');

function computeDirectoryHashes(rootDir: string): Record<string, string> {
  const result: Record<string, string> = {};

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = path.relative(rootDir, fullPath);
        const content = fs.readFileSync(fullPath);
        result[relPath] = crypto.createHash('sha256').update(content).digest('hex');
      }
    }
  }

  walk(rootDir);
  return result;
}

function createProjectSandboxCopy(): string {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-template-sandbox-'));
  const filesToCopy = [
    'app.identity.ts',
    'app.config.ts',
    'babel.config.js',
    'metro.config.js',
    'jest.config.js',
    'package.json',
    'tsconfig.json',
    'eslint.config.js',
  ];
  for (const relFile of filesToCopy) {
    fs.copyFileSync(path.join(REPO_ROOT, relFile), path.join(sandboxDir, relFile));
  }

  const dirsToCopy = ['config', 'scripts', 'src', 'tests', '.maestro', 'fastlane', '.github'];
  for (const relDir of dirsToCopy) {
    fs.cpSync(path.join(REPO_ROOT, relDir), path.join(sandboxDir, relDir), { recursive: true });
  }

  fs.symlinkSync(
    path.join(REPO_ROOT, 'node_modules'),
    path.join(sandboxDir, 'node_modules'),
    'dir',
  );
  return sandboxDir;
}

function runSandboxTypecheck(sandboxDir: string): string[] {
  const configPath = path.join(sandboxDir, 'tsconfig.json');
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    return [ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n')];
  }
  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, sandboxDir);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return diagnostics.map((diag) => {
    const msg = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
    if (diag.file && diag.start !== undefined) {
      const pos = diag.file.getLineAndCharacterOfPosition(diag.start);
      const rel = path.relative(sandboxDir, diag.file.fileName);
      return `${rel}:${pos.line + 1}:${pos.character + 1} - ${msg}`;
    }
    return msg;
  });
}

describe('Seam 2: Clone initializer (init-app) & --clean-starter verification', () => {
  it('parses CLI flags accurately and rejects malformed bundle IDs, Android package names, schemes, or API URLs', () => {
    const parsed = parseInitCliArgs([
      '--name',
      '星辰物流',
      '--slug',
      'star-logistics',
      '--bundle-id',
      'com.star.logistics',
      '--android-package',
      'com.star.logistics',
      '--scheme',
      'starlogistics',
      '--api-url',
      'https://api.star.cn',
      '--clean-starter',
    ]);

    expect(parsed.displayName).toBe('星辰物流');
    expect(parsed.slug).toBe('star-logistics');
    expect(parsed.cleanStarter).toBe(true);

    const sandboxDir = createProjectSandboxCopy();
    try {
      expect(() =>
        initializeAppInstance({
          projectRoot: sandboxDir,
          displayName: '非法包名测试',
          slug: 'bad-pkg',
          iosBundleIdentifier: 'com.valid.app',
          androidPackage: 'Com.Invalid-Dash.App',
          scheme: 'validscheme',
          apiBaseUrl: 'https://api.valid.com',
          skipGit: true,
        }),
      ).toThrow(/androidPackage/i);

      expect(() =>
        initializeAppInstance({
          projectRoot: sandboxDir,
          displayName: '非法 Scheme 测试',
          slug: 'bad-scheme',
          iosBundleIdentifier: 'com.valid.app',
          androidPackage: 'com.valid.app',
          scheme: '123_INVALID_SCHEME',
          apiBaseUrl: 'https://api.valid.com',
          skipGit: true,
        }),
      ).toThrow(/scheme/i);

      expect(() =>
        initializeAppInstance({
          projectRoot: sandboxDir,
          displayName: '非法接口地址测试',
          slug: 'bad-url',
          iosBundleIdentifier: 'com.valid.app',
          androidPackage: 'com.valid.app',
          scheme: 'validscheme',
          apiBaseUrl: 'ftp://not-http.example.com',
          skipGit: true,
        }),
      ).toThrow(/apiBaseUrl/i);
    } finally {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  it('rewrites App Identity (including $& special chars safely) & env files, renames origin -> template-upstream idempotently, and leaves Template Core (src/core) 100% untouched', () => {
    const sandboxDir = createProjectSandboxCopy();
    try {
      const coreHashesBefore = computeDirectoryHashes(path.join(sandboxDir, 'src/core'));
      let remotes = ['origin'];
      const executedGitArgs: string[][] = [];

      const mockGitRunner: GitCommandRunner = (args: string[]): GitCommandResult => {
        executedGitArgs.push(args);
        if (args[0] === 'remote' && args.length === 1) {
          return { status: 0, stdout: `${remotes.join('\n')}\n`, stderr: '' };
        }
        if (
          args[0] === 'remote' &&
          args[1] === 'rename' &&
          args[2] === 'origin' &&
          args[3] === 'template-upstream'
        ) {
          remotes = ['template-upstream'];
          return { status: 0, stdout: '', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      };

      const firstRun = initializeAppInstance({
        projectRoot: sandboxDir,
        displayName: '星辰 $& 物流助手',
        slug: 'star-logistics',
        iosBundleIdentifier: 'com.star.logistics',
        androidPackage: 'com.star.logistics',
        scheme: 'starlogistics',
        apiBaseUrl: 'https://api.starlogistics.cn',
        gitRunner: mockGitRunner,
      });

      expect(firstRun.gitRemoteResult.action).toBe('renamed');
      expect(executedGitArgs).toContainEqual(['remote', 'rename', 'origin', 'template-upstream']);

      // Re-running when template-upstream already exists is safe and idempotent
      const secondRun = initializeAppInstance({
        projectRoot: sandboxDir,
        displayName: '星辰 $& 物流助手',
        slug: 'star-logistics',
        iosBundleIdentifier: 'com.star.logistics',
        androidPackage: 'com.star.logistics',
        scheme: 'starlogistics',
        apiBaseUrl: 'https://api.starlogistics.cn',
        gitRunner: mockGitRunner,
      });
      expect(secondRun.gitRemoteResult.action).toBe('skipped');

      const updatedIdentity = fs.readFileSync(path.join(sandboxDir, 'app.identity.ts'), 'utf8');
      expect(updatedIdentity).toContain('displayName: "星辰 $& 物流助手"');
      expect(updatedIdentity).toContain('slug: "star-logistics"');
      expect(updatedIdentity).toContain('iosBundleIdentifier: "com.star.logistics"');
      expect(updatedIdentity).toContain('androidPackage: "com.star.logistics"');
      expect(updatedIdentity).toContain('scheme: "starlogistics"');

      const updatedPkg = JSON.parse(
        fs.readFileSync(path.join(sandboxDir, 'package.json'), 'utf8'),
      ) as { name: string };
      expect(updatedPkg.name).toBe('star-logistics');

      const prodEnv = fs.readFileSync(
        path.join(sandboxDir, 'config', 'env', 'production.env'),
        'utf8',
      );
      expect(prodEnv).toContain('EXPO_PUBLIC_API_BASE_URL=https://api.starlogistics.cn');

      const coreHashesAfter = computeDirectoryHashes(path.join(sandboxDir, 'src/core'));
      expect(coreHashesAfter).toEqual(coreHashesBefore);

      // Corrupted app.identity.ts missing expected field fails loudly instead of silent success
      fs.writeFileSync(
        path.join(sandboxDir, 'app.identity.ts'),
        'export const appIdentity = {};\n',
      );
      expect(() =>
        initializeAppInstance({
          projectRoot: sandboxDir,
          displayName: '损坏身份文件测试',
          slug: 'broken-id',
          iosBundleIdentifier: 'com.broken.id',
          androidPackage: 'com.broken.id',
          scheme: 'brokenid',
          apiBaseUrl: 'https://api.broken.cn',
          skipGit: true,
        }),
      ).toThrow(/Failed to rewrite field "displayName"/);
    } finally {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  it('strips demo Starter Slices & syncs Maestro smoke in --clean-starter mode while passing full TypeScript, ESLint, and Jest suites with 0-byte diff in src/core', () => {
    const sandboxDir = createProjectSandboxCopy();
    try {
      const coreHashesBefore = computeDirectoryHashes(path.join(sandboxDir, 'src/core'));

      initializeAppInstance({
        projectRoot: sandboxDir,
        displayName: '纯净业务起步盘',
        slug: 'clean-business-app',
        iosBundleIdentifier: 'com.clean.business',
        androidPackage: 'com.clean.business',
        scheme: 'cleanbiz',
        apiBaseUrl: 'https://api.cleanbiz.cn',
        cleanStarter: true,
        skipGit: true,
      });

      // Removed demo slices & routes
      expect(fs.existsSync(path.join(sandboxDir, 'src/features/capabilities-lab'))).toBe(false);
      expect(fs.existsSync(path.join(sandboxDir, 'src/features/demo'))).toBe(false);
      expect(fs.existsSync(path.join(sandboxDir, 'src/app/payment-demo.tsx'))).toBe(false);
      expect(fs.existsSync(path.join(sandboxDir, 'src/app/(tabs)/lab.tsx'))).toBe(false);
      expect(fs.existsSync(path.join(sandboxDir, 'src/app/feed'))).toBe(false);
      expect(
        fs.existsSync(path.join(sandboxDir, 'src/shared/components/FeedStatusBadge.tsx')),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(sandboxDir, 'src/features/home/screens/FeedDetailScreen.tsx')),
      ).toBe(false);

      // Drawer shell has no dangling paymentDemo route
      expect(
        fs.readFileSync(path.join(sandboxDir, 'src/features/shell/DrawerMenu.tsx'), 'utf8'),
      ).not.toContain('paymentDemo');
      expect(
        fs.readFileSync(path.join(sandboxDir, 'src/features/shell/AppShellOverlays.tsx'), 'utf8'),
      ).not.toContain('/payment-demo');

      // Headless payment capability retained and zero closed-source payment SDKs in default dependencies
      expect(fs.existsSync(path.join(sandboxDir, 'src/core/capabilities/payment/index.ts'))).toBe(
        true,
      );
      const pkgDeps = Object.keys(
        (
          JSON.parse(fs.readFileSync(path.join(sandboxDir, 'package.json'), 'utf8')) as {
            dependencies?: Record<string, string>;
          }
        ).dependencies ?? {},
      );
      expect(pkgDeps).not.toContain('react-native-wechat-lib');
      expect(pkgDeps).not.toContain('@uiw/react-native-alipay');
      expect(pkgDeps).not.toContain('@stripe/stripe-react-native');

      // Maestro smoke script updated to omit deleted demo tabs
      const cleanSmokeYaml = fs.readFileSync(path.join(sandboxDir, '.maestro/smoke.yaml'), 'utf8');
      expect(cleanSmokeYaml).not.toContain('能力实验室');
      expect(cleanSmokeYaml).not.toContain('业务动态列表');
      expect(cleanSmokeYaml).toContain('个人设置');

      // Preserved core slices & zero-touch Template Core
      expect(fs.existsSync(path.join(sandboxDir, 'src/features/auth'))).toBe(true);
      expect(fs.existsSync(path.join(sandboxDir, 'src/features/settings'))).toBe(true);
      expect(fs.existsSync(path.join(sandboxDir, 'src/app/privacy-consent.tsx'))).toBe(true);

      const coreHashesAfter = computeDirectoryHashes(path.join(sandboxDir, 'src/core'));
      expect(coreHashesAfter).toEqual(coreHashesBefore);

      // 1. Full TypeScript check on cleaned sandbox
      const tsErrors = runSandboxTypecheck(sandboxDir);
      expect(tsErrors).toEqual([]);

      // 2. Full ESLint check (including 4-layer dependency boundaries) on cleaned sandbox
      const eslintBin = path.join(REPO_ROOT, 'node_modules/eslint/bin/eslint.js');
      const eslintRun = spawnSync(process.execPath, [eslintBin, '.'], {
        cwd: sandboxDir,
        encoding: 'utf8',
      });
      expect({
        status: eslintRun.status,
        stdout: eslintRun.stdout,
        stderr: eslintRun.stderr,
      }).toEqual({
        status: 0,
        stdout: '',
        stderr: '',
      });

      // 3. Full Jest test suite execution on cleaned sandbox
      const jestBin = path.join(REPO_ROOT, 'node_modules/jest/bin/jest.js');
      const jestRun = spawnSync(process.execPath, [jestBin, '--runInBand'], {
        cwd: sandboxDir,
        encoding: 'utf8',
      });
      expect(jestRun.status).toBe(0);
    } finally {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  }, 30000);

  it('executes PGYER two-step COS upload and dispatches Feishu / WeCom / DingTalk build cards with variant & channel metadata', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-distribute-test-'));
    const dummyApkPath = path.join(tempDir, 'app-staging-huawei.apk');
    fs.writeFileSync(dummyApkPath, 'dummy-apk-binary', 'utf8');

    try {
      const parsedArgs = parseDistributeCliArgs(
        [
          '--platform',
          'android',
          '--variant',
          'staging',
          '--channel',
          'huawei',
          '--artifact',
          dummyApkPath,
          '--app-name',
          '星辰物流助手',
          '--version',
          '2.1.0',
          '--commit',
          'a1b2c3d',
          '--release-notes',
          '华为应用市场渠道包回归验证',
          '--pgyer-api-key',
          'test-pgyer-key',
          '--webhook-type',
          'feishu',
          '--webhook-url',
          'https://open.feishu.cn/open-apis/bot/v2/hook/mock-token',
        ],
        {},
      );

      const recordedRequests: DistributeHttpRequest[] = [];
      const mockFetch = jest.fn(async (req: DistributeHttpRequest) => {
        recordedRequests.push(req);
        if (req.url.includes('getCOSToken')) {
          return {
            status: 200,
            data: {
              code: 0,
              data: {
                key: 'pgyer-build-key-001',
                endpoint: 'https://cos.ap-shanghai.myqcloud.com/pgyer-upload',
                params: {
                  key: 'pgyer-build-key-001',
                  signature: 'sig-123',
                  'x-cos-security-token': 'tok-456',
                },
              },
            },
          };
        }
        if (req.url.includes('cos.ap-shanghai.myqcloud.com')) {
          return { status: 204, data: null };
        }
        if (req.url.includes('buildInfo')) {
          return {
            status: 200,
            data: {
              code: 0,
              data: {
                buildKey: 'pgyer-build-key-001',
                buildShortcutUrl: 'star-huawei',
                buildQRCodeURL: 'https://www.pgyer.com/app/qrcodeHistory/star-huawei',
              },
            },
          };
        }
        return { status: 200, data: { code: 0 } };
      });

      const result = await executeInternalDistribution(parsedArgs, mockFetch);
      expect(result.pgyerUploaded).toBe(true);
      expect(result.webhookDelivered).toBe(true);
      expect(result.downloadUrl).toBe('https://www.pgyer.com/star-huawei');
      expect(result.qrCodeUrl).toBe('https://www.pgyer.com/app/qrcodeHistory/star-huawei');
      expect(recordedRequests).toHaveLength(4);
      // 原因：PGYER buildInfo 必须走 POST 表单体，严禁在 URL QueryString 中暴露 _api_key
      const buildInfoReq = recordedRequests.find((r) => r.url.includes('buildInfo'));
      expect(buildInfoReq?.method).toBe('POST');
      expect(buildInfoReq?.url).not.toContain('test-pgyer-key');
      expect(JSON.stringify(result.webhookPayload)).toContain('huawei');
      expect(JSON.stringify(result.webhookPayload)).toContain('STAGING');

      // 非 dryRun 下缺失上传凭证与下载地址时必须显式报错，严禁把 mock 假地址推给真实群机器人
      await expect(
        executeInternalDistribution(
          parseDistributeCliArgs(['--platform', 'android', '--variant', 'staging'], {}),
          mockFetch,
        ),
      ).rejects.toThrow(/Missing distribution target/i);

      // Webhook URL 强制要求 https://
      expect(() =>
        parseDistributeCliArgs(
          ['--webhook-type', 'feishu', '--webhook-url', 'http://insecure-hook.example.com'],
          {},
        ),
      ).toThrow(/only https:\/\//i);

      const wecomPayload = buildImWebhookPayload('wecom', {
        appName: '星辰物流助手',
        platform: 'android',
        variant: 'production',
        channel: 'xiaomi',
        version: '2.1.0',
        releaseNotes: '小米渠道正式包',
        downloadUrl: result.downloadUrl,
        qrCodeUrl: result.qrCodeUrl,
      });
      expect(wecomPayload.msgtype).toBe('markdown');
      expect(JSON.stringify(wecomPayload)).toContain('xiaomi');

      const dingPayload = buildImWebhookPayload('dingtalk', {
        appName: '星辰物流助手',
        platform: 'ios',
        variant: 'staging',
        channel: 'app_store',
        version: '2.1.0',
        releaseNotes: 'iOS 内测归档',
        downloadUrl: result.downloadUrl,
        qrCodeUrl: result.qrCodeUrl,
      });
      expect(dingPayload.msgtype).toBe('markdown');
      expect(JSON.stringify(dingPayload)).toContain('![扫码安装二维码]');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
