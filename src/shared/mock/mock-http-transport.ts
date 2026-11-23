import type { HttpTransportDriver, RawHttpRequest, RawHttpResponse } from '@/core/network/types';
import { buildMockChannelPage, getMockFeedDelayMs } from './paginated-mock-feed';

interface MockFeedRecord {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  status: 'published' | 'review' | 'draft';
  coverUrl: string;
  publishedAt: string;
}

const MOCK_PAGE_1: MockFeedRecord[] = [
  {
    id: 'feed-1',
    title: '企业级移动端四层边界规范发布',
    summary: '通过 ESLint 物理路径锁彻底阻断跨层越权调用',
    content:
      '本底座采用 Route Shell -> Feature Slice -> Shared Layer -> Template Core 四层架构，确保派生应用长期可维护。',
    category: '工程架构',
    status: 'published',
    coverUrl: 'https://picsum.photos/seed/rn1/200/200',
    publishedAt: '2026-11-17',
  },
  {
    id: 'feed-2',
    title: '双端敏感权限动态剥离指南',
    summary: '在 app.identity.ts 一键关闭未用能力以通过应用市场审核',
    content:
      '当关闭不需要的原生能力开关时，Info.plist 与 AndroidManifest 会自动剥离对应敏感权限声明。',
    category: '合规安全',
    status: 'review',
    coverUrl: 'https://picsum.photos/seed/rn2/200/200',
    publishedAt: '2026-11-18',
  },
];

const MOCK_PAGE_2: MockFeedRecord[] = [
  {
    id: 'feed-3',
    title: '单飞 401 刷新锁压测报告',
    summary: '消除高并发场景下访问凭证过期引发的连环续期冲突',
    content: '通过比对请求所持旧令牌与最新存储令牌，避免晚到的过期响应触发二次刷新。',
    category: '网络基建',
    status: 'published',
    coverUrl: 'https://picsum.photos/seed/rn3/200/200',
    publishedAt: '2026-11-18',
  },
];

const MOCK_SEARCH_CORPUS = [
  { id: 's-1', title: '企业级移动底座四层架构规范', category: '架构' },
  { id: 's-2', title: 'Reanimated 抽屉手势与边缘冲突隔离', category: '交互' },
  { id: 's-3', title: '弱网离线缓存与单飞刷新方案', category: '网络' },
  { id: 's-4', title: 'Android 包体积守卫与基线管理', category: '性能' },
  { id: 's-5', title: '零依赖 Design Token 亮暗主题切换', category: '样式' },
] as const;

interface MockAccount {
  id: string;
  username: string;
  password: string;
  displayName: string;
}

// 原因：将本地开发 Mock 数据源收敛为标准边缘传输驱动，使业务切片保持 100% 纯净真实接口调用而无需散落环境判断分支
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
        id: `mock-u-${accounts.size + 1}`,
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
      const username = (body.username ?? '').trim();
      const newPassword = (body.newPassword ?? '').trim();
      const account = accounts.get(username);
      if (!account) {
        return {
          status: 200,
          headers: {},
          data: { code: 10005, message: '未找到该账号，请先注册', data: null },
        };
      }
      if (newPassword.length < 6) {
        return {
          status: 200,
          headers: {},
          data: { code: 10006, message: '新密码长度至少为 6 位', data: null },
        };
      }
      account.password = newPassword;
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
            accessToken: `mock-access-${Date.now()}`,
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

    if (req.url.endsWith('/feed') && req.method === 'GET') {
      const page = Number(req.params?.page ?? 1);
      return {
        status: 200,
        headers: {},
        data: {
          code: 0,
          data: {
            items: page === 1 ? MOCK_PAGE_1 : MOCK_PAGE_2,
            nextPage: page === 1 ? 2 : null,
          },
        },
      };
    }

    if (req.url.includes('/feed/') && req.method === 'GET') {
      const itemId = req.url.split('/').pop() ?? '';
      const all = [...MOCK_PAGE_1, ...MOCK_PAGE_2];
      const found = all.find((item) => item.id === itemId) ?? MOCK_PAGE_1[0]!;
      return {
        status: 200,
        headers: {},
        data: {
          code: 0,
          data: found,
        },
      };
    }

    const channelMatch = /\/channels\/([^/]+)\/items$/.exec(req.url);
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
      const q = String(req.params?.q ?? '')
        .trim()
        .toLowerCase();
      const items = q
        ? MOCK_SEARCH_CORPUS.filter(
            (item) =>
              item.title.toLowerCase().includes(q) || item.category.toLowerCase().includes(q),
          )
        : [];
      return {
        status: 200,
        headers: {},
        data: {
          code: 0,
          message: 'ok',
          data: { items },
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
