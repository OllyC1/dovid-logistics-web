import type { DispatchReadiness } from "@/features/dispatch/readiness";

type LaunchReadinessPanelProps = {
  dispatch: DispatchReadiness;
  activeApprovedZones: number;
  activeRateCards: number;
  publicBookingsEnabled: boolean;
  livePaymentsEnabled: boolean;
  assistedBookingsEnabled: boolean;
};

function Gate({ label, value, ready, note }: { label: string; value: string; ready: boolean; note: string }) {
  return <article className="rounded-2xl bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-extrabold text-navy">{label}</p>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${ready ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>{ready ? "Recorded" : "Action needed"}</span>
    </div>
    <p className="mt-3 text-2xl font-extrabold text-navy">{value}</p>
    <p className="mt-2 text-sm leading-6 text-slate">{note}</p>
  </article>;
}

export function LaunchReadinessPanel(props: LaunchReadinessPanelProps) {
  const databaseReady = props.activeApprovedZones > 0
    && props.activeRateCards > 0
    && props.dispatch.automaticCapacityAvailable;

  return <section aria-labelledby="launch-readiness-heading" className={`mt-8 rounded-3xl border p-4 sm:p-6 ${databaseReady ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="eyebrow">Founder launch checklist</p>
        <h2 id="launch-readiness-heading" className="mt-1 text-2xl font-extrabold text-navy">{databaseReady ? "Core operating records are configured" : "Not ready for real deliveries"}</h2>
      </div>
      <span className={`w-fit rounded-full px-3 py-1 text-xs font-extrabold ${databaseReady ? "bg-emerald-700 text-white" : "bg-amber-900 text-white"}`}>{databaseReady ? "Database gates recorded" : "Complete the actions below"}</span>
    </div>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate">This summary uses the current database and deployment controls. It explains why a customer request may still be held even when its zone is active. Physical checks and founder approval must still be completed outside the software.</p>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Gate label="Coverage records" value={`${props.activeApprovedZones} active`} ready={props.activeApprovedZones > 0} note="Approved boundaries recorded in the database. Road and address field confirmation remains a separate founder check." />
      <Gate label="Commercial pricing" value={`${props.activeRateCards} active card${props.activeRateCards === 1 ? "" : "s"}`} ready={props.activeRateCards > 0} note="Only active, non-provisional rate cards count here. Profitability controls still apply to every quote." />
      <Gate label="Dispatch capacity" value={`${props.dispatch.availableParcelSlots} free slot${props.dispatch.availableParcelSlots === 1 ? "" : "s"}`} ready={props.dispatch.automaticCapacityAvailable} note={`${props.dispatch.readyMotorcycles} of ${props.dispatch.totalMotorcycles} motorcycles currently meet the recorded dispatch requirements.`} />
      <Gate label="Optional scheduling guidance" value={props.dispatch.scheduleBuffersConfigured || props.dispatch.riderRestRulesConfigured ? "Partly recorded" : "Not required"} ready note="Handover, end-of-day, continuous-riding and break values may be recorded as guidance, but they do not block otherwise feasible bookings." />
    </div>

    <div className="mt-5 rounded-2xl bg-white p-4">
      <h3 className="font-extrabold text-navy">Current safety switches</h3>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate sm:grid-cols-3">
        <li><strong className="text-navy">Public booking:</strong> {props.publicBookingsEnabled ? "open for controlled testing" : "closed"}</li>
        <li><strong className="text-navy">Live Paystack:</strong> {props.livePaymentsEnabled ? "enabled" : "disabled"}</li>
        <li><strong className="text-navy">Assisted confirmation:</strong> {props.assistedBookingsEnabled ? "enabled" : "disabled"}</li>
      </ul>
    </div>

    <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
      <a href="/admin/dispatch" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-navy px-4 py-2 text-sm font-bold text-white">Prepare motorcycles</a>
      <a href="/admin/team" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-navy/20 bg-white px-4 py-2 text-sm font-bold text-navy">Verify riders</a>
      <a href="/admin/coverage" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-navy/20 bg-white px-4 py-2 text-sm font-bold text-navy">Review coverage and hours</a>
      <a href="/admin/rate-cards" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-navy/20 bg-white px-4 py-2 text-sm font-bold text-navy">Review pricing</a>
    </div>

    <details className="mt-5 rounded-2xl border border-navy/10 bg-white p-4">
      <summary className="flex min-h-11 cursor-pointer items-center font-extrabold text-navy">Evidence the software cannot create for you</summary>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate">
        <li>Physical carrying-capacity measurements, safety inspection and verified rider identities. Plate, make, model, year and registration notes are optional company records.</li>
        <li>Founder field confirmation that the active Ibadan polygons match real roads and supported addresses.</li>
        <li>Encrypted owner-held backup storage with approved retention, recovery point and recovery time targets.</li>
        <li>A physical low-end Android and slow-network field observation, plus a provider-generated Paystack dispute exercise.</li>
      </ul>
    </details>
  </section>;
}
