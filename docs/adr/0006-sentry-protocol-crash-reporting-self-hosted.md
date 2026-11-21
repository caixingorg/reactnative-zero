# Report Crashes Through a Sentry-Protocol Adapter Against a Self-Hosted Backend, Off by Default

Status: Proposed

We will add a crash-reporting adapter that speaks the Sentry protocol and points at a backend hosted inside mainland China (self-hosted Sentry, or GlitchTip if it proves sufficient), so crash data does not leave the country and no change to the privacy policy for cross-border transfer is needed. The SDK is installed but inert: it is initialised only from the phase-two deferred initializer after the user consents to the privacy policy (ADR-0004), its default state is off, and revoking consent closes it through the existing revoke path. The adapter plugs into the existing `ErrorReporter` contract, so the observability core stays vendor-free.

## Considered options

- **Sentry protocol, self-hosted in China (chosen).** First-class JS, Hermes and native stack support, with source map upload. Cost: operating the server, and Sentry itself is heavy, so GlitchTip must be evaluated before committing.
- **sentry.io SaaS.** No operations, but data crosses the border and the privacy policy and consent copy would need to change.
- **Bugly, Umeng.** Common in China, but native-first. Most React Native crashes are in JS, so stack restoration is weak unless errors are bridged manually. Kept as documented alternative recipes, not as the default.

## Consequences

- Source maps must be the composed Hermes map, not the plain Metro one. The upload step belongs in the fastlane build lanes, reads credentials from environment variables, and skips with a warning when they are missing. A dry run must print the files it would upload without sending them.
- `config/with-capability-manifest-sanitizer.ts` strips auto-init providers such as `SentryInitProvider`. That is compliance behaviour and stays. Before adding any allowlist, verify that the React Native SDK initialised from JS does not depend on a stripped provider.
- If the Sentry Gradle plugin is used for upload during the native build, check how it interacts with the sanitizer at `plugins[0]`.
- Nothing may initialise the SDK at module top level. The existing privacy-gate seam tests gain a case: without consent the SDK is never initialised, and with consent a thrown test error reaches the adapter.

## Open questions

- Is GlitchTip sufficient (JS and native symbolication, retention, alerting), or is a full Sentry deployment needed?
- Who operates the server and where is it hosted? This decides the data-retention and access policy the privacy documents must state.

This record becomes Accepted only after the user confirms the backend choice.
