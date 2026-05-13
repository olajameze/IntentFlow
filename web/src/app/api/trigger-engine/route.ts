import { NextResponse } from "next/server";

const WORKFLOW_FILE = "marketing-engine.yml";

/** Prefer `GITHUB_REPOSITORY`; allow `NEXT_PUBLIC_GITHUB_REPO` as the slug fallback for dispatch + links. */
function resolveRepoFull(): string | null {
  const primary = process.env.GITHUB_REPOSITORY?.trim();
  const pub = process.env.NEXT_PUBLIC_GITHUB_REPO?.trim();
  const r = primary || pub;
  if (!r || !r.includes("/")) return null;
  return r;
}

function workflowActionsUrl(repoFull: string): string {
  return `https://github.com/${repoFull}/actions/workflows/${WORKFLOW_FILE}`;
}

function manualWorkflowUrl(): string | null {
  const r = resolveRepoFull();
  return r ? workflowActionsUrl(r) : null;
}

/** Strip accidental quotes / "Bearer " from pasted PATs in .env.local */
function normalizePat(raw: string): string {
  let t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (/^Bearer\s+/i.test(t)) {
    t = t.replace(/^Bearer\s+/i, "").trim();
  }
  return t;
}

/** PAT for workflow_dispatch: first non-empty wins (avoids “I used another name” confusion). */
function dispatchToken(): string | undefined {
  for (const key of [
    "GITHUB_ACTION_DISPATCH_TOKEN",
    "GITHUB_DISPATCH_TOKEN",
    "GH_DISPATCH_TOKEN",
  ] as const) {
    const raw = process.env[key];
    if (!raw?.trim()) continue;
    return normalizePat(raw);
  }
  return undefined;
}

const BAD_CREDENTIALS_HINT =
  "GitHub returned 401 — the token is invalid, expired, or lacks scopes. Create a new PAT: Fine-grained → select repo `olajameze/IntentFlow` → Permissions: Contents Read + Actions Read and write. (Classic: enable `repo` + `workflow`.) In `web/.env.local` put the token alone — no quotes, no `Bearer ` prefix. Restart `npm run dev`.";

const DISPATCH_TOKEN_HINT =
  "Add a GitHub PAT to `web/.env.local` (next to `web/package.json`—not the monorepo root unless you symlink). Use any of: `GITHUB_ACTION_DISPATCH_TOKEN`, `GITHUB_DISPATCH_TOKEN`, or `GH_DISPATCH_TOKEN`. Fine-grained: Actions Write + Contents Read on this repo. Also set `NEXT_PUBLIC_GITHUB_REPO=owner/repo`. Restart `npm run dev` after saving.";

/** Non-secret shape check so you know you pasted a PAT, not something else */
function tokenShapeHint(token: string): string {
  if (token.startsWith("github_pat_")) return "fine_grained_pat";
  if (token.startsWith("ghp_")) return "classic_pat";
  if (token.startsWith("gho_") || token.startsWith("ghu_")) return "oauth_app_token_not_recommended";
  return "unexpected_prefix";
}

/**
 * GET — safe diagnostics (no secrets) to verify `.env.local` was picked up after restart.
 */
export async function GET() {
  const token = dispatchToken();
  const repo = resolveRepoFull();
  return NextResponse.json({
    dispatchTokenConfigured: Boolean(token),
    tokenShape: token ? tokenShapeHint(token) : null,
    repoConfigured: Boolean(repo),
    resolvedRepoSlug: repo ?? null,
    manualWorkflowUrl: manualWorkflowUrl(),
  });
}

/**
 * POST — dispatches `.github/workflows/marketing-engine.yml` via GitHub API when token is configured.
 * Otherwise returns 503 + URL to open the workflow manually.
 */
export async function POST() {
  const manual = manualWorkflowUrl();
  const token = dispatchToken();
  const repoFull = resolveRepoFull();

  if (!token) {
    return NextResponse.json(
      {
        error: "Engine dispatch token missing.",
        hint: DISPATCH_TOKEN_HINT,
        ...(manual && { manualUrl: manual }),
      },
      { status: 503 },
    );
  }

  if (!repoFull) {
    return NextResponse.json(
      {
        error: "GitHub repository not configured.",
        hint:
          "Set `GITHUB_REPOSITORY=owner/repo` or `NEXT_PUBLIC_GITHUB_REPO=owner/repo` in web/.env.local, then restart the dev server.",
      },
      { status: 503 },
    );
  }

  const slash = repoFull.indexOf("/");
  const owner = slash === -1 ? "" : repoFull.slice(0, slash);
  const repo = slash === -1 ? "" : repoFull.slice(slash + 1);
  if (!owner || !repo) {
    return NextResponse.json({ error: "Repository must look like owner/repo" }, { status: 400 });
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  const ref = process.env.ENGINE_WORKFLOW_REF?.trim() || "main";

  const gh = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref }),
  });

  if (gh.status === 204) {
    const logsUrl = manualWorkflowUrl() ?? workflowActionsUrl(repoFull);
    return NextResponse.json({
      ok: true,
      message: `Workflow dispatched (ref ${ref}). It may take a minute to appear in Actions.`,
      logsUrl,
    });
  }

  if (gh.status === 401) {
    return NextResponse.json(
      {
        error: "GitHub rejected the token (401 Bad credentials).",
        hint: BAD_CREDENTIALS_HINT,
        ...(manual && { manualUrl: manual }),
      },
      { status: 401 },
    );
  }

  const body = await gh.text();
  return NextResponse.json(
    {
      error: `GitHub API error (${gh.status})`,
      hint: body.slice(0, 600),
      ...(manual && { manualUrl: manual }),
    },
    { status: gh.status >= 400 && gh.status < 600 ? gh.status : 502 },
  );
}
