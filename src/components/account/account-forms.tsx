"use client";

import { useActionState, useState } from "react";
import { AddressAutocomplete, type AddressValue } from "@/components/maps/address-autocomplete";
import { Button } from "@/components/ui/button";
import { Field, PasswordField, TextareaField } from "@/components/ui/field";
import { addAddressAction, deleteAddressAction, updateAddressAction, updatePasswordAction, updateProfileAction, updateRecoveryPasswordAction, type AccountState } from "@/features/account/actions";
import { NEW_PASSWORD_HINT, NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";

function Feedback({ state }: { state: AccountState }) {
  return state.error ? <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{state.error}</p> : state.success ? <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{state.success}</p> : null;
}

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, {});
  return <form action={action} className="grid gap-4"><Field name="fullName" label="Full name" defaultValue={fullName} required /><Field name="phone" label="Phone number" defaultValue={phone} required /><Feedback state={state} /><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button></form>;
}

export function AddressForm() {
  const [state, action, pending] = useActionState(addAddressAction, {});
  const [address, setAddress] = useState<AddressValue>({ address: "", latitude: "", longitude: "" });
  return <form action={action} className="grid gap-4">
    <Field name="label" label="What would you like to call this place?" placeholder="Home, office, shop…" required />
    <AddressAutocomplete label="Find the address" value={address} onChange={setAddress} />
    <input type="hidden" name="addressLine" value={address.address} />
    <input type="hidden" name="latitude" value={address.latitude} />
    <input type="hidden" name="longitude" value={address.longitude} />
    <TextareaField name="instructions" label="Directions for the rider (optional)" placeholder="For example: blue gate beside the pharmacy" />
    <Feedback state={state} />
    <Button type="submit" disabled={pending || !address.latitude || !address.longitude}>{pending ? "Saving…" : "Save address"}</Button>
  </form>;
}

export type SavedAddress = {
  id: string;
  label: string;
  address_line: string;
  latitude: number | string;
  longitude: number | string;
  instructions: string | null;
};

export function SavedAddressCard({ address: saved }: { address: SavedAddress }) {
  const [editState, editAction, editPending] = useActionState(updateAddressAction, {});
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAddressAction, {});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [address, setAddress] = useState<AddressValue>({
    address: saved.address_line,
    latitude: String(saved.latitude),
    longitude: String(saved.longitude),
  });

  return <details className="group rounded-3xl bg-white p-5 shadow-sm">
    <summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block font-extrabold text-navy">{saved.label}</span>
        <span className="mt-1 block break-words text-sm leading-6 text-slate">{saved.address_line}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-2xl text-orange transition group-open:rotate-45">+</span>
    </summary>
    <div className="mt-5 border-t border-navy/8 pt-5">
      <form action={editAction} className="grid gap-4">
        <input type="hidden" name="id" value={saved.id} />
        <Field name="label" label="Name for this place" defaultValue={saved.label} required />
        <AddressAutocomplete label="Confirmed address" value={address} onChange={setAddress} />
        <input type="hidden" name="addressLine" value={address.address} />
        <input type="hidden" name="latitude" value={address.latitude} />
        <input type="hidden" name="longitude" value={address.longitude} />
        <TextareaField name="instructions" label="Directions for the rider (optional)" defaultValue={saved.instructions ?? ""} />
        <Feedback state={editState} />
        <Button type="submit" className="w-full sm:w-auto" disabled={editPending || !address.latitude || !address.longitude}>{editPending ? "Saving changes…" : "Save changes"}</Button>
      </form>
      <div className="mt-6 border-t border-navy/8 pt-5">
        {!confirmDelete ? <Button type="button" className="w-full sm:w-auto" variant="ghost" onClick={() => setConfirmDelete(true)}>Remove this address</Button> : <div className="rounded-2xl bg-red-50 p-4" role="alertdialog" aria-labelledby={`remove-address-${saved.id}`}>
          <p id={`remove-address-${saved.id}`} className="font-bold text-red-950">Remove {saved.label}?</p>
          <p className="mt-1 text-sm leading-6 text-red-900">This removes it from your saved places. Existing deliveries will keep their original address.</p>
          <form action={deleteAction} className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
            <input type="hidden" name="id" value={saved.id} />
            <Button type="submit" className="w-full sm:w-auto" disabled={deletePending}>{deletePending ? "Removing…" : "Yes, remove address"}</Button>
            <Button type="button" className="w-full sm:w-auto" variant="outline" disabled={deletePending} onClick={() => setConfirmDelete(false)}>Keep address</Button>
          </form>
        </div>}
        <Feedback state={deleteState} />
      </div>
    </div>
  </details>;
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, {});
  return <form action={action} className="grid gap-4"><PasswordField name="currentPassword" label="Current password" autoComplete="current-password" required /><PasswordField name="password" label="New password" minLength={NEW_PASSWORD_MIN_LENGTH} maxLength={NEW_PASSWORD_MAX_LENGTH} hint={NEW_PASSWORD_HINT} autoComplete="new-password" required /><Feedback state={state} /><Button type="submit" disabled={pending}>{pending ? "Updating…" : "Update password"}</Button></form>;
}

export function RecoveryPasswordForm() {
  const [state, action, pending] = useActionState(updateRecoveryPasswordAction, {});
  return <form action={action} className="grid gap-4">
    <PasswordField name="password" label="New password" minLength={NEW_PASSWORD_MIN_LENGTH} maxLength={NEW_PASSWORD_MAX_LENGTH} hint={NEW_PASSWORD_HINT} autoComplete="new-password" required />
    <PasswordField name="passwordConfirmation" label="Confirm new password" autoComplete="new-password" required />
    <Feedback state={state} />
    <Button type="submit" disabled={pending}>{pending ? "Updating…" : "Set new password"}</Button>
  </form>;
}
