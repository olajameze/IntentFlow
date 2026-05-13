import { NextResponse } from "next/server";

const WORKFLOW_FILE = "traffic-revenue-sync.yml";

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
  "GitHub returned 401 — the token is invalid, expired, or lacks scopes. Fine-grained: Contents Read + Actions Read and write on this repo. Restart `npm run dev` after updating `web/.env.local`.";

const FORBIDDEN_WORKFLOW_HINT =
  "GitHub returned 403 — ensure the PAT has **Actions → Read and write** on this repository.";

const DISPATCH_TOKEN_HINT =
  "Add `GITHUB_ACTION_DISPATCH_TOKEN` (or `GITHUB_DISPATCH_TOKEN` / `GH_DISPATCH_TOKEN`) plus `NEXT_PUBLIC_GITHUB_REPO=owner/repo` in `web/.env.local`. Restart the dev server after saving.";

function tokenShapeHint(token: string): string {
  if (token.startsWith("github_pat_")) return "fine_grained_pat";
  if (token.startsWith("ghp_")) return "classic_pat";
  if (token.startsWith("gho_") || token.startsWith("ghu_")) return "oauth_app_token_not_recommended";
  return "unexpected_prefix";
}

export async function GET() {
  const token = dispatchToken();
  const repo = resolveRepoFull();
  return NextResponse.json({
    workflowFile: WORKFLOW_FILE,
    dispatchTokenConfigured: Boolean(token),
    tokenShape: token ? tokenShapeHint(token) : null,
    repoConfigured: Boolean(repo),
    resolvedRepoSlug: repo ?? null,
    manualWorkflowUrl: manualWorkflowUrl(),
  });
}

export async function POST() {
  const manual = manualWorkflowUrl();
  const token = dispatchToken();
  const repoFull = resolveRepoFull();

  if (!token) {
    return NextResponse.json(
      {
        error: "GitHub dispatch token missing.",
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
  const ref = process.env.TRAFFIC_WORKFLOW_REF?.trim() || process.env.ENGINE_WORKFLOW_REF?.trim() || "main";

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
      message: `Traffic & revenue sync workflow dispatched (ref ${ref}). New Umami snapshots appear in Supabase after the job finishes.`,
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

  if (gh.status === 403) {
    return NextResponse.json(
      {
        error: "GitHub forbids workflow_dispatch for this token (403).",
        hint: FORBIDDEN_WORKFLOW_HINT,
        ...(manual && { manualUrl: manual }),
      },
      { status: 403 },
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
