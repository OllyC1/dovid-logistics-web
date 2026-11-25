# Google Maps test integration

## Credentials

Use two separate keys from the same Google Cloud project:

- `GOOGLE_MAPS_API_KEY` is server-only. Restrict it to Places API (New) and Routes API, then apply fixed egress IP restrictions when the hosting platform provides stable outbound addresses.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is intentionally browser-visible. Restrict it to Maps JavaScript API and exact HTTPS referrers for staging and production. Add `http://localhost:*/*` only to the development key.

Never place the backend key in a `NEXT_PUBLIC_` variable. Google requires all Autocomplete and Place Details calls in one session to use credentials from the same Cloud project.

Serverless hosts commonly use changing outbound IP addresses. An IP-restricted backend key will fail unless the deployment uses fixed egress, a NAT gateway or a controlled proxy. Do not replace an IP restriction with a browser referrer restriction for server-to-server requests; referrer restrictions do not protect a web-service key. See [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices).

## Enabled APIs

- Places API (New): backend key only.
- Routes API: backend key only.
- Maps JavaScript API: browser key only, used by the administrator polygon editor.

Address predictions are biased within 50 km of central Ibadan and restricted to Nigeria. A bias influences ranking but does not create an artificial service boundary. Booking eligibility continues to use reviewed active GeoJSON polygons.

## Cost and data controls

- Autocomplete starts after three characters and is debounced by 350 ms.
- Each input session uses one browser-generated token; the selected Place Details request completes that same session.
- Places responses request only prediction text, structured formatting, place ID, formatted address and coordinates.
- Routes responses request only distance, duration, leg timing and optimized waypoint indices needed by dispatch.
- Places and Routes requests use `no-store`. The application does not cache prediction lists or route responses.
- Server routes apply immediate per-instance request limits and return explicit provider-unavailable states. Netlify also applies shared edge limits of 40 address requests and 12 road-route quote requests per client per minute before the Next.js handler. Netlify documents that edge enforcement can take up to 10 seconds after a threshold is crossed, so both layers remain enabled.
- Structured usage logs contain operation, status and duration only. They omit keys, addresses, coordinates and response bodies.

The shared Netlify edge rules protect the deployed provider paths across serverless instances, while the in-process limits provide immediate defence in depth. Configure Google Cloud quotas, budgets and alerts for Places API (New), Routes API and Maps JavaScript API. Review [Places data and attribution requirements](https://developers.google.com/maps/documentation/places/web-service/policies).

## Routing safety

Routes use `TWO_WHEELER` with `TRAFFIC_AWARE` where Google supports it. Results are provider planning estimates, not guarantees of legal motorcycle access or exact motorcycle journey time. Dispatch compliance, reviewed restrictions, capacity, deadlines, payment clearance and profitability remain separate mandatory checks.

Provider failure never falls back to straight-line distance for a customer quote. Waypoint recommendations are re-evaluated after enforcing pickup-before-drop-off precedence.

## Validation

Run `npm run validate:maps` only in a controlled test environment. It reads `.env.local`, resolves representative Ibadan places and makes short, medium, long and optimized multi-stop requests. It prints route metrics but never prints credentials.

Live validation on 14 November 2026 successfully resolved Places sessions and returned these two-wheel route results:

- Initial Dugbe smoke route: 6,566 metres, 806 seconds.
- Short representative route: 11,523 metres, 1,233 seconds.
- Medium representative route: 12,358 metres, 1,300 seconds.
- Long representative route: 25,481 metres, 2,761 seconds.
- Optimized multi-stop route: 27,195 metres, 2,987 seconds, provider order `[0, 1]`.

The controlled validation was repeated on 19 November 2026 after the Google credential update. Places resolution succeeded and Routes API returned:

- Short representative route: 11,952 metres, 1,164 seconds.
- Medium representative route: 12,358 metres, 1,250 seconds.
- Long representative route: 25,481 metres, 2,634 seconds.
- Optimized multi-stop route: 27,195 metres, 2,864 seconds, provider order `[0, 1]`.

These are provider planning estimates captured at the test time, not promised journey times or approved operating boundaries.

The browser key also loaded Maps JavaScript successfully from `http://localhost:3000`. That localhost result does not validate a deployed hostname.

On 18 November 2026, executable Chrome acceptance at `https://dovid-logistics-prelaunch.netlify.app/admin/coverage` initially found `RefererNotAllowedMapError`. Google Cloud was then updated to authorize both `https://dovid-logistics-prelaunch.netlify.app` and `https://dovid-logistics-prelaunch.netlify.app/*`. On 19 November the browser-origin validator loaded Maps JavaScript API with HTTP 200, no request failures and no key, referrer, activation, billing or quota error. A plain HTTP download of the Maps loader is not sufficient evidence because referrer authorization is completed while the script executes. `npm run validate:maps:browser` performs that real browser-origin check and must pass after any referrer change.

## Activation checklist

- Confirm Places API (New), Routes API and Maps JavaScript API are enabled in the intended Google Cloud project.
- Verify the backend and browser keys are separate and restricted to only their required APIs.
- Add exact staging/production referrers to the browser key.
- Provision fixed backend egress before enabling IP restrictions, or route Maps web-service calls through controlled infrastructure.
- Configure shared rate limiting, Google Cloud quotas, budget alerts and usage dashboards.
- Run representative routes at operating times and compare estimates with observed journeys.
- Revalidate the attributed active polygons against actual roads and deliverable addresses before public launch. Zones A–E are standard-eligible; Zone F and the citywide fallback require manual dispatch approval.
- Keep public booking, assisted booking confirmation and live Paystack disabled until operational sign-off.
