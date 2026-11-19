# Operations expansion

Migrations `202611140006_operations_expansion.sql` through `202611140008_delivery_run_route_metrics.sql` add assisted bookings, delivery runs, route concurrency controls, provider timing, parcel custody, reviewed expenses, customer-authorized supplemental charges, delivery attempts, redelivery, return-to-sender and incident records. They are additive and do not activate service zones, bikes, public booking or live payments.

## Operating schedule

- Timezone: `Africa/Lagos`
- Published hours: `07:00–22:00` daily
- Normal same-day cutoff: `20:30`
- Handover, safe-completion, waiting-charge, fatigue and break values remain administrator-configurable. Values that were not supplied are deliberately left unconfigured rather than fabricated.
- Published hours never imply rider availability. Route duration, fleet capacity, package suitability, payment policy and profitability checks still apply.

## Assisted WhatsApp booking

1. An administrator creates a draft at `/admin/whatsapp-bookings` using address autocomplete.
2. The server checks approved coverage, provider road routing, fleet capacity and the existing pricing engine.
3. A short-lived high-entropy review token and separately hashed six-digit OTP are created.
4. Phase 1 only creates a manual `wa.me` link. It never sends an automated message.
5. The customer verifies the OTP. A separate short-lived browser-bound verification session is required before details are shown or accepted.
6. The customer enters the six-digit code, reviews the quote, chooses the payer and accepts the terms. No account or password is required.
7. A service-role-only database function creates the guest order atomically, binds it to the approved quote and issues a separate hashed guest-access token. Ordinary browser database roles cannot call that function.
8. The guest order preserves sender-pay, receiver-pay and mandatory supplemental-payment clearance without exposing staff credentials or weakening authenticated customer order ownership.
9. `ENABLE_ASSISTED_BOOKINGS=false` prevents real assisted orders until launch approval.

WhatsApp messages are not charge authorization. Administrators never sign in as customers, and private message contents are not stored in customer-readable tables.

## Delivery runs

One rider may have one active run containing multiple distinct orders. Each order retains its own payment, status, proof, tracking and custody records. Adding an order requires:

- a safely available assigned vehicle;
- a routing-provider result rather than straight-line routing;
- pickup-before-drop-off sequencing;
- parcel-count capacity;
- verified vehicle payload capacity and package weight for multi-parcel loads;
- administrator justification for deadline conflicts.

Vehicle payload values are intentionally blank until measured and approved. Bikes remain offline.

## Expenses and supplemental charges

`delivery_expense_reports` records actual operating costs. `customer_surcharges` records separately proposed customer charges. `payment_intents.surcharge_id` identifies supplemental payment intents without mutating a settled historical payment.

The workflow is:

`reported → under_review → approved / rejected / disputed`

Customer-billable amounts follow:

`proposed → customer_approved → payment_pending → paid`

No rider submission charges a customer. Paid supplemental intents settle only the surcharge and do not rewrite the original order payment.

## Failed delivery safety

Riders record an attempt and may leave an unsafe location immediately. Dispatch separately chooses retry, address correction, redelivery, authorized hold, return-to-sender, cancellation or incident escalation. Customer-attributable redelivery may produce a proposal, but never an automatic charge. Receiver payment refusal never permits parcel release or cash collection.

## Activation checklist

- Keep `ENABLE_PUBLIC_BOOKINGS=false`, `ENABLE_ASSISTED_BOOKINGS=false` and `ENABLE_LIVE_PAYMENTS=false`.
- Import and approve real service-zone polygons.
- Measure each motorcycle payload and cargo dimensions; record capacity verification.
- Assign approved rider profiles and complete vehicle safety checks.
- Configure handover, safe-completion, waiting, break and fatigue rules.
- Confirm applicable motorcycle operating restrictions and record compliance evidence.
- Configure Google Routes and test optimized stop sequencing on real roads.
- Configure an official WhatsApp Business provider only after credentials, templates, webhook verification, opt-in and messaging permissions are approved.
- Test Paystack supplemental payments and verified company-transfer reconciliation in non-live mode.
- Review all Supabase security advisors and run the clean database, unit, browser and production-build suites.
- Obtain operations, security and finance sign-off before enabling any launch flag.

## Unresolved integrations

- Official WhatsApp Business Platform credentials and approved templates are absent. The current reviewed workflow uses a manual `wa.me` handoff and does not claim to send automated WhatsApp messages.
- Motorcycle capacity measurements and local restriction confirmation are absent.
- Service-zone polygons remain draft and inactive.
- The two-bike fleet remains offline.
- Public booking, assisted-order confirmation and live Paystack remain disabled.

