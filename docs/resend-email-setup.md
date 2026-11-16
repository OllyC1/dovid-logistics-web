# Resend email setup

The application code supports Resend API delivery, signed Resend webhooks and a durable Supabase-backed queue. Supabase Auth must continue to generate all confirmation, recovery and invitation tokens.

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

Keep email confirmation enabled. Set the hosted Site URL to `https://dovid-logistics-prelaunch.netlify.app` and allow `https://dovid-logistics-prelaunch.netlify.app/auth/callback`. Copy the HTML files in `supabase/templates/` into the matching hosted Auth templates; `supabase/config.toml` applies to local development only.

## Netlify variables

Configure these as secret, server-only variables except the sender strings:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL=Dovid Logistics <notifications@dovidlogistics.com>`
- `RESEND_WEBHOOK_SECRET`
- `EMAIL_WORKER_SECRET`
- `RESEND_REPLY_TO_EMAIL` only after confirming that `hello@dovidlogistics.com` receives mail

Register `https://dovid-logistics-prelaunch.netlify.app/api/webhooks/resend` for `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, and `email.failed` events. Store its `whsec_...` signing secret only in Netlify.

## Capacity

Resend Free currently provides 100 emails per day and 3,000 per month. The database records API sends and all webhook events, including Supabase SMTP messages when the webhook covers the same Resend account. Operational alerts should be raised at 70%, 85% and 95%; the application does not impose a hard send limit. Authentication and payment-critical messages have higher queue priority than routine delivery updates.
