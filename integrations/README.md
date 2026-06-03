# Brand site integrations

## IntentFlow conversion webhook

After running `node web/scripts/setup-marketing-conversion.mjs`, open `webhook-secrets.local.json` (gitignored) for per-business secrets.

1. Copy [`intentflow-conversion-snippet.js`](intentflow-conversion-snippet.js) into your Weathers `/book` and PestTrace checkout success flows.
2. Set env on those sites:

```env
NEXT_PUBLIC_INTENTFLOW_WEBHOOK_URL=https://intent-flow-xi.vercel.app/api/outreach-conversion
NEXT_PUBLIC_INTENTFLOW_WEBHOOK_SECRET=<from webhook-secrets.local.json>
```

3. On successful deposit/payment/signup:

```js
import { reportIntentFlowConversion } from "./intentflow-conversion-snippet";

await reportIntentFlowConversion({
  event: "deposit_paid", // or payment_completed / trial_started
  externalId: paymentIntent.id,
  amount: 50,
  depositPaid: true,
});
```

See [`docs/outreach-conversion-webhook.md`](../docs/outreach-conversion-webhook.md).
