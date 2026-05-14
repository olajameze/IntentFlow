# IntentFlow — Omni-Channel Marketing Engine

Privacy-first portfolio operations: **Umami** analytics (no Google Analytics), **Stripe** revenue ingestion, **CrewAI** agents, and a **mobile-first Next.js 14 PWA** that scales to unlimited businesses in Supabase.

## Repository layout

| Path | Purpose |
| --- | --- |
| `web/` | Next.js 14 (App Router) dashboard + Route Handlers |
| `engine/` | Python 3.11 CrewAI orchestrator + Umami/Stripe tools |
| `supabase/migrations/` | SQL for Postgres (run in Supabase) |
| `.github/workflows/` | Scheduled GitHub Actions (free tier) |
| `requirements.md` | Product copy voice, approvals behaviour, reference PDF index |
| `docs/references/` | Long-form guidance PDFs (e.g. Hootsuite Social Trends) |

## 1. Supabase

1. Create a Supabase project (free tier).
2. Run `supabase/migrations/20260512000000_init_marketing_engine.sql` in the SQL editor (or link the CLI).
3. Copy `NEXT_PUBLIC_SUPABASE_URL` + **service role** key for automation, and the **anon** key only if you later add RLS for logged-in users.  
   This MVP uses the **service role only on the server** (`web/src/lib/supabase-admin.ts`) — never expose it to browsers.

## 2. Environment variables

### `web/.env.local` (see `web/.env.example`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (SSR / middleware session refresh when auth cookies exist)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only — required for `/api/*` admin routes)
- `STRIPE_SECRET_ENCRYPTION_KEY` — long random string (e.g. `openssl rand -hex 32`); must match Python engine + GitHub Actions; never `NEXT_PUBLIC_*`.
- `NEXT_PUBLIC_UMAMI_URL` — origin of your Umami deployment (e.g. `https://your-umami.vercel.app`)

### `engine/.env` (see `engine/.env.example`)

- `SUPABASE_URL` — same value as `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UMAMI_URL`, `UMAMI_API_TOKEN` — from the Umami UI (`Settings → API`)
- `GROQ_API_KEY` for CrewAI / copy tools (set this for **Groq-only**: omit `GOOGLE_API_KEY` or leave it empty — the engine skips Gemini automatically)
- **`ENGINE_USE_GROQ_ONLY=1`** (optional — force Groq even if a `GOOGLE_API_KEY` line exists in `engine/.env`)
- `STRIPE_SECRET_ENCRYPTION_KEY` — identical to the web app

## Troubleshooting quick reference

| Symptom | Likely fix |
| --- | --- |
| Gemini **429** / `RESOURCE_EXHAUSTED` / `limit: 0` / auth errors | Prefer **Groq-only**: set **`GROQ_API_KEY`** and **remove** `GOOGLE_API_KEY` (or use **`ENGINE_USE_GROQ_ONLY=1`** / **`ENGINE_FORCE_GROQ=1`** if a Google key remains in `engine/.env`). |
| Umami **401** in engine logs | **Umami Cloud** is not the same as self-hosted: use a **Cloud API key** (`UMAMI_API_KEY` or `UMAMI_API_TOKEN`) and header `x-umami-api-key` against `https://api.umami.is/v1` — the engine maps this automatically when `UMAMI_URL` is `https://cloud.umami.is`. Do not use a Bearer JWT from `cloud.umami.is/api/auth/login` for Cloud. Self-hosted: `Bearer` + `UMAMI_URL` pointing at your instance. See [Umami Cloud API key](https://docs.umami.is/docs/cloud/api-key). |
| Dashboard API **503** with service-role hint | Add **`NEXT_PUBLIC_SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** to `web/.env.local`; restart **`npm run dev`**. Probe **`GET http://localhost:3000/api/health`**. |
| Groq **retry still calls Gemini** | Engine must reset **`agent.agent_executor`** and pass **`chat_llm`** on the Groq **`Crew`** (see latest `engine/agents/orchestrator.py`). |
| **`/api/publish-approved`** rejects Facebook publish | Provide **`FACEBOOK_PAGE_ID`** + **`FACEBOOK_PAGE_ACCESS_TOKEN`**, or numbered **`FACEBOOK_PAGE_ID_N`** credentials per business. |
| **Traffic / analytics show 0** | Rows come from **`analytics_snapshots`** (engine or GitHub Actions). Run **`python main.py traffic`** with valid **`UMAMI_*`** + **`umami_website_id`**. UI expects Umami **`pageviews.value`** shape (fixed in `web/src/lib/umami-payload.ts`). |
| **PWA does not install in dev** | PWAs are **off in development** by default. Use **`npm run build && npm start`**, Vercel preview, or set **`NEXT_PUBLIC_ENABLE_PWA_DEV=1`** in `web/.env.local`. |
| **Vercel: “No python entrypoint” / Python build** | The dashboard app is **Next.js in `web/`**, not Python. Prefer **Project → Settings → General → Root Directory = `web`** (then you can rely on default install/build). If the project root stays the repo root, root **`vercel.json`** runs **`npm install` / `npm run build` in `web/`** and there must be **no** root `requirements.txt` (Python lives under **`engine/`** only). |

**Cold start checklist:** [`docs/runbook-local.md`](docs/runbook-local.md).

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

If your shell is already in **`web/`**, do not run `cd engine` (that folder is a sibling). Either `cd ../engine` or use **`npm run engine:traffic`** / **`engine:full`** / **`engine:revenue`** from **`web/`** or the **repo root** (see `web/package.json` and root `package.json`).

From the **repo root** (without `cd engine`), install engine dependencies with: **`pip install -r engine/requirements.txt`**.

## 5. Web dashboard

### Vercel (this repo)

- **Recommended:** set **Root Directory** to **`web`** so Vercel detects Next.js and runs `npm install` / `next build` there (same as local `cd web`).
- **Alternative:** leave the connected root at the monorepo root; root **`vercel.json`** then installs and builds **`web/`** explicitly. Do not add a root **`requirements.txt`** — Vercel would treat the repo as a **Python** project (`engine/` is for GitHub Actions / local only). The root **`package.json`** lists **`next` / `react` / `react-dom`** in **`dependencies`** (same versions as `web/`) so Vercel’s Next.js preset can detect the runtime version; **`vercel.json`** runs **`npm install`** at the root, then **`npm install --prefix web`**.

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

### PWA (phone / tablet install)

- **Production** (`npm run build && npm start`, or **Vercel**): the service worker is generated by `@ducanh2912/next-pwa`; use the browser **Install app** / **Add to Home Screen** action over **HTTPS** for the best experience.
- **Local Wi‑Fi testing:** set **`NEXT_PUBLIC_ENABLE_PWA_DEV=1`** in `web/.env.local`, restart dev, open `http://<your-LAN-IP>:3000` from the device. Install prompts are stricter without HTTPS — use a preview deployment when possible.

### Traffic & analytics look empty or always zero

- The dashboard reads **`analytics_snapshots`** in Supabase (written by **`python main.py traffic`**, **`python main.py full`**, or scheduled Actions) — not live Umami from the browser. Confirm **`UMAMI_URL`**, **`UMAMI_API_TOKEN`**, and each business **`umami_website_id`**, then run the engine.
- **Umami Cloud** returns metrics like `{ "pageviews": { "value": 123 } }`. The UI normalises that shape (older code expected flat numbers and showed **0**).

### E2E tests (Playwright)

From **`web/`** (or repo root **`npm run test:e2e`** after `npm run install:web`):

```bash
cd web
npm install
npx playwright install chromium
npm run test:e2e
```

**Tier B (`@integration`)** exercises DB seeding + Approvals workflow (requires **`web/.env.local`** with **`SUPABASE_SERVICE_ROLE_KEY`**):

```bash
cd web && npm run test:e2e:integration
```

GitHub Actions **Web E2E** uses **Node 22** (`actions/setup-node@v5`), **`actions/checkout@v6`**, **`actions/upload-artifact@v5`**, sets **`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`**, **`NODE_OPTIONS=--max-old-space-size=6144`**, and starts **`npm run dev:webpack`** (webpack dev server) for stability on runners; local runs keep default **`npm run dev`** (Turbopack).

Overrides: set **`BASE_URL`** to point at a running dev/preview server. In CI only, **`ENFORCE_HEALTH_OK=1`** makes `/api/health` require **`ok: true`** (requires Supabase env in the GitHub Workflow).

Docs: [Playwright](https://playwright.dev/docs/intro), [Next.js Playwright guide](https://nextjs.org/docs/app/building-your-application/testing/playwright).

## 6. GitHub Actions (free)

Add repository secrets: **`SUPABASE_URL`** (recommended) — or **`NEXT_PUBLIC_SUPABASE_URL`** with the **same Supabase HTTPS URL** if you already use that name in GitHub/Vercel; **`SUPABASE_SERVICE_ROLE_KEY`**; **`UMAMI_URL`** (not `NEXT_PUBLIC_UMAMI_URL`); **`UMAMI_API_TOKEN`**; **`STRIPE_SECRET_ENCRYPTION_KEY`**; plus **`GOOGLE_API_KEY`** / **`GROQ_API_KEY`** for the daily marketing job.

Workflows:

- `marketing-engine.yml` — daily `python main.py full`
- `traffic-revenue-sync.yml` — Umami + Stripe snapshots every four hours
- `revenue-sync.yml` — Stripe-focused snapshots every six hours
- `e2e-web.yml` — Playwright smoke + API contracts on `web/` changes (optional **`vars.ENFORCE_HEALTH_OK`** + matching Supabase secrets required for strict health)

The dashboard **Home** “Run engine now” button calls **`POST /api/trigger-engine`** to **dispatch** `marketing-engine.yml` when you configure **`GITHUB_ACTION_DISPATCH_TOKEN`** in `web/.env.local`. Set **`GITHUB_REPOSITORY=owner/repo`** or **`NEXT_PUBLIC_GITHUB_REPO=owner/repo`** (either works for the API; restart dev after changes).

The **Traffic** screen can call **`POST /api/trigger-traffic-sync`** to dispatch **`traffic-revenue-sync.yml`** (same PAT and repo vars). Optional **`TRAFFIC_WORKFLOW_REF`** overrides the Git branch (defaults to **`ENGINE_WORKFLOW_REF`** or **`main`**).

## Compliance & ethics

- **Similarweb scraping** is best-effort and may violate site terms — prefer licensed insights for production.
- Facebook publishing via **`/api/publish-approved`** runs when **`FACEBOOK_*`** env vars are configured; treat Page tokens like secrets and rotate them regularly.
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
