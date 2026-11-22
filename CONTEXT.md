# Enterprise React Native App Foundation

A clonable mobile application foundation designed to initialize independent iOS and Android business products while preserving a clean boundary for upstream foundation updates.

## 10-Minute Onboarding Map

### 1. Five Entry Files to Read First
1. `app.identity.ts` — Single source of truth for app name, bundle/package IDs, theme seed, compliance gates, and capability switches.
2. `src/app/_layout.tsx` — Root Route Shell (`GuardedRootStack` + `AppRuntimeProvider` + `AppDrawerShell` + `WelcomeOverlayGate`).
3. `src/core/runtime/create-app-runtime.ts` — Explicit 3-stage DI bootstrap (`bootStorageAndCompliance` → `bootCoreServices` → `bootNetworkAndUiStores`).
4. `eslint.config.js` — Enforces the 4-layer dependency direction (`app → features → shared → core`) and forbids cross-slice deep imports.
5. `metro.config.js` — Build-time `.prod.ts(x)` physical stub replacement when `APP_VARIANT=production`.

### 2. What to Keep vs. What You Can Delete
| Scope | Paths | Rule |
|---|---|---|
| **Template Core（勿随意改契约）** | `src/core/*` | Business-agnostic foundation (runtime, network, auth, storage, theme, UI primitives, capabilities). |
| **正式业务切片** | `src/features/{auth,home,discover,messages,profile,payment,content,search,feedback,settings,shell,webview}` | Product Feature Slices; external callers import only from `@/features/<slice>`. |
| **可整包删除的 Starter / Mock** | `src/features/capabilities-lab`, `src/features/content`, `src/features/payment`, `src/shared/mock/*` | Reference slices & local mock transport; stripped automatically by `pnpm init:app --clean-starter`. |

### 3. Build-Time Production Stubs (`metro.config.js`)
When `APP_VARIANT=production`, Metro physically redirects these modules to zero-payload stubs:
- `src/core/devtools/DevToolsOverlay.tsx` → `DevToolsOverlay.prod.tsx`
- `src/core/devtools/devtools-store.ts` → `devtools-store.prod.ts`
- `src/shared/mock/mock-http-transport.ts` → `mock-http-transport.prod.ts`

### 4. State Ownership Rules
- **AppRuntime DI Stores** (`src/core/runtime`): Cross-screen app state that must be isolated per test runtime (`auth`, `privacyGate`, `preferences`, `connectivity`, `toast`, `drawer`, `permissionPrompt`, `devTools`).
- **TanStack Query**: All remote/paginated data (all channels go through `httpClient`).
- **Module Singletons**: Pure UI coordination / telemetry registries (`pageActionsRegistry`, `appPerformanceMarks`).

## Language

**Template Core（底座内核）**:
The business-agnostic mobile foundation (runtime shell, networking, auth session lifecycle, storage, observability, and design primitives) maintained by this template and shared across derived products.
_Avoid_: Base SDK, boilerplate, framework, common library

**App Instance（派生应用）**:
An independent mobile product repository initialized from this template with its own app identity, backend configuration, business features, and release lifecycle.
_Avoid_: Sub-project, child app, tenant, micro-app

**Feature Slice（业务切片）**:
A self-contained vertical business capability owned exclusively by an App Instance, isolated from the Template Core so upstream foundation updates do not collide with product logic.
_Avoid_: Business plugin, module package, sub-bundle

**Starter Slice（样板切片）**:
A reference vertical capability shipped with the template (such as authentication, shell navigation, or an example data flow) intended to be adapted or replaced once an App Instance begins product development.
_Avoid_: Demo app, mock feature, sandbox

**Backend Adapter（后端适配器）**:
The pluggable boundary contract that translates a specific App Instance's backend response envelope, error codes, and token refresh protocol into the standard session and request semantics expected by the Template Core.
_Avoid_: API wrapper, HTTP util, service proxy

**Route Shell（路由装配壳）**:
The thin declarative navigation entry layer that maps deep-linkable paths and session guards to screens inside Feature Slices, containing zero business state or UI implementation details itself.
_Avoid_: Page component, route controller, view container

**Privacy Gate（隐私合规门禁）**:
The bootstrap checkpoint prior to explicit user privacy consent during which any capability that reads device identifiers, hardware state, or personal telemetry is strictly blocked from initializing.
_Avoid_: Terms dialog, splash popup, permission prompt

**App Variant（构建变体）**:
An environment-specific flavor of an App Instance (`development`, `staging`, or `production`) with isolated app identifiers and branding badges so all environments can be installed side-by-side on one physical device.
_Avoid_: Build mode, debug flag, env profile

**Design Token（设计令牌）**:
A semantic visual role (such as surface background, primary action, or spacing step) that decouples UI layout from concrete brand palettes so each App Instance can re-theme light and dark modes from a single source.
_Avoid_: Hardcoded color, style constant, utility class

**App Identity（应用身份源）**:
The single authoritative declaration of an App Instance's display name, bundle/package identifiers, deep-link scheme, compliance switches, and active capabilities, kept outside the Template Core so rebranding a clone never causes upstream merge conflicts.
_Avoid_: Global constants, scattered config

**Shared Layer（应用共享层）**:
Product-specific UI components and domain helpers reused across multiple Feature Slices within one App Instance, kept separate from the Template Core so single-app reuse never pollutes the upstream foundation.
_Avoid_: Core utils, common folder

**Capability Module（原生能力模块）**:
A self-contained device hardware or native OS capability (such as camera scanning, biometrics, geolocation, or hybrid web container) paired with declarative permission gating so an App Instance can disable or delete unused capabilities without leaving residual app-store permission declarations.
_Avoid_: Native plugin, global helper

**Permission Rationale（权限用途告知）**:
The explicit business-purpose explanation shown to the user before triggering an OS sensitive-permission prompt, required to pass regulatory and app store privacy audits.
_Avoid_: Generic alert, permission toast


