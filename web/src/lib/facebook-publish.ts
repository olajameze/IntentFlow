/**
 * Publish a text post to a Facebook Page via Graph API (server-only).
 * @see https://developers.facebook.com/docs/graph-api/reference/page/feed
 */

export type FacebookPublishResult =
  | { ok: true; postId: string }
  | { ok: false; status: number; error: string };

export async function publishFacebookPagePost(
  pageId: string,
  accessToken: string,
  message: string
): Promise<FacebookPublishResult> {
  const url = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/feed`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("message", message);

  const res = await fetch(url, { method: "POST" });
  const body = (await res.json()) as { id?: string; error?: { message?: string } };

  if (!res.ok) {
    const err = body.error?.message ?? res.statusText;
    return { ok: false, status: res.status, error: err };
  }
  if (!body.id) {
    return { ok: false, status: 500, error: "Graph API returned no post id" };
  }
  return { ok: true, postId: body.id };
}

/**
 * Resolve Page id + token for a business. Supports:
 * - FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN (single Page for all businesses)
 * - FACEBOOK_BUSINESS_ID_N + FACEBOOK_PAGE_ID_N + FACEBOOK_PAGE_ACCESS_TOKEN_N (per slot N=1..5)
 */
export function resolveFacebookCredentialsForBusiness(businessId: string): { pageId: string; token: string } | null {
  const globalId = process.env.FACEBOOK_PAGE_ID;
  const globalToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (globalId?.trim() && globalToken?.trim()) {
    return { pageId: globalId.trim(), token: globalToken.trim() };
  }

  for (let i = 1; i <= 5; i++) {
    const bid = process.env[`FACEBOOK_BUSINESS_ID_${i}`]?.trim();
    if (bid !== businessId) continue;
    const pageId = process.env[`FACEBOOK_PAGE_ID_${i}`]?.trim();
    const token = process.env[`FACEBOOK_PAGE_ACCESS_TOKEN_${i}`]?.trim();
    if (pageId && token) return { pageId, token };
  }

  return null;
}
