# Pluggable Payment Capability Architecture

Status: Proposed

We will implement payment support as a **headless, driver-based capability** under `src/core/capabilities/payment/` (with zero third-party payment SDKs bundled by default), separating **upstream payment providers** (first-party or secondary/aggregator gateways) from **client execution transports** (native vendor SDK, aggregator SDK, web/H5 checkout, mini-program jump, and store billing/IAP).

Both **one-time checkout** (`CheckoutDriver`) and **store in-app purchases / subscriptions** (`StoreBillingDriver`) are first-class contracts sharing unified error codes, concurrency locking, privacy-gate deferred initialization, server-side verification, and persistent recovery across app backgrounding or process death.

Channel visibility is determined by the **intersection** of backend-supplied eligible channels (by product type, region, platform, and secondary-gateway routing/circuit-breaking) and locally registered, available client drivers (`isAvailable()`).

## Considered options

- **Single all-in-one payment package bundling all native SDKs.** Rejected. Causes binary bloat, native dependency conflicts, and App Store rejection risks when third-party payment SDKs are present in apps selling digital goods.
- **Hard-binding to a single aggregator (e.g. Stripe / Ping++) or IAP SaaS (RevenueCat).** Rejected under ADR-0001 principles. Locks downstream apps and prevents reusing or open-sourcing the template across domestic and international markets.
- **One-time checkout only (deferring IAP).** Rejected by product decision: digital goods and subscriptions are first-class requirements and must be modeled cleanly alongside one-time payments rather than bolted on later.

## Consequences

- Default template builds remain free of closed-source payment binaries; downstream apps install or add only the native drivers (`modules/payment-*` or npm packages) they actually contract with.
- Client callbacks are never trusted as payment proof: both checkout and store billing flows enforce a server verification hook (`verifyOrder` / `verifyReceipt`) before resolving success or finishing IAP transactions.
- Pending checkout sessions are persisted in MMKV (with TTL expiry) so both `AppState` foreground resume and cold-start recovery after OS process death can reconcile order state automatically.
- UI stays strictly outside `core/capabilities/payment/`; reusable cashier UI and checkout flows live in `src/features/payment/` and can be stripped cleanly by `--clean-starter` if unused.
- Full technical specification lives in `.scratch/payment-capability/spec.md`.
