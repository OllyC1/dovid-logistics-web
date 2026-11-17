import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

if (existsSync(".env.local")) loadEnvFile(".env.local");

type TestRole = "customer" | "admin" | "rider";
type TestAccount = { id: string; email: string; password: string; role: TestRole };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const provisioningSecret = process.env.E2E_ACCOUNT_PROVISIONING_SECRET;
const deployedBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const canUseAdminClient = Boolean(supabaseUrl && serviceRoleKey);
const canUseProvisioner = Boolean(deployedBaseUrl && provisioningSecret);
const canRunLiveRoleChecks = canUseAdminClient || canUseProvisioner;
const requireLiveRoleChecks = process.env.REQUIRE_AUTHENTICATED_E2E === "true";
let admin: SupabaseClient;
const accounts: TestAccount[] = [];

const adminPermissions = [
  "staff.view", "riders.invite", "riders.manage", "dispatch.manage", "bookings.manage",
  "pricing.view", "pricing.manage", "payments.view", "payments.reconcile", "reports.view",
  "zones.manage", "staff.suspend",
];

async function createAccount(role: TestRole, suffix: string) {
  const email = `mobile-e2e-${role}-${suffix}@example.com`;
  const password = `E2e-${randomBytes(18).toString("base64url")}!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Mobile ${role} check`, phone: "08000000000" },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error(`Could not create ${role} test account`);
  const id = created.data.user.id;
  const profileRole = role === "customer" ? "customer" : role;
  const profile = await admin.from("profiles").upsert({ id, full_name: `Mobile ${role} check`, phone: "08000000000", role: profileRole });
  if (profile.error) throw profile.error;
  if (role !== "customer") {
    const membership = await admin.from("staff_memberships").insert({
      user_id: id,
      staff_role: role,
      status: "active",
      identity_verified_at: new Date().toISOString(),
      identity_verified_by: id,
      identity_verification_method: "controlled e2e account",
      identity_verification_reference: `mobile-${suffix}`,
    });
    if (membership.error) throw membership.error;
  }
  if (role === "admin") {
    const grants = await admin.from("staff_permission_grants").insert(adminPermissions.map((permission_key) => ({ user_id: id, permission_key, granted_by: id })));
    if (grants.error) throw grants.error;
  }
  return { id, email, password, role } satisfies TestAccount;
}

async function removeAccount(account: TestAccount) {
  if (account.role === "admin") await admin.from("staff_permission_grants").delete().eq("user_id", account.id);
  if (account.role !== "customer") await admin.from("staff_memberships").delete().eq("user_id", account.id);
  await admin.auth.admin.deleteUser(account.id);
}

async function login(page: Page, account: TestAccount, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function expectMobilePage(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} should load`).toBeLessThan(400);
  await expect(page.locator("main[data-workspace-content]")).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(dimensions.document, `${path} document overflow`).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body, `${path} body overflow`).toBeLessThanOrEqual(dimensions.viewport);
}

async function captureMobilePage(page: Page, path: string, projectName: string) {
  if (process.env.CAPTURE_MOBILE_SCREENSHOTS !== "true") return;
  const slug = path === "/" ? "home" : path.replace(/^\//, "").replaceAll("/", "-");
  await page.screenshot({ path: `.tmp/${projectName}-${slug}.png`, fullPage: true });
}

test.beforeAll(async ({}, testInfo) => {
  if (requireLiveRoleChecks && !canRunLiveRoleChecks) {
    throw new Error("Authenticated mobile acceptance was required, but no controlled Supabase admin client or deployed test provisioner is configured.");
  }
  test.skip(!canRunLiveRoleChecks, "Live role checks require controlled test provisioning");
  if (canUseProvisioner) {
    const provisioned = await fetch(`${deployedBaseUrl}/api/internal/e2e/accounts`, { method: "POST", headers: { "Content-Type": "application/json", "x-e2e-secret": provisioningSecret! }, body: JSON.stringify({ action: "create", roles: ["customer", "admin", "rider"] }) });
    if (!provisioned.ok) throw new Error(`Test account provisioner returned ${provisioned.status}`);
    accounts.push(...((await provisioned.json()) as { accounts: TestAccount[] }).accounts);
    return;
  }
  admin = createClient(supabaseUrl!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = `${Date.now()}-${testInfo.project.name.replace(/[^a-z0-9]/gi, "-")}`;
  for (const role of ["customer", "admin", "rider"] as const) accounts.push(await createAccount(role, suffix));
});

test.afterAll(async () => {
  if (canUseProvisioner && accounts.length) {
    await fetch(`${deployedBaseUrl}/api/internal/e2e/accounts`, { method: "POST", headers: { "Content-Type": "application/json", "x-e2e-secret": provisioningSecret! }, body: JSON.stringify({ action: "cleanup", userIds: accounts.map((account) => account.id) }) });
    return;
  }
  if (!admin) return;
  await Promise.all(accounts.map(removeAccount));
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Authenticated workspace audit is mobile-first");
  test.skip(!canRunLiveRoleChecks, "Live role checks are not configured");
  expect(await page.evaluate(() => window.innerWidth)).toBe(testInfo.project.name === "mobile-375" ? 375 : 390);
});

test("customer keeps a customer-only mobile workspace", async ({ page }) => {
  const account = accounts.find((item) => item.role === "customer")!;
  await login(page, account, /\/account(?:\?|$)/);
  await expect(page.locator("header")).toHaveCount(0);
  for (const path of ["/account", "/account/orders", "/account/addresses", "/account/notifications", "/account/settings"]) {
    await expectMobilePage(page, path);
    await captureMobilePage(page, path, test.info().project.name);
  }
});

test("administrator reaches the admin workspace without MFA and every authorized page fits mobile", async ({ page }) => {
  test.setTimeout(240_000);
  const account = accounts.find((item) => item.role === "admin")!;
  await login(page, account, /\/admin(?:\?|$)/);
  await expect(page.getByRole("heading", { level: 1, name: "Admin Dashboard" })).toBeVisible();
  await expect(page.locator("header")).toHaveCount(0);
  const menu = page.getByLabel("Open Dovid admin menu");
  await menu.click();
  const navigation = page.getByRole("navigation", { name: "Dovid admin navigation" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("link", { name: "Operations reports" }).click();
  await expect(navigation).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/operations/);

  const routes = [
    "/admin", "/admin/team", "/admin/email", "/admin/whatsapp-bookings", "/admin/coverage",
    "/admin/dispatch", "/admin/run-operations", "/admin/operations", "/admin/rate-cards",
    "/admin/cost-configuration", "/admin/competitors", "/admin/profitability", "/admin/promotions", "/admin/history",
  ];
  for (const path of routes) {
    await expectMobilePage(page, path);
    await captureMobilePage(page, path, test.info().project.name);
  }

  await page.goto("/admin/competitors");
  await expect(page.getByLabel("Pickup latitude")).toHaveCount(0);
  await expect(page.getByLabel("Pickup longitude")).toHaveCount(0);
  await expect(page.getByText(/Add a competitor source|Pickup address/).first()).toBeVisible();

  await page.goto("/admin/coverage");
  const coverageAddress = page.getByLabel("Find an address to review against this boundary");
  await coverageAddress.fill("Dugbe, Ibadan");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option").first().getByRole("button").click();
  await expect(coverageAddress).not.toHaveValue("Dugbe, Ibadan");
});

test("rider reaches only the rider workspace and its mobile menu responds immediately", async ({ page }) => {
  const account = accounts.find((item) => item.role === "rider")!;
  await login(page, account, /\/rider(?:\?|$)/);
  await expect(page.getByRole("heading", { level: 1, name: "Rider Dashboard" })).toBeVisible();
  await expect(page.locator("header")).toHaveCount(0);
  const menu = page.getByLabel("Open Rider workspace menu");
  await menu.click();
  const navigation = page.getByRole("navigation", { name: "Rider workspace navigation" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("link", { name: "Performance" }).click();
  await expect(navigation).toBeHidden();
  await expect(page).toHaveURL(/\/rider\/performance/);
  for (const path of ["/rider", "/rider/performance"]) {
    await expectMobilePage(page, path);
    await captureMobilePage(page, path, test.info().project.name);
  }
});
