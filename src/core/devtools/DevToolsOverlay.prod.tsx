import type { DevToolsOverlayProps } from './DevToolsOverlay';

// 原因：production 构建变体由 metro.config.js 将调试浮层解析至此空桩，使正式产物物理剥离全部联调界面与动作逻辑
export function DevToolsOverlay(_props: DevToolsOverlayProps): null {
  return null;
}
