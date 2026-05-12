export type FacebookPageCredentials = {
  pageId: string;
  accessToken: string;
};

/** Reads FACEBOOK_PAGE_ID_n + FACEBOOK_PAGE_ACCESS_TOKEN_n for n = 1,2,… until a pair is missing. Server-only. */
export function getFacebookPagesFromEnv(): FacebookPageCredentials[] {
  const out: FacebookPageCredentials[] = [];
  for (let i = 1; i <= 10; i++) {
    const pageId = process.env[`FACEBOOK_PAGE_ID_${i}`];
    const accessToken = process.env[`FACEBOOK_PAGE_ACCESS_TOKEN_${i}`];
    if (pageId?.trim() && accessToken?.trim()) {
      out.push({ pageId: pageId.trim(), accessToken: accessToken.trim() });
    }
  }
  return out;
}
