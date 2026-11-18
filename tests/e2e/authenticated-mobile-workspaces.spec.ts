import { createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

if (existsSync(".env.local")) loadEnvFile(".env.local");

type TestRole = "customer" | "admin" | "rider" | "super_admin";
type TestAccount = { id: string; email: string; password: string; role: TestRole };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const provisioningSecret = process.env.E2E_ACCOUNT_PROVISIONING_SECRET;
const deployedBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const canUseAdminClient = Boolean(supabaseUrl && serviceRoleKey);
const canUseProvisioner = Boolean(deployedBaseUrl && provisioningSecret);
const canRunLiveRoleChecks = canUseAdminClient || canUseProvisioner;
const requireLiveRoleChecks = process.env.REQUIRE_AUTHENTICATED_E2E === "true";
const fixtureRunCode = randomBytes(3).toString("hex").toUpperCase();
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
  const profileRole = role === "customer" ? "customer" : role === "rider" ? "rider" : "admin";
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

function totp(secret: string, timestamp = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30_000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

async function removeAccount(account: TestAccount) {
  const { data: vehicles, error: vehicleLookupError } = await admin.from("fleet_vehicles")
    .select("id")
    .eq("created_by", account.id)
    .like("code", "E2E-%");
  if (vehicleLookupError) throw vehicleLookupError;
  for (const vehicle of vehicles ?? []) {
    const reset = await admin.from("fleet_vehicles").update({
      operational_status: "offline",
      assigned_rider_id: null,
      safety_status: "review_required",
      capacity_verified_at: null,
      capacity_verified_by: null,
    }).eq("id", vehicle.id);
    if (reset.error) throw reset.error;
    const removed = await admin.from("fleet_vehicles").delete()
      .eq("id", vehicle.id)
      .eq("created_by", account.id)
      .like("code", "E2E-%");
    if (removed.error) throw removed.error;
  }
  if (account.role === "admin") {
    const grants = await admin.from("staff_permission_grants").delete().eq("user_id", account.id);
    if (grants.error) throw grants.error;
  }
  if (account.role !== "customer") {
    const membership = await admin.from("staff_memberships").delete().eq("user_id", account.id);
    if (membership.error) throw membership.error;
  }
  const deleted = await admin.auth.admin.deleteUser(account.id);
  if (deleted.error) throw deleted.error;
}

async function login(page: Page, account: TestAccount, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function expectMobilePage(page: Page, path: string) {
  let response;
  try {
    response = await page.goto(path, { waitUntil: "domcontentloaded" });
  } catch (error) {
    // Chromium can cancel a hard navigation while the previous Next.js RSC
    // request is still settling. Retry only that transport-level abort; all
    // HTTP, authorization and rendering failures still fail below.
    if (!(error instanceof Error) || !error.message.includes("net::ERR_ABORTED")) throw error;
    response = await page.goto(path, { waitUntil: "domcontentloaded" });
  }
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
  for (const role of ["customer", "admin", "rider", "super_admin"] as const) accounts.push(await createAccount(role, suffix));
  const customer = accounts.find((account) => account.role === "customer")!;
  const notification = await admin.from("notifications").insert({
    customer_id: customer.id,
    channel: "in_app",
    event_type: "controlled.account.acceptance",
    title: "Your test delivery update",
    body: "This controlled message verifies the mobile notification workflow.",
    deduplication_key: `mobile-account-${customer.id}`,
    status: "sent",
  });
  if (notification.error) throw notification.error;
});

test.afterAll(async () => {
  if (canUseProvisioner && accounts.length) {
    const cleanup = await fetch(`${deployedBaseUrl}/api/internal/e2e/accounts`, { method: "POST", headers: { "Content-Type": "application/json", "x-e2e-secret": provisioningSecret! }, body: JSON.stringify({ action: "cleanup", userIds: accounts.map((account) => account.id) }) });
    if (!cleanup.ok) throw new Error(`Test account cleanup returned ${cleanup.status}`);
    const result = await cleanup.json() as { cleaned?: number };
    if (result.cleaned !== accounts.length) throw new Error(`Test account cleanup removed ${result.cleaned ?? 0} of ${accounts.length} identities`);
    return;
  }
  if (!admin) return;
  const promotions = await admin.from("promotions").delete().like("code", "E2EMOBILE%");
  if (promotions.error) throw promotions.error;
  for (const account of accounts) await removeAccount(account);
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

  await page.goto("/account/settings");
  const updatedName = `Mobile Customer ${test.info().project.name.replace("mobile-", "")}`;
  await page.getByLabel("Full name").fill(updatedName);
  await page.getByLabel("Phone number").fill("08012345678");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Your details have been updated");
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(updatedName);

  await page.route("**/api/maps/places**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/maps/places") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ suggestions: [{ placeId: "saved-address-mobile", description: "Dugbe, Ibadan", mainText: "Dugbe", secondaryText: "Ibadan, Oyo, Nigeria" }] }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ address: "Dugbe, Ibadan, Nigeria", coordinates: { latitude: 7.3878, longitude: 3.8796 } }) });
  });
  await page.goto("/account/addresses");
  await page.getByLabel("What would you like to call this place?").fill("Family house");
  await page.getByLabel("Find the address").fill("Dugbe");
  await page.getByRole("button", { name: /Dugbe/ }).click();
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByRole("status")).toContainText("Address saved");
  let addressCard = page.locator("details").filter({ hasText: "Family house" }).first();
  await expect(addressCard).toBeVisible();
  await addressCard.locator("summary").click();
  await addressCard.getByLabel("Name for this place").fill("Grandma's house");
  await addressCard.getByLabel("Directions for the rider (optional)").fill("Blue gate beside the pharmacy");
  await addressCard.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Address updated.", { exact: true })).toBeVisible();
  addressCard = page.locator("details").filter({ hasText: "Grandma's house" }).first();
  if (!(await addressCard.evaluate(element => (element as HTMLDetailsElement).open))) await addressCard.locator("summary").click();
  await addressCard.getByRole("button", { name: "Remove this address" }).click();
  const confirmation = addressCard.getByRole("alertdialog");
  await expect(confirmation).toContainText("Existing deliveries will keep their original address");
  await confirmation.getByRole("button", { name: "Yes, remove address" }).click();
  await expect(page.getByText("Grandma's house", { exact: true })).toHaveCount(0);

  if (canUseAdminClient) {
    await page.goto("/account/notifications");
    await expect(page.getByText("Your test delivery update")).toBeVisible();
    await expect(page.getByText("New", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Mark all 1 as read/ }).click();
    await expect(page.getByRole("status")).toContainText("All updates marked as read");
    await expect(page.getByText("Read", { exact: true })).toBeVisible();
  }

  await page.goto("/account/settings");
  await page.getByLabel("New password").fill(`Updated-${randomBytes(18).toString("base64url")}!Aa1`);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated securely");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("administrator reaches the admin workspace without MFA and every authorized page fits mobile", async ({ page }) => {
  test.setTimeout(360_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") pageErrors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`); });
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
    "/admin/cost-configuration", "/admin/competitors", "/admin/profitability", "/admin/history",
  ];
  for (const path of routes) {
    await expectMobilePage(page, path);
    await captureMobilePage(page, path, test.info().project.name);
  }
  await page.goto("/admin/promotions");
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Promotions" })).toHaveCount(0);

  await page.goto("/admin/competitors");
  await expect(page.getByLabel("Pickup latitude")).toHaveCount(0);
  await expect(page.getByLabel("Pickup longitude")).toHaveCount(0);
  const quoteEvidence = page.locator("details").filter({ hasText: "Add a quoted delivery" }).first();
  await quoteEvidence.locator("summary").click();
  await expect(quoteEvidence.getByText(/Add a competitor source|Pickup address/).first()).toBeVisible();

  await page.goto("/admin/coverage");
  if (deployedBaseUrl?.includes(".netlify.app")) {
    await expect(page.locator(".gm-style")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("The map could not open")).toHaveCount(0);
    const coverageAddress = page.getByLabel("Find an address to review against this boundary");
    await coverageAddress.fill("Dugbe, Ibadan");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("option").first().getByRole("button").click();
    await expect(coverageAddress).not.toHaveValue("Dugbe, Ibadan");
    expect(pageErrors, "deployed coverage editor browser errors").toEqual([]);
  } else {
    const places = await page.request.get("/api/maps/places?input=Dugbe%2C%20Ibadan");
    expect(places.status()).toBe(200);
    expect(((await places.json()) as { suggestions?: unknown[] }).suggestions?.length ?? 0).toBeGreaterThan(0);
  }
});

test("administrator registers a bike, assigns its rider and prepares a compliant run on mobile", async ({ page }) => {
  test.setTimeout(240_000);
  const account = accounts.find((item) => item.role === "admin")!;
  await login(page, account, /\/admin(?:\?|$)/);
  const riderAccount = accounts.find((item) => item.role === "rider")!;
  const viewportCode = test.info().project.name === "mobile-375" ? "375" : "390";
  const plateNumber = `TST ${viewportCode} ${fixtureRunCode}`;
  const bikeCode = `E2E-${viewportCode}-${fixtureRunCode}`;
  await page.goto("/admin/dispatch");
  const addBike = page.locator("details").filter({ hasText: "Add a motorcycle" });
  await addBike.locator("summary").click();
  await addBike.getByLabel("Plate / registration number").fill(plateNumber);
  await addBike.getByLabel(/Internal bike name/).fill(bikeCode);
  await addBike.getByLabel("Manufacturer").fill("Honda");
  await addBike.getByLabel("Model", { exact: true }).fill("E2E test motorcycle");
  await addBike.getByLabel("Model year (optional)", { exact: true }).fill("2024");
  await addBike.getByLabel(/Why is this bike being registered/).fill("Controlled mobile fleet acceptance fixture");
  await addBike.getByRole("button", { name: "Register motorcycle offline" }).click();
  await expect(page.getByRole("status")).toContainText(`${plateNumber} was registered offline`);

  let bikeCard = page.locator("details").filter({ hasText: bikeCode }).first();
  await bikeCard.locator("summary").click();
  let bikeForm = bikeCard.locator("form");
  await expect(bikeForm).toBeVisible();
  await expect(bikeForm).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  await bikeForm.getByLabel("Assigned rider").selectOption(riderAccount.id);
  await bikeForm.getByLabel("Safety review").selectOption("cleared");
  await bikeForm.getByLabel("Maximum parcels").fill("2");
  await bikeForm.getByLabel("Maximum payload (grams)").fill("18000");
  await bikeForm.getByLabel("Length").fill("500");
  await bikeForm.getByLabel("Width").fill("400");
  await bikeForm.getByLabel("Height").fill("400");
  await bikeForm.getByLabel("I physically measured and verified this capacity").check();
  await bikeForm.getByLabel("Operating status").selectOption("available");
  await bikeForm.getByLabel("Reason and verification evidence").fill("Controlled inspection and rider assignment completed");
  await bikeForm.getByRole("button", { name: "Save bike record" }).click();
  await expect(page.getByRole("status")).toContainText("Bike configuration updated and recorded");

  await page.goto("/admin/run-operations");
  const runCreator = page.locator("details").filter({ hasText: "Create a compliant delivery run" }).first();
  await runCreator.locator("summary").click();
  for (const [label, role] of [
    ["Bike", "combobox"],
    ["Rider", "combobox"],
    ["Safety and compliance confirmation", "textbox"],
  ] as const) {
    const control = runCreator.getByRole(role, { name: label, exact: true });
    await expect(control).toBeVisible();
    expect((await control.boundingBox())?.height ?? 0, `${label} touch target`).toBeGreaterThanOrEqual(44);
  }
  const createRun = runCreator.getByRole("button", { name: "Create planned run" });
  expect((await createRun.boundingBox())?.height ?? 0, "Create run touch target").toBeGreaterThanOrEqual(44);
  const testBikeOption = runCreator.getByRole("option", { name: new RegExp(plateNumber) });
  const testBikeId = await testBikeOption.getAttribute("value");
  expect(testBikeId).toBeTruthy();
  await runCreator.getByRole("combobox", { name: "Bike" }).selectOption(testBikeId!);
  await expect(runCreator.getByRole("combobox", { name: "Rider" })).toHaveValue(riderAccount.id);
  await runCreator.getByRole("textbox", { name: "Safety and compliance confirmation" }).fill("Controlled run readiness acceptance only");
  await expect(createRun).toBeEnabled();

  await page.goto("/admin/dispatch");
  bikeCard = page.locator("details").filter({ hasText: bikeCode }).first();
  await bikeCard.locator("summary").click();
  bikeForm = bikeCard.locator("form");
  await bikeForm.getByLabel("Operating status").selectOption("offline");
  await bikeForm.getByLabel("Assigned rider").selectOption("");
  await bikeForm.getByLabel("I physically measured and verified this capacity").uncheck();
  await bikeForm.getByLabel("Reason and verification evidence").fill("Controlled acceptance completed; fixture returned offline");
  await bikeForm.getByRole("button", { name: "Save bike record" }).click();
  await expect(page.getByRole("status")).toContainText("Bike configuration updated and recorded");
});

test("Super Admin completes MFA and controls promotions and immutable rate-card drafts on mobile", async ({ page }) => {
  test.skip(canUseProvisioner, "The deployed provisioner intentionally cannot create Super Admin identities");
  test.setTimeout(240_000);
  const account = accounts.find((item) => item.role === "super_admin")!;
  await login(page, account, /\/staff\/mfa/);
  const setupSecret = page.locator("code");
  await expect(setupSecret).toBeVisible();
  if (Date.now() % 30_000 > 27_000) await page.waitForTimeout(3_500);
  await page.getByLabel("Six-digit authenticator code").fill(totp((await setupSecret.textContent()) ?? ""));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Super Admin Dashboard" })).toBeVisible();

  await expectMobilePage(page, "/admin/team");
  const invitePanel = page.locator("details").filter({ hasText: "Invite a team member" }).first();
  await invitePanel.locator(":scope > summary").click();
  const inviteRole = invitePanel.getByLabel("Role");
  await expect(inviteRole.getByRole("option", { name: "Admin", exact: true })).toHaveCount(1);
  await expect(inviteRole.getByRole("option", { name: "Rider", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Suspend/ })).toHaveCount(0);

  await expectMobilePage(page, "/admin/promotions");
  const viewportCode = test.info().project.name === "mobile-375" ? "375" : "390";
  const promotionCode = `E2EMOBILE${viewportCode}${Date.now().toString().slice(-6)}`;
  const createPromotion = page.locator("details").filter({ hasText: "Create a checkout discount code" }).first();
  await createPromotion.locator("summary").click();
  await createPromotion.getByLabel("Discount code").fill(promotionCode);
  await createPromotion.getByLabel("Discount type").selectOption("percentage");
  await createPromotion.getByRole("spinbutton", { name: "Percentage (0.01–100)", exact: true }).fill("20");
  await createPromotion.getByLabel("Starts").fill(new Date(Date.now() + 60_000).toISOString().slice(0, 16));
  await createPromotion.getByRole("button", { name: "Create inactive discount code" }).click();
  await expect(page.getByRole("status")).toContainText(`Code ${promotionCode} was created inactive`);
  let promotion = page.locator("details").filter({ hasText: promotionCode }).first();
  await promotion.locator("summary").click();
  await promotion.getByRole("button", { name: "Activate code" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Operational reason").fill("Controlled mobile Super Admin acceptance");
  await dialog.getByRole("button", { name: "Activate code" }).click();
  await expect(page.getByRole("status")).toContainText(`Code ${promotionCode} is now active`);
  promotion = page.locator("details").filter({ hasText: promotionCode }).first();
  if (!(await promotion.evaluate((element) => (element as HTMLDetailsElement).open))) await promotion.locator("summary").click();
  await promotion.getByRole("button", { name: "Deactivate code" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Operational reason").fill("Controlled acceptance completed safely");
  await dialog.getByRole("button", { name: "Deactivate code" }).click();
  await expect(page.getByRole("status")).toContainText(`Code ${promotionCode} is now inactive`);

  await expectMobilePage(page, "/admin/rate-cards");
  const rateCardName = `E2E mobile ${viewportCode} inactive draft`;
  const rateCardEditor = page.locator("details#rate-card-editor");
  await rateCardEditor.locator("summary").click();
  await rateCardEditor.getByLabel("Rate card name").fill(rateCardName);
  await rateCardEditor.getByLabel("Service level").selectOption("scheduled");
  await rateCardEditor.getByLabel("Effective from").fill(new Date(Date.now() + 120_000).toISOString().slice(0, 16));
  await rateCardEditor.getByRole("button", { name: "Create inactive version" }).click();
  await expect(rateCardEditor.getByRole("status")).toContainText("Inactive rate-card version created");
  const rateCard = page.locator("details").filter({ hasText: rateCardName }).first();
  await rateCard.locator("summary").click();
  await expect(rateCard).toContainText("scheduled");
  await rateCard.getByRole("button", { name: "Delete unused draft" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Operational reason").fill("Controlled unused draft cleanup");
  const deleted = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().includes("/api/admin/pricing/rate-cards/"));
  await dialog.getByRole("button", { name: "Delete draft" }).click();
  expect((await deleted).status()).toBe(200);
  await expect(page.getByText(rateCardName, { exact: true })).toHaveCount(0);
  await expectMobilePage(page, "/admin/history");
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
