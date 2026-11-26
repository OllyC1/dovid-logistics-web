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
- Migration `20261126044853_purpose_owned_email_content.sql` replayed as migration 43 on a clean local database, passed the purpose and enquiry queue contracts, was the only pending hosted migration in the dry run, and was applied without seeds, roles, reset or data deletion. Commit `4612901b5bee6fe71d26bc8c10fba6a5983d47ad` then deployed successfully with a clean Netlify secret scan. A controlled live contact submission produced separate customer/staff enquiry purposes with no application CTA; Resend accepted and delivered both once through the scheduled worker.
- Migrations `20261126051214_gate_sender_dispatch_on_verified_payment.sql` and `20261126082915_refine_sender_dispatch_clearance_transition.sql` now enforce payment before sender-paid work can consume rider or vehicle capacity. Automatic, manual, direct and multi-parcel run assignment paths are covered; failed attempts leave no partial assignment, stop or custody records. Receiver-pay dispatch remains available, verified and complimentary settlement assign exactly once, and later refund/dispute states do not freeze safe cancellation. Both migrations replayed cleanly, all database suites passed, the hosted dry runs contained only the intended migration, and the remote project reports three enabled guards, no browser execution privilege and zero unsafe sender dispatches. Commit `08d1ccf` was pushed with Netlify intentionally skipped because this was a database-only release.
- Migration `20261126110000_route_payment_receipts_to_payer.sql` separates the payer's payment receipt from the order's delivery-update contact. It replayed in the clean local stack, passed every database validator, was the only remote dry-run item and was applied without seeds, roles, reset or data deletion. Commit `0a42373bd87d2445fa11b760f542d7f953747f96` deployed through GitHub-to-Netlify with a clean 449-file secret scan; `/`, `/book` and `/login` returned HTTPS 200 with the expected security headers.
- Real Paystack TEST hosted checkouts passed on the final domain for guest sender payment, a separately approved mandatory waiting charge and receiver-pay without an account. Every amount and NGN currency matched its bound intent; authentic signed webhook settlement produced one provider event, one transaction, one verification audit and one purpose-specific receipt. Signed replays returned HTTP 200 as duplicates without increasing those counts. Sender handover clearance remained false while the mandatory charge was outstanding and changed to true only after its verified settlement; receiver handover clearance likewise changed to true only after verified receiver payment.
- The scheduled application-email worker processed the new sender supplemental and receiver payment receipts on the first attempt. Resend reported both as delivered, and each notification recipient matched the email bound to its payment intent. No address is hardcoded: order-progress notifications continue to use the booking contact while payment receipts use the payer-entered address.
- Commit `cd44b014d9c1dd769f589d6524fa82459d8f2f26` fixed Paystack refund intent lookup to use the original transaction reference, made authenticated duplicate delivery reconcile idempotently, and added mobile-first WhatsApp/copy/open actions for receiver payment links. Netlify published the exact commit after a clean 454-file secret scan. The full application suite passed 369/369 applicable tests, the production build passed, and the 375px/390px payment suite passed 14/14 applicable journeys.
- A real full Paystack TEST refund then progressed through signed `refund.pending`, `refund.processing` and `refund.processed` events. The order ended `refunded`, rider handover clearance stayed false, and the immutable event history produced exactly one reconciled refund record. Migration `20261126123000_preserve_refund_state_order.sql` subsequently prevented a replayed older `refund.pending` event from downgrading the processed financial state; it replayed cleanly, passed migration/RLS and SECURITY DEFINER validation, was the only remote dry-run item and was applied without seeds, roles, reset or data deletion.
- A real Android browser pass used the official Pixel 2 profile at 1080x1920, two CPU cores and the emulator-enforced 2.5 GB RAM. Android 16 with Chrome 133 rendered the final HTTPS site correctly and passed the homepage, non-clashing menu, one-tap login navigation, password visibility, guest booking and live Google Places suggestion checks. An Android 11 image with Chrome 83 correctly exposed the documented Next.js 16 browser boundary (Chrome 111+): HTML loaded but the unsupported browser ignored the modern stylesheet. The release therefore includes a framework-independent, touch-friendly browser-update and support notice for browsers missing the required CSS capabilities. TypeScript, ESLint, 372/372 applicable tests and the 60-page production build pass with that notice.
- The dispatch workspace now calculates readiness from genuine plates, verified physical capacity, safety clearance, active named riders, motorcycle and rider parcel limits, active workload and configured scheduling buffers. Its mobile-first status panel explains why automatic capacity is unavailable and links directly to the corrective fleet, team and operating-rule workflows. The controlled authenticated fleet journey passed at 375px and 390px: it moved from blocked to available only after every safety input was recorded, then removed all temporary users and motorcycles. The full local suite passed 376/376 applicable tests, TypeScript, ESLint and the 60-page production build.
- After migration `20261126144013`, the exact current repository was rebuilt with isolated local Supabase client settings and the complete authenticated mobile matrix passed 18/18 at 375px and 390px. It covered Customer-only navigation, every authorized Admin page, audited zone review/activation, genuine-plate fleet onboarding, rider assignment, run preparation, staff invitation and identity approval, Super Admin MFA, promotions, immutable rate-card drafts, paid pickup/handover proof, missed delivery and authorized return-to-sender. Rider fixtures now follow the production payment sequence: immutable paid intent and transaction evidence is recorded, the order becomes paid, and only then may assignment consume capacity. All temporary operational records were removed; two local-only Super Admin identities were retained in a banned state because immutable staff-audit references deliberately prevent their deletion.

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
| Quality certification | Lighthouse, accessibility, keyboard and constrained Android emulator evidence captured on the final domain; one physical low-end Android field pass and slow-network operational observation remain |

## Current recorded operating state — 26 November 2026

The following is a read-only snapshot of the hosted Supabase records. It is evidence of what the software currently records, not a substitute for founder field verification or physical inspection.

- Coverage: Zones A–F and the Ibadan fallback zone are recorded as active and approved. Zone F remains manual-approval only. Boundary-source records exist, but road-by-road and address-edge field confirmation remains outstanding.
- Commercial pricing: one active, non-provisional rate card is recorded. Every quote still passes the profitability controls; final founder approval of the operating assumptions remains outstanding.
- Fleet: `IB-BIKE-01` and `IB-BIKE-02` contain founder-created test plate text (`NJ98762` and `NBTR12G`). Both are currently marked available, safety-cleared and assigned to active named riders, with zero active assignments, but neither has recorded make/model/year or independently reviewed registration evidence. The deployed release still mistakes non-placeholder text for a genuine plate, so these records must not be treated as real launch capacity.
- People and capacity: the configured rider limit is ten active parcels, but that limit cannot create trustworthy capacity without an evidence-verified physical motorcycle registration, recorded make/model/year, measured capacity, safety clearance and an active named rider.
- Scheduling: the handover buffer, safe-completion buffer, maximum continuous riding time and minimum break duration are not configured. Do not infer or silently insert operational values.
- Payment protection: no active sender-paid assignment exists without a recorded paid transaction. Live Paystack remains disabled.
- Controlled access: public booking remains visible for founder testing; assisted-booking confirmation remains disabled.

Migration `20261126144013_audit_operational_settings_updates.sql` was applied after explicit founder authorization and the hosted ledger now matches the repository through that version. It makes operating-rule changes atomic, reason-required and auditable with explicit before/after evidence. Remote validation proved that browser roles cannot execute the function, `service_role` can execute it, short reasons are rejected and a successful update creates before/after audit evidence in the same transaction. The validation transaction was rolled back and left no settings or audit-row change. Commit `5aba9a527a5a3089bc639a87e9ef980e29acbc34` then deployed through GitHub-to-Netlify as deployment `6b084f4b31706a9a4b4a6414`; the 465-file secret scan was clean and 48/48 final-domain mobile checks passed at 375px and 390px.

A two-hour post-release observability review found no Netlify or Supabase service 5xx response. It did reveal two avoidable Postgres permission errors when anonymous delivery-order reads evaluated legacy staff policies that still targeted PostgreSQL `PUBLIC`. Migration `20261126155214_scope_staff_policies_to_authenticated.sql` changes only those 20 policy role targets to `authenticated`; all permission predicates remain unchanged. The complete 49-migration clean replay, 15/15 database/security suites, 378/378 applicable application tests, TypeScript, ESLint and the 60-page build passed before production application. The founder explicitly authorized this migration together with `20261126163300` on 26 November 2026.

The subsequent end-to-end capacity audit found that public quotes, assisted quotes and delivery-run assignment did not share every readiness invariant. The application now uses one verified-capacity calculation for public and assisted quotes; both paths apply route-duration, cutoff, handover, safe-completion and rider-rest scheduling; and mobile Dispatch/Run controls disable a motorcycle before submission when its measured capacity is unverified. Migration `20261126163300_harden_delivery_run_capacity.sql` adds private, non-callable assignment guards that serialize on the motorcycle, enforce both motorcycle and configured rider parcel limits, require reviewed rest rules and reject a multi-parcel route above the maximum continuous riding limit. It also prevents a service-role caller from creating a run for a busy, placeholder, unsafe or unverified motorcycle. The mobile Coverage page now explains all four required safety times, identifies each missing value and keeps every control at a touch-safe size; the Super Admin and Dispatch readiness summaries cannot report automatic capacity unless route buffers and rider-rest rules are all configured.

Migrations `20261126155214` and `20261126163300` were applied to production in the verified order after an exact two-file dry-run and explicit founder approval. The final production dry-run at that release point reported the database up to date with no pending migrations, seeds or role changes. Remote validation found 0 trusted-helper policies on PostgreSQL `PUBLIC`, all 20 intended policies on `authenticated`, both new trigger guards enabled, empty search paths and no application-role execution on their private functions, 0 exposed tables without RLS, 0 public SECURITY DEFINER functions without a fixed search path and 0 application privileges on the five intentional deny-all tables. Anonymous order, quote and package reads completed as empty results without helper-permission errors. Supabase health advisors are clear; the remaining security notices are the five intentional deny-all tables, two intentional authenticated RPCs and the documented Free-plan leaked-password setting. The application then passed TypeScript, full ESLint, 388/388 applicable tests and the 60-page production build. The affected authenticated rider/admin group passed 8/8 at 375px and 390px, including verified fleet setup, waiting, paid handover, missed delivery and authorized return.

Commit `cc00ba93bc0abc0af009a6a95079e533c835d804` was published by the GitHub-to-Netlify pipeline as deployment `6b0871a5df45bc67365c545e`. Netlify scanned 470 files with no secret match and deployed the Next.js server, scheduled email worker and edge functions successfully. The final-domain public mobile audit passed 40/40 checks at 375px and 390px. Deployment-window observability recorded 0 HTTP 5xx responses; the two 404 responses were the deliberate unknown-route recovery checks and the single 499 was a client-aborted request.

The subsequent fleet reconciliation exposed a safety gap: plausible test plate text could satisfy the deployed placeholder heuristic without any physical-registration evidence. Migration `20261126180626_verify_fleet_registrations.sql` separates entered plate text from authorized evidence review, requires make/model/year, makes fleet updates and their audit event atomic, and blocks assignment/run creation unless the same verified evidence exists at the database boundary. Its data change is fail-closed only: no fleet, order, payment or audit record is deleted. The migration replayed as migration 50 on a clean local database, all 16/16 database suites passed, and all privileged functions have fixed search paths with no browser execution privilege. TypeScript, full ESLint, 390/390 applicable tests and the 60-page production build passed. The complete Customer, Admin, Super Admin and Rider mobile matrix passed 18/18 at 375px and 390px; its affected Admin subset covered the workspace, audited zone lifecycle and registration-evidence bike workflow. The full public/guest mobile group then passed 86 applicable checks at the same widths, with 14 provider/deployed-only checks correctly skipped and no failure.

The founder explicitly authorized migration `20261126180626` on 26 November 2026. The final production dry-run contained exactly that migration with no seeds or role changes, and it was applied before its dependent application release. Both idle test-plate bikes remained recorded but moved offline; each still has zero active assignments and zero active runs. Remote validation found the evidence constraint and all three readiness guards active, no browser execution on the private guards or atomic fleet-update RPC, service-role access only on the RPC, fixed search paths and zero public SECURITY DEFINER functions without a fixed search path. The subsequent dry-run reports the remote database fully synchronized with no pending migration, seed or role change.

Commit `8141b253b93852efc7d226e03775360e4cba710b` was then published through the GitHub-to-Netlify production pipeline as deploy `6b088215ad53fc9464720c89`. Netlify scanned 472 files with no secret match and deployed the Next.js handler, scheduled email worker and edge functions successfully. The final-domain authentication, booking/payment UI and public-page audit passed 56/56 checks at 375px and 390px. A real controlled Bodija-to-Dugbe quote used Google routing and returned 7,627 metres and 814 seconds, then failed closed with HTTP 409 `capacity_unavailable` because both test bikes are offline. It created no quote, order or payment; the single rejected availability-test record was removed by its exact ID and marker. Deployment-window observability recorded zero HTTP 5xx responses; the two 404 responses were deliberate unknown-route recovery checks, the single 409 was the controlled capacity check, and the 499 responses were client-aborted browser-test requests.

The Admin operating-rule acceptance was subsequently strengthened from display-only coverage to a complete mobile save cycle. At both 375px and 390px an administrator entered all four required safety times using focus-and-keyboard interaction, supplied the mandatory reason, received HTTP 200, observed the configured state, verified the stored values and immutable audit event, then restored the original isolated local values through the same authorized atomic RPC. Both runs passed and no hosted operating setting changed.

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
- the hosted sender-pay, mandatory supplemental-charge, receiver-pay and full-refund TEST journeys are complete on the final domain; a genuine provider-generated dispute still requires Paystack dashboard/support simulation because the public API cannot create a dispute;
- field validation and final founder confirmation of the attributed active service polygons;
- real fleet registrations, measurements, safety checks and rider verification; the current remote placeholder motorcycles remain offline/unassigned and intentionally provide no dispatch capacity;
- approved commercial operating configuration;
- encrypted off-device owner-held storage for the verified logical export, recorded retention/RPO/RTO ownership, and either the runbook-required non-production-project restore or an explicit approval to use the completed isolated full-stack drill as the Free-plan recovery environment;
- final-domain Paystack acceptance; real final-domain Resend application-email delivery, Google Maps JavaScript, Places and representative Routes passed on 25 November 2026;
- a final physical low-end Android handset field pass and slow-network operational observation; the final-domain automated accessibility/Lighthouse audit and constrained Android Chrome 133 browser pass are complete.
