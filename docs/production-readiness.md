# Production readiness and recovery

The founder has authorized public booking to be visible for controlled pre-launch self-testing. That permission does not authorize real delivery obligations: verified coverage, profitable pricing, genuine fleet capacity and payment controls must still pass every request. Assisted-booking confirmation and live payments remain disabled until every blocking gate in this runbook is complete and its evidence is retained.

## Verified release evidence — 25 November 2026

- Migration `20261125221900_booking_continuation_capacity_waiting_enquiries.sql` replayed against a clean local database, passed the database contract suite, was the only pending remote migration, passed a remote dry-run, and was applied without seeds, reset or data deletion.
- The remote database linter reported no schema errors. All public/private SECURITY DEFINER functions have a fixed search path; the new continuation-token and operational RPCs are unavailable to browser roles.
- The remote pre-launch database contains three historical controlled orders and three Paystack transactions, all explicitly marked provider domain `test`; there were no orders or payment transactions in the preceding 24 hours.
- Guest booking without an account, optional booking email, manual route approval continuation, customer/staff role routing, Super Admin MFA, rider added-cost reporting, failed delivery/return, waiting-time handling, payment confirmation, public-page metadata and mobile overflow checks passed in the isolated acceptance environment at 375px and 390px.
- A real queued application email to the founder-authorized test mailbox was accepted by Resend and confirmed delivered exactly once; signed status processing and event deduplication passed.

This evidence does not make the service production-ready. The physical fleet, final coverage, owner-held encrypted backup, hosted TEST payment matrix and final-device certification below remain launch gates.

## Verified release evidence â€” 26 November 2026

- Commit `599fc27257a4e19df6fac2741795cf61351772c4` was published by the GitHub-to-Netlify pipeline. The deployed mobile HTTPS audit passed 48/48 checks at 375px and 390px.
- Mobile Lighthouse measured performance 93, accessibility 100, best practices 100 and SEO 100. Server response improved from 1.56 seconds to 0.15 seconds, Speed Index from 4.68 seconds to 1.90 seconds and cumulative layout shift remained zero.
- The isolated authenticated mobile matrix passed 18/18 Customer, Admin, Super Admin and Rider workflows. The public, guest-booking and payment UI group passed 56 applicable checks at the two priority widths.
- Application email events remain purpose-locked and fail closed when no reviewed template exists. Six Auth flows and seven Auth security notifications now have separate branded templates.
- Supabase accepted the reviewed Auth configuration while preserving the existing Resend SMTP settings. A real reauthentication email to an authorized disposable Gmail alias received a signed Resend `email.delivered` event, and the temporary test identity was removed.
- A read-only Supabase logical export was restored into an isolated full Supabase stack. All 41 migrations, 12/12 clean database suites and 11/11 recovered-data workflow/security suites passed; 72 tables, 99 policies, six Auth users, three controlled orders, three TEST payment records and both audit histories matched the remote source exactly. The drill also proved that repository migrations must precede data restoration because managed `auth` schema objects are excluded from schema dumps. See `docs/database-recovery-drill-2026-11-26.md`.

## Non-negotiable release gates

| Gate | Completion evidence |
| --- | --- |
| Supabase password security | Strong password policy and recent-authentication controls verified; leaked-password protection is deferred under the founder-approved Free-plan decision and is not a launch blocker |
| Recoverability | Technical logical-export and isolated full-stack restore drill passed; encrypted off-device owner-held storage, retention/RPO/RTO approval and the runbook-required non-production-project restore or explicit Free-plan exception remain |
| Hosted role acceptance | Current release tested at 375px and 390px with disposable Customer, Admin, Rider and Super Admin accounts; no provisioner left enabled |
| Paystack TEST | Current release tested for guest sender-pay, authenticated sender-pay, receiver-pay, waiting and redelivery charges, duplicate webhook replay, handover blocking and clearance, refunds and disputes |
| Service coverage | Founder-approved road-accurate polygons with boundary source, road/address checks, overlap review, motorcycle restrictions and an explicit activation approval for one initial zone |
| Fleet readiness | Real registration details, physical capacity measurements, safety checks, verified riders, assignments and successful two-bike conflict/capacity tests |
| Commercial approval | Approved active rate card, cost assumptions, profitability floor, service hours, distance thresholds, charges, promotions, rider capacity and escalation procedure |
| Domain/providers | Custom domain connected; Supabase, Paystack, Google and Resend URLs/restrictions updated and retested |
| Quality certification | Lighthouse/Core Web Vitals, screen-reader, keyboard, slow-network and low-end Android evidence captured on the final domain |

## Database backup and restore

No public booking or live payment may begin without a successful owner-held logical export and restore drill. Paid PITR is not required for this founder-approved Free-plan launch.

The founder approved remaining on Supabase Free. Leaked-password protection and PITR are therefore intentionally deferred rather than launch blockers. Use owner-held database exports and tested restore procedures until a paid recovery plan is approved.

The 26 November 2026 technical drill passed in an isolated full Supabase stack. It replayed all 41 migrations, restored Auth and application data, matched all recorded source invariants and passed the clean and recovered-data validation groups. The working export remains Git-ignored on the development machine; it is not yet the required encrypted off-device owner-held copy. Follow `docs/database-recovery-drill-2026-11-26.md` for the proved recovery order and outstanding owner actions.

1. Record the approved Free-plan recovery model: a restricted logical backup export, encrypted owner-held storage, verified migration history and a restore drill into a separate project. Add PITR only if a paid plan is later approved.
2. Record the exact backup/PITR retention period, responsible owner, escalation contact and approved recovery-point and recovery-time objectives in the launch approval record. Do not infer these values.
3. Before launch, perform a restore drill into a separate, non-production Supabase project. Use provider-native recovery where possible.
4. Verify restored schema migrations, RLS, functions, authentication configuration, orders, payment audit records, reconciliation records, delivery history, pricing history and immutable audit records.
5. Run the database contract checks and a read-only application smoke test against the restored project.
6. Delete the temporary recovery project after the approved verification and record the restore start time, completion time, achieved recovery point and discrepancies.
7. Repeat the drill at least quarterly and after a material backup, billing-plan or Supabase project change.

Never replace a production database with a restore before capturing the incident timeline, preserving the affected database for forensic review, and obtaining owner authorization.

## Incident response

The founder must name an operational owner and a technical owner before activation. The incident record must identify:

- operational owner: Dovid Logistics;
- technical owner: Dovid Logistics;
- escalation email: `hello@dovidlogistics.com`;
- escalation phone: `+2347072232323`.

- incident reporter and timestamp;
- affected services, orders and payments;
- whether bookings or payments are being disabled;
- evidence sources and preserved logs;
- provider support case numbers;
- customer notification decision and owner;
- recovery action, approver and verification result;
- payment reconciliation and financial-retention actions;
- post-incident follow-up owner and due date.

If payment state or delivery custody is uncertain, disable the relevant operation without deleting provider events, transactions, reconciliation records, payment intents, order history or audit data.

## Provider and domain cutover

`dovidlogistics.com` is connected to Netlify with HTTPS. Supabase Auth, application URLs, Google Maps browser restrictions and Resend delivery have been exercised on the final origin. Before live activation:

1. Keep only required Supabase redirect URLs; retain the prelaunch hostname only while controlled testing still needs it.
2. Keep Paystack in TEST mode, verify the final-domain webhook and callback URLs, and repeat the complete TEST payment matrix on this exact release.
3. Re-run Places, Routes and Maps JavaScript validation from the final origin after every key-restriction change.
4. Re-run hosted mobile acceptance, sitemap/canonical checks, payment webhooks and Lighthouse/Core Web Vitals on the final deployment.
5. Remove obsolete provider URLs only after the replacement path is verified.

## Controlled activation

1. Keep live Paystack and assisted-booking confirmation disabled.
2. Public booking may be visible for founder testing, but must reject unsupported coverage, insufficient genuine fleet capacity, unsafe packages and unprofitable pricing. It must not create a delivery obligation from a pending manual-approval request.
3. Complete all non-negotiable gates and retain their evidence.
4. Activate only founder-reviewed zones, keep Zone F on manual approval, and use only verified, available motorcycles with genuine registration and safety records.
5. Complete a controlled hosted TEST journey for every role and payment path.
6. Monitor capacity, route failures, webhook delivery, email delivery, payment settlement and support escalations.
7. Add zones only after founder approval and repeated checks.
8. Enable live Paystack only after separate explicit authorization, credential review, refund/dispute ownership and financial reconciliation sign-off.

## Current external blockers

The remaining actions require provider-plan changes, real-world approval, controlled credentials or identity verification and therefore cannot be fabricated in source control:

- leaked-password protection, intentionally deferred while Dovid Logistics remains on the Supabase Free plan;
- hosted authenticated acceptance of the final deployed commit with disposable or authorized role accounts; the release passes the isolated Customer, Admin, Super Admin and Rider matrix at 375px and 390px;
- fresh authorized Paystack TEST payment tokens/orders for the full sender, receiver, supplemental, refund and dispute matrix;
- field validation and final founder confirmation of the attributed active service polygons;
- real fleet registrations, measurements, safety checks and rider verification; the current remote placeholder motorcycles remain offline/unassigned and intentionally provide no dispatch capacity;
- approved commercial operating configuration;
- encrypted off-device owner-held storage for the verified logical export, recorded retention/RPO/RTO ownership, and either the runbook-required non-production-project restore or an explicit approval to use the completed isolated full-stack drill as the Free-plan recovery environment;
- final-domain Paystack acceptance; real final-domain Resend application-email delivery, Google Maps JavaScript, Places and representative Routes passed on 25 November 2026;
- final-domain accessibility, Core Web Vitals and low-end-device certification.
