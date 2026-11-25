import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeHttpBaseUrl } from '../../src/core/config/url-validator';

export interface GitCommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type GitCommandRunner = (args: string[], cwd: string) => GitCommandResult;

export interface GitRemoteRenameResult {
  action: 'renamed' | 'skipped';
  reason?: string;
}

export interface InitializeAppInstanceOptions {
  projectRoot: string;
  displayName: string;
  slug: string;
  iosBundleIdentifier: string;
  androidPackage: string;
  scheme: string;
  apiBaseUrl: string;
  stagingApiBaseUrl?: string;
  devApiBaseUrl?: string;
  privacyPolicyUrl?: string;
  userAgreementUrl?: string;
  cleanStarter?: boolean;
  skipGit?: boolean;
  gitRunner?: GitCommandRunner;
}

export interface InitializeAppInstanceResult {
  updatedFiles: string[];
  removedPaths: string[];
  gitRemoteResult: GitRemoteRenameResult;
}

export interface ParsedInitCliArgs {
  help?: boolean;
  displayName?: string;
  slug?: string;
  iosBundleIdentifier?: string;
  androidPackage?: string;
  scheme?: string;
  apiBaseUrl?: string;
  privacyPolicyUrl?: string;
  userAgreementUrl?: string;
  cleanStarter: boolean;
  skipGit: boolean;
}

// 原因：遵循 Apple CFBundleIdentifier、Android Java 包名（禁连字符与数字打头）与 RFC 3986 URI Scheme 硬性语法规范，在克隆阶段提前拦截非法原生工程标识符
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IOS_BUNDLE_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*)+$/;
const ANDROID_PACKAGE_REGEX = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const URI_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*$/;

function defaultGitRunner(args: string[], cwd: string): GitCommandResult {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    status: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

export function validateHttpUrl(rawUrl: string, fieldName: string): string {
  const normalized = normalizeHttpBaseUrl(rawUrl);
  if (!normalized) {
    throw new Error(`Invalid ${fieldName}: "${rawUrl}" must be a valid http:// or https:// URL.`);
  }
  return normalized;
}

export function deriveDefaultSlug(input: string): string {
  const ascii = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'enterprise-mobile-app';
}

export function deriveDefaultAndroidPackage(bundleId: string): string {
  return bundleId
    .toLowerCase()
    .split('.')
    .map((segment) => {
      const cleaned = segment.replace(/[^a-z0-9_]/g, '_');
      return /^[a-z]/.test(cleaned) ? cleaned : `app_${cleaned}`;
    })
    .join('.');
}

export function deriveDefaultScheme(slug: string): string {
  const cleaned = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  return /^[a-z]/.test(cleaned) ? cleaned : `app${cleaned}`;
}

function deriveVariantApiUrl(prodApiUrl: string, variantPrefix: 'dev' | 'staging'): string {
  const parsed = new URL(prodApiUrl);
  if (parsed.hostname.startsWith('api.')) {
    parsed.hostname = parsed.hostname.replace(/^api\./, `api-${variantPrefix}.`);
    return parsed.toString().replace(/\/+$/, '');
  }
  return prodApiUrl;
}

export function parseInitCliArgs(argv: readonly string[]): ParsedInitCliArgs {
  const result: ParsedInitCliArgs = {
    cleanStarter: false,
    skipGit: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const nextValue = (): string | undefined => {
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        i += 1;
        return val;
      }
      return undefined;
    };

    switch (arg) {
      case '-h':
      case '--help':
        result.help = true;
        break;
      case '--name':
        result.displayName = nextValue();
        break;
      case '--slug':
        result.slug = nextValue();
        break;
      case '--bundle-id':
        result.iosBundleIdentifier = nextValue();
        break;
      case '--android-package':
        result.androidPackage = nextValue();
        break;
      case '--scheme':
        result.scheme = nextValue();
        break;
      case '--api-url':
        result.apiBaseUrl = nextValue();
        break;
      case '--privacy-url':
        result.privacyPolicyUrl = nextValue();
        break;
      case '--terms-url':
        result.userAgreementUrl = nextValue();
        break;
      case '--clean-starter':
        result.cleanStarter = true;
        break;
      case '--skip-git':
        result.skipGit = true;
        break;
      default:
        break;
    }
  }

  return result;
}

function validateIdentityInputs(options: InitializeAppInstanceOptions): {
  displayName: string;
  slug: string;
  iosBundleIdentifier: string;
  androidPackage: string;
  scheme: string;
  prodApiUrl: string;
  stagingApiUrl: string;
  devApiUrl: string;
  privacyUrl: string;
  termsUrl: string;
} {
  const displayName = options.displayName.trim();
  if (!displayName) {
    throw new Error('Invalid displayName: display name must not be empty.');
  }

  const slug = options.slug.trim();
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      `Invalid slug "${slug}": expected lowercase letters, digits, and single hyphens (e.g. "star-logistics").`,
    );
  }

  const iosBundleIdentifier = options.iosBundleIdentifier.trim();
  if (!IOS_BUNDLE_ID_REGEX.test(iosBundleIdentifier)) {
    throw new Error(
      `Invalid iosBundleIdentifier "${iosBundleIdentifier}": expected reverse-DNS identifier with at least two segments (e.g. "com.company.app").`,
    );
  }

  const androidPackage = options.androidPackage.trim();
  if (!ANDROID_PACKAGE_REGEX.test(androidPackage)) {
    throw new Error(
      `Invalid androidPackage "${androidPackage}": expected lowercase Java package segments without hyphens (e.g. "com.company.app").`,
    );
  }

  const scheme = options.scheme.trim();
  if (!URI_SCHEME_REGEX.test(scheme)) {
    throw new Error(
      `Invalid scheme "${scheme}": expected lowercase URI scheme starting with a letter (e.g. "starapp").`,
    );
  }

  const prodApiUrl = validateHttpUrl(options.apiBaseUrl, 'apiBaseUrl');
  const stagingApiUrl = options.stagingApiBaseUrl
    ? validateHttpUrl(options.stagingApiBaseUrl, 'stagingApiBaseUrl')
    : deriveVariantApiUrl(prodApiUrl, 'staging');
  const devApiUrl = options.devApiBaseUrl
    ? validateHttpUrl(options.devApiBaseUrl, 'devApiBaseUrl')
    : deriveVariantApiUrl(prodApiUrl, 'dev');
  const privacyUrl = validateHttpUrl(
    options.privacyPolicyUrl ?? 'https://legal.example.com/privacy',
    'privacyPolicyUrl',
  );
  const termsUrl = validateHttpUrl(
    options.userAgreementUrl ?? 'https://legal.example.com/terms',
    'userAgreementUrl',
  );

  return {
    displayName,
    slug,
    iosBundleIdentifier,
    androidPackage,
    scheme,
    prodApiUrl,
    stagingApiUrl,
    devApiUrl,
    privacyUrl,
    termsUrl,
  };
}

// 原因：将克隆后的 origin 自动重命名为 template-upstream，从物理命令层防止业务提交误 push 回底座仓库并保留上游修复同步通道
export function renameTemplateOriginRemote(
  projectRoot: string,
  gitRunner: GitCommandRunner = defaultGitRunner,
): GitRemoteRenameResult {
  const listRes = gitRunner(['remote'], projectRoot);
  if (listRes.status !== 0) {
    return { action: 'skipped', reason: 'not-a-git-repository' };
  }

  const remotes = listRes.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (remotes.includes('template-upstream')) {
    return { action: 'skipped', reason: 'template-upstream-already-exists' };
  }

  if (!remotes.includes('origin')) {
    return { action: 'skipped', reason: 'origin-not-found' };
  }

  const renameRes = gitRunner(['remote', 'rename', 'origin', 'template-upstream'], projectRoot);
  if (renameRes.status !== 0) {
    throw new Error(`Failed to rename git remote origin -> template-upstream: ${renameRes.stderr}`);
  }

  return { action: 'renamed' };
}

// 原因：使用函数型回调逐字段精确替换并校验全部 5 个字段必须命中，杜绝 $& 元字符污染或模板结构变更导致的静默失配
function rewriteIdentityFile(
  identityPath: string,
  values: {
    displayName: string;
    slug: string;
    iosBundleIdentifier: string;
    androidPackage: string;
    scheme: string;
  },
): void {
  let content = fs.readFileSync(identityPath, 'utf8');
  const rules: { field: keyof typeof values; pattern: RegExp }[] = [
    { field: 'displayName', pattern: /displayName:\s*['"`].*?['"`],/ },
    { field: 'slug', pattern: /slug:\s*['"`].*?['"`],/ },
    { field: 'iosBundleIdentifier', pattern: /iosBundleIdentifier:\s*['"`].*?['"`],/ },
    { field: 'androidPackage', pattern: /androidPackage:\s*['"`].*?['"`],/ },
    { field: 'scheme', pattern: /scheme:\s*['"`].*?['"`],/ },
  ];

  for (const rule of rules) {
    let matched = false;
    content = content.replace(rule.pattern, () => {
      matched = true;
      return `${rule.field}: ${JSON.stringify(values[rule.field])},`;
    });
    if (!matched) {
      throw new Error(
        `Failed to rewrite field "${rule.field}" in ${identityPath}: expected property pattern not found.`,
      );
    }
  }

  fs.writeFileSync(identityPath, content, 'utf8');
}

function writeVariantEnvFile(
  filePath: string,
  variant: 'development' | 'staging' | 'production',
  apiUrl: string,
  privacyUrl: string,
  termsUrl: string,
): void {
  const content = [
    `APP_VARIANT=${variant}`,
    `EXPO_PUBLIC_API_BASE_URL=${apiUrl}`,
    `EXPO_PUBLIC_PRIVACY_POLICY_URL=${privacyUrl}`,
    `EXPO_PUBLIC_USER_AGREEMENT_URL=${termsUrl}`,
    `EXPO_PUBLIC_ENABLE_MOCK_GATEWAY=${variant === 'development' ? 'true' : 'false'}`,
    `EXPO_PUBLIC_ENABLE_DEVTOOLS=${variant === 'production' ? 'false' : 'true'}`,
    '',
  ].join('\n');
  fs.writeFileSync(filePath, content, 'utf8');
}

// 原因：按增量结构裁剪演示切片并同步更新薄 Route Shell、共享桶与黑盒冒烟脚本，避免整段复制内核壳代码并保证零悬空引用
function applyCleanStarterTransform(projectRoot: string): {
  updatedFiles: string[];
  removedPaths: string[];
} {
  const relPathsToDelete = [
    'src/features/capabilities-lab',
    'src/features/content',
    'src/features/payment',
    'src/app/developer-lab.tsx',
    'src/app/list.tsx',
    'src/app/detail.tsx',
    'src/app/checkout.tsx',
    'src/app/status.tsx',
    'src/app/feed',
    'src/shared/components/FeedStatusBadge.tsx',
    'src/features/home',
    'tests/seam-runtime/walking-skeleton.test.tsx',
    'tests/seam-runtime/home-vertical-slice.test.tsx',
    'tests/seam-runtime/welcome-and-polish.test.tsx',
    'tests/seam-runtime/capability-fusion.test.tsx',
    'tests/seam-runtime/template-components.test.tsx',
    'tests/seam-runtime/payment-checkout.test.tsx',
    'tests/seam-runtime/checkout-reliability.test.tsx',
    'tests/seam-runtime/production-guard-and-crash-reporter.test.tsx',
    'tests/seam-build-config/checkout-prod-stub.test.ts',
    'tests/seam-runtime/server-query-and-offline-banner.test.tsx',
    'tests/seam-runtime/permission-rationale-and-capabilities.test.tsx',
    'tests/seam-runtime/image-upload-lab.test.tsx',
    'tests/seam-runtime/music-player-lab.test.tsx',
    'tests/seam-runtime/extended-capabilities-and-vendor-adapters.test.tsx',
    'tests/seam-build-config/clone-initializer-and-clean-starter.test.ts',
  ];

  const removedPaths: string[] = [];
  for (const rel of relPathsToDelete) {
    const target = path.join(projectRoot, rel);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      removedPaths.push(rel);
    }
  }

  const homeScreensDir = path.join(projectRoot, 'src/features/home/screens');
  fs.mkdirSync(homeScreensDir, { recursive: true });

  const cleanHomeScreen = `import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDevTools, useAppRuntime } from '@/core/runtime';
import { AppText, HStack, Screen, VStack } from '@/core/ui';
import { VariantCapsuleBadge } from '@/shared';

export function HomeScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { identity } = useAppRuntime();
  const effectiveApiBaseUrl = useDevTools((state) => state.effectiveApiBaseUrl);

  return (
    <Screen scrollable>
      <VStack p="lg" gap="sm" bg="surface" radius="lg" bordered>
        <HStack gap="sm" align="center">
          <VariantCapsuleBadge />
          <AppText variant="caption" tone="secondary">
            {effectiveApiBaseUrl}
          </AppText>
        </HStack>
        <AppText variant="titleLg">{identity.displayName}</AppText>
        <AppText variant="bodySm" tone="secondary">
          {t('home.cleanWelcome')}
        </AppText>
      </VStack>
    </Screen>
  );
}
`;

  const cleanHomeIndex = `export { HomeScreen } from './screens/HomeScreen';\n`;

  const cleanHomeTabRoute = `import React from 'react';
import { HomeScreen } from '@/features/home';

export default function HomeTabRoute(): React.JSX.Element {
  return <HomeScreen />;
}
`;

  const updatedFiles: string[] = [];
  const writeRel = (relFile: string, content: string): void => {
    fs.writeFileSync(path.join(projectRoot, relFile), content, 'utf8');
    updatedFiles.push(relFile);
  };

  writeRel('src/features/home/screens/HomeScreen.tsx', cleanHomeScreen);
  writeRel('src/features/home/index.ts', cleanHomeIndex);
  writeRel('src/app/(tabs)/index.tsx', cleanHomeTabRoute);

  // Surgical removal of deleted route registrations from src/app/_layout.tsx
  const rootLayoutPath = path.join(projectRoot, 'src/app/_layout.tsx');
  if (fs.existsSync(rootLayoutPath)) {
    const updatedRootLayout = fs
      .readFileSync(rootLayoutPath, 'utf8')
      .replace(/^\s*<Stack\.Screen name="feed\/\[id\]" \/>\r?\n/m, '')
      .replace(/^\s*<Stack\.Screen name="developer-lab" \/>\r?\n/m, '')
      .replace(/^\s*<Stack\.Screen name="list" \/>\r?\n/m, '')
      .replace(/^\s*<Stack\.Screen name="detail" \/>\r?\n/m, '')
      .replace(/^\s*<Stack\.Screen name="checkout" \/>\r?\n/m, '')
      .replace(/^\s*<Stack\.Screen name="status" \/>\r?\n/m, '');
    writeRel('src/app/_layout.tsx', updatedRootLayout);
  }

  // Surgical removal of checkout drawer entry from DrawerMenu.tsx & rewiring AppShellOverlays.tsx away from deleted /list, /status, /checkout routes
  const drawerMenuPath = path.join(projectRoot, 'src/features/shell/DrawerMenu.tsx');
  if (fs.existsSync(drawerMenuPath)) {
    const updatedDrawerMenu = fs
      .readFileSync(drawerMenuPath, 'utf8')
      .replace(/^\s*\| 'checkout'\r?\n/m, '')
      .replace(/^\s*\{ target: 'checkout',.*?\},\r?\n/m, '');
    writeRel('src/features/shell/DrawerMenu.tsx', updatedDrawerMenu);
  }
  const overlaysPath = path.join(projectRoot, 'src/features/shell/AppShellOverlays.tsx');
  if (fs.existsSync(overlaysPath)) {
    const updatedOverlays = fs
      .readFileSync(overlaysPath, 'utf8')
      .replace(/^\s*\| '\/checkout'\r?\n/m, '')
      .replace(/^\s*\| \{ pathname: '\/list'; params: \{ title: string \} \}\r?\n/m, '')
      .replace(/^\s*\| \{ pathname: '\/status'; params: \{ kind: 'empty'; title: string \} \}/m, '')
      .replace(/^\s*favorites: .*?,\r?\n/m, "  favorites: '/(tabs)/profile',\n")
      .replace(/^\s*history: .*?,\r?\n/m, "  history: '/(tabs)/profile',\n")
      .replace(/^\s*checkout: '\/checkout',\r?\n/m, '')
      .replace(/^\s*about: .*?,\r?\n/m, "  about: '/settings',\n");
    writeRel('src/features/shell/AppShellOverlays.tsx', updatedOverlays);
  }

  // Rewrite preserved tab/search routes so they don't push to deleted '/detail'
  writeRel(
    'src/app/(tabs)/discover.tsx',
    `import { useRouter } from 'expo-router';
import React from 'react';
import { useAppRuntime } from '@/core/runtime';
import { DiscoverScreen } from '@/features/discover';
import { useLegalDocumentOpener } from '@/shared';

export default function DiscoverTabRoute(): React.JSX.Element {
  const router = useRouter();
  const { env } = useAppRuntime();
  const openLegalDocument = useLegalDocumentOpener();

  return (
    <DiscoverScreen
      onOpenSearch={() => router.push('/search')}
      onOpenWebView={() =>
        openLegalDocument({
          url: env.userAgreementUrl,
          title: 'H5 轻应用容器',
        })
      }
    />
  );
}
`,
  );

  writeRel(
    'src/app/(tabs)/messages.tsx',
    `import React from 'react';
import { MessagesScreen } from '@/features/messages';

export default function MessagesTabRoute(): React.JSX.Element {
  return <MessagesScreen />;
}
`,
  );

  writeRel(
    'src/app/(tabs)/profile.tsx',
    `import { useRouter } from 'expo-router';
import React from 'react';
import { ProfileScreen } from '@/features/profile';

export default function ProfileTabRoute(): React.JSX.Element {
  const router = useRouter();
  return <ProfileScreen onOpenSettings={() => router.push('/settings')} />;
}
`,
  );

  writeRel(
    'src/app/search.tsx',
    `import React from 'react';
import { SearchScreen } from '@/features/search';
import { useSafeBack } from '@/shared';

export default function SearchStackRoute(): React.JSX.Element {
  const safeBack = useSafeBack();
  return <SearchScreen onBack={safeBack} />;
}
`,
  );

  // Surgical removal of developer-lab prop (and now-unused useRouter) from src/app/settings.tsx
  const settingsRoutePath = path.join(projectRoot, 'src/app/settings.tsx');
  if (fs.existsSync(settingsRoutePath)) {
    const updatedSettingsRoute = fs
      .readFileSync(settingsRoutePath, 'utf8')
      .replace(/^import \{ useRouter \} from 'expo-router';\r?\n/m, '')
      .replace(/^\s*const router = useRouter\(\);\r?\n/m, '')
      .replace(/^\s*onOpenDeveloperLab=\{.*?\}\r?\n/m, '');
    writeRel('src/app/settings.tsx', updatedSettingsRoute);
  }

  // Surgical removal of FeedStatusBadge barrel export from src/shared/index.ts
  const sharedIndexPath = path.join(projectRoot, 'src/shared/index.ts');
  if (fs.existsSync(sharedIndexPath)) {
    const updatedSharedIndex = fs
      .readFileSync(sharedIndexPath, 'utf8')
      .replace(/export \{[\s\S]*?\} from '\.\/components\/FeedStatusBadge';\r?\n/, '');
    writeRel('src/shared/index.ts', updatedSharedIndex);
  }

  // Surgical strip of home feed records from src/shared/mock/mock-http-transport.ts while preserving auth gateway and channel pagination for remaining tabs
  const mockTransportPath = path.join(projectRoot, 'src/shared/mock/mock-http-transport.ts');
  if (fs.existsSync(mockTransportPath)) {
    const cleanAuthTransport = `import type { HttpTransportDriver, RawHttpRequest, RawHttpResponse } from '@/core/network/types';
import { buildMockChannelPage, getMockFeedDelayMs } from './paginated-mock-feed';

interface MockAccount {
  id: string;
  username: string;
  password: string;
  displayName: string;
}

// 原因：保留最小认证网关与通用频道分页 Mock 驱动，使新派生项目在尚未联调真实后端时仍可跑通首日登录、注册、改密、注销、单飞刷新与 4 栏底导切换
export function createMockHttpTransport(): HttpTransportDriver {
  const accounts = new Map<string, MockAccount>([
    [
      'admin',
      {
        id: 'mock-u1',
        username: 'admin',
        password: 'password123',
        displayName: '测试管理员',
      },
    ],
  ]);

  return async (req: RawHttpRequest): Promise<RawHttpResponse> => {
    if (req.url.endsWith('/auth/login') && req.method === 'POST') {
      const body = (req.data ?? {}) as { username?: string; password?: string };
      const account = body.username ? accounts.get(body.username) : undefined;
      if (account && body.password === account.password) {
        return {
          status: 200,
          headers: {},
          data: {
            code: 0,
            message: 'ok',
            data: {
              tokens: {
                accessToken: 'mock-access-token',
                refreshToken: 'mock-refresh-token',
              },
              user: {
                id: account.id,
                username: account.username,
                displayName: account.displayName,
              },
            },
          },
        };
      }
      return {
        status: 200,
        headers: {},
        data: { code: 10002, message: '测试账号为 admin，密码为 password123', data: null },
      };
    }

    if (req.url.endsWith('/auth/register') && req.method === 'POST') {
      const body = (req.data ?? {}) as {
        username?: string;
        password?: string;
        displayName?: string;
      };
      const username = (body.username ?? '').trim();
      const password = (body.password ?? '').trim();
      const displayName = (body.displayName ?? username).trim();
      if (username.length < 3 || password.length < 6) {
        return {
          status: 200,
          headers: {},
          data: { code: 10003, message: '账号至少 3 位且密码至少 6 位', data: null },
        };
      }
      if (accounts.has(username)) {
        return {
          status: 200,
          headers: {},
          data: { code: 10004, message: '该账号已注册，请直接登录或找回密码', data: null },
        };
      }
      const created: MockAccount = {
        id: \`mock-u-\${accounts.size + 1}\`,
        username,
        password,
        displayName,
      };
      accounts.set(username, created);
      return {
        status: 200,
        headers: {},
        data: {
          code: 0,
          message: 'ok',
          data: { id: created.id, username: created.username, displayName: created.displayName },
        },
      };
    }

    if (req.url.endsWith('/auth/reset-password') && req.method === 'POST') {
      const body = (req.data ?? {}) as { username?: string; newPassword?: string };
      const account = body.username ? accounts.get(body.username.trim()) : undefined;
      if (!account) {
        return {
          status: 200,
          headers: {},
          data: { code: 10005, message: '未找到该账号，请先注册', data: null },
        };
      }
      if (!body.newPassword || body.newPassword.trim().length < 6) {
        return {
          status: 200,
          headers: {},
          data: { code: 10006, message: '新密码长度至少为 6 位', data: null },
        };
      }
      account.password = body.newPassword.trim();
      return {
        status: 200,
        headers: {},
        data: { code: 0, message: 'ok', data: { reset: true } },
      };
    }

    if (req.url.endsWith('/auth/change-password') && req.method === 'POST') {
      const body = (req.data ?? {}) as {
        username?: string;
        currentPassword?: string;
        newPassword?: string;
      };
      const account = body.username ? accounts.get(body.username) : undefined;
      if (!account || account.password !== body.currentPassword) {
        return {
          status: 200,
          headers: {},
          data: { code: 10007, message: '当前密码不正确', data: null },
        };
      }
      if (!body.newPassword || body.newPassword.length < 6) {
        return {
          status: 200,
          headers: {},
          data: { code: 10006, message: '新密码长度至少为 6 位', data: null },
        };
      }
      account.password = body.newPassword;
      return {
        status: 200,
        headers: {},
        data: { code: 0, message: 'ok', data: { updated: true } },
      };
    }

    if (req.url.endsWith('/auth/account') && req.method === 'DELETE') {
      const username =
        (typeof req.params?.username === 'string' ? req.params.username : undefined) ??
        ((req.data ?? {}) as { username?: string }).username;
      if (username) {
        accounts.delete(username);
      }
      return {
        status: 200,
        headers: {},
        data: { code: 0, message: 'ok', data: { deleted: true } },
      };
    }

    if (req.url.endsWith('/auth/refresh') && req.method === 'POST') {
      return {
        status: 200,
        headers: {},
        data: {
          code: 0,
          data: {
            accessToken: \`mock-access-\${Date.now()}\`,
            refreshToken: 'mock-refresh-token',
          },
        },
      };
    }

    if ((req.headers?.Authorization ?? '').includes('simulated-expired')) {
      return {
        status: 401,
        headers: {},
        data: { code: 40101, message: '模拟访问凭证已过期', data: null },
      };
    }

    const channelMatch = /\\/channels\\/([^/]+)\\/items$/.exec(req.url);
    if (channelMatch && req.method === 'GET') {
      const delayMs = getMockFeedDelayMs();
      if (delayMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
      const channelKey = decodeURIComponent(channelMatch[1] ?? 'following');
      const page = Number(req.params?.page ?? 1);
      return {
        status: 200,
        headers: {},
        data: {
          code: 0,
          data: buildMockChannelPage(channelKey, page),
        },
      };
    }

    if (req.url.endsWith('/search') && req.method === 'GET') {
      return {
        status: 200,
        headers: {},
        data: {
          code: 0,
          message: 'ok',
          data: { items: [] },
        },
      };
    }

    if (req.url.endsWith('/feedback') && req.method === 'POST') {
      return {
        status: 200,
        headers: {},
        data: {
          code: 0,
          message: 'ok',
          data: { ticketId: 'FB-2026-001', received: true },
        },
      };
    }

    return {
      status: 404,
      headers: {},
      data: { code: 404, message: 'Not Found', data: null },
    };
  };
}
`;
    writeRel('src/shared/mock/mock-http-transport.ts', cleanAuthTransport);
  }

  // Update app-resources.ts with clean welcome copy while keeping auth & settings copy intact
  const cleanAppResources = `import type { TranslationBundleMap } from '@/core/i18n/resources';

// 原因：派生应用级界面文案归属 Shared Layer，增删业务切片词条时无需改动 Template Core
export const appTranslationResources: TranslationBundleMap = {
  'zh-CN': {
    tabs: {
      home: '首页',
      discover: '发现',
      messages: '消息',
      profile: '我的',
      settings: '个人设置',
    },
    auth: {
      title: '账号登录',
      subtitle: '请使用企业账号登录以继续访问',
      welcomeSubtitle: '欢迎回来，请输入账号密码继续使用',
      usernameLabel: '账号',
      usernamePlaceholder: '请输入账号',
      usernameMinError: '请输入至少 3 位账号',
      passwordLabel: '密码',
      passwordPlaceholder: '请输入密码',
      passwordMinError: '请输入至少 6 位密码',
      submitButton: '登录',
      consentRequiredError: '请先阅读并勾选同意《用户协议》与《隐私政策》',
      fillTestAccount: '填入测试账号',
      forgotPassword: '忘记密码？',
      registerLink: '注册新账号 →',
      showPassword: '显示密码',
      hidePassword: '隐藏密码',
      consentCheckboxLabel: '同意用户协议与隐私政策',
      consentPrefix: '我已阅读并同意',
      userAgreementBook: '《用户协议》',
      consentAnd: '和',
      privacyPolicyBook: '《隐私政策》',
      resetTitle: '找回 / 重置密码',
      resetUsernamePlaceholder: '请输入已注册的账号或手机号',
      resetNewPasswordLabel: '新密码',
      resetNewPasswordPlaceholder: '请输入 6 位以上新密码',
      resetNewPasswordMinError: '新密码长度至少为 6 位',
      resetSubmitButton: '确认重置密码',
      resetSuccess: '密码已重置，请使用新密码登录',
      resetFailed: '重置失败，请稍后重试',
    },
    messages: {
      tabNotifications: '通知',
      tabInteractions: '互动',
      tabDirect: '私信',
      markAllRead: '全部已读',
      markAllReadSuccess: '已全部标为已读',
      notifyBannerTitle: '消息通知提醒',
      notifyBannerSubtitle: '可一键验证系统本地通知推送',
      testNotifyButton: '测试通知',
      testNotifyTitle: '系统通知提醒',
      testNotifyBody: '这是一条本地测试推送，说明消息通知链路已正常打通。',
      testNotifySent: '已发送本地测试通知',
      notifyRationaleTitle: '通知权限说明',
      notifyRationaleDesc: '用于即时向您发送重要系统通知与互动提醒。',
      sendFileButton: '选择本地文件发送给联系人',
      fileAttached: '已选择附件：{{name}}',
    },
    profile: {
      tabFavorites: '收藏',
      tabHistory: '历史',
      tabActivity: '动态',
      settingsLabel: '设置',
      favoritesTitle: '我的收藏清单',
      favoritesSubtitle: '支持一键导出为文本并调用系统分享',
      exportShareButton: '导出分享',
      favoritesEmpty: '暂无收藏记录',
      favoritesExported: '已生成收藏清单供系统分享',
      avatarLabel: '更换头像',
      avatarFallbackChar: '我',
      avatarRationaleTitle: '相册权限说明',
      avatarRationaleDesc: '用于挑选本地图片更换个人头像。',
      avatarUpdated: '头像已更新（本地预览）',
      guestUser: '未登录用户',
      avatarHint: '点击头像可从相册更换 · 下方支持图文动态发布',
      activityTag: '个人动态',
      activityTitle: '我的最新动态 · {{note}}',
      activitySummary: '由 {{author}} 通过快捷发布条发布（{{note}}）。',
      justNow: '刚刚',
      currentUser: '当前用户',
    },
    home: {
      subtitle: '当前接口地址',
      variantLabel: '构建变体',
      cleanWelcome: '演示切片已清理完毕，可在 src/features/ 下创建您的第一个业务切片。',
    },
    settings: {
      title: '个人设置',
      appearanceTitle: '外观模式',
      appearanceSystem: '跟随系统',
      appearanceLight: '浅色',
      appearanceDark: '深色',
      languageTitle: '界面语言',
      languageZh: '简体中文',
      languageEn: 'English',
      appInfoTitle: '应用信息',
      variantLabel: '当前环境',
      privacyPolicyLink: '隐私政策',
      userAgreementLink: '用户协议',
      openDevToolsButton: '打开开发者调试面板',
      signOutButton: '退出登录',
      signOutConfirmTitle: '确认退出登录？',
      signOutConfirmDescription: '退出后将清除本机加密登录凭证与离线缓存快照，需重新登录方可使用。',
    },
  },
  'en-US': {
    tabs: {
      home: 'Home',
      discover: 'Discover',
      messages: 'Messages',
      profile: 'Me',
      settings: 'Settings',
    },
    auth: {
      title: 'Sign In',
      subtitle: 'Sign in with your enterprise account to continue',
      welcomeSubtitle: 'Welcome back, enter your credentials to continue',
      usernameLabel: 'Account',
      usernamePlaceholder: 'Enter username',
      usernameMinError: 'Username must be at least 3 characters',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Enter password',
      passwordMinError: 'Password must be at least 6 characters',
      submitButton: 'Sign In',
      consentRequiredError: 'Please read and accept the User Agreement and Privacy Policy first',
      fillTestAccount: 'Fill Test Account',
      forgotPassword: 'Forgot Password?',
      registerLink: 'Create Account →',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      consentCheckboxLabel: 'Agree to User Agreement and Privacy Policy',
      consentPrefix: 'I have read and agree to the',
      userAgreementBook: 'User Agreement',
      consentAnd: 'and',
      privacyPolicyBook: 'Privacy Policy',
      resetTitle: 'Reset Password',
      resetUsernamePlaceholder: 'Enter registered account or phone',
      resetNewPasswordLabel: 'New Password',
      resetNewPasswordPlaceholder: 'Enter at least 6 characters',
      resetNewPasswordMinError: 'New password must be at least 6 characters',
      resetSubmitButton: 'Confirm Password Reset',
      resetSuccess: 'Password reset. Please sign in with your new password.',
      resetFailed: 'Reset failed, please try again later',
    },
    messages: {
      tabNotifications: 'Alerts',
      tabInteractions: 'Activity',
      tabDirect: 'Direct',
      markAllRead: 'Mark all read',
      markAllReadSuccess: 'All messages marked as read',
      notifyBannerTitle: 'Notification Alerts',
      notifyBannerSubtitle: 'Send a local test notification to verify delivery',
      testNotifyButton: 'Test Alert',
      testNotifyTitle: 'System Notification',
      testNotifyBody: 'This local test push confirms your notification pipeline is active.',
      testNotifySent: 'Local test notification sent',
      notifyRationaleTitle: 'Notification Permission',
      notifyRationaleDesc: 'Used to deliver important system alerts and activity updates.',
      sendFileButton: 'Pick a local file to share with contacts',
      fileAttached: 'Attached file: {{name}}',
    },
    profile: {
      tabFavorites: 'Saved',
      tabHistory: 'History',
      tabActivity: 'Posts',
      settingsLabel: 'Settings',
      favoritesTitle: 'Saved Collection',
      favoritesSubtitle: 'Export your saved list as text and share via system sheet',
      exportShareButton: 'Export & Share',
      favoritesEmpty: 'No saved items yet',
      favoritesExported: 'Saved list exported for sharing',
      avatarLabel: 'Change avatar',
      avatarFallbackChar: 'M',
      avatarRationaleTitle: 'Photo Library Permission',
      avatarRationaleDesc: 'Used to choose a local photo for your profile avatar.',
      avatarUpdated: 'Avatar updated (local preview)',
      guestUser: 'Guest User',
      avatarHint: 'Tap avatar to pick from photos · Publish updates below',
      activityTag: 'Personal',
      activityTitle: 'My latest update · {{note}}',
      activitySummary: 'Published by {{author}} via quick composer ({{note}}).',
      justNow: 'Just now',
      currentUser: 'Current User',
    },
    home: {
      subtitle: 'Active API Base URL',
      variantLabel: 'App Variant',
      cleanWelcome:
        'Starter sample slices removed. Create your first feature slice in src/features/.',
    },
    settings: {
      title: 'Settings',
      appearanceTitle: 'Appearance',
      appearanceSystem: 'System',
      appearanceLight: 'Light',
      appearanceDark: 'Dark',
      languageTitle: 'Language',
      languageZh: '简体中文',
      languageEn: 'English',
      appInfoTitle: 'Application Info',
      variantLabel: 'Active Variant',
      privacyPolicyLink: 'Privacy Policy',
      userAgreementLink: 'Terms of Use',
      openDevToolsButton: 'Open DevTools Drawer',
      signOutButton: 'Sign Out',
      signOutConfirmTitle: 'Sign out of this account?',
      signOutConfirmDescription:
        'Local encrypted credentials and offline snapshots will be cleared immediately.',
    },
  },
};
`;
  writeRel('src/shared/i18n/app-resources.ts', cleanAppResources);

  // Sync Maestro E2E smoke definition with cleaned tabs (Home -> Settings -> Sign Out)
  const maestroFlowsDir = path.join(projectRoot, '.maestro/flows');
  if (fs.existsSync(maestroFlowsDir)) {
    fs.rmSync(maestroFlowsDir, { recursive: true, force: true });
    removedPaths.push('.maestro/flows');
  }
  const maestroSmokePath = path.join(projectRoot, '.maestro/smoke.yaml');
  if (fs.existsSync(maestroSmokePath)) {
    const cleanMaestroSmoke = `appId: \${MAESTRO_APP_ID || 'com.enterprise.rntemplate.dev'}
name: Enterprise RN Clean Starter Smoke Flow
---
- launchApp:
    clearState: true

- assertVisible: '清晰的三层应用骨架'
- tapOn: '跳过'

- assertVisible: '账号登录'
- tapOn: '请输入账号'
- inputText: 'admin'
- tapOn: '请输入密码'
- inputText: 'password123'
- hideKeyboard
- tapOn:
    id: 'login-privacy-checkbox'
- tapOn: '登录'

- tapOn: '我的'
- tapOn:
    id: 'profile-settings-button'
- assertVisible: '个人设置'

- scrollUntilVisible:
    element: '退出登录'
    direction: DOWN
- tapOn: '退出登录'
- assertVisible: '确认退出登录？'
- tapOn:
    text: '退出登录'
    index: 1
- assertVisible: '账号登录'
`;
    writeRel('.maestro/smoke.yaml', cleanMaestroSmoke);
  }

  return { updatedFiles, removedPaths };
}

// 原因：仅在 src/core 外部修改身份配置、环境文件与可选业务样板，保证派生项目与上游底座内核长期零冲突对齐
export function initializeAppInstance(
  options: InitializeAppInstanceOptions,
): InitializeAppInstanceResult {
  const validated = validateIdentityInputs(options);
  const updatedFiles: string[] = [];

  const identityPath = path.join(options.projectRoot, 'app.identity.ts');
  rewriteIdentityFile(identityPath, {
    displayName: validated.displayName,
    slug: validated.slug,
    iosBundleIdentifier: validated.iosBundleIdentifier,
    androidPackage: validated.androidPackage,
    scheme: validated.scheme,
  });
  updatedFiles.push('app.identity.ts');

  const pkgPath = path.join(options.projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
    pkgJson.name = validated.slug;
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf8');
    updatedFiles.push('package.json');
  }

  writeVariantEnvFile(
    path.join(options.projectRoot, 'config', 'env', 'example.env'),
    'development',
    validated.devApiUrl,
    validated.privacyUrl,
    validated.termsUrl,
  );
  writeVariantEnvFile(
    path.join(options.projectRoot, 'config', 'env', 'development.env'),
    'development',
    validated.devApiUrl,
    validated.privacyUrl,
    validated.termsUrl,
  );
  writeVariantEnvFile(
    path.join(options.projectRoot, 'config', 'env', 'staging.env'),
    'staging',
    validated.stagingApiUrl,
    validated.privacyUrl,
    validated.termsUrl,
  );
  writeVariantEnvFile(
    path.join(options.projectRoot, 'config', 'env', 'production.env'),
    'production',
    validated.prodApiUrl,
    validated.privacyUrl,
    validated.termsUrl,
  );
  updatedFiles.push(
    'config/env/example.env',
    'config/env/development.env',
    'config/env/staging.env',
    'config/env/production.env',
  );

  let removedPaths: string[] = [];
  if (options.cleanStarter) {
    const cleanResult = applyCleanStarterTransform(options.projectRoot);
    updatedFiles.push(...cleanResult.updatedFiles);
    removedPaths = cleanResult.removedPaths;
  }

  const gitRemoteResult: GitRemoteRenameResult = options.skipGit
    ? { action: 'skipped', reason: 'skip-git-flag' }
    : renameTemplateOriginRemote(options.projectRoot, options.gitRunner);

  return {
    updatedFiles,
    removedPaths,
    gitRemoteResult,
  };
}
