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

// 原因：将本地开发 Mock 数据源收敛为标准边缘传输驱动，使业务切片保持 100% 纯净真实接口调用而无需散落环境判断分支
export function createMockHttpTransport(): HttpTransportDriver {
  return async (req: RawHttpRequest): Promise<RawHttpResponse> => {
    if (req.url.endsWith('/auth/login') && req.method === 'POST') {
      const body = (req.data ?? {}) as { username?: string; password?: string };
      if (body.username === 'admin' && body.password === 'password123') {
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
                id: 'mock-u1',
                username: 'admin',
                displayName: '测试管理员',
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

    return {
      status: 404,
      headers: {},
      data: { code: 404, message: 'Not Found', data: null },
    };
  };
}
