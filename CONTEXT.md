# Enterprise React Native App Foundation

A clonable mobile application foundation designed to initialize independent iOS and Android business products while preserving a clean boundary for upstream foundation updates.

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


