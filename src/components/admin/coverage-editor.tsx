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
type MapInstance = { addListener(event: string, handler: (event: { latLng?: MapLatLng }) => void): MapListener; panTo(position: { lat: number; lng: number }): void; setZoom(zoom: number): void };
type PolygonInstance = { setMap(map: MapInstance | null): void; setPath(path: Array<{ lat: number; lng: number }>): void; getPath(): MapPath };
type MapsApi = {
  Map: new(element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Polygon: new(options: Record<string, unknown>) => PolygonInstance;
};

declare global { interface Window { google?: { maps: MapsApi } } }

function polygonPath(boundary: ZoneGeoJson | null) {
  if (!boundary) return [];
  const geometry = boundary.type === "Feature" ? boundary.geometry : boundary;
  const ring = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
  return (ring ?? []).slice(0, -1).map(([longitude, latitude]) => ({ lat: latitude, lng: longitude }));
}

function pathToGeoJson(path: MapLatLng[]): ZoneGeoJson | null {
  if (path.length < 3) return null;
  const ring = path.map((point) => [point.lng(), point.lat()]);
  ring.push([...ring[0]]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function CoverageEditor({ initialZones, settings: initialSettings, mapsKey }: { initialZones: CoverageZone[]; settings: OperationalSettings; mapsKey?: string }) {
  const [zones, setZones] = useState(initialZones);
  const [selectedId, setSelectedId] = useState(initialZones[0]?.id ?? "");
  const selected = zones.find((zone) => zone.id === selectedId) ?? zones[0];
  const [draft, setDraft] = useState(selected);
  const [boundary, setBoundary] = useState<ZoneGeoJson | null>(selected?.boundary_geojson ?? null);
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [zoneAction, setZoneAction] = useState<"review" | "approve" | "activate" | "suspend" | null>(null);
  const [drawing, setDrawing] = useState(false);
  const drawingPoints = useRef<MapLatLng[]>([]);
  const [previewMode, setPreviewMode] = useState<"pickup" | "delivery" | null>(null);
  const [preview, setPreview] = useState<{ pickup?: { latitude: number; longitude: number }; delivery?: { latitude: number; longitude: number } }>({});
  const [mapSearch, setMapSearch] = useState<AddressValue>({ address: "", latitude: "", longitude: "" });
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const polygon = useRef<PolygonInstance | null>(null);
  const [mapsReady, setMapsReady] = useState(typeof window !== "undefined" && Boolean(window.google?.maps));

  useEffect(() => {
    if (!mapsKey || window.google?.maps) return;
    const existing = document.querySelector<HTMLScriptElement>("script[data-dovid-maps]");
    if (existing) { existing.addEventListener("load", () => setMapsReady(true), { once: true }); return; }
    const script = document.createElement("script");
    script.dataset.dovidMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}&v=weekly`;
    script.async = true;
    script.addEventListener("load", () => setMapsReady(true), { once: true });
    document.head.append(script);
  }, [mapsKey]);

  useEffect(() => {
    if (!mapsReady || !mapElement.current || map.current || !window.google?.maps) return;
    map.current = new window.google.maps.Map(mapElement.current, { center: { lat: 7.38, lng: 3.95 }, zoom: 12, mapTypeControl: true, streetViewControl: false });
  }, [mapsReady]);

  useEffect(() => {
    if (!map.current || !window.google?.maps) return;
    polygon.current?.setMap(null);
    const path = polygonPath(boundary);
    if (!path.length) { polygon.current = null; return; }
    const nextPolygon = new window.google.maps.Polygon({ map: map.current, paths: path, editable: true, draggable: false, strokeColor: "#F36C21", strokeOpacity: 1, strokeWeight: 3, fillColor: "#F36C21", fillOpacity: 0.2 });
    polygon.current = nextPolygon;
    const sync = () => setBoundary(pathToGeoJson(nextPolygon.getPath().getArray()));
    const listeners = [nextPolygon.getPath().addListener("insert_at", sync), nextPolygon.getPath().addListener("set_at", sync), nextPolygon.getPath().addListener("remove_at", sync)];
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
  const overlaps = useMemo(() => boundary ? zones.filter((zone) => zone.id !== selectedId && zone.boundary_geojson && zoneBoundariesOverlap(boundary, zone.boundary_geojson)).map((zone) => zone.name) : [], [boundary, zones, selectedId]);
  const previewMessage = useMemo(() => {
    if (!preview.pickup || !preview.delivery || !boundary) return "Click the map to set both preview points.";
    const covered = isPointInZoneGeoJson(preview.pickup, boundary) && isPointInZoneGeoJson(preview.delivery, boundary);
    return covered ? "Great! We can check delivery availability for this route." : "We're not delivering to this location just yet.";
  }, [preview, boundary]);

  if (!draft) return <p>No coverage zones are configured.</p>;

  async function saveDraft() {
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/coverage/zones/${draft.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.name, code: draft.code, boundaryGeoJson: boundary, bookingEligibility: draft.booking_eligibility, dispatchApprovalRequired: draft.dispatch_approval_required, priority: Number(draft.priority), effectiveFrom: new Date(draft.effective_from).toISOString(), effectiveUntil: draft.effective_until ? new Date(draft.effective_until).toISOString() : null, boundarySource: draft.boundary_source, reviewNotes: draft.review_notes }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setMessage(body.error ?? "The draft could not be saved.");
    setZones((current) => current.map((zone) => zone.id === draft.id ? { ...draft, boundary_geojson: boundary, operational_status: boundary === selected?.boundary_geojson ? draft.operational_status : "draft" } : zone));
    setMessage(body.overlaps?.length ? `Draft saved. Review overlaps with ${body.overlaps.map((item: { name: string }) => item.name).join(", ")}.` : "Draft saved. No zone was activated.");
  }

  async function performAction(action: "review" | "approve" | "activate" | "suspend", reason: string) {
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/coverage/zones/${draft.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setMessage(body.error ?? "The action could not be completed.");
    const nextStatus = action === "review" ? "in_review" : action === "approve" ? "approved" : action === "activate" ? "active" : "suspended";
    setZones((current) => current.map((zone) => zone.id === draft.id ? { ...zone, operational_status: nextStatus } : zone));
    setDraft((current) => current ? { ...current, operational_status: nextStatus } : current);
    setZoneAction(null);
    setMessage(`Zone ${action} completed and recorded.`);
  }

  async function saveSettings() {
    setPending(true); setMessage("");
    const response = await fetch("/api/admin/coverage/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceAreaId: settings.service_area_id, standardMaxDistanceMeters: Number(settings.standard_max_distance_meters), manualMaxDistanceMeters: Number(settings.manual_max_distance_meters), maxActiveAssignmentsPerRider: Number(settings.max_active_assignments_per_rider), standardPackageSizes: settings.standard_package_sizes, oversizedRequiresManualApproval: settings.oversized_requires_manual_approval, serviceHours: settings.service_hours, sameDayBookingCutoff: settings.same_day_booking_cutoff.slice(0, 5), handoverBufferMinutes: settings.handover_buffer_minutes, safeCompletionBufferMinutes: settings.safe_completion_buffer_minutes, waitingFreeMinutes: settings.waiting_free_minutes, waitingFeePerMinuteKobo: settings.waiting_fee_per_minute_kobo, maximumContinuousRidingMinutes: settings.maximum_continuous_riding_minutes, minimumBreakMinutes: settings.minimum_break_minutes, motorcycleRestrictionsConfirmed: Boolean(settings.motorcycle_restrictions_confirmed_at), motorcycleRestrictionsNotes: settings.motorcycle_restrictions_notes }) });
    const body = await response.json(); setPending(false); setMessage(response.ok ? "Operational thresholds saved." : body.error ?? "Settings could not be saved.");
  }

  function importGeoJson(file: File | undefined) {
    if (!file) return;
    void file.text().then((text) => { try { const parsed = JSON.parse(text) as unknown; const check = validateZoneGeoJson(parsed); if (!check.valid) return setMessage(check.issues.join(" ")); const importedBoundary = parsed as ZoneGeoJson; setBoundary(importedBoundary); drawingPoints.current = polygonPath(importedBoundary).map((position) => ({ lat: () => position.lat, lng: () => position.lng })); setMessage("GeoJSON imported into the draft. Save it before review."); } catch { setMessage("That file is not valid JSON."); } });
  }

  function selectZone(zone: CoverageZone) {
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
      <aside className="rounded-3xl bg-white p-4 shadow-sm"><p className="px-3 text-xs font-bold uppercase tracking-widest text-orange">Draft zones</p><div className="mt-3 grid gap-2">{zones.map((zone) => <button key={zone.id} type="button" onClick={() => selectZone(zone)} className={`rounded-2xl p-3 text-left ${zone.id === selectedId ? "bg-navy text-white" : "bg-cloud text-navy"}`}><span className="font-extrabold">{zone.code} · {zone.name}</span><span className="mt-1 block text-xs capitalize opacity-70">{zone.operational_status.replaceAll("_", " ")} · {zone.affectedOrders} affected orders</span></button>)}</div></aside>
      <section className="grid gap-5 rounded-3xl bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-navy">Name<input className="rounded-xl border p-3 font-normal" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><label className="grid gap-2 text-sm font-bold text-navy">Code<input className="rounded-xl border p-3 font-normal" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}/></label></div>
        <div ref={mapElement} className="min-h-[480px] rounded-2xl bg-cloud" aria-label="Ibadan service zone map">{!mapsKey ? <p className="p-6 text-sm text-slate">Configure the public Google Maps key to use map drawing. GeoJSON import and export remain available.</p> : null}</div>
        <AddressAutocomplete label="Find an address to review against this boundary" value={mapSearch} onChange={locateAddress} required={false} showMapPreview={false}/>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => { setDrawing((value) => !value); drawingPoints.current = polygonPath(boundary).map((position) => ({ lat: () => position.lat, lng: () => position.lng })); }}><MapPin className="mr-2 size-4"/>{drawing ? "Finish drawing" : "Add boundary points"}</Button><label className="inline-flex cursor-pointer items-center rounded-full border border-navy/15 px-4 py-2 text-sm font-bold text-navy"><Upload className="mr-2 size-4"/>Import GeoJSON<input className="sr-only" type="file" accept=".json,.geojson,application/geo+json" onChange={(event) => importGeoJson(event.target.files?.[0])}/></label><Button type="button" variant="outline" disabled={!boundary} onClick={exportGeoJson}><Download className="mr-2 size-4"/>Export</Button><Button type="button" variant="ghost" onClick={() => { setBoundary(null); drawingPoints.current = []; }}>Clear draft</Button></div>
        <div className={`rounded-2xl p-4 text-sm ${validation.valid && !overlaps.length ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{validation.valid ? <p><CheckCircle2 className="mr-2 inline size-4"/>Polygon structure is valid.</p> : validation.issues.map((issue) => <p key={issue}><XCircle className="mr-2 inline size-4"/>{issue}</p>)}{overlaps.length ? <p className="mt-2 font-bold">Overlap detected with {overlaps.join(", ")}.</p> : null}</div>
        <div className="grid gap-4 sm:grid-cols-3"><label className="grid gap-2 text-sm font-bold text-navy">Booking eligibility<select className="rounded-xl border p-3 font-normal" value={draft.booking_eligibility} onChange={(event) => setDraft({ ...draft, booking_eligibility: event.target.value as CoverageZone["booking_eligibility"] })}><option value="unavailable">Unavailable</option><option value="manual_approval">Manual approval</option><option value="standard">Standard eligible</option></select></label><label className="grid gap-2 text-sm font-bold text-navy">Priority<input type="number" className="rounded-xl border p-3 font-normal" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}/></label><label className="flex items-center gap-3 rounded-xl border p-3 text-sm font-bold text-navy"><input type="checkbox" checked={draft.dispatch_approval_required} onChange={(event) => setDraft({ ...draft, dispatch_approval_required: event.target.checked })}/>Dispatch approval required</label></div>
        <label className="grid gap-2 text-sm font-bold text-navy">Boundary source and review evidence<input className="rounded-xl border p-3 font-normal" value={draft.boundary_source ?? ""} onChange={(event) => setDraft({ ...draft, boundary_source: event.target.value || null })} placeholder="Reviewed file, survey or authority source"/></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Review notes<textarea className="min-h-24 rounded-xl border p-3 font-normal" value={draft.review_notes ?? ""} onChange={(event) => setDraft({ ...draft, review_notes: event.target.value || null })}/></label>
        <div className="grid gap-2 sm:flex sm:flex-wrap"><Button disabled={pending} onClick={saveDraft}><Save className="mr-2 size-4"/>Save draft</Button><Button variant="outline" disabled={pending || !validation.valid || Boolean(overlaps.length)} onClick={() => setZoneAction("review")}>Request review</Button><Button variant="outline" disabled={pending || draft.operational_status !== "in_review" || Boolean(overlaps.length)} onClick={() => setZoneAction("approve")}><ShieldCheck className="mr-2 size-4"/>Approve</Button><Button disabled={pending || draft.operational_status !== "approved" || Boolean(overlaps.length)} onClick={() => setZoneAction("activate")}>Activate</Button><Button variant="ghost" disabled={pending || draft.operational_status !== "active"} onClick={() => setZoneAction("suspend")}>Suspend</Button></div>
        <div className="rounded-2xl bg-cloud p-4"><p className="font-bold text-navy">Eligibility preview</p><p className="mt-1 text-sm text-slate">Choose pickup or destination, then click the map. This preview checks the selected polygon only; live booking also checks roads, hours, capacity and pricing.</p><div className="mt-3 flex gap-2"><Button variant="outline" onClick={() => setPreviewMode("pickup")}>Set pickup</Button><Button variant="outline" onClick={() => setPreviewMode("delivery")}>Set destination</Button></div><p className="mt-3 text-sm font-bold text-navy">{previewMessage}</p></div>
      </section>
    </div>
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-extrabold text-navy">Operating rules</h2><p className="mt-2 text-sm text-slate">Set safe hours and capacity rules. These controls never replace route, payment or profitability checks.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="grid gap-2 text-sm font-bold text-navy">Standard maximum (km)<input type="number" className="rounded-xl border p-3 font-normal" value={settings.standard_max_distance_meters / 1000} onChange={(event) => setSettings({ ...settings, standard_max_distance_meters: Math.round(Number(event.target.value) * 1000) })}/></label><label className="grid gap-2 text-sm font-bold text-navy">Manual maximum (km)<input type="number" className="rounded-xl border p-3 font-normal" value={settings.manual_max_distance_meters / 1000} onChange={(event) => setSettings({ ...settings, manual_max_distance_meters: Math.round(Number(event.target.value) * 1000) })}/></label><label className="grid gap-2 text-sm font-bold text-navy">Assignments per rider<input type="number" min={1} max={10} className="rounded-xl border p-3 font-normal" value={settings.max_active_assignments_per_rider} onChange={(event) => setSettings({ ...settings, max_active_assignments_per_rider: Number(event.target.value) })}/></label></div>
      <div className="mt-6 grid gap-3"><p className="text-sm font-extrabold text-navy">Service hours · Africa/Lagos</p>{serviceDays.map(({ key, label }) => { const hours = settings.service_hours[key]; return <div key={key} className="grid items-center gap-3 rounded-2xl bg-cloud p-3 sm:grid-cols-[120px_1fr_1fr_auto]"><span className="text-sm font-bold text-navy">{label}</span><input aria-label={`${label} opens`} disabled={!hours} type="time" value={hours?.[0] ?? "07:00"} onChange={(event) => setSettings({ ...settings, service_hours: { ...settings.service_hours, [key]: [event.target.value, hours?.[1] ?? "22:00"] } })} className="rounded-xl border bg-white p-3"/><input aria-label={`${label} closes`} disabled={!hours} type="time" value={hours?.[1] ?? "22:00"} onChange={(event) => setSettings({ ...settings, service_hours: { ...settings.service_hours, [key]: [hours?.[0] ?? "07:00", event.target.value] } })} className="rounded-xl border bg-white p-3"/><label className="flex items-center gap-2 text-sm font-bold text-navy"><input type="checkbox" checked={Boolean(hours)} onChange={(event) => setSettings({ ...settings, service_hours: { ...settings.service_hours, [key]: event.target.checked ? ["07:00", "22:00"] : null } })}/>Open</label></div>; })}</div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3"><label className="grid gap-2 text-sm font-bold text-navy">Same-day cutoff<input type="time" value={settings.same_day_booking_cutoff.slice(0, 5)} onChange={(event) => setSettings({ ...settings, same_day_booking_cutoff: event.target.value })} className="rounded-xl border p-3 font-normal"/></label><label className="grid gap-2 text-sm font-bold text-navy">Handover buffer (minutes)<input type="number" min={0} max={240} value={settings.handover_buffer_minutes ?? ""} onChange={(event) => setSettings({ ...settings, handover_buffer_minutes: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label><label className="grid gap-2 text-sm font-bold text-navy">Completion buffer (minutes)<input type="number" min={0} max={240} value={settings.safe_completion_buffer_minutes ?? ""} onChange={(event) => setSettings({ ...settings, safe_completion_buffer_minutes: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-4"><label className="grid gap-2 text-sm font-bold text-navy">Free waiting (minutes)<input type="number" min={0} max={240} value={settings.waiting_free_minutes ?? ""} onChange={(event) => setSettings({ ...settings, waiting_free_minutes: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label><label className="grid gap-2 text-sm font-bold text-navy">Waiting fee (kobo/minute)<input type="number" min={0} value={settings.waiting_fee_per_minute_kobo ?? ""} onChange={(event) => setSettings({ ...settings, waiting_fee_per_minute_kobo: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label><label className="grid gap-2 text-sm font-bold text-navy">Continuous riding limit<input type="number" min={15} max={480} value={settings.maximum_continuous_riding_minutes ?? ""} onChange={(event) => setSettings({ ...settings, maximum_continuous_riding_minutes: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label><label className="grid gap-2 text-sm font-bold text-navy">Minimum break (minutes)<input type="number" min={5} max={180} value={settings.minimum_break_minutes ?? ""} onChange={(event) => setSettings({ ...settings, minimum_break_minutes: nullableNumber(event.target.value) })} className="rounded-xl border p-3 font-normal"/></label></div>
      <div className="mt-4 grid gap-3 rounded-2xl border p-4"><label className="flex items-center gap-3 text-sm font-bold text-navy"><input type="checkbox" checked={Boolean(settings.motorcycle_restrictions_confirmed_at)} onChange={(event) => setSettings({ ...settings, motorcycle_restrictions_confirmed_at: event.target.checked ? new Date().toISOString() : null })}/>Motorcycle access restrictions have been operationally reviewed</label><textarea value={settings.motorcycle_restrictions_notes ?? ""} onChange={(event) => setSettings({ ...settings, motorcycle_restrictions_notes: event.target.value || null })} placeholder="Record reviewed roads, time restrictions and evidence. Do not guess." className="min-h-24 rounded-xl border p-3 text-sm"/></div>
      <Button className="mt-5" disabled={pending} onClick={saveSettings}>Save operating rules</Button>
    </section>
    {message ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p> : null}
    <ReasonDialog
      open={Boolean(zoneAction)}
      title={`${zoneAction ? zoneAction[0].toUpperCase() + zoneAction.slice(1) : "Update"} ${draft.name}?`}
      description="Zone state changes affect future eligibility decisions and must remain auditable. Activation is allowed only after geometry review and approval."
      confirmLabel={zoneAction === "review" ? "Request review" : zoneAction === "approve" ? "Approve zone" : zoneAction === "activate" ? "Activate zone" : "Suspend zone"}
      pending={pending}
      onCancel={() => setZoneAction(null)}
      onConfirm={(reason) => zoneAction ? performAction(zoneAction, reason) : undefined}
    />
  </div>;
}
