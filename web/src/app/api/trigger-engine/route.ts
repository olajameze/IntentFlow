import { NextResponse } from "next/server";

const WORKFLOW_FILE = "marketing-engine.yml";

function manualWorkflowUrl(): string | null {
  const r = process.env.NEXT_PUBLIC_GITHUB_REPO?.trim();
  if (!r || !r.includes("/")) return null;
  return `https://github.com/${r}/actions/workflows/${WORKFLOW_FILE}`;
}

/**
 * POST — dispatches `.github/workflows/marketing-engine.yml` via GitHub API when token is configured.
 * Otherwise returns 503 + URL to open the workflow manually.
 */
export async function POST() {
  const manual = manualWorkflowUrl();
  const token = process.env.GITHUB_ACTION_DISPATCH_TOKEN?.trim();
  const repoFull = process.env.GITHUB_REPOSITORY?.trim();

  if (!token || !repoFull) {
    return NextResponse.json(
      {
        error: "Engine dispatch not configured on the server.",
        hint: "Add web/.env.local: GITHUB_ACTION_DISPATCH_TOKEN (PAT with Contents: Read + Actions: Write) and GITHUB_REPOSITORY=owner/repo. Optional: NEXT_PUBLIC_GITHUB_REPO=owner/repo so the fallback link opens the right workflow.",
        ...(manual && { manualUrl: manual }),
      },
      { status: 503 },
    );
  }

  const parts = repoFull.split("/");
  const owner = parts[0];
  const repo = parts.slice(1).join("/");
  if (!owner || !repo) {
    return NextResponse.json(
      { error: "GITHUB_REPOSITORY must be owner/repo (e.g. you/IntentFlow)" },
      { status: 400 },
    );
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
    const logsUrl = manual ?? `https://github.com/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}`;
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
