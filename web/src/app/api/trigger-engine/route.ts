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

/**
 * POST — dispatches `.github/workflows/marketing-engine.yml` via GitHub API when token is configured.
 * Otherwise returns 503 + URL to open the workflow manually.
 */
export async function POST() {
  const manual = manualWorkflowUrl();
  const token = process.env.GITHUB_ACTION_DISPATCH_TOKEN?.trim();
  const repoFull = resolveRepoFull();

  if (!token) {
    return NextResponse.json(
      {
        error: "Engine dispatch token missing.",
        hint: "Add `GITHUB_ACTION_DISPATCH_TOKEN` to web/.env.local (fine-grained PAT: Actions Write + Contents Read). Set `NEXT_PUBLIC_GITHUB_REPO=owner/repo` for a one-click “Open workflow” link in the toast. Restart dev after editing env.",
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
