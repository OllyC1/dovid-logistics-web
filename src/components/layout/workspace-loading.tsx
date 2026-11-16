export function WorkspaceLoading({ label = "Loading your workspace" }: { label?: string }) {
  return <div className="grid gap-5" role="status" aria-live="polite" aria-label={label}>
    <div className="h-4 w-28 animate-pulse rounded-full bg-orange/20" />
    <div className="h-10 w-3/4 max-w-md animate-pulse rounded-2xl bg-navy/10" />
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="h-36 animate-pulse rounded-3xl bg-white shadow-sm" />
      <div className="h-36 animate-pulse rounded-3xl bg-white shadow-sm" />
    </div>
    <div className="h-56 animate-pulse rounded-3xl bg-white shadow-sm" />
    <span className="sr-only">{label}…</span>
  </div>;
}
