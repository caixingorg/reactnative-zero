/**
 * @module core/ui/drawer-logic
 * 职责：抽屉手势里不依赖界面的纯判定（松手后吸附到开还是关、边缘触发区、拖动进度），便于在 Jest 里完整测试；
 * 真实拖动手感只能在真机上验证。
 * 边界：函数带 'worklet' 标记，会在 UI 线程执行，因此只能做纯计算，不能读取外部可变状态。
 */

/** 松手速度（像素/秒）超过它就按方向决定，不再看位置，让快速轻扫也能开关抽屉。 */
export const DRAWER_FLING_VELOCITY = 500;

/** 屏幕最左边缘的触发宽度（像素）。 */
export const DRAWER_EDGE_WIDTH = 20;

export type DrawerSnapTarget = 'open' | 'closed';

export function resolveDrawerSnap(progress: number, velocityX: number): DrawerSnapTarget {
  'worklet';
  if (velocityX > DRAWER_FLING_VELOCITY) {
    return 'open';
  }
  if (velocityX < -DRAWER_FLING_VELOCITY) {
    return 'closed';
  }
  return progress >= 0.5 ? 'open' : 'closed';
}

export function clampDrawerProgress(
  startProgress: number,
  translationX: number,
  width: number,
): number {
  'worklet';
  if (width <= 0) {
    return 0;
  }
  const next = startProgress + translationX / width;
  return Math.min(1, Math.max(0, next));
}

export function isInDrawerEdgeZone(x: number, edgeWidth: number = DRAWER_EDGE_WIDTH): boolean {
  return x >= 0 && x <= edgeWidth;
}

/** 抽屉宽度：屏幕宽度的 58%，但不超过 236，保持紧凑比例、避免右侧大片留白。 */
export function resolveDrawerWidth(windowWidth: number): number {
  return Math.min(Math.round(windowWidth * 0.58), 236);
}
