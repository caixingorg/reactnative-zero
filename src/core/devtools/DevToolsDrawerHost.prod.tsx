import type { DevToolsDrawerHostProps } from './DevToolsDrawerHost';

// 原因：production 构建变体由 metro.config.js 将调试抽屉解析至此空桩，使正式产物物理剥离全部联调界面与动作逻辑
export function DevToolsDrawerHost(_props: DevToolsDrawerHostProps): null {
  return null;
}
