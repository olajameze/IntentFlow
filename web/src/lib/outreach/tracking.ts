/** Rewrite CTA links and inject open-tracking pixel before send. */
export function injectTracking(html: string, prospectId: string, baseUrl: string): string {
  if (!html || !baseUrl) return html;

  let out = html;

  out = out.replace(
    /<a\b([^>]*?)\bdata-outreach-cta="true"([^>]*?)\bhref="([^"]+)"([^>]*)>/gi,
    (_match, pre, mid, href, post) => {
      const tracked = `${baseUrl}/api/outreach-track/click?p=${encodeURIComponent(prospectId)}&to=${encodeURIComponent(href)}`;
      return `<a${pre}data-outreach-cta="true"${mid}href="${tracked}"${post}>`;
    },
  );
  out = out.replace(
    /<a\b([^>]*?)\bhref="([^"]+)"([^>]*?)\bdata-outreach-cta="true"([^>]*)>/gi,
    (_match, pre, href, mid, post) => {
      const tracked = `${baseUrl}/api/outreach-track/click?p=${encodeURIComponent(prospectId)}&to=${encodeURIComponent(href)}`;
      return `<a${pre}href="${tracked}"${mid}data-outreach-cta="true"${post}>`;
    },
  );

  const pixel = `<img src="${baseUrl}/api/outreach-track/open?p=${encodeURIComponent(prospectId)}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" />`;
  if (out.includes("<!-- OUTREACH_TRACKING_PIXEL -->")) {
    out = out.replace("<!-- OUTREACH_TRACKING_PIXEL -->", pixel);
  } else if (out.includes("</body>")) {
    out = out.replace("</body>", `${pixel}</body>`);
  } else {
    out += pixel;
  }

  return out;
}

export function htmlToPlain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}
