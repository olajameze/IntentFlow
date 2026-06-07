# Outreach conversion webhook

IntentFlow closes the loop from cold email → click → **paying customer** when your brand site reports bookings or payments.

## Prospect ID (`p`)

Outreach CTAs include `p={prospect_id}` in the URL. Persist this query param through your booking/signup flow (sessionStorage is fine).

## Endpoint

```
POST https://<your-intentflow-dashboard>/api/outreach-conversion
Authorization: Bearer <conversion_webhook_secret>
Content-Type: application/json
```

Find the secret in **Settings → Outreach & conversion webhooks** (per business).

Optional global fallback: `OUTREACH_CONVERSION_SECRET` in `web/.env.local`.

## Events

| Event | When to send | Marks booked? |
|-------|----------------|---------------|
| `deposit_paid` | Weathers £50 deposit succeeded | Yes |
| `payment_completed` | Stripe payment succeeded | Yes |
| `trial_started` | PestTrace trial/signup completed | Yes |
| `booking_started` | Calendly confirmed (use `deposit_paid` if deposit required) | Only if `deposit_paid: true` |

## Body

```json
{
  "prospect_id": "uuid-from-p-query-param",
  "event": "payment_completed",
  "external_id": "stripe_pi_xxx",
  "amount": 50,
  "currency": "gbp",
  "deposit_paid": true
}
```

`external_id` is required for idempotency (safe to retry webhooks).

## Weathers `/book` (example)

```javascript
const params = new URLSearchParams(window.location.search);
const prospectId = params.get("p");
if (!prospectId) return;

async function reportConversion(event, extra = {}) {
  await fetch("https://YOUR-DASHBOARD.vercel.app/api/outreach-conversion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer YOUR_WEBHOOK_SECRET",
    },
    body: JSON.stringify({
      prospect_id: prospectId,
      event,
      external_id: extra.external_id,
      amount: extra.amount,
      currency: "gbp",
      deposit_paid: extra.deposit_paid,
    }),
  });
}

// After Stripe deposit success:
await reportConversion("deposit_paid", {
  external_id: paymentIntent.id,
  amount: 50,
  deposit_paid: true,
});
```

## PestTrace signup/payment (example)

```javascript
await reportConversion("trial_started", {
  external_id: `signup_${userId}`,
});
// or after first charge:
await reportConversion("payment_completed", {
  external_id: subscriptionId,
  amount: 99,
  currency: "gbp",
});
```

## HMAC alternative

```
X-IntentFlow-Signature: sha256=<hmac_sha256_hex(raw_body, secret)>
```

## What IntentFlow does

- Sets `booked_at` on the prospect
- Logs `outreach_email_events` (`booked`)
- Upserts `leads` with `status: converted`
- Updates engagement tier to **hot**

Monitor **Outreach → Hot leads** for clickers who have not yet converted.

## Brevo transactional webhooks (delivery + replies)

When sending via Brevo SMTP (`OUTREACH_EMAIL_PROVIDER=smtp`), configure Brevo to POST events to:

```
POST https://<your-intentflow-dashboard>/api/outreach-webhooks/brevo
```

Set `BREVO_WEBHOOK_SECRET` in the dashboard env. Brevo should send the same value as `X-Brevo-Signature` (HMAC-SHA256 of the raw body) or `Authorization: Bearer <secret>`.

| Brevo event | IntentFlow action |
|-------------|-------------------|
| `delivered` | Sets `delivered_at`, logs `delivered` |
| `hard_bounce` / `soft_bounce` / `blocked` | `status=bounced`, logs `bounce` |
| `spam` / `invalid` | `status=unsubscribed`, logs `unsubscribe` |
| `inbound_email` / `reply` | Auto `replied_at`, stops sequence; STOP/unsubscribe keywords honoured |

SMTP sends include `X-IntentFlow-Prospect-Id` for correlation.

## Outbound integrator webhooks (Zapier / HubSpot)

Register subscriptions via `POST /api/outreach-webhooks/subscriptions` (service role or `CRON_SECRET`):

```json
{
  "url": "https://hooks.zapier.com/...",
  "secret": "your-signing-secret",
  "campaign": "pesttrace",
  "events": ["reply", "booked", "converted", "hot_lead"]
}
```

IntentFlow signs payloads with `X-IntentFlow-Signature` (HMAC-SHA256). Events fire on reply, conversion webhook, and first hot-tier click.
