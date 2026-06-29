# Local cold start — IntentFlow

Use this checklist the first time (or after a clean clone) before reporting “nothing works.”

## 1. Supabase

1. Create/open your Supabase project.
2. Run SQL from `supabase/migrations/` in order, **or** apply outreach migrations in one shot:
   - `POST /api/setup/apply-outreach-migration` (dashboard, service role), or
   - `cd web && node scripts/setup-marketing-conversion.mjs` with `SUPABASE_DB_URL` set.
3. Outreach intelligence migrations (required for lead score, delivery tracking, event log):
   - `20260604000000_business_outreach.sql`
   - `20260607000000_outreach_intelligence.sql` (`lead_score`, `delivered_at`, `sequence_step`, …)
   - `20260608000000_outreach_event_types.sql` (allows `sent`, `delivered`, `meeting_booked`, …)
   - `20260608100000_outreach_webhook_subscriptions.sql` (outbound integrator webhooks)
   - `20260609000000_outreach_campaign_stats_rpc.sql` (single-query KPI RPC + deliverability fields)
   - `20260617000000_outreach_platform_v2.sql` (inbox messages, suppression, alerts, nurture, HubSpot, timeline, LinkedIn tasks, operator auth tables)
4. Confirm `businesses` exists and optionally seed rows. `GET /api/health` should report `outreachSchemaReady: true` and `outreachStatsRpcReady: true`.

## 2. Environment

### `web/.env.local`

Copy from `web/.env.example`. Required for the dashboard + API routes:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional but recommended when using encrypted Stripe secrets in Settings:

- `STRIPE_SECRET_ENCRYPTION_KEY` — **must be identical** in `web/.env.local`, `engine/.env`, and GitHub Actions secret `STRIPE_SECRET_ENCRYPTION_KEY` when workflows decrypt Stripe. Generate once, e.g. `openssl rand -hex 32` (64 hex chars); never commit it; do not use `NEXT_PUBLIC_*`. If you rotate this key, re-save each business Stripe key in Settings so ciphertext is re-encrypted.

The Python engine **re-reads** `GOOGLE_API_KEY`, `GEMINI_TEXT_MODEL`, `GROQ_API_KEY`, `ENGINE_USE_GROQ_ONLY`, `ENGINE_FORCE_GROQ`, and `STRIPE_SECRET_ENCRYPTION_KEY` from `web/.env.local` after loading `engine/.env`, so those can be maintained only in the web env file for local dev.

### `engine/.env`

Copy from `engine/.env.example`. The engine loads `engine/.env`, then repo `.env`, then `web/.env.local` with `override=False` (first file wins per variable), then **re-applies** `GOOGLE_API_KEY`, `GEMINI_TEXT_MODEL`, `GROQ_API_KEY`, `ENGINE_USE_GROQ_ONLY`, `ENGINE_FORCE_GROQ`, and `STRIPE_SECRET_ENCRYPTION_KEY` from `web/.env.local` when present so dashboard env stays authoritative for those keys.

Minimum for Crew + copy generation without paid Gemini quota:

- `SUPABASE_URL` (same as `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY` — with **no** `GOOGLE_API_KEY`, the engine uses Groq only (no flag required)
- `ENGINE_USE_GROQ_ONLY=1` — optional; forces Groq if a stale `GOOGLE_API_KEY` still exists in `engine/.env`

Traffic snapshots from Umami Cloud:

- `CLARITY_API_TOKEN` (engine reads from `web/.env.local`)
- `CLARITY_SNAPSHOT_DAYS` — optional, 1–3 (default 3)

## 3. Install & run web

From repo root:

```bash
npm run install:web
npm run dev
```

Visit `http://localhost:3000`.

### Verify APIs

After the dev server starts:

```bash
curl -s http://localhost:3000/api/health
```

Expect `200` JSON with `"ok": true` when Supabase URL + service role are correct **and** the DB is reachable.

## 4. Install & run engine

```bash
cd engine
python -m venv .venv
# Windows:
# .venv\Scripts\activate
source .venv/bin/activate   # Linux / macOS / Git Bash
pip install -r requirements.txt
python main.py traffic    # snapshots only — good smoke test
python main.py full       # full CrewAI run
```

Groq sanity (no Gemini):

```bash
cd engine && python -c "import config; print('Groq:', 'yes' if config.groq_api_key() else 'no')"
```

## 5. Outreach conversion loop

1. Apply outreach migrations (see §1).
2. In **Settings → Outreach & conversion webhooks**, enable outreach per business, **Generate campaign copy**, and copy the conversion webhook secret.
3. Wire your brand site (`/book`, Stripe, signup) using [`docs/outreach-conversion-webhook.md`](outreach-conversion-webhook.md) — pass `p` from the URL through to the webhook `prospect_id`.
4. **Brevo SMTP + deliverability** (recommended when `OUTREACH_EMAIL_PROVIDER=smtp`):
   - Dashboard → Transactional → Settings → Webhooks → URL: `https://<dashboard>/api/outreach-webhooks/brevo`
   - Events: `delivered`, `hard_bounce`, `soft_bounce`, `spam`, `blocked`, optional `inbound_email` for auto-reply stop
   - Set `BREVO_WEBHOOK_SECRET` in `web/.env.local` (and Vercel) — must match Brevo signing token
   - Optional `BREVO_API_KEY` for contacts validate API (pre-send gate)
5. Send pacing env: `OUTREACH_DAILY_SEND_LIMIT`, `OUTREACH_HOURLY_SEND_LIMIT` (default 30), `OUTREACH_SEND_WINDOW_MINUTES` (default 20), jitter 200–800 ms between bulk sends.
6. Optional env: `OUTREACH_CONVERSION_SECRET` (global fallback), `OUTREACH_PUBLIC_BASE_URL` (tracking pixels + snapshot links), `OUTREACH_SNAPSHOT_ENABLED=1` (pesttrace audit snapshots), `GROQ_API_KEY` (LLM follow-ups).
7. **Audit readiness snapshots (pesttrace only):** After `python main.py outreach --campaign pesttrace`, each drafted prospect gets a score + public page at `/r/{token}`. Apply migration `20260610000000_outreach_snapshots.sql` (Settings → apply outreach migrations or Supabase SQL). Requires `OUTREACH_PUBLIC_BASE_URL` before sending snapshot emails.
8. Optional IMAP reply fallback (when Brevo inbound is unavailable):
   - `OUTREACH_REPLY_IMAP_HOST`, `OUTREACH_REPLY_IMAP_USER`, `OUTREACH_REPLY_IMAP_PASSWORD` in `web/.env.local`
   - `outreach-poll-replies.yml` cron → `POST /api/outreach-poll-replies` every 30 min
9. Cron jobs (GitHub Actions + `CRON_SECRET` + `OUTREACH_DASHBOARD_URL`):
   - `outreach-followups.yml` → `POST /api/outreach-prospects/send-followups`
   - `outreach-ab-winner.yml` daily → `POST /api/outreach-prospects/ab-winner`
   - `outreach-poll-replies.yml` → `POST /api/outreach-poll-replies` (IMAP fallback)
   - `outreach-nurture.yml` → `POST /api/outreach-nurture/send` (post-conversion nurture)
   - `outreach-intent-sync.yml` → `POST /api/outreach/intent-sync` (Umami site intent)
   - `outreach-send-stats.yml` → `POST /api/outreach/send-stats` (smart send-time buckets)
10. **Settings → Outbound webhook subscriptions** — register Zapier/CRM endpoints without exposing service keys.
11. **Settings → Outreach email alerts / Suppression centre / HubSpot** — configure email-only hot-lead alerts, DNC list, and HubSpot sync (`HUBSPOT_ACCESS_TOKEN`).
12. **Outreach → Inbox** — unified reply threads, LLM suggest reply, Weathers job log, customer timeline.
13. Monitor **Outreach** KPI strip — benchmark targets: open 40–60%, click 5–15%, reply 2–8%, bounce &lt; 3%. Hot leads and `booked_at` fill from clicks + conversion webhooks. Deliverability row shows `delivery_rate`, in-flight, and verify failures.

### Outreach platform v2 env vars

Add to `web/.env.local` / Vercel as needed:

- `HUBSPOT_ACCESS_TOKEN` — HubSpot private app token
- `HUBSPOT_PIPELINE_ID` — optional deal pipeline
- `HUBSPOT_WEBHOOK_SECRET` — verify inbound HubSpot webhooks
- `CALENDLY_WEBHOOK_SECRET` — verify Calendly signing secret
- `OUTREACH_ALERT_FROM_EMAIL` — alert sender (defaults to campaign from address)
- `OUTREACH_ALERT_TO_EMAIL` — fallback ops inbox when no alert rules exist
- `OUTREACH_SMART_SEND=1` — snap follow-up sends to top UTC hours from `outreach_send_stats`
- `OUTREACH_REQUIRE_AUTH=1` — require Supabase login for dashboard (cron uses `CRON_SECRET` Bearer bypass)

Run all enabled campaigns:

```bash
cd engine && python main.py outreach --campaign all
```

Campaigns: `pesttrace` (compliance SaaS + audit snapshots), `weathers` (West Midlands pest control), `jgdevs` (websites, SEO, booking for UK small businesses).

## 6. E2E tests (optional)

### Tier A + C + D (default CI / local smoke)

From `web/`:

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

Reads `BASE_URL` if set (default dev server spun up by Playwright config). Loads `.env.local` for consistency but Tier A+C+D generally does **not** need real Supabase.

### Tier B (`@integration` — seeded DB rows)

Requires **`NEXT_PUBLIC_SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** in `web/.env.local`, plus **at least one active** `businesses` row:

```bash
cd web && npm run test:e2e:integration
```

This runs only tests titled with **`@integration`** (approve/reject UI + `/api/publish-approved` assertions).

Optional real Facebook posting: **`FACEBOOK_PAGE_ID`**, **`FACEBOOK_PAGE_ACCESS_TOKEN`**, **`PLAYWRIGHT_REAL_FACEBOOK_PUBLISH=1`**; otherwise the Facebook publish case expects HTTP **400** with a credential message.
