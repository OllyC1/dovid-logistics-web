export type AppRole = "customer" | "rider" | "admin";
export type StaffRole = "super_admin" | "admin" | "rider";
export type StaffStatus = "pending" | "active" | "suspended" | "revoked";
export type AssuranceLevel = "aal1" | "aal2";

export function activeStaffHome(staffRole: StaffRole | null, staffStatus: StaffStatus | null) {
  if (staffStatus !== "active" || !staffRole) return null;
  return staffRole === "rider" ? "/rider" : "/admin";
}

export function resolveTrustedAppRole(
  staffRole: StaffRole | null,
  staffStatus: StaffStatus | null,
  currentAal: AssuranceLevel,
): AppRole {
  if (staffStatus !== "active" || !staffRole) return "customer";
  if (staffRole === "super_admin" && currentAal !== "aal2") return "customer";
  return staffRole === "rider" ? "rider" : "admin";
}

export function roleHome(role: AppRole) {
  if (role === "admin") return "/admin";
  if (role === "rider") return "/rider";
  return "/account";
}

export function postLoginDestination(
  staffRole: StaffRole | null,
  staffStatus: StaffStatus | null,
  currentAal: AssuranceLevel,
) {
  const staffHome = activeStaffHome(staffRole, staffStatus);
  if (!staffHome) return "/account";
  if (staffRole === "super_admin" && currentAal !== "aal2") return `/staff/mfa?next=${staffHome}`;
  return staffHome;
}

export function isWorkspacePath(pathname: string) {
  return ["/account", "/admin", "/rider", "/staff"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
