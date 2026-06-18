# Inbound call qualification (free hybrid)

IntentFlow prepares you for **inbound calls from outreach prospects** without telephony signups. When someone replies to your email or clicks your CTA, Groq generates a call script and optional web chat link.

## What you get

1. **Call prep queue** — Outreach screen → extras panel → *Call prep queue*
2. **Email alerts** — `call_task` event when a task is created (configure in alert rules)
3. **Qualification chat** — Public page `/q/{token}` for prospects who prefer text over waiting on the phone

You still answer **07462253896** (Weathers) or your business line yourself; AI prepares the conversation.

## Setup

1. Apply migration (once):

   ```bash
   cd web && node scripts/apply-call-tasks-migration.mjs
   ```

   Or paste `supabase/migrations/20260618000000_outreach_call_tasks.sql` into the Supabase SQL editor.

2. Existing env (no new accounts):

   - `GROQ_API_KEY` — script + chat generation
   - `OUTREACH_PUBLIC_BASE_URL` — absolute chat links in alerts and dashboard

3. Optional: add `call_task` to **Outreach alert rules** in Settings so you get emailed when a prospect engages.

## Triggers

| Event | Call task |
|-------|-----------|
| First email reply | Created (`reply` or `call_intent` if they mention phone/call) |
| Hot click + phone on file | Created (`click`) |

## Operator workflow

1. Open Outreach → select campaign → **Call prep queue**
2. Before answering an inbound call, tap **Details** or **Copy script**
3. Optionally send the **Copy chat link** URL in your inbox reply
4. After the call, **Done** → pick outcome (`book`, `demo`, `callback`, `not_ready`, `unqualified`) and notes

## Public chat URL

```
https://<your-dashboard>/q/<qualification_token>
```

Token is per task (shown in Call prep queue). Chat runs up to ~5 turns, then shows the campaign booking URL with `?p={prospect_id}` attribution.

## API (internal)

| Route | Purpose |
|-------|---------|
| `GET/PATCH /api/outreach-call-tasks` | Dashboard queue |
| `POST /api/outreach-call-tasks` | Manual create `{ prospect_id }` |
| `GET /api/outreach-qualify/session?token=` | Chat page bootstrap |
| `POST /api/outreach-qualify/chat` | Chat turn `{ token, message }` |

## Cost

Uses existing Groq free tier only — no Twilio, Vapi, or other telephony services.
