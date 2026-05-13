/** Instant shell while navigating between dashboard routes — real data mounts on the destination page. */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-56 rounded-md bg-muted" />
      <div className="h-4 max-w-xl rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-[88px] rounded-xl bg-muted sm:col-span-1" />
        <div className="h-[88px] rounded-xl bg-muted sm:col-span-1" />
        <div className="h-[88px] rounded-xl bg-muted sm:col-span-1" />
      </div>
      <div className="h-56 rounded-xl bg-muted lg:h-64" />
    </div>
  );
}
