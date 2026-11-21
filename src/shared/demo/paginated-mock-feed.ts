/**
 * @module shared/demo/paginated-mock-feed
 * 职责：为 12 个通用子页面提供多页异步模拟数据源（每频道 3 页 × 8 条 = 24 条），
 * 让真机可真实体验首次懒加载骨架屏、多屏滚动、下拉刷新、上拉分页加载与再次点击底栏回顶。
 * 边界：测试环境（NODE_ENV === 'test'）延迟自动降为 0ms，保证单元测试快速稳定。
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAppRuntime } from '@/core/runtime';

export interface MockListRecord {
  id: string;
  title: string;
  tag: string;
  summary: string;
  meta: string;
  unread?: boolean;
  rank?: number;
}

interface ChannelSeed {
  tag: string;
  titles: readonly string[];
  summaryPrefix: string;
  metaPool: readonly string[];
  hasUnread?: boolean;
  hasRank?: boolean;
}

const DEFAULT_SEED: ChannelSeed = {
  tag: '关注动态',
  titles: [
    '跨端四层架构演进与边界治理实战',
    '列表滚动帧率优化：FlashList 回收策略拆解',
    'Design Token 亮暗双模主题零闪烁方案',
    '弱网离线缓存与单飞 401 刷新设计复盘',
    '移动端包体积守卫：如何精准拦截依赖膨胀',
    'Reanimated 手势冲突隔离与边缘返回适配',
    '客户端可观测性：冷启动打点与慢路由定位',
    '企业级多环境构建变体并存安装实践',
  ],
  summaryPrefix: '深度分享一线移动团队在生产环境中的架构取舍与实测数据',
  metaPool: ['10 分钟前', '1 小时前', '3 小时前', '昨天', '2 天前'],
};

const CHANNEL_SEEDS: Record<string, ChannelSeed> = {
  following: DEFAULT_SEED,
  trending: {
    tag: '热榜',
    titles: [
      '通用页面骨架与单层顶栏交互规范',
      '离线优先架构在弱网下的容错表现',
      '真机调试流水线与自动化回归清单',
      '零依赖样式体系升级 RN 0.88 零报错经验',
      '隐私合规双阶段门禁的工程落地细节',
      '大列表图片压缩与并发上传限流方案',
      '本地音频播放状态机与焦点管理',
      '客户端崩溃自建 Sentry 协议接入指南',
    ],
    summaryPrefix: '本周高热讨论专题，覆盖方案对比、踩坑记录与最佳实践',
    metaPool: ['9.8k 热度', '8.4k 热度', '7.2k 热度', '6.5k 热度', '5.1k 热度'],
    hasRank: true,
  },
  categories: {
    tag: '精选分类',
    titles: [
      '移动架构设计',
      '设计系统与令牌',
      '渲染与启动性能',
      '工程化与发布',
      '弱网与数据缓存',
      '安全与隐私合规',
      '原生硬件能力',
      '自动化测试体系',
    ],
    summaryPrefix: '系统化归档该领域核心文档、模板与最佳实践案例',
    metaPool: ['128 篇', '94 篇', '76 篇', '63 篇', '52 篇'],
  },
  rankings: {
    tag: '口碑榜',
    titles: [
      '零依赖 Design Token 主题方案',
      '跨端手势与全局抽屉交互实践',
      '弱网离线优先架构落地清单',
      '可裁剪 Starter Slice 模板机制',
      '单飞 Token 刷新与并发锁',
      'Android 包体积自动化守卫',
      '声明式权限用途告知门禁',
      '双端键盘避让与吸底表单方案',
    ],
    summaryPrefix: '综合团队复用率与真机稳定性评分排行的优质技术方案',
    metaPool: ['评分 9.7', '评分 9.5', '评分 9.3', '评分 9.1', '评分 8.9'],
    hasRank: true,
  },
  topics: {
    tag: '深度专题',
    titles: [
      '企业级 RN 模板从 0 到 1 落地合集',
      '移动端可观测性与稳定性治理',
      '高频页面模板复用与换肤体系',
      '离线存储与加密凭证安全指南',
      '真机测试与 Maestro 冒烟自动化',
      '原生能力插件按需裁剪与清单净化',
      '跨团队多 App Instance 同步机制',
      '暗黑模式无障碍对比度设计规范',
    ],
    summaryPrefix: '由浅入深串联架构决策、代码契约与真机验收要点',
    metaPool: ['共 12 篇', '共 9 篇', '共 8 篇', '共 6 篇'],
  },
  notifications: {
    tag: '系统通知',
    titles: [
      '新版本通用页面骨架已更新',
      '账号已在新设备上完成安全校验',
      'Android 调试包校验全部通过',
      '包体积守卫报告：增幅处于安全阈值内',
      '隐私合规门禁策略已同步至最新条款',
      '离线缓存快照已完成自动清理',
      '本周稳定性周报已生成',
      '开发者能力实验室已迁入设置页',
    ],
    summaryPrefix: '系统状态与重要安全变更提醒，点击查看完整说明',
    metaPool: ['刚刚', '10 分钟前', '1 小时前', '昨天', '3 天前'],
    hasUnread: true,
  },
  interactions: {
    tag: '互动消息',
    titles: [
      '林晚 赞了你的动态',
      '陈明 评论了你的架构复盘',
      '周扬 收藏了你的模板指南',
      '架构周报 转发了你的分享',
      '移动效能组 在讨论中提到了你',
      '苏晴 赞了你的评论',
      '李想 关注了你',
      '产品设计组 回复了你的反馈',
    ],
    summaryPrefix: '来自协作伙伴的最新点赞、评论与关注互动',
    metaPool: ['5 分钟前', '30 分钟前', '2 小时前', '昨天'],
    hasUnread: true,
  },
  direct: {
    tag: '私信',
    titles: [
      '产品助手',
      '研发效能机器人',
      '林晚（架构师）',
      '陈明（客户端）',
      '设计系统负责人',
      '测试团队值班号',
      '发布审批提醒',
      '安全审计通知',
    ],
    summaryPrefix: '请查收最新迭代排期、真机验收反馈或发布确认事项',
    metaPool: ['刚刚', '20 分钟前', '今天 10:20', '昨天'],
    hasUnread: true,
  },
  favorites: {
    tag: '我的收藏',
    titles: [
      '企业级移动底座四层架构规范',
      'Reanimated 抽屉与分页联动指南',
      'FlashList 长列表性能优化手册',
      '离线队列与幂等重试最佳实践',
      'Expo CNG 无厂商锁定构建指南',
      'iOS / Android 签名与发布流水线',
      '客户端多语言词条分层管理规范',
      '无障碍角色与读屏适配清单',
    ],
    summaryPrefix: '你标记的重点参考内容，随时回顾与复用',
    metaPool: ['收藏于 今天', '收藏于 昨天', '收藏于 本周', '收藏于 上周'],
  },
  history: {
    tag: '浏览历史',
    titles: [
      '离线缓存与弱网降级方案',
      'Android 包体积守卫配置',
      '通用搜索页历史与热词交互规范',
      '表单键盘避让与吸底提交按钮',
      '本地音乐播放与蓝牙系统音频说明',
      '图片压缩与多端 multipart 上传',
      '欢迎页与隐私门禁启动顺序',
      '设置页分组列表设计规范',
    ],
    summaryPrefix: '最近浏览过的文档与示范页面记录',
    metaPool: ['15 分钟前', '1 小时前', '今天', '昨天'],
  },
  activity: {
    tag: '个人动态',
    titles: [
      '完成了本地音乐播放与图片压缩联调',
      '更新了通用页面骨架规格与测试接缝',
      '提交了单层顶栏与独立抽屉按钮重构',
      '验证了 4 栏底部导航与 12 个子页懒挂载',
      '完成了 5 类通用栈模板组件与单测',
      '整理了系统复盘与视觉重塑优化计划',
      '通过了全量四层架构边界与裁剪校验',
      '开启了暗黑模式真机对比走查',
    ],
    summaryPrefix: '个人在项目中的关键里程碑与协作记录',
    metaPool: ['今天', '昨天', '2 天前', '本周'],
  },
};

const PAGE_SIZE = 8;
const TOTAL_PAGES = 3;
let simulatedDelayMs = 260;

export function setMockFeedDelayMs(ms: number): void {
  simulatedDelayMs = Math.max(0, ms);
}

export function getMockFeedDelayMs(): number {
  return simulatedDelayMs;
}

export interface DemoChannelPagePayload {
  items: MockListRecord[];
  nextPage: number | null;
}

export function buildDemoChannelPage(
  channelKey: string,
  pageParam: number,
): DemoChannelPagePayload {
  const seed = CHANNEL_SEEDS[channelKey] ?? DEFAULT_SEED;
  const startRank = (pageParam - 1) * PAGE_SIZE;

  const items: MockListRecord[] = Array.from({ length: PAGE_SIZE }, (_, idx) => {
    const baseTitle = seed.titles[idx % seed.titles.length] ?? '示例内容';
    const suffix = pageParam > 1 ? ` · 第 ${pageParam} 页` : '';
    const rank = startRank + idx + 1;
    return {
      id: `${channelKey}-p${pageParam}-${idx + 1}`,
      title: `${baseTitle}${suffix}`,
      tag: seed.tag,
      summary: `${seed.summaryPrefix}（#${rank}）。`,
      meta: seed.metaPool[(idx + pageParam) % seed.metaPool.length] ?? '刚刚',
      unread: seed.hasUnread ? pageParam === 1 && idx < 3 : false,
      rank: seed.hasRank ? rank : undefined,
    };
  });

  return {
    items,
    nextPage: pageParam < TOTAL_PAGES ? pageParam + 1 : null,
  };
}

// 原因：所有演示频道统一经由 httpClient 发起请求，与首页推荐保持唯一数据链路（共享鉴权头、离线检测、DevTools 抓包与生产空桩隔离）
export function useMockPaginatedFeed(channelKey: string) {
  const { httpClient } = useAppRuntime();
  const query = useInfiniteQuery({
    queryKey: ['channel-feed', channelKey],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      httpClient.get<DemoChannelPagePayload>(`/channels/${encodeURIComponent(channelKey)}/items`, {
        params: { page: pageParam },
      }),
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
  });

  const items = useMemo<MockListRecord[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    items,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
  };
}
