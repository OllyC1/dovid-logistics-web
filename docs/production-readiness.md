# Production readiness and recovery

Public booking, assisted booking and live payments must remain disabled until every blocking gate in this runbook is complete and its evidence is retained. Test-mode provider journeys and controlled operational data do not authorize a live launch.

## Non-negotiable release gates

| Gate | Completion evidence |
| --- | --- |
| Supabase password security | Strong password policy and recent-authentication controls verified; leaked-password protection is deferred under the founder-approved Free-plan decision and is not a launch blocker |
| Recoverability | Supabase recoverable backup or PITR enabled, recorded retention, named incident owner, and a successful restore drill into a separate project |
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

When the founder authorizes `dovidlogistics.com`:

1. Connect the domain in Netlify and create the exact DNS records shown there.
2. Confirm Netlify issues certificates and HTTPS redirects without loops.
3. Verify the Supabase Site URL and redirect allowlist use `https://dovidlogistics.com`, retaining only required development URLs and the prelaunch hostname during transition.
4. Change the Paystack TEST webhook and callback URLs, ping the webhook, and repeat the full TEST journey before considering live mode.
5. Restrict Google browser referrers to the final origin and verify both Places and Maps JavaScript from that origin.
6. Update application base URL and Resend links, then repeat verification and recovery email delivery.
7. Re-run hosted mobile acceptance, sitemap/canonical checks, Maps validation, payment webhook checks and Lighthouse/Core Web Vitals checks on the final domain.
8. Remove obsolete provider URLs only after the cutover is verified.

## Controlled activation

1. Keep all launch flags disabled.
2. Complete all non-negotiable gates and retain their evidence.
3. Activate approved Zones A-E, keep Zone F on manual approval, and use only verified, available motorcycles.
4. Complete a controlled hosted TEST journey for every role and payment path.
5. Enable public bookings for the single approved zone.
6. Monitor capacity, route failures, webhook delivery, email delivery, payment settlement and support escalations.
7. Add zones only after founder approval and repeated checks.
8. Enable live Paystack only after separate explicit authorization, credential review, refund/dispute ownership and financial reconciliation sign-off.

## Current external blockers

The remaining actions require provider-plan changes, real-world approval, controlled credentials or identity verification and therefore cannot be fabricated in source control:

- leaked-password protection, intentionally deferred while Dovid Logistics remains on the Supabase Free plan;
- disposable or authorized hosted role accounts for authenticated acceptance;
- fresh authorized Paystack TEST payment tokens/orders;
- real service polygons and founder approval;
- real fleet measurements, safety checks and rider verification;
- approved commercial operating configuration;
- a tested owner-held Free-plan database export and completed restore drill (PITR is deferred by founder approval);
- authorization and DNS/provider cutover for the final domain;
- final-domain accessibility, Core Web Vitals and low-end-device certification.
