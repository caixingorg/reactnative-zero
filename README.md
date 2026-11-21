# Enterprise React Native App Foundation

基于 **Expo Continuous Native Generation (CNG)** 构建的企业级可克隆 iOS / Android 移动应用底座（零付费云构建绑定、全量开启 React Native 新架构 Fabric / TurboModules，原生适配**中国大陆应用市场合规与海外双市场发布**）。

> **快速导航**：查看分层拓扑图、冷启动与刷新锁时序图、构建期裁剪流水线及全模块职责速查表，请先阅读 [**技术架构全景手册 (`docs/ARCHITECTURE.md`)**](./docs/ARCHITECTURE.md)；领域术语见 [`CONTEXT.md`](./CONTEXT.md)，架构决策见 [`docs/adr/`](./docs/adr/)。

---

## 目录

1. [核心设计哲学与目录全景图](#1-核心设计哲学与目录全景图)
2. [场景一：5 分钟克隆并初始化新业务项目 (`pnpm init-app`)](#2-场景一5-分钟克隆并初始化新业务项目-pnpm-init-app)
3. [场景二：全局唯一身份与定制总闸 (`app.identity.ts`) 详解](#3-场景二全局唯一身份与定制总闸-appidentityts-详解)
4. [场景三：多环境变体 (`APP_VARIANT`)、环境变量与真机 DevTools 联调](#4-场景三多环境变体-app_variant环境变量与真机-devtools-联调)
5. [场景四：日常业务开发标准手册（四层架构、网络适配、鉴权、主题与缓存）](#5-场景四日常业务开发标准手册四层架构网络适配鉴权主题与缓存)
6. [场景五：9 大预置原生能力 (`Capability Module`) 与权限合规裁剪](#6-场景五9-大预置原生能力-capability-module-与权限合规裁剪)
7. [场景六：商业第三方 SDK、二阶段隐私唤醒 (`Privacy Gate`) 与 OTA 热更接入](#7-场景六商业第三方-sdk二阶段隐私唤醒-privacy-gate-与-ota-热更接入)
8. [场景七：国内/海外镜像源切换、安卓多渠道打包与内网蒲公英/群机器人分发](#8-场景七国内海外镜像源切换安卓多渠道打包与内网蒲公英群机器人分发)
9. [场景八：从上游底座无冲突同步升级 & 常见踩坑排障 (FAQ)](#9-场景八从上游底座无冲突同步升级--常见踩坑排障-faq)

---

## 1. 核心设计哲学与目录全景图

### 为什么要将“底座内核”与“派生业务”物理隔离？

传统移动项目从旧项目复制改名时，业务代码与底层基建严重缠绕：新项目不仅要花数天清理旧代码与残余原生权限（极易触发 Apple 5.1.1 或国内工信部“超范围索权/同意隐私前抢跑初始化”拒审），且后续底座修复了 Bug 也无法同步给已派生的项目。

本仓库通过 **目录级物理隔离 + 运行时依赖注入** 彻底解决这一问题：

```text
enterprise-rn-template/
├── app.identity.ts              ★ [业务必改] 派生应用唯一身份源（名称、包名、主题色、合规与原生能力总闸）
├── app.config.ts                ⚙️ [底座托管] Expo CNG 配置入口（严禁写死业务常量，自动读取 app.identity.ts）
├── config/
│   ├── env/                     ★ [业务必改] 按变体隔离的环境变量（development / staging / production.env）
│   ├── expo-config-resolver.ts  ⚙️ [底座托管] 纯函数配置推导器（多变体包名后缀、自适应图标与权限插件装配）
│   ├── with-capability-manifest-sanitizer.ts ⚙️ [底座托管] 编译期 Info.plist / AndroidManifest 权限与自启动清洗插件
│   └── with-china-build-mirrors.ts           ⚙️ [底座托管] 国内/海外 Gradle 阿里云 Maven 与 Podfile 镜像注入插件
├── fastlane/
│   └── Fastfile                 ⚙️ [底座托管] 本地 iOS/Android 归档及国内华米OV多渠道矩阵打包流水线
├── scripts/
│   ├── init-app.ts              🛠 [工具脚本] 新项目一键改名、换包名、剥离演示代码与绑定 template-upstream 远端
│   ├── distribute-internal.ts   🛠 [工具脚本] 蒲公英 API v2 上传 + 飞书/企微/钉钉群机器人自动通知
│   └── verify-variant-config.cjs 🛠 [门禁脚本] 防止根目录 .env 文件污染多变体配置的回归检查
└── src/
    ├── app/                     ★ [1. Route Shell 路由装配壳] 极薄页面路由映射与 <Stack.Protected> 守卫（单文件 ≤15 行）
    ├── features/                ★ [2. Feature Slice 业务切片] 垂直业务模块（每個切片仅通过 index.ts 对外暴露）
    ├── shared/                  ★ [3. Shared Layer 应用共享层] 当前 App 跨多个业务切片复用的业务组件与词条
    └── core/                    🔒 [4. Template Core 底座内核] 跨项目通用基建（业务开发保持零改动，随时可从上游同步升级）
        ├── auth/                └── 硬件加密会话存储、重装残留自动擦除与单飞刷新状态机
        ├── bootstrap/           └── 两阶段隐私合规门禁（PrivacyGateView / privacy-gate-store）
        ├── capabilities/        └── 9 大自包含原生能力模块（可按需软关闭或整目录物理删除）
        ├── config/              └── Zod 强模式环境变量校验与全局类型契约
        ├── devtools/            └── 非生产环境内置调试抽屉（production 变体在打包期物理替换为空桩）
        ├── i18n/                └── 中英双语国际化引擎
        ├── network/             └── 可插拔 BackendAdapter、单飞 401 刷新互斥锁、TanStack Query 与离线快照
        ├── observability/       └── 全局错误边界与可插拔日志/崩溃上报/埋点接口
        ├── permissions/         └── 敏感权限同步用途告知弹窗（Permission Rationale）与被拒引导设置队列
        ├── preferences/         └── 亮暗外观模式与语言偏好持久化
        ├── runtime/             └── 全局 Runtime 容器与依赖注入入口（createAppRuntime）
        ├── storage/             └── 双层存储驱动（Keychain/Keystore 硬件加密存储 + MMKV 高速键值存储）
        ├── theme/               └── 零第三方编译插件的 Design Token 亮暗双色主题引擎
        ├── ui/                  └── 10 个跨端基础 UI 原语组件（Screen / Stack / Box / AppText / Button 等）
        ├── updates/             └── 符合隐私门禁规范的 OTA 热更新扩展位
        └── vendors/             └── 微信/支付宝/外部地图/厂商推送商业 SDK 适配器契约与开发态 Mock
```

> **黄金准则**：日常开发新项目时，只修改 `app.identity.ts`、`config/env/*.env`、`src/app/`、`src/features/` 和 `src/shared/`，**不要直接修改 `src/core/`**。所有定制需求均通过 `app.identity.ts` 或 `src/app/_layout.tsx` 中的 `createAppRuntime(...)` 注入完成。

---

## 2. 场景一：5 分钟克隆并初始化新业务项目 (`pnpm init-app`)

### 2.0 开工前的环境要求（务必先看）

| 项目     | 要求                                                                                                      | 不满足时的现象                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Node.js  | 22.13+ / 24.3+ / 26（推荐 `.nvmrc` 指定的 24，fnm / nvm 进入目录自动切换）；**不支持 Node 25 等奇数版本** | `.npmrc` 开启了 `engine-strict`，`pnpm install` 直接报 `ERR_PNPM_UNSUPPORTED_ENGINE`                              |
| 项目路径 | **只能是纯英文路径**（例如 `~/dev/my-app`），不能含中文                                                   | `pod install` 加载 `hermes-engine.podspec` 时报 `incompatible character encodings`；Android Gradle/NDK 也可能异常 |
| 代理软件 | 开启 TUN / fake-IP 模式时，本机会多出一块 `198.18.x.x` 虚拟网卡                                           | dev client 拿到该地址，一直停在 "Searching for development servers"                                               |

`pnpm init-app`、`pnpm ios`、`pnpm android` 与 `pnpm prebuild:*` 执行前都会自动运行 `pnpm preflight` 预检：路径含中文直接报错退出，检测到代理虚拟网卡只给提示。开着代理调试模拟器时可这样启动：

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=localhost pnpm ios
```

真机调试请关闭代理的 TUN 模式，或把 `REACT_NATIVE_PACKAGER_HOSTNAME` 设为本机的局域网 IP。

### 2.1 标准初始化流程

```bash
# 1. 克隆底座仓库到你的新业务目录
git clone <template-repo-url> my-business-app
cd my-business-app

# 2. 安装依赖（仓库已锁定 pnpm 与国内 npmmirror 镜像源）
pnpm install

# 3A. 方式一：交互式初始化（按终端提示依次输入应用名、Bundle ID、Scheme、接口地址）
pnpm init-app

# 3B. 方式二：命令行一键非交互初始化（推荐加 --clean-starter 直接剥离演示代码）
pnpm init-app \
  --name "星辰物流助手" \
  --slug "star-logistics" \
  --bundle-id "com.star.logistics" \
  --android-package "com.star.logistics" \
  --scheme "starlogistics" \
  --api-url "https://api.starlogistics.cn" \
  --privacy-url "https://legal.starlogistics.cn/privacy" \
  --terms-url "https://legal.starlogistics.cn/terms" \
  --clean-starter

# 4. 关联新业务自己的 Git 仓库并执行全量门禁验证
git remote add origin <your-new-business-git-url>
pnpm verify
```

### 2.2 `pnpm init-app` 背后自动为你做了什么？

1. **零内核侵入改名**：自动重写 `app.identity.ts`、`package.json` 及 `config/env/{example,development,staging,production}.env`（自动根据生产域名推导 `api-dev` 与 `api-staging` 地址），`src/core/` 保持 0 字节改动。
2. **防误推保护**：自动将原指向底座仓库的 `origin` 远端重命名为 `template-upstream`，防止开发人员顺手 `git push origin main` 把业务代码推回底座仓库。
3. **`--clean-starter` 净壳裁剪**：
   - **如果不加 `--clean-starter`**：保留完整的演示切片（包含分页动态列表 `src/features/home`、9 大原生能力实验室 `src/features/capabilities-lab`），适合新成员先在模拟器上跑通体验所有内置能力。
   - **如果加了 `--clean-starter`**：自动物理删除演示动态列表与能力实验室切片、同步清理路由与 Maestro 冒烟脚本，仅保留**隐私合规门禁 + 登录认证流 + 干净首页壳 + 个人设置页**，立即可写正式业务。

---

## 3. 场景二：全局唯一身份与定制总闸 (`app.identity.ts`) 详解

根目录下的 [`app.identity.ts`](./app.identity.ts) 是整个应用的控制中心：

```ts
export const appIdentity: AppIdentity = {
  displayName: '企业移动底座',
  slug: 'enterprise-rn-template',
  iosBundleIdentifier: 'com.enterprise.rntemplate',
  androidPackage: 'com.enterprise.rntemplate',
  scheme: 'enterprisern',
  defaultLanguage: 'zh-CN', // 默认语言：'zh-CN' | 'en-US'
  theme: {
    primaryLight: '#2563EB', // 亮色模式品牌主色
    primaryDark: '#60A5FA', // 暗色模式品牌主色
    radiusBase: 10, // 全局圆角基准（自动推导 sm/md/lg/full）
    spacingUnit: 4, // 全局间距基准（自动推导 xs=4, sm=8, md=12, lg=16, xl=24, 2xl=32）
  },
  privacyPolicyVersion: '1.0.0', // 隐私协议版本号：升版（如改为 '1.1.0'）会自动要求已授权老用户重新弹窗签署
  compliance: {
    requirePrivacyConsent: true, // 国内上架设为 true（开启两阶段隐私门禁）；纯海外出海应用可设为 false
    requirePermissionRationale: true, // 调用相机/定位等敏感权限前是否先弹出业务用途说明（国内机审必开）
    useChinaBuildMirrors: true, // 可选：Prebuild 时是否注入阿里云 Maven 与清华 Podfile 镜像（默认 false，独立于 requirePrivacyConsent）
    blockedAndroidAutoInitProviders: [
      // 可选：追加需要从 AndroidManifest 强制移除（tools:node="remove"）的第三方 SDK 自动初始化 ContentProvider 类名
    ],
  },
  capabilities: {
    camera: true, // 相机与扫码
    photoLibrary: true, // 相册选图
    mediaLibrary: true, // 保存图片/海报到系统相册
    filesAndSharing: true, // 文档选择、本地文件读写与系统分享
    webview: true, // 安全混合 WebView 容器与双向 JSBridge
    biometrics: true, // 面容 ID / 指纹核身
    location: true, // 前台地理定位
    notifications: true, // 本地与远程推送通知
    audioVideo: true, // 音视频播放与麦克风录制
    backgroundAudio: false, // 后台音频播放（必须同时开启 audioVideo: true，仅在真实实现后台播放时开启）
  },
};
```

### 常见定制操作速查

- **切换为“纯海外出海模式”**：将 `compliance.requirePrivacyConsent` 设为 `false`、`defaultLanguage` 设为 `'en-US'`。启动时会自动跳过国内隐私拦截页直接初始化二阶段 SDK，且 Prebuild 默认使用 Gradle/CocoaPods 官方源。
- **法务更新了《隐私政策》需要全量用户重签**：只需将 `privacyPolicyVersion` 从 `'1.0.0'` 改为 `'2.0.0'`。老用户升级 App 后，因本地存储的已签署版本号不匹配，会自动重新弹出隐私政策拦截窗。
- **一键全局换肤**：修改 `theme.primaryLight` 与 `theme.primaryDark`，全应用按钮、徽章、激活态与生产包 Android 自适应图标背景色会自动同步更新。

---

## 4. 场景三：多环境变体 (`APP_VARIANT`)、环境变量与真机 DevTools 联调

### 4.1 三变体同机并存机制

通过环境变量 `APP_VARIANT` 驱动，支持在同一台测试真机上**同时安装开发环境、测试环境与生产环境 3 个 App** 而不互相覆盖：

| 构建变体 (`APP_VARIANT`) | 手机桌面名称   | 包名 / Bundle ID 后缀 | 桌面图标底色              | 内置 DevTools 抽屉 | 本地演示网关       |
| :----------------------- | :------------- | :-------------------- | :------------------------ | :----------------- | :----------------- |
| `development`            | `应用名 (Dev)` | `.dev`                | 科技蓝 (`#0EA5E9`)        | 开启               | 可开启             |
| `staging`                | `应用名 (Stg)` | `.stg`                | 琥珀黄 (`#D97706`)        | 开启               | 可开启             |
| `production`             | `应用名`       | 无后缀                | 品牌主色 (`primaryLight`) | **打包期物理剥离** | **打包期物理剥离** |

```bash
# 本地编译并安装对应变体到模拟器/真机（首次或修改原生能力开关后执行）
pnpm ios                                  # 默认安装 development 变体
pnpm android                              # 默认安装 development 变体
APP_VARIANT=staging npx expo run:android  # 编译安装 staging 变体

# 仅生成各变体原生工程目录（供 Xcode / Android Studio 打开编译）
pnpm prebuild:dev
pnpm prebuild:staging
pnpm prebuild:prod

# 启动日常 JS 热重载服务
pnpm start          # development 变体
pnpm start:staging  # staging 变体
pnpm start:prod     # production 变体
```

### 4.2 环境变量配置与扩展规范 (`config/env/*.env`)

> ⚠️ **严禁在项目根目录创建 `.env`、`.env.production` 等文件！**
> 原因：Expo CLI 在执行 Release 归档时固定以 `NODE_ENV=production` 运行，若根目录存在 `.env.production`，会强行覆盖 `staging` 变体的接口地址。本底座将环境变量统一收纳在 `config/env/{development,staging,production}.env`，并由 `pnpm verify:variants` 门禁强制守护。

**如何新增一个自定义环境变量（例如 `EXPO_PUBLIC_SENTRY_DSN`）？**

1. 在 `config/env/{example,development,staging,production}.env` 中添加 `EXPO_PUBLIC_SENTRY_DSN=https://...`。
2. 在 [`src/core/config/types.ts`](./src/core/config/types.ts) 的 `RuntimePublicEnv` 接口中声明字段 `sentryDsn?: string;`。
3. 在 [`src/core/config/env-schema.ts`](./src/core/config/env-schema.ts) 的 `rawEnvSchema` 与 `parseRuntimeEnv` 中添加 Zod 校验与字段映射（启动期若漏配或格式错误会立即抛出明确字段诊断异常）。

### 4.3 免后端演示网关与真机 `DevTools` 调试面板

- **内置演示账号**：当 `config/env/development.env` 中 `EXPO_PUBLIC_ENABLE_DEMO_GATEWAY=true` 时，无需启动任何后端服务，直接使用账号 **`admin`** / 密码 **`password123`** 即可体验完整登录、分页列表加载与 401 令牌自动刷新。
- **呼出真机 `DevTools` 抽屉**：在 `development` 或 `staging` 包中，点击**首页顶部的环境胶囊徽章（如 `DEV` / `STG`）**，或进入**“个人设置 → 打开开发者调试面板”**，可执行：
  1. 查看当前变体、分发渠道号（`APP_CHANNEL`）、网络在线状态、加密凭证持有状态及最近 15 条结构化日志。
  2. **免重打包动态切换后端 API 地址**（持久化生效，冷重启依然保留）。
  3. **一键模拟 AccessToken 过期**：验证下一次请求触发后台静默单飞 401 续期。
  4. **一键清空本地 MMKV 缓存**或**重置隐私合规门禁**（立即回退到隐私弹窗拦截页）。
- **生产包零残留保障**：当 `APP_VARIANT=production` 时，[`metro.config.js`](./metro.config.js) 会在打包期将 `DevToolsDrawerHost`、`devtools-store` 与 `demo-http-transport` 物理重定向为空桩文件（`.prod.ts`），正式包中不包含任何调试 UI 与演示代码。

---

## 5. 场景四：日常业务开发标准手册（四层架构、网络适配、鉴权、主题与缓存）

### 5.1 严格四层单向依赖规则（ESLint 自动拦截）

[`eslint.config.js`](./eslint.config.js) 强制锁死以下单向依赖流，任何反向引用或跨业务切片深层导入都会在 `pnpm lint` 与 Git 提交钩子中直接报错：

```text
[1] src/app/**        (Route Shell 路由装配壳：只做路由映射，严禁写业务逻辑或复杂 UI)
       ↓ 只能引用各切片的公共入口 @/features/<slice>
[2] src/features/*    (Feature Slice 业务切片：不同业务切片之间严禁互相引用！)
       ↓ 跨切片共享组件/词条必须下沉到 @/shared
[3] src/shared/**     (Shared Layer 应用共享层：严禁反向引用 features 或 app)
       ↓
[4] src/core/**       (Template Core 底座内核：严禁引用 shared / features / app / app.identity.ts)
```

### 5.2 手把手新增一个业务模块（以“订单模块 `orders`”为例）

**第 1 步：创建业务切片目录与唯一公共出口 `src/features/orders/index.ts`**

```ts
// src/features/orders/api/orders-api.ts
import { useQuery } from '@tanstack/react-query';
import { useAppRuntime } from '@/core/runtime';

export interface OrderItem {
  id: string;
  title: string;
  amountCents: number;
}

export function useOrdersListQuery() {
  const { httpClient } = useAppRuntime();
  return useQuery({
    queryKey: ['orders', 'list'],
    queryFn: () => httpClient.get<OrderItem[]>('/orders'),
    // 可选：开启冷启动离线首屏秒开快照（严禁对含身份证/银行卡等敏感隐私的接口开启！）
    meta: { persistOffline: true },
  });
}
```

```tsx
// src/features/orders/screens/OrderListScreen.tsx
import React from 'react';
import { AppText, Button, EmptyState, Screen, Skeleton, VStack } from '@/core/ui';
import { useOrdersListQuery } from '../api/orders-api';

export function OrderListScreen(): React.JSX.Element {
  const { data, isLoading, refetch } = useOrdersListQuery();

  if (isLoading) {
    return (
      <Screen>
        <Skeleton height={80} />
      </Screen>
    );
  }

  return (
    <Screen scrollable>
      <VStack gap="md">
        <AppText variant="titleLg">我的订单</AppText>
        {data && data.length > 0 ? (
          data.map((item) => (
            <VStack key={item.id} p="md" bg="surface" radius="md" bordered>
              <AppText variant="bodyMd" weight="600">
                {item.title}
              </AppText>
            </VStack>
          ))
        ) : (
          <EmptyState title="暂无订单" actionLabel="刷新重试" onAction={() => void refetch()} />
        )}
      </VStack>
    </Screen>
  );
}
```

```ts
// src/features/orders/index.ts （外部只能导入此桶文件，严禁深层导入 screens/*）
export { OrderListScreen } from './screens/OrderListScreen';
export type { OrderItem } from './api/orders-api';
```

**第 2 步：在 `src/app/` 挂载极薄路由文件**

```tsx
// src/app/orders/index.tsx
import React from 'react';
import { OrderListScreen } from '@/features/orders';

export default function OrdersRoute(): React.JSX.Element {
  return <OrderListScreen />;
}
```

### 5.3 对接自定义后端信封格式 (`BackendAdapter`)

底座默认内置 [`createDefaultBackendAdapter()`](./src/core/network/default-backend-adapter.ts)，开箱支持国内主流的 `{ code: 0 | 200, message: string, data: T }` 响应解包、业务码 `401 / 40101` 过期识别以及 `POST /auth/refresh` 单飞并发续期锁（10 个并发请求同时遇到 401 只会发起 1 次刷新请求，其余 9 个挂起等待新 Token 后自动重放）。

**如果你们后端的返回格式不同（例如 `{ errCode: '0000', errMsg: '', payload: {...} }`），无需修改内核，只需在 `src/shared/` 编写适配器并在 `src/app/_layout.tsx` 注入：**

```ts
// 在 src/app/_layout.tsx 的 createAppRuntime 中注入：
const runtime = createAppRuntime({
  identity: appIdentity,
  env,
  translations: appTranslationResources,
  backendAdapter: myCustomBackendAdapter, // 替换默认后端协议适配器
});
```

### 5.4 使用内置 UI 原语与亮暗主题 Token (`src/core/ui`)

为避免 NativeWind 等第三方 Babel/Metro 样式编译插件在升级 React Native 大版本时崩溃，本底座采用零编译插件的语义化主题引擎（[ADR-0003](./docs/adr/0003-zero-dependency-themed-stylesheet.md)）：

- **直接使用的布局与交互原语**（从 `@/core/ui` 导入）：
  - 布局容器：`Screen`（自带安全区与软键盘避让）、`VStack`（纵向间距栈）、`HStack`（横向间距栈）、`Box`（语义背景/边框/内边距盒子）
  - 交互与反馈：`AppText`、`Button`、`TextField`（兼容 `react-hook-form` + `zod`）、`AppImage`（基于 `expo-image` 二级缓存）、`BottomSheetModal`、`Skeleton`、`EmptyState`
- **在自定义样式中获取当前亮/暗主题颜色**：
  ```tsx
  import { useAppTheme } from '@/core/theme/theme-context';
  const { colors, spacing, radius, isDark } = useAppTheme();
  ```

### 5.5 双层安全存储规范 (`secretStorage` vs `keyValueStorage`)

- **敏感凭证（Token、密钥、支付凭据）**：必须使用 `runtime.secretStorage`（底层为 iOS Keychain / Android Keystore 硬件级加密，且内置卸载重装自动擦除孤儿 Keychain 机制；还可通过 `@/core/capabilities/biometrics` 调用 `setHardwareBiometricSecret` 绑定指纹/面容硬件锁）。
- **普通偏好与非敏感缓存**：使用 `runtime.keyValueStorage`（底层为 MMKV v4 高速同步存储）。

---

## 6. 场景五：9 大预置原生能力 (`Capability Module`) 与权限合规裁剪

底座遵循“全家桶预置、按需做减法”设计（[ADR-0005](./docs/adr/0005-batteries-included-capabilities-with-manifest-gating.md)）。

### 6.1 敏感权限同步用途告知 (`Permission Rationale`)

国内应用市场（华为/小米/OV/应用宝）严禁“一言不合直接弹系统权限框”，要求申请相机、相册、定位、麦克风、通知权限前必须**同步告知业务用途**。底座所有能力模块已自动接入 `permissionCoordinator`，或直接在业务中调用：

```ts
const { permissionCoordinator } = useAppRuntime();
const granted = await permissionCoordinator.requestPermissionWithRationale({
  kind: 'camera',
  rationaleTitle: '需要开启相机权限',
  rationaleMessage: '用于扫描运单条形码及拍摄货物签收照片。',
});
```

- 若用户首次申请，先弹出用途说明卡片，用户点确认后再触发系统授权框（或同步展示）；
- 若用户此前已拒绝且勾选“不再询问”，自动弹出引导卡片并提供**“一键前往系统设置页”**按钮。

### 6.2 9 大原生能力模块调用入口与裁剪对照表

当你的业务不需要某项能力时：

- **方式 A（10 秒软关闭，推荐）**：在 `app.identity.ts` 将对应开关改为 `false`，执行 `npx expo prebuild --clean`。[`with-capability-manifest-sanitizer.ts`](./config/with-capability-manifest-sanitizer.ts) 会自动从编译后的 `Info.plist` 和 `AndroidManifest.xml` 中**彻底剥离对应权限声明与后台服务**，直接规避 Apple 5.1.1 和国内“超范围索权”拒审。
- **方式 B（物理卸载缩减包体积）**：各模块完全自包含，直接按下表删除文件夹并 `pnpm remove` 对应 npm 包即可：

| 能力开关 (`app.identity.ts`)    | 调用入口 (`@/core/capabilities/<目录>`)                                                                                      | 物理删除可一并卸载的依赖包 (`pnpm remove ...`)                                       |
| :------------------------------ | :--------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| `camera`                        | `@/core/capabilities/camera`（拍照采集、二维码/条码扫描组件）                                                                | `expo-camera`                                                                        |
| `photoLibrary` / `mediaLibrary` | `@/core/capabilities/media`（选图裁剪、保存海报到相册；Android 13+ 自动走免权限系统 Photo Picker）                           | `expo-image-picker expo-media-library`                                               |
| `filesAndSharing`               | `@/core/capabilities/files`（文档选择器、沙盒文件读写、原生系统分享）                                                        | `expo-document-picker expo-file-system expo-sharing`                                 |
| `webview`                       | `@/core/capabilities/webview`（域名白名单、防 iframe 劫持 nonce 校验、类型安全双向 `JSBridge`、默认关闭 DOM Storage 防追踪） | `react-native-webview`（需同步移除 `src/features/webview` 与 `src/app/webview.tsx`） |
| `biometrics`                    | `@/core/capabilities/biometrics`（面容/指纹核身、硬件级生物识别密钥存取）                                                    | `expo-local-authentication`                                                          |
| `location`                      | `@/core/capabilities/location`（前台单次定位；已强制剥离后台定位前台服务防拒审）                                             | `expo-location`                                                                      |
| `notifications`                 | `@/core/capabilities/notifications`（本地通知调度、推送 Token 获取）                                                         | `expo-notifications`                                                                 |
| `audioVideo`                    | `@/core/capabilities/audio-video`（音频播放、视频播放器组件）                                                                | `expo-audio expo-video`                                                              |
| （基础设备反馈）                | `@/core/capabilities/device-feedback`（触觉震动反馈、安全剪贴板读写、设备信息）                                              | `expo-clipboard expo-haptics expo-device expo-application`                           |

---

## 7. 场景六：商业第三方 SDK、二阶段隐私唤醒 (`Privacy Gate`) 与 OTA 热更接入

### 7.1 国内《个保法》两阶段启动门禁：如何安全初始化第三方 SDK？

国内机审最严红线：**在用户点击《隐私政策》“同意”按钮前，绝不允许任何 SDK 读取 OAID、AndroidID、MAC、IMEI、位置或发起埋点请求**。

本底座将启动拆分为两个严格阶段（[ADR-0004](./docs/adr/0004-two-phase-privacy-gate-bootstrap.md)）：

1. **第一阶段（未同意隐私前）**：仅渲染本地 UI 与隐私协议弹窗，零网络请求、零设备标识读取（连默认语言都只读静态配置 `defaultLanguage` 而不调系统 Locale 原生接口）。同时在 `AndroidManifest.xml` 中自动通过 `tools:node="remove"` 剥离 Firebase、极光、友盟、Sentry 等常见 AAR 的 `ContentProvider` 抢跑自启动。
2. **第二阶段（用户点击“同意”后）**：自动按序触发 `deferredInitializers` 钩子。

**接入 Sentry / 友盟 / 极光推送等 SDK 的标准写法（在 `src/app/_layout.tsx` 中注册）：**

```tsx
const runtime = createAppRuntime({
  identity: appIdentity,
  env,
  translations: appTranslationResources,
  // 1. 注入自定义崩溃监控与埋点实现（仅在 Phase 2 用户授权后才会调用 initialize()）
  observability: {
    errorReporter: {
      initialize: () => {
        Sentry.init({ dsn: 'https://...' });
      },
      suspend: () => {
        // 用户在设置页撤回隐私授权时自动挂起
        void Sentry.close();
      },
      captureException: (err, ctx) => Sentry.captureException(err, { extra: ctx }),
    },
  },
  // 2. 注册任意需要在用户同意隐私政策后才延迟唤醒的第三方原生 SDK
  deferredInitializers: [
    {
      id: 'vendor:jpush',
      init: async () => {
        await JPush.init({ appKey: 'your-app-key', channel: env.appChannel ?? 'official' });
      },
      onConsentRevoked: () => {
        JPush.stopPush();
      },
    },
  ],
});
```

> **防抢跑补充**：如果你引入的某个国内第三方安卓 SDK 内部自带了自动初始化的 `ContentProvider`（导致机审被拒），只需把它的 Provider 类名加进 `app.identity.ts` 的 `compliance.blockedAndroidAutoInitProviders: ['com.xxx.sdk.InitProvider']`，执行 `npx expo prebuild` 即可将其自启动彻底抹除。

### 7.2 注入微信登录、微信/支付宝支付、外部地图与厂商推送 (`CommercialVendorAdapters`)

底座在 [`src/core/vendors/index.ts`](./src/core/vendors/index.ts) 中预定义了四大商业能力契约：

- 在 `development` / `staging` 变体下：未注入真实 SDK 时默认提供开箱即用的 Mock 实现，让新项目在等待微信/支付宝商户资质审批期间即可跑通全套业务流程。
- 在 `production` 变体下：**若未显式注入真实适配器则调用时立即抛错阻断**，绝不让模拟支付成功混入生产环境。

```tsx
// 业务组件内调用：
import { useCommercialVendorAdapters } from '@/core/vendors';

const { socialAuth, payment, mapNavigation, vendorPush } = useCommercialVendorAdapters();
const wxRes = await socialAuth.signInWithProvider('wechat');
const payRes = await payment.checkoutOrder({
  channel: 'wechat_pay',
  orderId: 'ORD_01',
  amountCents: 9900,
});
```

```tsx
// 拿到商户密钥后，在 src/app/_layout.tsx 的 createAppRuntime 中注入真实实现：
createAppRuntime({
  identity: appIdentity,
  env,
  vendors: {
    socialAuth: myRealWeChatAndAppleAuthAdapter,
    payment: myRealWeChatAndAlipayAdapter,
    mapNavigation: myRealAmapNavigationAdapter,
    vendorPush: myRealVendorPushAdapter,
  },
});
```

### 7.3 按需开启 OTA 热更新 (`OtaUpdateCoordinator`)

底座默认关闭热更新且不预装 `expo-updates`。若已自建合规热更服务，在 `createAppRuntime({ ota: { enabled: true, driver: otaDriver } })` 中注入即可自动在隐私门禁通过后的第二阶段执行热更检查。

---

## 8. 场景七：国内/海外镜像源切换、安卓多渠道打包与内网蒲公英/群机器人分发

### 8.1 国内与海外构建镜像源自动切换

1. **JS 依赖源 (`.npmrc`)**：默认固化国内 `https://registry.npmmirror.com/`；若在海外 GitHub Actions 构建，可通过环境变量 `NPM_CONFIG_REGISTRY=https://registry.npmjs.org/` 覆盖。
2. **Android Gradle 与 iOS CocoaPods 源 (`config/with-china-build-mirrors.ts`)**：
   - 默认关闭（`false`），独立于 `requirePrivacyConsent`（避免海外 GDPR 应用因开启隐私门禁被误路由至国内镜像），需显式开启：
     - **国内模式（开启）**：在 `app.identity.ts` 中设置 `compliance.useChinaBuildMirrors: true` 或构建时传入 `EXPO_USE_CHINA_MIRRORS=true`，`expo prebuild` 自动在 `android/build.gradle` 前置注入阿里云 Maven 镜像群（`public` / `google` / `gradle-plugin`），并在 `ios/Podfile` 顶部注入清华 CocoaPods Specs 镜像源（可通过 `EXPO_COCOAPODS_MIRROR_URL` 指定企业内网 Nexus/GitLab 镜像）。
     - **海外模式（默认关闭）**：不配置或设置 `EXPO_USE_CHINA_MIRRORS=false`（或 `useChinaBuildMirrors: false`），Prebuild 保持 100% 原生官方源。

### 8.2 安卓国内应用市场多渠道打包 (`APP_CHANNEL`)

国内上架需要为华为（`huawei`）、小米（`xiaomi`）、OPPO（`oppo`）、vivo（`vivo`）、荣耀（`honor`）、应用宝（`yingyongbao`）及官网（`official`）注入不同渠道号。

首次使用前需要安装 Ruby 与 Bundler，并在仓库根目录安装已锁定版本的 fastlane（`Gemfile` / `Gemfile.lock`）：

```bash
bundle install
bundle exec fastlane lanes   # 确认能列出 android / ios 的 lane
```

若 `bundle install` 因镜像证书失败，可临时绕过镜像直连官方源（变量名含 `/`，必须通过 `env` 传入）：

```bash
env 'BUNDLE_MIRROR__HTTPS://RUBYGEMS__ORG/=https://rubygems.org' bundle install
```

**版本号与 build number**：应用版本以 `package.json` 的 `version` 为唯一来源，Expo 配置与 `pnpm distribute` 共用同一读取逻辑。

- 升级版本：`pnpm version:bump patch`（或 `minor` / `major` / 具体版本号），不会创建 git tag。
- 版本覆盖：设置 `APP_VERSION` 可临时覆盖；`DISTRIBUTE_APP_VERSION` 或 `--version` 只影响分发通知文案。
- iOS build number：`IOS_BUILD_NUMBER` → CI 流水线序号（`GITHUB_RUN_NUMBER` / `CI_PIPELINE_IID`）→ `1`。
- Android versionCode：`ANDROID_VERSION_CODE` → CI 流水线序号 → `1`。本地构建没有 CI 序号时固定为 `1`，需要递增请显式传入环境变量。

```bash
# 1. 打单个指定渠道的 Android Release 包（自动注入 AndroidManifest APP_CHANNEL 与 UMENG_CHANNEL meta-data）
bundle exec fastlane android build_channel variant:production channel:huawei

# 2. 一键批量打出国内 7 大主流应用市场渠道包矩阵（产物归档至 dist/android/）
bundle exec fastlane android build_domestic_matrix variant:production

# 3. 自定义渠道列表批量打包
bundle exec fastlane android build_domestic_matrix variant:production channels:"official,huawei,xiaomi"

# 4. 本地 Xcode 归档导出 iOS IPA（无需 EAS Cloud）
bundle exec fastlane ios build_archive variant:staging export_method:"ad-hoc"
```

在 JS 业务代码中读取当前渠道号：

```ts
const { env } = useAppRuntime();
console.log(env.appChannel); // 例如 'huawei'、'xiaomi'、'official'
```

### 8.3 内网蒲公英上传与飞书/企业微信/钉钉群机器人自动通知

构建完成后，使用 `pnpm distribute` 一键将 APK/IPA 上传至蒲公英（API v2 `getCOSToken` 直传），并向研发/测试群发送包含**环境变体、渠道号、版本号、更新说明、下载按钮与扫码二维码**的富文本卡片：

```bash
# 1. 离线演练（无需配置密钥，直接在终端预览生成的飞书/企微/钉钉 JSON 卡片载荷）
pnpm distribute:dry-run --platform android --variant staging --channel huawei --webhook-type feishu

# 2. 正式上传蒲公英并推送飞书群机器人卡片（支持 feishu | wecom | dingtalk）
pnpm distribute \
  --platform android \
  --variant staging \
  --channel huawei \
  --artifact dist/android/app-staging-huawei-release.apk \
  --version 1.2.0 \
  --commit "$(git rev-parse --short HEAD)" \
  --release-notes "修复订单列表下拉刷新与华为渠道推送通道" \
  --pgyer-api-key "$PGYER_API_KEY" \
  --webhook-type feishu \
  --webhook-url "$FEISHU_BOT_WEBHOOK_URL"
```

---

## 9. 场景八：从上游底座无冲突同步升级 & 常见踩坑排障 (FAQ)

### 9.1 派生项目如何拉取上游底座 (`template-upstream`) 的最新升级？

因为业务项目的身份配置在 `app.identity.ts`、业务代码在 `src/features/` 与 `src/shared/`，而 `src/core/` 与 `config/` 保持零业务耦合，当底座仓库升级了 React Native 版本或修复了底层 Bug 时：

```bash
# 1. 拉取上游底座最新提交
git fetch template-upstream

# 2A. 方式一：精准拣选上游某个修复 Commit
git cherry-pick <commit-sha>

# 2B. 方式二：直接将 src/core 与 config 对齐到上游最新 main 分支并跑全量验证
git checkout template-upstream/main -- src/core config
pnpm verify
```

### 9.2 常见问题与架构红线排障 (FAQ)

| 现象 / 报错信息                                                                           | 原因说明                                                                                        | 正确做法                                                                                                                   |
| :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **`pnpm lint` 报错：`严禁在 src/ 生产代码中分支嗅探 process.env.NODE_ENV`**               | Metro 打包与 Jest 环境下直接嗅探 `NODE_ENV` 会导致测试与真实运行行为分叉。                      | 环境变体判断请使用 `env.appVariant`（来自 `useAppRuntime()`）；测试替身请通过 `createAppRuntime({ overrides })` 显式注入。 |
| **`pnpm lint` 报错：`严禁跨 Feature Slice 引用` 或 `禁止深层引用切片私有文件`**           | 防止不同业务模块互相引用内部私有组件导致架构腐化。                                              | 外部只允许 `import { X } from '@/features/orders'`；若两个业务切片都要用某个组件，将其移入 `src/shared/components/`。      |
| **`pnpm verify:variants` 报错：`根目录存在 .env`**                                        | 根目录 `.env*` 会被 `@expo/env` 自动加载并串味污染其他变体。                                    | 删除根目录下的 `.env*`，将环境变量写入 `config/env/{development,staging,production}.env`。                                 |
| **Android WebView 内 H5 页面读取 `window.localStorage` 为 `null`**                        | `SecureHybridWebView` 默认关闭 DOM Storage（`allowDomStorage={false}`）以防外部网页持久化追踪。 | 若嵌入的是企业自有受信任 SPA 轻应用，请显式传入 `<SecureHybridWebView allowDomStorage ... />`。                            |
| **生产包调用微信登录/支付抛 `VendorAdapterNotConfiguredError`**                           | 生产环境强制阻断开发态 Mock 适配器，防止模拟已支付造成资损。                                    | 在 `src/app/_layout.tsx` 的 `createAppRuntime({ vendors })` 中注入真实商业 SDK 适配器。                                    |
| **`pod install` 报 `Invalid hermes-engine.podspec ... incompatible character encodings`** | 项目路径含中文等非 ASCII 字符，CocoaPods 拼接路径时编码冲突。                                   | 把项目移到纯英文路径；`pnpm preflight` 会提前拦截。                                                                        |
| **`pnpm install` 报 `ERR_PNPM_UNSUPPORTED_ENGINE`**                                       | 当前 Node 版本不在 Expo 支持范围内（例如 Node 25），且 `.npmrc` 开启了 `engine-strict`。        | 切换到 `.nvmrc` 指定的版本：`fnm use` 或 `nvm use`。                                                                       |
| **dev client 一直停在 "Searching for development servers"，日志里出现 `198.18.x.x`**      | 代理软件的 TUN / fake-IP 虚拟网卡接管了默认路由，Metro 地址被写成虚拟 IP。                      | 模拟器用 `REACT_NATIVE_PACKAGER_HOSTNAME=localhost pnpm ios`；真机请关闭 TUN 模式或指定局域网 IP。                         |

---

## 常用质量与工程命令速查

| 命令                      | 说明                                                                                                          |
| :------------------------ | :------------------------------------------------------------------------------------------------------------ |
| `pnpm init-app`           | 交互式或参数化初始化新派生项目（改名、改包名、可选 `--clean-starter` 剥离演示切片）                           |
| `pnpm preflight`          | 原生构建环境预检（非 ASCII 项目路径、代理虚拟网卡）；`init-app` / `ios` / `android` / `prebuild:*` 会自动先跑 |
| `pnpm verify`             | **全量门禁（提交前必跑）**：TypeScript 严格类型检查 + ESLint 四层架构检查 + 全套 Jest 双接缝测试              |
| `pnpm verify:variants`    | 验证 `development` / `staging` / `production` 在 `development` 与 `production` 编译模式下的配置隔离           |
| `pnpm distribute:dry-run` | 离线演练蒲公英上传与飞书/企微/钉钉群机器人通知卡片生成                                                        |
| `pnpm typecheck`          | 运行 TypeScript 严格模式全量类型检查 (`tsc --noEmit`)                                                         |
| `pnpm lint`               | 运行 ESLint（含四层单向依赖禁令与禁用 `any` 检查）                                                            |
| `pnpm test`               | 运行 Jest 双接缝（Seam 1 运行时接缝 + Seam 2 原生预构建配置接缝）自动化测试套件                               |
| `pnpm format`             | 使用 Prettier 统一格式化仓库代码与文档                                                                        |

## 参与贡献

分支命名、提交规范、合并策略与必需检查见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告,不要公开提 issue。

## 许可证

[MIT](LICENSE)
