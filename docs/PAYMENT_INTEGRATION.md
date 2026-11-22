# Payment Integration Guide（原生支付驱动组织与接入规范）

本模板默认仅内置纯 TypeScript 无头支付引擎（`src/core/capabilities/payment/`）以及零原生依赖驱动（`WebCheckoutDriver`、`ZeroAmountDriver`、`Mock*Driver`），**不向默认安装包编入任何闭源第三方支付 SDK**。

当派生应用（App Instance）签约具体支付渠道后，按以下 4 类来源接入，业务切片（`src/features/*`）代码无需修改。

---

## 1. 目录组织原则

```text
app.config.ts                            # 原生工程配置入口（挂载 Config Plugin）
package.json                             # 官方有成熟 RN 包的 SDK（Stripe / expo-iap / RevenueCat）
modules/                                 # 仅原生 SDK 的渠道（支付宝 / 微信 / 离线二级聚合 SDK）
├── payment-alipay/                      # Expo Module + Config Plugin（引官方 Pod / Maven）
└── payment-wechat/                      # Expo Module + Config Plugin（自动生成 WXPayEntryActivity）
src/core/capabilities/payment/drivers/   # 薄适配器：把外部 SDK 翻译成 CheckoutDriver / StoreBillingDriver
src/app/_layout.tsx (或 App 装配层)       # 唯一接线处：按当前项目实际签约渠道 registerDriver
```

---

## 2. 按 SDK 来源分类接入

### A. H5 / 浏览器收银台（PayPal、80% 二级聚合平台）
- **无需新增原生代码**：直接注册内置 `createWebCheckoutDriver()`。
- 后端下发 `{ orderId, channelCode, driverId: 'web_checkout', payload: { checkoutUrl, returnUrlPrefix } }`。
- 如需升级为系统内嵌浏览器面板（iOS `ASWebAuthenticationSession` / Android Chrome Custom Tabs），可安装 `expo-web-browser` 并在 `createWebCheckoutDriver({ openUrl })` 中注入即可。

### B. 官方有成熟 RN 包的渠道（Stripe / Adyen / Apple IAP / Google Billing）
1. **银行卡 + Apple Pay + Google Pay + PayPal（出海）**：
   - 安装 `@stripe/stripe-react-native`（或 `@adyen/react-native`），在 `app.config.ts` 的 `plugins` 中添加官方 Config Plugin（配置 Apple Pay Merchant ID 等）。
   - 写一个薄 `CheckoutDriver` 适配器，在 `isAvailable()` 中检测设备是否支持 Apple Pay / Google Pay，在 `execute()` 中拉起 PaymentSheet 并返回 `DriverExecutionResult`。
2. **Apple IAP / Google Play Billing（订阅 + 一次性买断）**：
   - **自建后端路线（零 SaaS 抽成）**：安装 `expo-iap`，使用内置适配器 [`createExpoIapBillingDriver`](../src/core/capabilities/payment/drivers/expo-iap-driver.ts) 并配置 `ServerOrderVerifier.verifyStoreTransaction`。
   - **托管订阅路线（免自建收据服务器）**：安装 `react-native-purchases`（RevenueCat），使用内置适配器 [`createRevenueCatBillingDriver`](../src/core/capabilities/payment/drivers/revenuecat-driver.ts)。
   - **硬性约束**：`StoreBillingCoordinator` 仅在后端明确返回 `shouldFinishTransaction: true` 时调用 `finishTransaction`，严禁在客户端跳过验单直接核销；Apple 审核强制要求买断/订阅页面保留「恢复购买」按钮。

### C. 官方仅提供原生 SDK 的渠道（微信支付 / 支付宝 / 云闪付）
1. 使用 `npx create-expo-module --local` 在 `modules/payment-<vendor>/` 下建本地模块（纳入 git，不被 `expo prebuild --clean` 清除）。
2. 在 `ios/*.podspec` 和 `android/build.gradle` 中声明官方 CocoaPods / Maven 坐标（**严禁将闭源 `.aar` / `.xcframework` 打包发布至公共 npm**）。
3. 在 `modules/payment-<vendor>/app.plugin.js` 中编写 Expo Config Plugin 注入 `Info.plist` URL Schemes / Universal Links 与 `AndroidManifest.xml`；微信支付模块（[`modules/payment-wechat/app.plugin.js`](../modules/payment-wechat/app.plugin.js)）会自动按宿主包名生成 `<androidPackage>.wxapi.WXPayEntryActivity` 并处理 Apple Silicon 模拟器 Pod 架构兼容。
4. 不论后端是直连微信/支付宝，还是经由二级聚合平台（拉卡拉/通联/易宝等）在服务端换取原厂签名参数，客户端均复用同一个原厂 `CheckoutDriver`。

### D. 二级平台仅提供离线 `.aar` / `.xcframework`
- 同样建本地模块 `modules/payment-<vendor>/`，将离线包放入该模块私有的 `android/libs/` 与 `ios/Frameworks/` 目录，由模块自身的 `build.gradle` / `.podspec` 本地引用，绝不手改根目录生成后的 `android/` 与 `ios/`。

---

## 3. 安全与合规红线

1. **隐私门禁（ADR-0004）**：必须通过 `paymentService.createDeferredInitializer()` 挂入 Privacy Gate 二阶段，在用户同意隐私政策前严禁初始化任何第三方支付 SDK。
2. **绝不信任客户端回调**：前端回调仅触发后端 `verifyCheckoutOrder` / `verifyStoreTransaction`，发货与权益变更完全以服务端状态为准。
3. **PCI-DSS 合规**：禁止在自定义 React Native 表单中采集真实银行卡号或 CVV，银行卡输入必须走持牌网关原生控件或托管 H5 收银台。
4. **应用商店审核隔离**：虚拟商品与软件会员订阅在 iOS 必须仅通过后端渠道下发暴露 Apple IAP，未签约的第三方支付 SDK 不得编译进二进制包。
5. **敏感数据脱敏**：支付事件与日志严禁打印签名串、支付令牌与原始商店收据。
