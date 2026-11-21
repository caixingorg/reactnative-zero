/**
 * @module core/config/types
 * 职责：定义派生应用身份源 (AppIdentity)、合规开关、原生能力总闸与运行期公开环境契约。
 * 边界：本文件位于 Template Core 内，仅声明纯类型契约；具体取值由根目录 `app.identity.ts` 与 `config/env/*.env` 注入。
 */
export type AppVariant = 'development' | 'staging' | 'production';
export type SupportedLanguageCode = 'zh-CN' | 'en-US';

export interface ComplianceFlags {
  /** 是否启用两阶段隐私门禁（国内市场必须为 `true`；海外无前置同意要求时可设为 `false`）。 */
  requirePrivacyConsent: boolean;
  /** 触发系统敏感权限弹窗前，是否先展示业务用途告知弹窗（Permission Rationale）。 */
  requirePermissionRationale: boolean;
  /**
   * 是否在 Expo Prebuild 生成原生工程时自动注入国内构建镜像（阿里云 Maven / 清华 CocoaPods CDN）。
   * 默认 `false`（独立于 `requirePrivacyConsent`，避免海外 GDPR 应用被静默路由至国内镜像）；
   * 构建期可通过环境变量 `EXPO_USE_CHINA_MIRRORS=true|false` 强制覆盖。
   */
  useChinaBuildMirrors?: boolean;
  /**
   * 需要从 AndroidManifest.xml 中强制剥离（tools:node="remove"）的第三方 SDK 自动初始化 ContentProvider 类名列表，
   * 防止第三方 AAR 在用户同意隐私政策前通过 ContentProvider.onCreate 抢跑读取 OAID/AndroidID 触发国内应用市场拒审。
   */
  blockedAndroidAutoInitProviders?: string[];
}

export interface CapabilityFlags {
  /** 相机拍照与二维码/条形码扫描。关闭后自动剔除 iOS `NSCameraUsageDescription` 与 Android `CAMERA`。 */
  camera: boolean;
  /** 系统相册选图。Android 13+ 走免权限 Photo Picker，关闭后剔除 iOS 相册读取描述与旧版外部存储读权限。 */
  photoLibrary: boolean;
  /** 保存图片/海报到系统相册。关闭后剔除 `NSPhotoLibraryAddUsageDescription` 与 `WRITE_EXTERNAL_STORAGE`。 */
  mediaLibrary: boolean;
  /** 文档选择与系统分享。 */
  filesAndSharing: boolean;
  /** 内置安全混合 WebView 容器与只读 JSBridge。 */
  webview: boolean;
  /** 面容 ID / 指纹生物识别核身。关闭后剔除 `NSFaceIDUsageDescription` 与 `USE_BIOMETRIC`。 */
  biometrics: boolean;
  /** 前台使用期间定位（底座始终阻断后台定位与前台定位服务）。 */
  location: boolean;
  /** 本地/远程通知。关闭后剔除 `POST_NOTIFICATIONS` 与 `RECEIVE_BOOT_COMPLETED`。 */
  notifications: boolean;
  /** 前台音视频播放与麦克风录制。 */
  audioVideo: boolean;
  /**
   * 后台音频播放（依赖 `audioVideo`）。开启后声明 iOS `UIBackgroundModes=audio` 与 Android 媒体播放前台服务；
   * Apple 审核 2.5.4 与 Google Play 前台服务政策要求声明即须真实使用，仅在已实现后台播放时开启。
   * 可选字段，缺省视为 `false`，以便派生应用同步上游 `src/core` 与 `config` 时无需修改既有 `app.identity.ts`。
   */
  backgroundAudio?: boolean;
}

export interface BrandThemeSeed {
  /** 亮色模式主品牌色（Hex）。 */
  primaryLight: string;
  /** 暗色模式主品牌色（Hex）。 */
  primaryDark: string;
  /** 基准圆角步长（px）。 */
  radiusBase: number;
  /** 基准间距单位（px）。 */
  spacingUnit: number;
}

// 原因：遵循 ADR-0002，将派生应用专属身份与品牌换肤种子抽象为契约并由运行时接缝注入，确保克隆定制零触碰 Template Core
export interface AppIdentity {
  /** 应用展示名称（开发/预发变体会自动追加 ` (Dev)` / ` (Stg)` 后缀）。 */
  displayName: string;
  /** Expo slug 标识。 */
  slug: string;
  /** 生产环境 iOS Bundle Identifier（非生产变体自动追加 `.dev` / `.stg` 实现同机并存）。 */
  iosBundleIdentifier: string;
  /** 生产环境 Android Package Name（非生产变体自动追加 `.dev` / `.stg`）。 */
  androidPackage: string;
  /** 生产环境深度链接 Scheme（非生产变体自动追加 `-dev` / `-stg`）。 */
  scheme: string;
  /** 隐私同意前或无法探测系统语言时的默认语言。 */
  defaultLanguage: SupportedLanguageCode;
  /** 亮/暗双模式 Design Token 推导种子。 */
  theme: BrandThemeSeed;
  /** 隐私政策版本号；升版后已安装用户将被重新拦截至隐私门禁完成重签。 */
  privacyPolicyVersion: string;
  /** 合规门禁、镜像源与 Android Provider 拦截开关。 */
  compliance: ComplianceFlags;
  /** 9 大原生能力声明开关，与构建期清单裁剪同源。 */
  capabilities: CapabilityFlags;
}

export interface RuntimePublicEnv {
  /** 当前构建变体（由 `APP_VARIANT` 注入）。 */
  appVariant: AppVariant;
  /** 分发渠道号（如 `official` / `huawei` / `xiaomi`），同时写入 AndroidManifest meta-data。 */
  appChannel?: string;
  /** 后端 API 基础地址（生产变体强制 `https://`）。 */
  apiBaseUrl: string;
  /** 隐私政策网页地址（生产变体强制 `https://`）。 */
  privacyPolicyUrl: string;
  /** 用户协议网页地址（生产变体强制 `https://`）。 */
  userAgreementUrl: string;
  /** 非生产环境下是否启用内置免后端演示网关（生产构建由 Metro 物理剔除）。 */
  enableDemoGateway?: boolean;
  /** 非生产环境下是否挂载悬浮调试抽屉（生产构建由 Metro 物理剔除）。 */
  enableDevTools?: boolean;
}

export interface LegalDocumentTarget {
  url: string;
  title: string;
}
