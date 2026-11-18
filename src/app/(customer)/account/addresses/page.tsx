import { AddressForm, SavedAddressCard, type SavedAddress } from "@/components/account/account-forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AddressesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: addresses } = await supabase.from("customer_addresses")
    .select("id,label,address_line,latitude,longitude,instructions")
    .order("created_at", { ascending: false });

  return <>
    <div>
      <p className="eyebrow">My places</p>
      <h1 className="mt-2 text-3xl font-extrabold text-navy">Saved addresses</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">Save places you use often. Open any address to correct the location, update rider directions or remove it.</p>
    </div>
    <div className="mt-7 grid min-w-0 gap-6 lg:grid-cols-2">
      <section className="grid min-w-0 content-start gap-3" aria-label="Your saved addresses">
        {addresses?.map(address => <SavedAddressCard key={address.id} address={address as SavedAddress} />)}
        {!addresses?.length ? <p className="rounded-3xl bg-white p-7 text-slate">No saved addresses yet.</p> : null}
      </section>
      <section className="min-w-0 rounded-3xl bg-white p-5 sm:p-6">
        <h2 className="mb-2 text-xl font-extrabold text-navy">Add an address</h2>
        <p className="mb-5 text-sm leading-6 text-slate">Start typing and choose a Google suggestion so the rider receives the correct map location.</p>
        <AddressForm />
      </section>
    </div>
  </>;
}
