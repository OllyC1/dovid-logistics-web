import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalized);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Auth user lookup exceeded the safe pagination limit");
}

export async function listAuthUsers(admin: SupabaseClient) {
  const users: User[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
  return users;
}
