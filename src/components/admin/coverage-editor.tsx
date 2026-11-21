"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, MapPin, Save, ShieldCheck, Upload, XCircle } from "lucide-react";
import { isPointInZoneGeoJson, validateZoneGeoJson, zoneBoundariesOverlap, type ZoneGeoJson } from "@/features/service-areas/geometry";
import { Button } from "@/components/ui/button";
import { AddressAutocomplete, type AddressValue } from "@/components/maps/address-autocomplete";
import { ReasonDialog } from "@/components/ui/reason-dialog";

export type CoverageZone = {
  id: string;
  name: string;
  code: string;
  boundary_geojson: ZoneGeoJson | null;
  operational_status: "draft" | "in_review" | "approved" | "active" | "suspended";
  booking_eligibility: "standard" | "manual_approval" | "unavailable";
  dispatch_approval_required: boolean;
  priority: number;
  effective_from: string;
  effective_until: string | null;
  boundary_source: string | null;
  review_notes: string | null;
  is_citywide: boolean;
  affectedOrders: number;
};

export type OperationalSettings = {
  service_area_id: string;
  standard_max_distance_meters: number;
  manual_max_distance_meters: number;
  max_active_assignments_per_rider: number;
  standard_package_sizes: string[];
  oversized_requires_manual_approval: boolean;
  service_hours: { timezone: string; monday: [string, string] | null; tuesday: [string, string] | null; wednesday: [string, string] | null; thursday: [string, string] | null; friday: [string, string] | null; saturday: [string, string] | null; sunday: [string, string] | null };
  same_day_booking_cutoff: string;
  handover_buffer_minutes: number | null;
  safe_completion_buffer_minutes: number | null;
  waiting_free_minutes: number | null;
  waiting_fee_per_minute_kobo: number | null;
  maximum_continuous_riding_minutes: number | null;
  minimum_break_minutes: number | null;
  motorcycle_restrictions_confirmed_at: string | null;
  motorcycle_restrictions_notes: string | null;
};

type ServiceDay = Exclude<keyof OperationalSettings["service_hours"], "timezone">;
const serviceDays: Array<{ key: ServiceDay; label: string }> = [
  { key: "monday", label: "Monday" }, { key: "tuesday", label: "Tuesday" }, { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" }, { key: "friday", label: "Friday" }, { key: "saturday", label: "Saturday" }, { key: "sunday", label: "Sunday" },
];

function nullableNumber(value: string) {
  return value === "" ? null : Number(value);
}

type MapListener = { remove(): void };
type MapLatLng = { lat(): number; lng(): number };
type MapPath = { getArray(): MapLatLng[]; addListener(event: string, handler: () => void): MapListener };
type MapBounds = { extend(position: { lat: number; lng: number }): void; isEmpty(): boolean };
type MapInstance = { addListener(event: string, handler: (event: { latLng?: MapLatLng }) => void): MapListener; panTo(position: { lat: number; lng: number }): void; setZoom(zoom: number): void; fitBounds(bounds: MapBounds, padding?: number): void };
type PolygonInstance = { setMap(map: MapInstance | null): void; setPath(path: Array<{ lat: number; lng: number }>): void; getPath(): MapPath };
type MapsApi = {
  Map: new(element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  LatLngBounds: new() => MapBounds;
  Polygon: new(options: Record<string, unknown>) => PolygonInstance;
  importLibrary?: (name: string) => Promise<Record<string, unknown>>;
};

declare global { interface Window { google?: { maps: MapsApi }; gm_authFailure?: () => void } }

function polygonPaths(boundary: ZoneGeoJson | null) {
  if (!boundary) return [];
  const geometry = boundary.type === "Feature" ? boundary.geometry : boundary;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon[0].slice(0, -1).map(([longitude, latitude]) => ({ lat: latitude, lng: longitude })));
}

function polygonPath(boundary: ZoneGeoJson | null) {
  return polygonPaths(boundary)[0] ?? [];
}

function pathsToGeoJson(paths: MapLatLng[][]): ZoneGeoJson | null {
  if (paths.some((path) => path.length < 3)) return null;
  const polygons = paths.map((path) => {
    const ring = path.map((point) => [point.lng(), point.lat()]);
    ring.push([...ring[0]]);
    return [ring];
  });
  return { type: "Feature", properties: {}, geometry: polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons } };
}

function pathToGeoJson(path: MapLatLng[]): ZoneGeoJson | null {
  return pathsToGeoJson([path]);
}

export function CoverageEditor({ initialZones, settings: initialSettings, mapsKey, canPublish = false }: { initialZones: CoverageZone[]; settings: OperationalSettings; mapsKey?: string; canPublish?: boolean }) {
  const [zones, setZones] = useState(initialZones);
  const [selectedId, setSelectedId] = useState(initialZones[0]?.id ?? "");
  const selected = zones.find((zone) => zone.id === selectedId) ?? zones[0];
  const [draft, setDraft] = useState(selected);
  const [boundary, setBoundary] = useState<ZoneGeoJson | null>(selected?.boundary_geojson ?? null);
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [zoneAction, setZoneAction] = useState<"review" | "approve" | "activate" | "publish" | "suspend" | null>(null);
  const [drawing, setDrawing] = useState(false);
  const drawingPoints = useRef<MapLatLng[]>([]);
  const [previewMode, setPreviewMode] = useState<"pickup" | "delivery" | null>(null);
  const [preview, setPreview] = useState<{ pickup?: { latitude: number; longitude: number }; delivery?: { latitude: number; longitude: number } }>({});
  const [mapSearch, setMapSearch] = useState<AddressValue>({ address: "", latitude: "", longitude: "" });
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const polygons = useRef<PolygonInstance[]>([]);
  const fitBoundary = useRef(true);
  const [mapsReady, setMapsReady] = useState(typeof window !== "undefined" && Boolean(window.google?.maps?.Map));
  const [mapsError, setMapsError] = useState<"missing_key" | "authentication" | "network" | null>(mapsKey ? null : "missing_key");

  useEffect(() => {
    if (!mapsKey) return;
    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      setMapsReady(false);
      setMapsError("authentication");
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-dovid-maps]");
    const loaded = async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          if (!window.google?.maps) throw new Error("Google Maps did not load.");
          if (!window.google.maps.Map && window.google.maps.importLibrary) await window.google.maps.importLibrary("maps");
          if (window.google.maps.Map) {
            setMapsReady(true);
            setMapsError(null);
            return;
          }
        } catch {
          // The asynchronous bootstrap can expose importLibrary before the maps library is ready.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      setMapsReady(false);
      setMapsError("network");
    };
    const failed = () => { setMapsReady(false); setMapsError("network"); };
    const handleLoad = () => { void loaded(); };
    if (window.google?.maps) {
      void loaded();
      return () => { window.gm_authFailure = previousAuthFailure; };
    }
    if (existing) {
      existing.addEventListener("load", handleLoad, { once: true });
      existing.addEventListener("error", failed, { once: true });
      return () => { existing.removeEventListener("load", handleLoad); existing.removeEventListener("error", failed); window.gm_authFailure = previousAuthFailure; };
    }
    const script = document.createElement("script");
    script.dataset.dovidMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}&v=weekly&loading=async`;
    script.async = true;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", failed, { once: true });
    document.head.append(script);
    return () => { script.removeEventListener("load", handleLoad); script.removeEventListener("error", failed); window.gm_authFailure = previousAuthFailure; };
  }, [mapsKey]);

  useEffect(() => {
    if (!mapsReady || !mapElement.current || map.current || !window.google?.maps) return;
    map.current = new window.google.maps.Map(mapElement.current, { center: { lat: 7.38, lng: 3.95 }, zoom: 12, mapTypeControl: true, streetViewControl: false });
  }, [mapsReady]);

  useEffect(() => {
    if (!map.current || !window.google?.maps) return;
    polygons.current.forEach((polygon) => polygon.setMap(null));
    const paths = polygonPaths(boundary);
    if (!paths.length) { polygons.current = []; return; }
    const nextPolygons = paths.map((path, index) => new window.google!.maps.Polygon({ map: map.current!, paths: path, editable: paths.length === 1, draggable: false, strokeColor: index === 0 ? "#F36C21" : "#F39A21", strokeOpacity: 1, strokeWeight: 3, fillColor: "#F36C21", fillOpacity: 0.2 }));
    polygons.current = nextPolygons;
    if (fitBoundary.current) {
      const bounds = new window.google.maps.LatLngBounds();
      paths.flat().forEach((position) => bounds.extend(position));
      if (!bounds.isEmpty()) map.current.fitBounds(bounds, 48);
      fitBoundary.current = false;
    }
    const sync = () => setBoundary(pathsToGeoJson(nextPolygons.map((polygon) => polygon.getPath().getArray())));
    const listeners = nextPolygons.flatMap((polygon) => [
      polygon.getPath().addListener("insert_at", sync),
      polygon.getPath().addListener("set_at", sync),
      polygon.getPath().addListener("remove_at", sync),
    ]);
    return () => listeners.forEach((listener) => listener.remove());
  }, [boundary, selectedId, mapsReady]);

  useEffect(() => {
    if (!map.current || (!drawing && !previewMode)) return;
    const listener = map.current.addListener("click", (event) => {
      if (!event.latLng) return;
      const point = { latitude: event.latLng.lat(), longitude: event.latLng.lng() };
      if (previewMode) { setPreview((current) => ({ ...current, [previewMode]: point })); setPreviewMode(null); return; }
      const next = [...drawingPoints.current, event.latLng as MapLatLng];
      drawingPoints.current = next;
      const nextBoundary = pathToGeoJson(next);
      if (nextBoundary) setBoundary(nextBoundary);
    });
    return () => listener.remove();
  }, [drawing, previewMode, boundary]);

  const validation = useMemo(() => boundary ? validateZoneGeoJson(boundary) : { valid: false, issues: ["Draw or import a reviewed polygon before requesting approval."] }, [boundary]);
  const overlaps = useMemo(() => boundary && !draft?.is_citywide ? zones.filter((zone) => zone.id !== selectedId && !zone.is_citywide && zone.boundary_geojson && zoneBoundariesOverlap(boundary, zone.boundary_geojson)).map((zone) => zone.name) : [], [boundary, draft?.is_citywide, zones, selectedId]);
  const actionGuidance = !validation.valid
    ? validation.issues[0]
    : overlaps.length
      ? `Resolve the overlap with ${overlaps.join(", ")} first.`
      : draft?.operational_status === "draft"
        ? "Next step: request review. Activate is disabled because approval has not happened."
        : draft?.operational_status === "in_review"
          ? "Next step: approve. Activate is disabled until approval succeeds."
          : draft?.operational_status === "approved"
            ? "Next step: activate. Customers do not use this zone until activation succeeds."
            : draft?.operational_status === "active"
              ? "This zone is live. Saving a changed boundary will return it to Draft and deactivate it."
              : "This zone is suspended. Request review to restart its audit and publication workflow.";
  const previewMessage = useMemo(() => {
    if (!preview.pickup || !preview.delivery || !boundary) return "Click the map to set both preview points.";
    const covered = isPointInZoneGeoJson(preview.pickup, boundary) && isPointInZoneGeoJson(preview.delivery, boundary);
    return covered ? "Great! We can check delivery availability for this route." : "We're not delivering to this location just yet.";
  }, [preview, boundary]);

  if (!draft) return <p>No coverage zones are configured.</p>;

  async function persistDraft() {
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/coverage/zones/${draft.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.name, code: draft.code, boundaryGeoJson: boundary, bookingEligibility: draft.booking_eligibility, dispatchApprovalRequired: draft.dispatch_approval_required, priority: Number(draft.priority), effectiveFrom: new Date(draft.effective_from).toISOString(), effectiveUntil: draft.effective_until ? new Date(draft.effective_until).toISOString() : null, boundarySource: draft.boundary_source, reviewNotes: draft.review_notes }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) { setMessage(body.error ?? "The draft could not be saved."); return null; }
    const nextStatus = body.operationalStatus as CoverageZone["operational_status"];
    setZones((current) => current.map((zone) => zone.id === draft.id ? { ...draft, boundary_geojson: boundary, operational_status: nextStatus } : zone));
    setDraft((current) => current ? { ...current, operational_status: nextStatus } : current);
    return body;
  }

  async function saveDraft() {
    const body = await persistDraft();
    if (!body) return;
    setMessage(body.overlaps?.length ? `Draft saved as ${body.operationalStatus}. Review overlaps with ${body.overlaps.map((item: { name: string }) => item.name).join(", ")}.` : `Draft saved as ${body.operationalStatus.replaceAll("_", " ")}. It will become active only after approval.`);
  }

  async function performAction(action: "review" | "approve" | "activate" | "publish" | "suspend", reason: string) {
    if (action === "publish" && !(await persistDraft())) return;
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/coverage/zones/${draft.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setMessage(body.error ?? "The action could not be completed.");
    const nextStatus = action === "review" ? "in_review" : action === "approve" ? "approved" : action === "activate" || action === "publish" ? "active" : "suspended";
    setZones((current) => current.map((zone) => zone.id === draft.id ? { ...zone, operational_status: nextStatus } : zone));
    setDraft((current) => current ? { ...current, operational_status: nextStatus } : current);
    setZoneAction(null);
    setMessage(action === "publish" ? "Zone saved, reviewed, approved, activated and recorded." : `Zone ${action} completed and recorded.`);
  }

  async function saveSettings() {
    setPending(true); setMessage("");
    const response = await fetch("/api/admin/coverage/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceAreaId: settings.service_area_id, standardMaxDistanceMeters: Number(settings.standard_max_distance_meters), manualMaxDistanceMeters: Number(settings.manual_max_distance_meters), maxActiveAssignmentsPerRider: Number(settings.max_active_assignments_per_rider), standardPackageSizes: settings.standard_package_sizes, oversizedRequiresManualApproval: settings.oversized_requires_manual_approval, serviceHours: settings.service_hours, sameDayBookingCutoff: settings.same_day_booking_cutoff.slice(0, 5), handoverBufferMinutes: settings.handover_buffer_minutes, safeCompletionBufferMinutes: settings.safe_completion_buffer_minutes, waitingFreeMinutes: settings.waiting_free_minutes, waitingFeePerMinuteKobo: settings.waiting_fee_per_minute_kobo, maximumContinuousRidingMinutes: settings.maximum_continuous_riding_minutes, minimumBreakMinutes: settings.minimum_break_minutes, motorcycleRestrictionsConfirmed: Boolean(settings.motorcycle_restrictions_confirmed_at), motorcycleRestrictionsNotes: settings.motorcycle_restrictions_notes }) });
    const body = await response.json(); setPending(false); setMessage(response.ok ? "Operational thresholds saved." : body.error ?? "Settings could not be saved.");
  }

  function importGeoJson(file: File | undefined) {
    if (!file) return;
    void file.text().then((text) => { try { const parsed = JSON.parse(text) as unknown; const check = validateZoneGeoJson(parsed); if (!check.valid) return setMessage(check.issues.join(" ")); const importedBoundary = parsed as ZoneGeoJson; fitBoundary.current = true; setBoundary(importedBoundary); drawingPoints.current = polygonPath(importedBoundary).map((position) => ({ lat: () => position.lat, lng: () => position.lng })); setMessage("GeoJSON imported into the draft. Save it before review."); } catch { setMessage("That file is not valid JSON."); } });
  }

  function selectZone(zone: CoverageZone) {
    fitBoundary.current = true;
    setSelectedId(zone.id);
    setDraft(zone);
    setBoundary(zone.boundary_geojson);
    drawingPoints.current = polygonPath(zone.boundary_geojson).map((position) => ({ lat: () => position.lat, lng: () => position.lng }));
    setMessage("");
    setPreview({});
    setMapSearch({ address: "", latitude: "", longitude: "" });
  }

  function locateAddress(value: AddressValue) {
    setMapSearch(value);
    if (!map.current || !value.latitude || !value.longitude) return;
    map.current.panTo({ lat: Number(value.latitude), lng: Number(value.longitude) });
    map.current.setZoom(16);
    setMessage("Address located. Use it to review the draft boundary; selecting an address does not change the polygon.");
  }

  function exportGeoJson() {
    if (!boundary) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(boundary, null, 2)], { type: "application/geo+json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${draft.code.toLowerCase()}-draft.geojson`; link.click(); URL.revokeObjectURL(url);
  }

  return <div className="grid gap-8">
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <aside className="rounded-3xl bg-white p-4 shadow-sm"><p className="px-3 text-xs font-bold uppercase tracking-widest text-orange">Service zones</p><div className="mt-3 grid gap-2">{zones.map((zone) => <button key={zone.id} type="button" onClick={() => selectZone(zone)} className={`rounded-2xl p-3 text-left ${zone.id === selectedId ? "bg-navy text-white" : "bg-cloud text-navy"}`}><span className="font-extrabold">{zone.code} · {zone.name}</span><span className="mt-1 block text-xs capitalize opacity-70">{zone.operational_status.replaceAll("_", " ")} · {zone.affectedOrders} affected orders</span></button>)}</div></aside>
      <section className="grid gap-5 rounded-3xl bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-navy">Name<input className="rounded-xl border p-3 font-normal" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><label className="grid gap-2 text-sm font-bold text-navy">Code<input className="rounded-xl border p-3 font-normal" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}/></label></div>
        <div className="rounded-2xl border border-navy/10 bg-cloud p-4" aria-label="Zone workflow">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-orange">Current status</p><p className="mt-1 text-lg font-extrabold capitalize text-navy">{draft.operational_status.replaceAll("_", " ")}</p></div><span className={`rounded-full px-4 py-2 text-sm font-bold ${draft.operational_status === "active" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{draft.operational_status === "active" ? "Live for eligible customers" : "Not live for zone-specific bookings"}</span></div>
          <ol className="mt-4 grid gap-2 text-sm leading-6 text-slate"><li className={draft.operational_status === "draft" ? "font-bold text-navy" : ""}>1. Draft — save the reviewed boundary and operating details.</li><li className={draft.operational_status === "in_review" ? "font-bold text-navy" : ""}>2. In review — an authorized staff member checks the evidence.</li><li className={draft.operational_status === "approved" ? "font-bold text-navy" : ""}>3. Approved — the exact boundary hash is locked for audit.</li><li className={draft.operational_status === "active" ? "font-bold text-navy" : ""}>4. Active — the zone participates in live booking decisions.</li></ol>
          {draft.operational_status === "active" ? <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-slate">Editing and saving a boundary immediately deactivates this zone and returns it to Draft. Publish it again before customers can use the changed boundary.</p> : <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-slate">While this zone is not active, the whole-Ibadan fallback may still cover the route as manual approval, or the route may be unavailable.</p>}
        </div>
        <details className="group rounded-2xl bg-cloud p-4" open><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-navy"><span>How to review a zone</span><span aria-hidden="true" className="text-orange transition group-open:rotate-45">+</span></summary><ol className="mt-3 grid gap-2 text-sm leading-6 text-slate"><li><strong className="text-navy">1.</strong> Find a familiar address and inspect the surrounding roads.</li><li><strong className="text-navy">2.</strong> Draw or import a reviewed boundary; do not guess neighbourhood edges.</li><li><strong className="text-navy">3.</strong> Preview pickup and destination, save the draft, then request review.</li><li><strong className="text-navy">4.</strong> Regular admins follow review → approval → activation. The Super Admin can save and publish the same audited sequence in one action.</li></ol></details>
        <details className="group rounded-2xl border border-navy/10 p-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-navy"><span>How this affects customer booking</span><span aria-hidden="true" className="text-orange transition group-open:rotate-45">+</span></summary><div className="mt-3 grid gap-3 text-sm leading-6 text-slate"><p><strong className="text-navy">1. Zone match:</strong> the pickup, destination and any additional stop must be covered. Lower priority numbers are checked first; the whole-Ibadan zone is the manual-approval fallback after Zones A–F.</p><p><strong className="text-navy">2. Booking eligibility:</strong> Standard continues automatically when every other rule passes. Manual approval creates a dispatch request with a reference and notifies dispatch admins. Unavailable rejects coverage; it cannot be published.</p><p><strong className="text-navy">3. Live state:</strong> Draft, In review, Approved and Suspended zones do not participate. Approved still is not live until it is activated.</p><p><strong className="text-navy">4. After geography:</strong> service hours, the 20:00 same-day cutoff, route distance, fleet capacity, package size, waiting and safety rules can still stop or route a booking for approval.</p><p><strong className="text-navy">5. Manual dispatch:</strong> the customer contacts dispatch or checks the reference later. Approval lets that customer continue to the quote; rejection returns the recorded reason.</p><p><strong className="text-navy">Impact count:</strong> this zone appears on {draft.affectedOrders} recorded historical orders. Future quotes are affected only by the currently active version.</p></div></details>
        <div className="relative min-h-[360px] overflow-hidden rounded-2xl bg-cloud sm:min-h-[480px]" aria-label="Ibadan service zone map"><div ref={mapElement} className="absolute inset-0" />{mapsError ? <div role="alert" className="absolute inset-0 z-10 grid place-items-center bg-cloud/95 p-6"><div className="max-w-lg rounded-3xl bg-white p-5 text-center shadow-sm"><XCircle className="mx-auto size-8 text-orange"/><h3 className="mt-3 text-lg font-extrabold text-navy">The map could not open</h3><p className="mt-2 text-sm leading-6 text-slate">{mapsError === "missing_key" ? "The browser map key is not configured for this deployment." : mapsError === "authentication" ?         "Google rejected this website's browser key. Check that Maps JavaScript API and billing are enabled, then allow https://dovidlogistics.com/* in the key's website restrictions." : "The map service did not load. Check the connection and try again."}</p><p className="mt-3 text-xs leading-5 text-slate">GeoJSON import, export and validation remain available; no zone can be activated from an unreviewed boundary.</p></div></div> : null}</div>
        <AddressAutocomplete label="Find an address to review against this boundary" value={mapSearch} onChange={locateAddress} required={false} showMapPreview={false}/>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => { setDrawing((value) => !value); drawingPoints.current = polygonPath(boundary).map((position) => ({ lat: () => position.lat, lng: () => position.lng })); }}><MapPin className="mr-2 size-4"/>{drawing ? "Finish drawing" : "Add boundary points"}</Button><label className="inline-flex cursor-pointer items-center rounded-full border border-navy/15 px-4 py-2 text-sm font-bold text-navy"><Upload className="mr-2 size-4"/>Import GeoJSON<input className="sr-only" type="file" accept=".json,.geojson,application/geo+json" onChange={(event) => importGeoJson(event.target.files?.[0])}/></label><Button type="button" variant="outline" disabled={!boundary} onClick={exportGeoJson}><Download className="mr-2 size-4"/>Export</Button><Button type="button" variant="ghost" onClick={() => { setBoundary(null); drawingPoints.current = []; }}>Clear draft</Button></div>
        <div className={`rounded-2xl p-4 text-sm ${validation.valid && !overlaps.length ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{validation.valid ? <p><CheckCircle2 className="mr-2 inline size-4"/>Polygon structure is valid.</p> : validation.issues.map((issue) => <p key={issue}><XCircle className="mr-2 inline size-4"/>{issue}</p>)}{overlaps.length ? <p className="mt-2 font-bold">Overlap detected with {overlaps.join(", ")}.</p> : null}</div>
        <div className="grid gap-4 sm:grid-cols-3"><label className="grid gap-2 text-sm font-bold text-navy">Booking eligibility<select className="rounded-xl border p-3 font-normal" value={draft.booking_eligibility} onChange={(event) => setDraft({ ...draft, booking_eligibility: event.target.value as CoverageZone["booking_eligibility"] })}><option value="unavailable">Unavailable</option><option value="manual_approval">Manual approval</option><option value="standard">Standard eligible</option></select></label><label className="grid gap-2 text-sm font-bold text-navy">Priority<input type="number" className="rounded-xl border p-3 font-normal" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}/></label><label className="flex items-center gap-3 rounded-xl border p-3 text-sm font-bold text-navy"><input type="checkbox" checked={draft.dispatch_approval_required} onChange={(event) => setDraft({ ...draft, dispatch_approval_required: event.target.checked })}/>Dispatch approval required</label></div>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-navy">Effective from<input type="datetime-local" className="rounded-xl border p-3 font-normal" value={draft.effective_from.slice(0, 16)} onChange={(event) => setDraft({ ...draft, effective_from: event.target.value })}/></label><label className="grid gap-2 text-sm font-bold text-navy">Effective until<input type="datetime-local" className="rounded-xl border p-3 font-normal" value={draft.effective_until?.slice(0, 16) ?? ""} onChange={(event) => setDraft({ ...draft, effective_until: event.target.value || null })}/></label></div>
        <label className="grid gap-2 text-sm font-bold text-navy">Boundary source and review evidence<input className="rounded-xl border p-3 font-normal" value={draft.boundary_source ?? ""} onChange={(event) => setDraft({ ...draft, boundary_source: event.target.value || null })} placeholder="Reviewed file, survey or authority source"/></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Review notes<textarea className="min-h-24 rounded-xl border p-3 font-normal" value={draft.review_notes ?? ""} onChange={(event) => setDraft({ ...draft, review_notes: event.target.value || null })}/></label>
        <p role="note" className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Workflow:</strong> {actionGuidance}</p>
        <div className="grid gap-2 sm:flex sm:flex-wrap"><Button disabled={pending} onClick={saveDraft}><Save className="mr-2 size-4"/>Save draft</Button>{canPublish ? <Button disabled={pending || !validation.valid || Boolean(overlaps.length) || draft.booking_eligibility === "unavailable"} onClick={() => setZoneAction("publish")}><ShieldCheck className="mr-2 size-4"/>Save and publish zone</Button> : null}<Button variant="outline" disabled={pending || !validation.valid || Boolean(overlaps.length) || draft.operational_status === "in_review"} onClick={() => setZoneAction("review")}>Request review</Button><Button variant="outline" disabled={pending || draft.operational_status !== "in_review" || Boolean(overlaps.length)} onClick={() => setZoneAction("approve")}><ShieldCheck className="mr-2 size-4"/>Approve</Button><Button disabled={pending || draft.operational_status !== "approved" || Boolean(overlaps.length)} onClick={() => setZoneAction("activate")}>Activate</Button><Button variant="ghost" disabled={pending || draft.operational_status !== "active"} onClick={() => setZoneAction("suspend")}>Suspend</Button></div>
        <div className="rounded-2xl bg-cloud p-4"><p className="font-bold text-navy">Eligibility preview</p><p className="mt-1 text-sm text-slate">Choose pickup or destination, then click the map. This preview checks the selected polygon only; live booking also checks roads, hours, capacity and pricing.</p><div className="mt-3 flex gap-2"><Button variant="outline" onClick={() => setPreviewMode("pickup")}>Set pickup</Button><Button variant="outline" onClick={() => setPreviewMode("delivery")}>Set destination</Button></div><p className="mt-3 text-sm font-bold text-navy">{previewMessage}</p></div>
      </section>
    </div>
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-extrabold text-navy">Operating rules</h2><p className="mt-2 text-sm text-slate">Set safe hours and capacity rules. These controls never replace route, payment or profitability checks.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="grid gap-2 text-sm font-bold text-navy">Standard maximum (km)<input type="number" className="rounded-xl border p-3 font-normal" value={settings.standard_max_distance_meters / 1000} onChange={(event) => setSettings({ ...settings, standard_max_distance_meters: Math.round(Number(event.target.value) * 1000) })}/></label><label className="grid gap-2 text-sm font-bold text-navy">Manual maximum (km)<input type="number" className="rounded-xl border p-3 font-normal" value={settings.manual_max_distance_meters / 1000} onChange={(event) => setSettings({ ...settings, manual_max_distance_meters: Math.round(Number(event.target.value) * 1000) })}/></label><label className="grid gap-2 text-sm font-bold text-navy">Assignments per rider<input type="number" min={1} max={10} className="rounded-xl border p-3 font-normal" value={settings.max_active_assignments_per_rider} onChange={(event) => setSettings({ ...settings, max_active_assignments_per_rider: Number(event.target.value) })}/></label></div>
      <div className="mt-6 grid gap-3"><p className="text-sm font-extrabold text-navy">Service hours · Africa/Lagos</p>{serviceDays.map(({ key, label }) => { const hours = settings.service_hours[key]; return <div key={key} className="grid items-center gap-3 rounded-2xl bg-cloud p-3 sm:grid-cols-[120px_1fr_1fr_auto]"><span className="text-sm font-bold text-navy">{label}</span><input aria-label={`${label} opens`} disabled={!hours} type="time" value={hours?.[0] ?? "07:00"} onChange={(event) => setSettings({ ...settings, service_hours: { ...settings.service_hours, [key]: [event.target.value, hours?.[1] ?? "22:00"] } })} className="rounded-xl border bg-white p-3"/><input aria-label={`${label} closes`} disabled={!hours} type="time" value={hours?.[1] ?? "22:00"} onChange={(event) => setSettings({ ...settings, service_hours: { ...settings.service_hours, [key]: [hours?.[0] ?? "07:00", event.target.value] } })} className="rounded-xl border bg-white p-3"/><label className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-navy"><input type="checkbox" checked={Boolean(hours)} onChange={(event) => setSettings({ ...settings, service_hours: { ...settings.service_hours, [key]: event.target.checked ? ["07:00", "22:00"] : null } })}/>Open</label></div>; })}</div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3"><label className="grid gap-2 text-sm font-bold text-navy">Same-day cutoff<input type="time" value={settings.same_day_booking_cutoff.slice(0, 5)} onChange={(event) => setSettings({ ...settings, same_day_booking_cutoff: event.target.value })} className="rounded-xl border p-3 font-normal"/></label><label className="grid gap-2 text-sm font-bold text-navy">Handover buffer (minutes)<input type="number" min={0} max={240} value={settings.handover_buffer_minutes ?? ""} onChange={(event) => setSettings({ ...settings, handover_buffer_minutes: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label><label className="grid gap-2 text-sm font-bold text-navy">Completion buffer (minutes)<input type="number" min={0} max={240} value={settings.safe_completion_buffer_minutes ?? ""} onChange={(event) => setSettings({ ...settings, safe_completion_buffer_minutes: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-4"><label className="grid gap-2 text-sm font-bold text-navy">Free waiting (minutes)<input type="number" min={0} max={240} value={settings.waiting_free_minutes ?? ""} onChange={(event) => setSettings({ ...settings, waiting_free_minutes: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label><label className="grid gap-2 text-sm font-bold text-navy">Waiting fee (kobo/minute)<input type="number" min={0} value={settings.waiting_fee_per_minute_kobo ?? ""} onChange={(event) => setSettings({ ...settings, waiting_fee_per_minute_kobo: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label><label className="grid gap-2 text-sm font-bold text-navy">Continuous riding limit<input type="number" min={15} max={480} value={settings.maximum_continuous_riding_minutes ?? ""} onChange={(event) => setSettings({ ...settings, maximum_continuous_riding_minutes: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label><label className="grid gap-2 text-sm font-bold text-navy">Minimum break (minutes)<input type="number" min={5} max={180} value={settings.minimum_break_minutes ?? ""} onChange={(event) => setSettings({ ...settings, minimum_break_minutes: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label></div>
      <div className="mt-4 grid gap-3 rounded-2xl border p-4"><label className="flex items-center gap-3 text-sm font-bold text-navy"><input type="checkbox" checked={Boolean(settings.motorcycle_restrictions_confirmed_at)} onChange={(event) => setSettings({ ...settings, motorcycle_restrictions_confirmed_at: event.target.checked ? new Date().toISOString() : null })}/>Motorcycle access restrictions have been operationally reviewed</label><textarea value={settings.motorcycle_restrictions_notes ?? ""} onChange={(event) => setSettings({ ...settings, motorcycle_restrictions_notes: event.target.value || null })} placeholder="Record reviewed roads, time restrictions and evidence. Do not guess." className="min-h-24 rounded-xl border p-3 text-sm"/></div>
      <Button className="mt-5" disabled={pending} onClick={saveSettings}>Save operating rules</Button>
    </section>
    {message ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p> : null}
    <ReasonDialog
      open={Boolean(zoneAction)}
      title={`${zoneAction ? zoneAction[0].toUpperCase() + zoneAction.slice(1) : "Update"} ${draft.name}?`}
      description={zoneAction === "publish" ? "This saves the current edits, immediately deactivates any previous version, then completes review, approval and activation atomically with a complete audit trail." : "Zone state changes affect future eligibility decisions and must remain auditable. Activation is allowed only after geometry review and approval."}
      confirmLabel={zoneAction === "review" ? "Request review" : zoneAction === "approve" ? "Approve zone" : zoneAction === "activate" ? "Activate zone" : zoneAction === "publish" ? "Save and publish" : "Suspend zone"}
      pending={pending}
      onCancel={() => setZoneAction(null)}
      onConfirm={(reason) => zoneAction ? performAction(zoneAction, reason) : undefined}
    />
  </div>;
}
