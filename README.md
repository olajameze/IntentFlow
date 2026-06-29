# IntentFlow — Omni-Channel Marketing Engine

Privacy-first portfolio operations: **Microsoft Clarity** analytics, **Stripe** revenue ingestion, **CrewAI** agents, and a **mobile-first Next.js 14 PWA** that scales to unlimited businesses in Supabase.

## Repository layout

| Path | Purpose |
| --- | --- |
| `web/` | Next.js 14 (App Router) dashboard + Route Handlers |
| `engine/` | Python 3.11 CrewAI orchestrator + Clarity/Stripe tools |
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
- `CLARITY_API_TOKEN` — Clarity project → Settings → Data Export → Generate API token (for `/api/clarity-sync` and `python main.py traffic`)
- `CLARITY_SNAPSHOT_DAYS` — optional, 1–3 (Clarity API limit; default 3)

### `engine/.env` (see `engine/.env.example`)

- `SUPABASE_URL` — same value as `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLARITY_API_TOKEN` — same token as web (engine reads from `web/.env.local` when present)
- `GROQ_API_KEY` for CrewAI / copy tools (set this for **Groq-only**: omit `GOOGLE_API_KEY` or leave it empty — the engine skips Gemini automatically)
- **`ENGINE_USE_GROQ_ONLY=1`** (optional — force Groq even if a `GOOGLE_API_KEY` line exists in `engine/.env`)
- `STRIPE_SECRET_ENCRYPTION_KEY` — identical to the web app

## Troubleshooting quick reference

| Symptom | Likely fix |
| --- | --- |
| Gemini **429** / `RESOURCE_EXHAUSTED` / `limit: 0` / auth errors | Prefer **Groq-only**: set **`GROQ_API_KEY`** and **remove** `GOOGLE_API_KEY` (or use **`ENGINE_USE_GROQ_ONLY=1`** / **`ENGINE_FORCE_GROQ=1`** if a Google key remains in `engine/.env`). |
| Clarity sync **401/403** | Regenerate the Data Export token in Clarity → Settings → Data Export. Set **`CLARITY_API_TOKEN`** in `web/.env.local` and GitHub secret **`CLARITY_API_TOKEN`**. |
| Dashboard API **503** with service-role hint | Add **`NEXT_PUBLIC_SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** to `web/.env.local`; restart **`npm run dev`**. Probe **`GET http://localhost:3000/api/health`**. |
| Groq **retry still calls Gemini** | Engine must reset **`agent.agent_executor`** and pass **`chat_llm`** on the Groq **`Crew`** (see latest `engine/agents/orchestrator.py`). |
| **`/api/publish-approved`** rejects Facebook publish | Provide **`FACEBOOK_PAGE_ID`** + **`FACEBOOK_PAGE_ACCESS_TOKEN`**, or numbered **`FACEBOOK_PAGE_ID_N`** credentials per business. |
| **Traffic / analytics show 0** | Rows come from **`analytics_snapshots`** (engine or GitHub Actions). Run **`python main.py traffic`** with valid **`CLARITY_API_TOKEN`** + each business **`clarity_project_id`**. Clarity API only covers the last **1–3 days** per sync. |
| **PWA does not install in dev** | PWAs are **off in development** by default. Use **`npm run build && npm start`**, Vercel preview, or set **`NEXT_PUBLIC_ENABLE_PWA_DEV=1`** in `web/.env.local`. |
| **Vercel: “No python entrypoint” / Python build** | Vercel picks the [Python runtime](https://vercel.com/docs/functions/runtimes/python#python-entrypoints) when it sees **`requirements.txt`**, **`pyproject.toml`**, or **`Pipfile`**. This repo has **`engine/requirements.txt`** (CrewAI — not deployed on Vercel). Set **Root Directory** to **`web`** ([monorepo guide](https://vercel.com/docs/monorepos), [Root Directory](https://vercel.com/docs/deployments/configure-a-build#root-directory)) and ensure **Framework Preset** is **Next.js**, not Python. Repo root **`.vercelignore`** excludes **`engine/`** if the Git root is mistakenly used as the project root. |
| **Vercel: “Next.js output directory `.next` was not found”** | The Next build writes **`web/.next`**. In Vercel → **Settings → General → Root Directory**, set **`web`** (must match the folder that contains **`next.config.mjs`**). Remove any root **`vercel.json`** that builds with `--prefix web` while the Git root is still the project root. |

**Cold start checklist:** [`docs/runbook-local.md`](docs/runbook-local.md).

## 3. Microsoft Clarity

1. Sign up at [clarity.microsoft.com](https://clarity.microsoft.com/) (Microsoft account).
2. Create **one project per website** → copy each **Project ID** from Setup.
3. Save each ID in **Settings → Active portfolio → Clarity project ID**.
4. Clarity → **Settings → Data Export → Generate API token** → set **`CLARITY_API_TOKEN`** in `web/.env.local` and GitHub Actions secrets.
5. Paste the tracking snippet from the **Traffic → Tracking code** tab on each site.
6. Click **Sync now** on Traffic (or run **`python main.py traffic`**) — max **3-day** lookback, **10 requests/project/day**.

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

Follow Vercel’s [Using Monorepos](https://vercel.com/docs/monorepos) guidance: the dashboard app is the **`web/`** package only.

1. **Import** this Git repository as a new Vercel project (or open the existing project’s **Settings**).
2. **Settings → General → Root Directory:** click **Edit**, choose **`web`**, then **Save**. This must be the folder that contains **`next.config.mjs`**, **`package.json`**, and **`src/`** ([Root Directory](https://vercel.com/docs/deployments/configure-a-build#root-directory)).
3. **Settings → General → Framework Preset:** **Next.js** (matches **`web/vercel.json`**). If it ever shows **Python**, switch it to **Next.js** — Python is only for **`engine/`**, which is **not** deployed here ([Python runtime / detection](https://vercel.com/docs/functions/runtimes/python#python-entrypoints)).
4. **Build & Development:** leave **Install Command** and **Build Command** empty unless you have a documented reason to override them (defaults run **`npm install`** / **`next build`** inside **`web/`**).
5. Add your **`web/.env`** equivalents under **Environment Variables** (production / preview), e.g. **`NEXT_PUBLIC_SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`**, etc. (see **`web/.env.example`**).

The repository root **`package.json`** only forwards scripts to **`web/`** (no npm workspaces — **`web/package-lock.json`** is the lockfile used by CI and by Vercel when Root Directory is **`web`**).

**Safety net:** if the Vercel **Root Directory** is ever left at the **Git repository root**, root **`.vercelignore`** excludes **`engine/`** so **`engine/requirements.txt`** is not uploaded and Vercel is less likely to treat the deployment as a Python app. The correct fix is still **Root Directory = `web`**.

There is **no** root **`vercel.json`** on purpose: building Next from the Git root while output lives under **`web/.next`** makes Vercel look for **`.next`** in the wrong place.

Do **not** add a root **`requirements.txt`** — that would also steer Vercel toward Python.

**One-time:** install dependencies in **`web/`** (pick one):

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

- The dashboard reads **`analytics_snapshots`** in Supabase (written by **`python main.py traffic`**, **`python main.py full`**, or scheduled Actions). Confirm **`CLARITY_API_TOKEN`** and each business **`clarity_project_id`**, then run the engine or **Sync now** on Traffic.

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

Add repository secrets: **`SUPABASE_URL`** (recommended) — or **`NEXT_PUBLIC_SUPABASE_URL`** with the **same Supabase HTTPS URL** if you already use that name in GitHub/Vercel; **`SUPABASE_SERVICE_ROLE_KEY`**; **`CLARITY_API_TOKEN`**; **`STRIPE_SECRET_ENCRYPTION_KEY`**; plus **`GOOGLE_API_KEY`** / **`GROQ_API_KEY`** for the daily marketing job.

Workflows:

- `marketing-engine.yml` — daily `python main.py full`
- `traffic-revenue-sync.yml` — Clarity + Stripe snapshots every four hours
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
