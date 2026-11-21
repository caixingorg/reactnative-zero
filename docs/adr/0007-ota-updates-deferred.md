# Defer Over-the-Air Updates and Cover Rollback With Minimum-Version and Kill-Switch Controls

Status: Proposed

We will not implement over-the-air JS updates for now. The `OtaCoordinator` interface stays closed with no driver. Until a driver exists, production rollback means building a fixed version with a higher version code and withdrawing the faulty package from the distribution platform (see `docs/RELEASE.md`), backed by a client-side minimum-version check and remote kill-switches whose server contract the template defines and each app implements.

If OTA is revisited, the long-term direction compatible with ADR-0001 is `expo-updates` against a self-hosted updates-protocol server, with code signing and rollback to the embedded bundle. The costs are running that server and a CDN in China and managing `runtimeVersion` strictly.

## Considered options

- **CodePush-style services.** The hosted service behind the original CodePush has been retired, and relying on a community fork on a New-Architecture-only React Native release is a risk unless a fork is shown to work. Not chosen.
- **`expo-updates` with a self-hosted server.** Cleanest under ADR-0001. Deferred, not rejected.
- **Pushy (`react-native-update`).** Domestic CDN and diff patches, but a third-party dependency whose support for the current React Native release and New Architecture is unverified.

## Consequences

- Before any OTA ships, the hot-update policies of the target app stores and applicable regulators must be checked. This record does not assert what they allow.
- Version checks must send no identifiers, or run only after privacy consent.
- Issue 16 (minimum version and kill-switch) carries the fallback. Revisit this decision once the release pipeline and crash reporting have been stable for a while.
