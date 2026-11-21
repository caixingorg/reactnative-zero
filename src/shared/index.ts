/**
 * @module shared
 * 职责：应用共享层（Shared Layer）统一公共出口，聚合本产品跨 Feature Slice 复用的业务组件、词条、法律文档跳转与演示网关。
 * 边界：只能依赖 `src/core`，严禁反向引用 `src/features` 或 `src/app`（由 ESLint 强制拦截）。
 */
export {
  FeedStatusBadge,
  type FeedItemStatus,
  type FeedStatusBadgeProps,
} from './components/FeedStatusBadge';
export { VariantCapsuleBadge } from './components/VariantCapsuleBadge';
export { createDemoHttpTransport } from './demo/demo-http-transport';
export { useMockPaginatedFeed, type MockListRecord } from './demo/paginated-mock-feed';
export { appTranslationResources } from './i18n/app-resources';
export { useLegalDocumentOpener } from './navigation/use-legal-document-opener';
