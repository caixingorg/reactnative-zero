/**
 * @module features/demo
 * 职责：Starter 演示切片，展示通用列表、详情与状态页模板的默认用法；正式业务开发时可整体删除。
 */
export {
  PaymentCashierSheet,
  type PaymentCashierSheetProps,
} from './components/PaymentCashierSheet';
export { ContentDetailScreen, type ContentDetailScreenProps } from './screens/ContentDetailScreen';
export { GenericListScreen, type GenericListScreenProps } from './screens/GenericListScreen';
export { PaymentDemoScreen, type PaymentDemoScreenProps } from './screens/PaymentDemoScreen';
export {
  ProfileRegisterDemoScreen,
  type ProfileRegisterDemoScreenProps,
  type ProfileRegisterFormValues,
} from './screens/ProfileRegisterDemoScreen';
export {
  StatusPageScreen,
  type StatusPageKind,
  type StatusPageScreenProps,
} from './screens/StatusPageScreen';
