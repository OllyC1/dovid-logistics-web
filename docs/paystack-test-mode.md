# Paystack test-mode configuration

The application uses Paystack hosted checkout. Payment initialization and verification happen only on the server. No Paystack public key is required by the browser, and no secret belongs in a `NEXT_PUBLIC_` variable.

## Required staging environment variables

- `PAYSTACK_SECRET_KEY`: the Test Mode secret key beginning with `sk_test_`.
- `PAYSTACK_WEBHOOK_SECRET`: the Test Mode webhook signing secret beginning with `whsec_`.
- `PAYSTACK_WEBHOOK_SECRET_PREVIOUS`: optional previous `whsec_` value during a controlled signing-secret rotation overlap.
- `NEXT_PUBLIC_APP_URL`: the exact HTTPS staging origin, without a trailing path.
- `ENABLE_LIVE_PAYMENTS=false`.
- `ENABLE_PUBLIC_BOOKINGS=false`.
- `ENABLE_ASSISTED_BOOKINGS=false`.

The application rejects `sk_live_` credentials while live payments are disabled. Keep test and live environment variables in separate deployment environments.

## Paystack dashboard settings

1. Switch the Paystack Dashboard to **Test Mode** before copying credentials or reviewing events.
2. Under **Developers → API configuration**, copy the Test Mode secret key into the server-only `PAYSTACK_SECRET_KEY` variable.
3. Generate a Test Mode webhook signing secret and store the complete `whsec_` value in `PAYSTACK_WEBHOOK_SECRET`.
4. Configure the webhook URL as `https://YOUR-STAGING-HOST/api/payments/webhook`. It must be public HTTPS, must not redirect, and must return a `2xx` response.
5. Subscribe the endpoint to `charge.success`, `charge.failed`, `refund.pending`, `refund.processing`, `refund.needs-attention`, `refund.failed`, `refund.processed`, `charge.dispute.create`, `charge.dispute.remind`, and `charge.dispute.resolve`. If using the legacy single dashboard webhook, confirm these events appear in Test Mode event history.
6. Ping the endpoint from the dashboard and confirm a successful signed `ping` delivery. Review delivery history and retry only after confirming application idempotency.
7. The application sends customers to `https://YOUR-STAGING-HOST/pay/callback`. Paystack appends the transaction reference; the page calls the server-side verification endpoint before showing a confirmed state.
8. Keep the account settlement currency and every Dovid payment intent on `NGN`. Amounts are sent and checked in integer kobo.
9. Configure Test Mode webhook failure alerts and an operational owner for refund and dispute events.

During Paystack's transition to timestamped signatures, the endpoint accepts the current `Paystack-Signature` header and the legacy `x-paystack-signature` header. Timestamped signatures have a five-minute replay window. Remove legacy reliance only after Test Mode deliveries consistently include `Paystack-Signature`.

Paystack currently documents webhook source addresses `52.31.139.75`, `52.49.173.169`, and `52.214.14.220`. If the hosting firewall supports source allowlists, apply them in addition to signature verification, not instead of it.

## Implemented payment controls

- Sender, receiver, and supplemental checkouts are initialized server-side.
- Receiver links are hashed in the database, expire, are consumed after settlement, and do not require a receiver account.
- Active main and supplemental payment intents are idempotent and expire locally after 30 minutes.
- Callback verification and signed webhooks check provider reference, exact amount, exact currency, provider mode, and provider status.
- Duplicate provider events, transactions, reconciliations, refunds, and disputes are stored idempotently.
- Refund and dispute states are recorded separately from immutable successful-payment evidence.
- Waiting, toll/access, redelivery, and other approved supplemental charges create separate intents.
- Delivery handover requires a paid main intent, every mandatory supplemental payment, no active dispute, no pending refund, and proof of delivery clearance.

## Google Maps deployment audit

The repository has separate browser and backend Maps variables, minimal field masks, per-instance application limits, request debouncing, and no-store provider responses. The browser key must be restricted to Maps JavaScript API and the exact staging HTTPS referrer. The backend key must be restricted to Places API (New) and Routes API plus fixed outbound IP addresses when the host provides stable egress.

Cloud Console restrictions, project quotas, budgets, and alerts cannot be proven from an API key value. Before staging sign-off, an owner must inspect Google Cloud Console, capture the allowed APIs and restrictions for both keys, set daily quotas and budget alerts, deploy a shared rate limiter, and rerun `npm run validate:maps` from the staging network. See `docs/google-maps-integration.md` for the complete checklist.

## Test-mode activation checklist

- Deploy to a stable HTTPS staging hostname.
- Add the Test Mode secrets only to server-side deployment storage.
- Apply migration `202611140009_paystack_test_mode_hardening.sql`.
- Ping the webhook and inspect its signed Test Mode delivery.
- Complete one provider-approved Test Mode sender checkout and one receiver checkout.
- Confirm callback verification and `charge.success` each settle only once.
- Exercise failed, abandoned, pending, duplicate, expired, refund, and dispute scenarios in Test Mode.
- Confirm a mandatory unpaid supplemental charge blocks rider completion.
- Keep live payments, public booking, assisted confirmation, zones, and fleet activation disabled.

## Provider references

- [Accept Payments](https://paystack.com/docs/payments/accept-payments/)
- [Verify Payments](https://paystack.com/docs/payments/verify-payments/)
- [Webhooks and signature verification](https://paystack.com/docs/payments/webhooks/)
- [Refunds](https://paystack.com/docs/payments/refunds/)
- [Manage disputes](https://paystack.com/docs/payments/manage-disputes/)
