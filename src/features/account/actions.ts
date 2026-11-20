"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isStrongNewPassword, NEW_PASSWORD_HINT, NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountState = { error?: string; success?: string };

const addressSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(2).max(40),
  addressLine: z.string().trim().min(8).max(300),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  instructions: z.string().trim().max(500).optional(),
});

async function authenticatedCustomer() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function updateProfileAction(_: AccountState, formData: FormData): Promise<AccountState> {
  const parsed = z.object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(20),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check your name and phone number." };

  try {
    const { supabase, user } = await authenticatedCustomer();
    if (!user) return { error: "Your session has expired. Please log in again." };
    const { error } = await supabase.from("profiles").update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    if (error) throw error;
    revalidatePath("/account");
    revalidatePath("/account/settings");
    return { success: "Your details have been updated." };
  } catch {
    return { error: "We could not update your details. Please try again." };
  }
}

export async function addAddressAction(_: AccountState, formData: FormData): Promise<AccountState> {
  const parsed = addressSchema.omit({ id: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose an address from the suggestions before saving." };

  try {
    const { supabase, user } = await authenticatedCustomer();
    if (!user) return { error: "Your session has expired. Please log in again." };
    const { error } = await supabase.from("customer_addresses").insert({
      customer_id: user.id,
      label: parsed.data.label,
      address_line: parsed.data.addressLine,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      instructions: parsed.data.instructions || null,
    });
    if (error) throw error;
    revalidatePath("/account");
    revalidatePath("/account/addresses");
    return { success: "Address saved. It is ready for your next booking." };
  } catch {
    return { error: "We could not save this address. Please try again." };
  }
}

export async function updateAddressAction(_: AccountState, formData: FormData): Promise<AccountState> {
  const parsed = addressSchema.required({ id: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a confirmed address and check the details." };

  try {
    const { supabase, user } = await authenticatedCustomer();
    if (!user) return { error: "Your session has expired. Please log in again." };
    const { data, error } = await supabase.from("customer_addresses").update({
      label: parsed.data.label,
      address_line: parsed.data.addressLine,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      instructions: parsed.data.instructions || null,
    }).eq("id", parsed.data.id).eq("customer_id", user.id).select("id").maybeSingle();
    if (error || !data) throw error ?? new Error("Address not found");
    revalidatePath("/account/addresses");
    return { success: "Address updated." };
  } catch {
    return { error: "We could not update this address. Please try again." };
  }
}

export async function deleteAddressAction(_: AccountState, formData: FormData): Promise<AccountState> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "This address could not be identified." };

  try {
    const { supabase, user } = await authenticatedCustomer();
    if (!user) return { error: "Your session has expired. Please log in again." };
    const { data, error } = await supabase.from("customer_addresses").delete()
      .eq("id", parsed.data.id).eq("customer_id", user.id).select("id").maybeSingle();
    if (error || !data) throw error ?? new Error("Address not found");
    revalidatePath("/account");
    revalidatePath("/account/addresses");
    return { success: "Address removed." };
  } catch {
    return { error: "We could not remove this address. It may be attached to an active schedule." };
  }
}

export async function markAllNotificationsReadAction(_: AccountState, formData: FormData): Promise<AccountState> {
  const parsed = z.object({ acknowledgement: z.literal("read") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "We could not confirm that request." };

  try {
    const { supabase, user } = await authenticatedCustomer();
    if (!user) return { error: "Your session has expired. Please log in again." };
    const { error } = await supabase.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("customer_id", user.id)
      .is("read_at", null);
    if (error) throw error;
    revalidatePath("/account");
    revalidatePath("/account/notifications");
    return { success: "All updates marked as read." };
  } catch {
    return { error: "We could not update your notifications. Please try again." };
  }
}

export async function updatePasswordAction(_: AccountState, formData: FormData): Promise<AccountState> {
  const parsed = z.object({
    currentPassword: z.string().min(1).max(256),
    password: z.string().min(NEW_PASSWORD_MIN_LENGTH).max(NEW_PASSWORD_MAX_LENGTH).refine(isStrongNewPassword),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: NEW_PASSWORD_HINT };

  try {
    const { supabase, user } = await authenticatedCustomer();
    if (!user) return { error: "Your session has expired. Please log in again." };
    if (!user.email) return { error: "This account does not have an email password to verify." };
    const { error: reauthenticationError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.currentPassword,
    });
    if (reauthenticationError) return { error: "Your current password was not correct." };
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
      current_password: parsed.data.currentPassword,
    });
    if (error) throw error;
    return { success: "Password updated securely." };
  } catch {
    return { error: "We could not update your password. Please log in again and retry." };
  }
}

export async function updateRecoveryPasswordAction(_: AccountState, formData: FormData): Promise<AccountState> {
  const parsed = z.object({
    password: z.string().min(NEW_PASSWORD_MIN_LENGTH).max(NEW_PASSWORD_MAX_LENGTH).refine(isStrongNewPassword),
    passwordConfirmation: z.string(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.password !== parsed.data.passwordConfirmation) {
    return { error: parsed.success ? "Enter the same new password in both fields." : NEW_PASSWORD_HINT };
  }

  try {
    const { supabase, user } = await authenticatedCustomer();
    if (!user) return { error: "Open the secure recovery link in your email, then try again." };
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) throw error;
    return { success: "Password updated securely. You can continue to your Dovid account." };
  } catch {
    return { error: "This recovery session could not update the password. Request a fresh recovery email and try again." };
  }
}
