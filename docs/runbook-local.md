# Local cold start — IntentFlow

Use this checklist the first time (or after a clean clone) before reporting “nothing works.”

## 1. Supabase

1. Create/open your Supabase project.
2. Run SQL from `supabase/migrations/` in order (at minimum `20260512000000_init_marketing_engine.sql` plus any newer files).
3. Confirm `businesses` exists and optionally seed rows.

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
- `GROQ_API_KEY`
- `ENGINE_USE_GROQ_ONLY=1` — avoids Gemini entirely when quota is zero

Traffic snapshots from Umami Cloud:

- `UMAMI_URL` (or reuse `NEXT_PUBLIC_UMAMI_URL` from web)
- `UMAMI_API_TOKEN` — **`401`** from Umami means this token is wrong or missing

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

## 5. E2E tests (optional)

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
