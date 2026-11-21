/**
 * @module core/ui/page-shell-logic
 * 职责：顶部 Tab + 分页容器里不依赖界面的纯判定（滚动位置对应哪一页、哪些页需要挂载、再次点击导航时该回顶部还是刷新），
 * 便于在 Jest 里完整测试；真实滑动手感只能在真机上验证。
 */

/** 滚动偏移对应的当前页下标，向最近的整页取整并限制在有效范围内。 */
export function resolveActiveIndex(offsetX: number, pageWidth: number, pageCount: number): number {
  if (pageWidth <= 0 || pageCount <= 0) {
    return 0;
  }
  const raw = Math.round(offsetX / pageWidth);
  return Math.min(pageCount - 1, Math.max(0, raw));
}

/**
 * 懒加载：页面第一次被访问时才挂载，之后一直保留（滚动位置、已加载的数据都不丢）。
 * 返回新的已访问集合；没有变化时返回原集合，方便 React 判断无需重渲染。
 */
export function markPageVisited(visited: ReadonlySet<number>, index: number): ReadonlySet<number> {
  if (visited.has(index)) {
    return visited;
  }
  return new Set([...visited, index]);
}

export type ReselectAction = 'scrollToTop' | 'refresh';

/** 再次点击当前导航：不在顶部就先回顶部，已经在顶部才触发刷新。 */
export function decideReselectAction(isAtTop: boolean): ReselectAction {
  return isAtTop ? 'refresh' : 'scrollToTop';
}

/** 距顶部不超过这个距离（像素）都算"在顶部"，避免回弹或 1 像素误差导致永远回不了顶。 */
export const AT_TOP_TOLERANCE = 8;

export function isScrollAtTop(offsetY: number): boolean {
  return offsetY <= AT_TOP_TOLERANCE;
}
