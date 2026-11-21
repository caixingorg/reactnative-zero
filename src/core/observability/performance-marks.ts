/**
 * @module core/observability/performance-marks
 * 职责：轻量性能标记——记录「JS 侧启动到某时刻」与「两标记之间」的耗时，仅保存在内存中供开发抽屉展示（可选写入日志环形缓冲），不上报任何外部服务。
 * 边界：不依赖原生模块与运行时容器；时钟可注入以便测试；标记名只允许调用方给出的固定字符串，不记录用户数据。
 */
import type { Logger } from './observability';

export interface PerformanceMarks {
  /** 记录一个标记并返回其时间（毫秒，自 JS 侧模块加载起算）；同名标记以最早一次为准 */
  mark(name: string): number;
  /** 返回从 `from` 标记到现在（或到 `to` 标记）的耗时；起点不存在时返回 null */
  measure(from: string, to?: string): number | null;
  getMarks(): Readonly<Record<string, number>>;
}

export interface CreatePerformanceMarksOptions {
  logger?: Logger;
  now?: () => number;
}

// 原因：RN 的 performance.now() 是「自系统开机」的时长而不是自应用启动，所以绝对值没有意义；
// 这里只取单调时钟，由 createPerformanceMarks 在创建时记下起点，所有标记都相对该起点；缺失时退化为 Date.now
function defaultNow(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (typeof perf?.now === 'function') {
    return perf.now();
  }
  return Date.now();
}

export function createPerformanceMarks(
  options: CreatePerformanceMarksOptions = {},
): PerformanceMarks {
  const clock = options.now ?? defaultNow;
  // 原因：起点即模块首次加载的时刻，近似 JS 侧启动；不含原生启动与 JS 包加载之前的时间
  const origin = clock();
  const now = (): number => clock() - origin;
  const marks = new Map<string, number>();

  function mark(name: string): number {
    const existing = marks.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const at = Math.round(now());
    marks.set(name, at);
    options.logger?.debug(`[perf] ${name} @${at}ms`);
    return at;
  }

  function measure(from: string, to?: string): number | null {
    const start = marks.get(from);
    if (start === undefined) {
      return null;
    }
    const end = to === undefined ? Math.round(now()) : marks.get(to);
    return end === undefined ? null : end - start;
  }

  return { mark, measure, getMarks: () => Object.fromEntries(marks) };
}

// 原因：进程级单例，模块首次被导入时即可开始计时，不依赖运行时容器创建；标记只在内存中，开发抽屉读取展示
export const appPerformanceMarks: PerformanceMarks = createPerformanceMarks();
