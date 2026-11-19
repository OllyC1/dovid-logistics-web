export default function Loading() {
  return (
    <section
      className="mx-auto grid min-h-[55vh] w-full max-w-3xl content-center gap-5 px-4 py-12 sm:px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="grid gap-3">
        <span className="h-3 w-24 rounded-full bg-orange/30 motion-safe:animate-pulse" aria-hidden="true" />
        <h1 className="text-2xl font-extrabold text-navy sm:text-3xl">Loading your page…</h1>
        <p className="max-w-xl text-sm leading-6 text-slate sm:text-base">
          Please wait a moment. Your request is being prepared.
        </p>
      </div>
      <div className="grid gap-3" aria-hidden="true">
        <span className="h-16 rounded-2xl bg-cloud motion-safe:animate-pulse" />
        <span className="h-16 rounded-2xl bg-cloud motion-safe:animate-pulse" />
      </div>
    </section>
  );
}
