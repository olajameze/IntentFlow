# IntentFlow — product requirements & reference docs

## Reference library (keep in repo)

| Document | Path | How we use it |
| --- | --- | --- |
| Hootsuite *Social Trends 2026* (English) | `docs/references/HootsuiteSocialTrends2026_Report_en.pdf` (**local file — not committed; copy from your Downloads**) | **Guidance** for cadence, formats, and platform-native behaviour when drafting or reviewing social copy. See `docs/references/README.md`. |

The engine **does not** read PDF bytes at build time — authors and LLM prompts should **summarise and apply** themes from the document when editing prompts or copy.

- Operators must be able to **edit post body** while status is `pending`, then **Save edits** (persists to Supabase) or **Approve** / **Reject**.
- **Approve** must persist the **latest edited text** (single PATCH including `content` + `status` when the textarea changed).

## Copy & brand voice (engine → `pending_posts`)

- Every business gets **unique** drafts grounded in Supabase `businesses` context (name, type, audience, industry, goals, website). **No invented credentials, logos, customers, or metrics.**
- Voice: **confident, educational, problem → solution.** Never needy, begging, desperate, or guilt-based.
- **Ethical “laws of power” marketing read:** authority, proof, restraint, outcome-led framing — **not** deception, false scarcity, or competitor attacks. See `engine/tools/copy_doctrine.py`.
- **PestTrace** (`type = b2b_saas` and name/URL contains `pesttrace`): drafts should **centre compliance and operational risk** for pest-control operators and the **solutions PestTrace enables**, without sounding salesy (PestTrace is the lens, education is the lead).

## LinkedIn Page ID

- **Not required today** for the dashboard or for marking LinkedIn drafts “published” in-app (`/api/publish-approved` updates DB only for non-Facebook platforms).
- **Required only if** you later integrate the **LinkedIn UGC / Posts API** (then store Page / organization identifiers securely per business — out of scope until that feature exists).

## Facebook

- Optional `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_ACCESS_TOKEN` (or per-business numbered vars) — see `web/.env.example`.
