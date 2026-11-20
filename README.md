# Dovid Logistics Web

Production-oriented delivery, pricing and operations platform for Dovid Logistics in Ibadan. It combines public marketing, customer booking, authenticated order management, server-side road routing, cashless payment, profitability-aware quoting, administrator controls and a rider workspace.

## Stack

- Next.js App Router, React, strict TypeScript and Tailwind CSS
- Supabase PostgreSQL, Auth and Row Level Security
- Google Places API (New) for address suggestions and Google Routes API for two-wheel road distance
- Paystack hosted checkout and signed, idempotent webhooks
- Zod validation, Vitest unit/integration tests and Playwright smoke tests

## Local setup

1. Install Node.js 24 or a supported LTS release.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and provide the required secrets. Enable Places API (New) and Routes API for `GOOGLE_MAPS_API_KEY`; address suggestions and route pricing remain unavailable until the key is configured.
4. Use a separate referrer-restricted `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for the administrator map. See `docs/google-maps-integration.md` for API restrictions, hosting limitations and live validation.
4. Apply every versioned file in `supabase/migrations/` in filename order. Never skip an applied migration or edit production migration history.
5. Configure at least one active `service_areas` record and polygon-backed `service_zones` record.
6. Run `npm run dev` and open `http://localhost:3000`.

The application returns safe unavailable states when an external service is missing. It does not invent routes, prices, bank details, competitor evidence or payment confirmation.

## Pricing architecture

All money is stored and calculated as integer kobo. Rates and margins use basis points. The pure pricing engine lives in `src/features/pricing/engine.ts` and performs:

- exact distance-band selection with an open-ended per-kilometre band;
- fuel, maintenance, depreciation, labour, bonus reserve and overhead allocation;
- service-level, waiting, stop, weather, return and handling adjustments;
- payment-fee and tax treatment without floating-point currency arithmetic;
- verified competitor-median targeting only when freshness, sample and comparability rules pass;
- a hard minimum-profitable-price floor;
- promotion caps and stackability enforcement;
- 10-minute quote expiry and immutable configuration-version attribution.

The migration seeds the supplied Ibadan launch bands as **provisional planning rates**, not market-verified facts. Zero-cost defaults carry explicit justifications. Operators must replace assumptions with approved, measured values before production rollout.

Customer responses expose only the final total, expiry and customer-safe included charges. Internal costs, floor price, margin, competitor target and pricing flags are written to admin-only records.

## Quote and order flow

1. `POST /api/delivery/quotes` validates the request, service zones and road route.
2. The server loads the active version, rate card, eligible competitor evidence and promotion.
3. The quote engine computes and stores the customer quote plus a confidential cost estimate.
4. `POST /api/delivery/quotes/:id/confirm` atomically confirms an owned, unexpired quote.
5. `POST /api/orders` invokes the database order function with the confirmed quote and idempotency key.
6. The order stores an immutable customer-safe pricing snapshot and configuration version.

Order creation never trusts a browser-supplied amount. Historic orders do not change when configuration or rate cards change.

## Administrator workspace

Assign `profiles.role = 'admin'` through a trusted database operation, then visit `/admin`.

- **Rate cards:** create immutable inactive versions, preview band output and explicitly activate an approved card.
- **Cost configuration:** create a draft assumptions version; activation retires the prior version.
- **Competitor evidence:** record sources and route-specific quotes with URLs, verification state and comparability.
- **Profitability:** review actuals separately from clearly labelled forecasts and simulate break-even volume.
- **Promotions:** inspect discount rules while the quote engine protects the margin floor.
- **History:** audit effective versions and reasons for change.
- **Assisted bookings:** create WhatsApp or phone drafts and secure customer review links without impersonating customers.
- **Delivery runs:** plan multi-parcel rider runs, review expenses and resolve failed-delivery exceptions.

Sensitive write endpoints verify the authenticated admin role server-side. RLS remains the final authorization boundary.

## Rider workspace

Assign `profiles.role = 'rider'` and set `delivery_orders.rider_id` through an admin operation. `/rider` exposes only assigned deliveries, safe contact and route details, verified payment status, status history and the rider's own performance data. It never shows platform profitability or competitor information.

The compensation model uses a guaranteed base salary plus a capped, transparent monthly bonus. Safety and parcel handling remain explicit metrics; speed alone cannot override safety.

## Payments

The platform is cashless. Paystack callbacks are not proof of payment. Settlement occurs only after a valid signed webhook or controlled admin reconciliation matches reference, exact amount, currency and successful state. Duplicate events are idempotent and receipts remain evidence rather than automatic settlement authority.

Configure the webhook as `https://your-domain.example/api/payments/webhook`. Use Paystack test mode until the complete provider flow has been verified.

See `docs/paystack-test-mode.md` for the exact Test Mode credentials, timestamped webhook signature, callback, event subscription, refund, dispute and activation settings.

## Data and retention foundations

The additive operations migration includes versioned pricing, rate cards, competitor evidence, promotions, quote cost estimates, delivery expenses, payment reconciliation, rider compensation/performance, recurring pickup schedules, delivery feedback and referrals. RLS separates customer, rider and admin access.

## Tests

- `npm run test` runs pricing, payment, rider bonus and migration-contract tests.
- `npm run test:e2e` runs browser smoke tests.
- `npm run lint` checks source quality.
- `npm run build` performs the production Next.js build.

Pricing tests cover every supplied band boundary, the open-ended rate, invalid input, high fuel, low volume, stale/insufficient competitor evidence, margin floors, fee/tax combinations, promotion stacking, expiry and version attribution.

The operating model, launch controls and unresolved integrations are documented in `docs/operations-expansion.md`.
Production release gates, recovery requirements, incident handling and cutover order are documented in `docs/production-readiness.md`.

## Security notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY` or `GOOGLE_MAPS_API_KEY` to browser code.
- Require passwords of at least 12 characters with upper/lowercase letters, digits and symbols; require recent authentication and the current password for changes.
- Configure a private Storage bucket before enabling proof-of-delivery uploads.
- Keep payment and delivery transitions behind database functions and server routes.
- Review provisional assumptions, tax treatment, payment fees and market evidence with finance and operations before launch.
