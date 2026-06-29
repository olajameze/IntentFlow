/** Microsoft Clarity — free analytics, heatmaps, session replay. */

export function normalizeClarityProjectId(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (!/^[a-z0-9]{5,32}$/i.test(t)) return null;
  return t;
}

export function clarityProjectIdInvalidMessage(): string {
  return "Clarity project ID should be 5–32 letters/numbers (from clarity.microsoft.com → your project → Settings).";
}

export function clarityTrackingSnippet(projectId: string): string {
  const id = normalizeClarityProjectId(projectId);
  if (!id) {
    return "<!-- Set clarity_project_id in Settings first -->";
  }
  return `<script type="text/javascript">
(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${id}");
</script>`;
}

export function clarityDashboardUrl(projectId: string): string | null {
  const id = normalizeClarityProjectId(projectId);
  if (!id) return null;
  return `https://clarity.microsoft.com/projects/view/${id}/dashboard`;
}

export function clarityProjectsHomeUrl(): string {
  return "https://clarity.microsoft.com/projects";
}
