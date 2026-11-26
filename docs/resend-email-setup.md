# Resend email setup

The application code supports Resend API delivery, signed Resend webhooks and a durable Supabase-backed queue. Supabase Auth must continue to generate all confirmation, recovery and invitation tokens.

## Purpose-specific email contract

Application emails are not allowed to share a misleading generic call to action. The renderer has an explicit presentation for each currently supported event family:

| Purpose | Event types | Customer or staff action |
| --- | --- | --- |
| Booking | `booking_confirmed`, `dispatch_request_approved`, `dispatch_request_rejected` | View or continue the relevant booking only |
| Dispatch staff | `dispatch.approval_requested`, `dispatch.approval_queue` | Open Dispatch Control with a verified staff account |
| Delivery | `package_collected`, `package_delivered`, `delivery_failed`, `redelivery_scheduled` | Track, view receipt or review the relevant next step |
| Payment | `payment_confirmed`, `additional_fee_request` | View payment details or review the approved charge |
| Enquiries | `website_enquiry_received`, `website_enquiry_acknowledged` | Staff may open the enquiry workspace; the customer acknowledgement has no sign-in or payment button |
| Controlled validation | `production_readiness_test` | No customer action |

Unknown events fail closed as permanent template errors and are never submitted to Resend. Every new application email event must be added to this catalogue with its audience, badge, action wording and safety note before release. The queue does not invent a subject or default `/account` link.

Supabase Auth emails are intentionally separate from the application queue. Confirmation, recovery, staff invitation, magic-link, email-change and reauthentication templates each have their own purpose-specific heading, explanation, single-use action and security copy in `supabase/templates/`. Password, email and phone changes, identity linking/unlinking, and MFA enrollment/unenrollment use seven additional branded security-notification templates.

## Verified pre-launch state

- The Resend sending domain `dovidlogistics.com` is verified.
- Supabase Auth uses the configured Resend SMTP provider.
- The hosted Site URL and Auth redirects must use `https://dovidlogistics.com`; retain the prelaunch hostname only during transition.
- `RESEND_FROM_EMAIL` is configured for the Netlify production context.
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `EMAIL_WORKER_SECRET` are configured as secret Netlify production variables.
- The scheduled application queue and signed webhook were verified with real Resend test delivery on 16 November 2026.
- On 25 November 2026, a real application email sent through the production queue to the founder-authorized mailbox `macochoajarvis36@gmail.com` was accepted by Resend and confirmed by the recipient as delivered. The delivery record completed on the first attempt, the signed webhook updated its status, and a duplicate event did not create a second email.
- On 26 November 2026, the full Auth template set was rendered against isolated Supabase and Mailpit. The hosted Auth configuration was then updated without changing SMTP credentials, and a real purpose-specific reauthentication email to a disposable alias of the authorized test mailbox received a signed `email.delivered` Resend event. The temporary Auth identity was deleted and the database confirmed no test alias remained.
- Unauthenticated calls to both the queue worker and the Resend webhook continue to be rejected. This is live-provider evidence, not a mocked or simulated test.

## Provider setup

1. In Resend, add `dovidlogistics.com` as a sending domain.
2. Copy the exact DNS records shown by Resend into the current DNS provider. Preserve existing MX records. Merge an existing SPF policy instead of creating a second SPF TXT record.
3. Confirm DKIM and SPF in Resend. Add or review DMARC separately; do not claim verification until Resend reports the sending domain as verified.
4. Disable link tracking for authentication messages so Supabase verification links are not rewritten.

The exact DNS values are account-specific and must be copied from the Resend domain page. They are intentionally not invented or committed here.

## Supabase Auth SMTP

Prefer the Resend integration in the Supabase Integrations catalog. Otherwise configure Authentication → SMTP with:

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: a Resend SMTP-compatible API key
- Sender email: `notifications@dovidlogistics.com`
- Sender name: `Dovid Logistics`

Keep email confirmation enabled. Set the hosted Site URL to `https://dovidlogistics.com` and allow `https://dovidlogistics.com/**`, `https://www.dovidlogistics.com/**`, and the required development redirects. The versioned `supabase/config.toml` is managed with `supabase config push`.

## Netlify variables

Configure these as secret, server-only variables except the sender strings:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL=Dovid Logistics <notifications@dovidlogistics.com>`
- `RESEND_WEBHOOK_SECRET`
- `EMAIL_WORKER_SECRET`
- `RESEND_REPLY_TO_EMAIL` only after confirming that `hello@dovidlogistics.com` receives mail

The API key cannot be recovered from Supabase SMTP after it has been saved. Create or select a server-side Resend API key in the Resend dashboard and add it directly to Netlify; never copy it into source control, support messages or terminal output. Generate `EMAIL_WORKER_SECRET` independently and store it only in Netlify. Copy the endpoint-specific signing secret from the Resend webhook details page into `RESEND_WEBHOOK_SECRET`.

Register `https://dovidlogistics.com/api/webhooks/resend` for `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, and `email.failed` events. Store its `whsec_...` signing secret only in Netlify.

## Capacity

Resend Free currently provides 100 emails per day and 3,000 per month. The database records API sends and all webhook events, including Supabase SMTP messages when the webhook covers the same Resend account. Operational alerts should be raised at 70%, 85% and 95%; the application does not impose a hard send limit. Authentication and payment-critical messages have higher queue priority than routine delivery updates.
