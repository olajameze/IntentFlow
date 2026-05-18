/**
 * Publish a text post to LinkedIn via the UGC Posts API (server-only).
 *
 * Required env vars:
 *   LINKEDIN_ACCESS_TOKEN  — OAuth 2.0 Bearer token with r_liteprofile + w_member_social
 *                            (or w_organization_social for org pages).
 *   LINKEDIN_AUTHOR_URN    — e.g. "urn:li:person:ABC123" or "urn:li:organization:12345"
 *
 * Get a token: LinkedIn Developer Portal → OAuth 2.0 → Request an access token.
 * Person URN: GET https://api.linkedin.com/v2/me → "id" field → "urn:li:person:{id}"
 * Org URN:    GET https://api.linkedin.com/v2/organizationAcls?q=roleAssignee → use orgId
 *
 * @see https://docs.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/ugc-post-api
 */

export type LinkedInPublishResult =
  | { ok: true; postUrn: string }
  | { ok: false; status: number; error: string };

export async function publishLinkedInPost(
  accessToken: string,
  authorUrn: string,
  text: string,
): Promise<LinkedInPublishResult> {
  const body = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      const err = (await res.json()) as { message?: string; serviceErrorCode?: number };
      if (err.message) errMsg = err.message;
    } catch {
      // ignore parse failure
    }
    return { ok: false, status: res.status, error: errMsg };
  }

  const postUrn = res.headers.get("x-restli-id") ?? "";
  return { ok: true, postUrn };
}

/** Resolve LinkedIn credentials from env vars (server-only). */
export function resolveLinkedInCredentials(): { token: string; authorUrn: string } | null {
  const token = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN?.trim();
  if (!token || !authorUrn) return null;
  return { token, authorUrn };
}
