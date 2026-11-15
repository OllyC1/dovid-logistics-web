"use client";

import { useActionState, useState } from "react";
import { AddressAutocomplete, type AddressValue } from "@/components/maps/address-autocomplete";
import { Button } from "@/components/ui/button";
import { Field, TextareaField } from "@/components/ui/field";
import { addAddressAction, updatePasswordAction, updateProfileAction, type AccountState } from "@/features/account/actions";

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

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, {});
  return <form action={action} className="grid gap-4"><Field name="password" type="password" label="New password" minLength={8} autoComplete="new-password" required /><Feedback state={state} /><Button type="submit" disabled={pending}>{pending ? "Updating…" : "Update password"}</Button></form>;
}
