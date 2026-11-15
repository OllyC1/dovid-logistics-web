"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin, Search } from "lucide-react";
import type { PlaceSuggestion } from "@/lib/maps/places";

export type AddressValue = { address: string; latitude: string; longitude: string };

type Props = {
  label: string;
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  namePrefix?: string;
  placeholder?: string;
  required?: boolean;
  showMapPreview?: boolean;
};

export function AddressAutocomplete({ label, value, onChange, namePrefix, placeholder = "Start typing a street, landmark or area", required = true, showMapPreview = true }: Props) {
  const listId = useId();
  const sessionToken = useRef("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const selected = value.latitude !== "" && value.longitude !== "";

  useEffect(() => {
    if (selected || value.address.trim().length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setMessage("");
      if (!sessionToken.current) sessionToken.current = crypto.randomUUID();
      try {
        const response = await fetch(`/api/maps/places?input=${encodeURIComponent(value.address)}&sessionToken=${encodeURIComponent(sessionToken.current)}`, { signal: controller.signal });
        const body = await response.json() as { suggestions?: PlaceSuggestion[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Address suggestions are unavailable right now.");
        setSuggestions(body.suggestions ?? []);
        if (!body.suggestions?.length) setMessage("No close matches yet. Add a street, landmark or area.");
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Address suggestions are unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selected, value.address]);

  async function chooseAddress(suggestion: PlaceSuggestion) {
    setSearching(true);
    setSuggestions([]);
    setMessage("");
    try {
      const response = await fetch(`/api/maps/places/${encodeURIComponent(suggestion.placeId)}?sessionToken=${encodeURIComponent(sessionToken.current)}`);
      const body = await response.json() as { address?: string; coordinates?: { latitude: number; longitude: number }; error?: string };
      if (!response.ok || !body.address || !body.coordinates) throw new Error(body.error ?? "That address could not be confirmed.");
      onChange({ address: body.address, latitude: String(body.coordinates.latitude), longitude: String(body.coordinates.longitude) });
      sessionToken.current = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That address could not be confirmed.");
    } finally {
      setSearching(false);
    }
  }

  const mapUrl = selected ? `https://www.google.com/maps?q=${encodeURIComponent(`${value.latitude},${value.longitude}`)}` : "";
  return <div className="grid gap-2">
    <label className="grid gap-2 text-sm font-semibold text-navy">
      <span>{label}</span>
      <span className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate" aria-hidden="true" />
        <input
          className="min-h-12 w-full rounded-2xl border border-slate/25 bg-white py-3 pl-11 pr-11 text-base font-normal outline-none transition placeholder:text-slate/60 focus:border-orange focus:ring-4 focus:ring-orange/10"
          value={value.address}
          onChange={event => {
            setSuggestions([]);
            setMessage("");
            setSearching(false);
            onChange({ address: event.target.value, latitude: "", longitude: "" });
          }}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
        />
        {searching ? <Loader2 className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-orange" aria-label="Searching addresses" /> : null}
      </span>
    </label>
    {namePrefix ? <><input type="hidden" name={`${namePrefix}Address`} value={value.address}/><input type="hidden" name={`${namePrefix}Latitude`} value={value.latitude}/><input type="hidden" name={`${namePrefix}Longitude`} value={value.longitude}/></> : null}
    {suggestions.length ? <ul id={listId} role="listbox" className="z-20 overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-xl">
      {suggestions.map(suggestion => <li key={suggestion.placeId} role="option" aria-selected="false">
        <button type="button" className="flex w-full items-start gap-3 border-b border-navy/8 px-4 py-3 text-left transition last:border-0 hover:bg-cloud focus:bg-cloud focus:outline-none" onClick={() => chooseAddress(suggestion)}>
          <MapPin className="mt-0.5 size-4 shrink-0 text-orange" aria-hidden="true" />
          <span><span className="block text-sm font-bold text-navy">{suggestion.mainText}</span>{suggestion.secondaryText ? <span className="mt-0.5 block text-xs text-slate">{suggestion.secondaryText}</span> : null}</span>
        </button>
      </li>)}
      <li className="px-4 py-2 text-right text-xs text-slate" translate="no">Google Maps</li>
    </ul> : null}
    {message ? <p className="text-xs leading-5 text-slate" role="status">{message}</p> : null}
    {selected && showMapPreview ? <div className="overflow-hidden rounded-2xl border border-navy/10 bg-cloud">
      <iframe className="pointer-events-none hidden h-48 w-full border-0 sm:block" title={`${label} map`} src={`${mapUrl}&z=16&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      <a className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-orange" href={mapUrl} target="_blank" rel="noreferrer">Open in Google Maps <ExternalLink className="size-4" aria-hidden="true" /></a>
    </div> : !selected ? <p className="text-xs leading-5 text-slate">Choose a suggestion so we can confirm the exact location and show it on the map.</p> : null}
  </div>;
}
