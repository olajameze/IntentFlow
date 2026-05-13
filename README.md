# IntentFlow — Omni-Channel Marketing Engine

Privacy-first portfolio operations: **Umami** analytics (no Google Analytics), **Stripe** revenue ingestion, **CrewAI** agents, and a **mobile-first Next.js 14 PWA** that scales to unlimited businesses in Supabase.

## Repository layout

| Path | Purpose |
| --- | --- |
| `web/` | Next.js 14 (App Router) dashboard + Route Handlers |
| `engine/` | Python 3.11 CrewAI orchestrator + Umami/Stripe tools |
| `supabase/migrations/` | SQL for Postgres (run in Supabase) |
| `.github/workflows/` | Scheduled GitHub Actions (free tier) |

## 1. Supabase

1. Create a Supabase project (free tier).
2. Run `supabase/migrations/20260512000000_init_marketing_engine.sql` in the SQL editor (or link the CLI).
3. Copy `NEXT_PUBLIC_SUPABASE_URL` + **service role** key for automation, and the **anon** key only if you later add RLS for logged-in users.  
   This MVP uses the **service role only on the server** (`web/src/lib/supabase-admin.ts`) — never expose it to browsers.

## 2. Environment variables

### `web/.env.local` (see `web/.env.example`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `STRIPE_SECRET_ENCRYPTION_KEY` — long random string; must match Python engine + GitHub Actions
- `NEXT_PUBLIC_UMAMI_URL` — origin of your Umami deployment (e.g. `https://your-umami.vercel.app`)

### `engine/.env` (see `engine/.env.example`)

- `SUPABASE_URL` — same value as `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UMAMI_URL`, `UMAMI_API_TOKEN` — from the Umami UI (`Settings → API`)
- `GOOGLE_API_KEY` **or** `GROQ_API_KEY` for CrewAI / copy tools
- `STRIPE_SECRET_ENCRYPTION_KEY` — identical to the web app

## 3. Umami on Vercel + Supabase

1. Fork [Umami](https://github.com/umami-software/umami) as its own GitHub repo.
2. Create a second Vercel project targeting that repo.
3. In Umami’s environment variables, set `DATABASE_URL` to the Supabase Postgres connection string (use the **connection pooling** string; free tier includes enough row headroom for analytics metadata).
4. Deploy, create an admin user, add **one website per business**, copy each **Website ID** into `businesses.umami_website_id` via the dashboard Settings screen.
5. In Umami, generate an **API token** and use it for `UMAMI_API_TOKEN`.

## 4. Python engine

```bash
cd engine
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py full        # CrewAI strategic pass (uses LLM credits on free tiers)
python main.py traffic     # snapshots only (lighter)
python main.py revenue     # Stripe snapshots only
```

`playwright` powers the optional Similarweb scraper — run `playwright install chromium` if you call that tool locally.

## 5. Web dashboard

**One-time:** install dependencies in `web/` (pick one):

```bash
cd web && npm install
```

…or from the repo root:

```bash
npm run install:web
```

**Dev server** — from the repo root:

```bash
npm run dev
```

…or from `web/`:

```bash
cd web
npm run dev
```

Visit `http://localhost:3000` — the installable PWA manifest is `public/manifest.webmanifest`.

## 6. GitHub Actions (free)

Add repository secrets: **`SUPABASE_URL`** (recommended) — or **`NEXT_PUBLIC_SUPABASE_URL`** with the **same Supabase HTTPS URL** if you already use that name in GitHub/Vercel; **`SUPABASE_SERVICE_ROLE_KEY`**; **`UMAMI_URL`** (not `NEXT_PUBLIC_UMAMI_URL`); **`UMAMI_API_TOKEN`**; **`STRIPE_SECRET_ENCRYPTION_KEY`**; plus **`GOOGLE_API_KEY`** / **`GROQ_API_KEY`** for the daily marketing job.

Workflows:

- `marketing-engine.yml` — daily `python main.py full`
- `traffic-revenue-sync.yml` — Umami + Stripe snapshots every four hours
- `revenue-sync.yml` — Stripe-focused snapshots every six hours

## Compliance & ethics

- **Similarweb scraping** is best-effort and may violate site terms — prefer licensed insights for production.
- Social publishing routes are stubbed (`/api/publish-approved`) until OAuth tokens are stored securely per business.
- Rotate Stripe keys regularly; encrypted columns require the same master key on every runtime.

## Support matrix

| Concern | Choice |
| --- | --- |
| Analytics | Umami (self-hosted, GDPR-friendly, no consent banner) |
| Revenue | Stripe API + manual + merged CSV |
| Automation | CrewAI + Gemini/Groq free tiers (rate limits apply) |
| Hosting | Vercel Hobby + Supabase free + GitHub Actions free minutes |

---

Built for rapid iteration: add a business in the PWA, attach Umami + optional Stripe keys, and the next scheduled run picks it up automatically.
