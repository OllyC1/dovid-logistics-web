import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

if (existsSync(".env.local") && process.env.DOVID_LOCAL_E2E !== "true") loadEnvFile(".env.local");

type TestRole = "customer" | "admin" | "rider" | "super_admin";
type TestAccount = { id: string; email: string; password: string; role: TestRole };
type RiderFixture = { orderId: string; quoteId: string; pricingRuleId: string; paymentIntentId: string; runId?: string; vehicleId?: string };
type MailpitMessage = { ID: string; To?: { Address?: string }[] };

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
const invitedAccounts: TestAccount[] = [];
const riderFixtures: RiderFixture[] = [];
let superAdminMfaSecret = "";

const adminPermissions = [
  "staff.view", "riders.invite", "riders.manage", "dispatch.manage", "bookings.manage",
  "pricing.view", "pricing.manage", "payments.view", "payments.reconcile", "reports.view",
  "zones.manage", "staff.suspend",
];

async function insertFixture(table: string, values: Record<string, unknown> | Record<string, unknown>[]) {
  const result = await admin.from(table).insert(values);
  if (result.error) throw result.error;
}

async function createRiderFixture({ withRun = false }: { withRun?: boolean } = {}) {
  const customer = accounts.find((account) => account.role === "customer")!;
  const rider = accounts.find((account) => account.role === "rider")!;
  const administrator = accounts.find((account) => account.role === "admin")!;
  const pricingRuleId = randomUUID();
  const quoteId = randomUUID();
  const orderId = randomUUID();
  const paymentIntentId = randomUUID();
  const suffix = orderId.slice(0, 8).toUpperCase();

  await insertFixture("pricing_rules", {
    id: pricingRuleId,
    name: `Rider acceptance ${suffix}`,
    base_fee_minor: 10_000,
    included_distance_meters: 0,
    per_kilometer_minor: 0,
    minimum_fee_minor: 10_000,
    active: false,
  });
  await insertFixture("quotes", {
    id: quoteId,
    pricing_rule_id: pricingRuleId,
    customer_id: customer.id,
    request_payload: {
      pickupAddress: "Bodija, Ibadan",
      deliveryAddress: "Dugbe, Ibadan",
      packageSize: "small",
      packageCategory: "parcel",
      additionalStops: [],
      oversized: false,
    },
    distance_meters: 4_000,
    amount_minor: 10_000,
    currency: "NGN",
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    status: "confirmed",
    service_level: "standard",
    payment_method: "online",
  });
  await insertFixture("delivery_orders", {
    id: orderId,
    customer_id: customer.id,
    rider_id: rider.id,
    quote_id: quoteId,
    order_reference: `DOV-RIDER-${suffix}`,
    tracking_reference: `TRK-RIDER-${suffix}`,
    idempotency_key: randomUUID(),
    pickup_address: "Bodija, Ibadan",
    pickup_latitude: 7.435,
    pickup_longitude: 3.91,
    delivery_address: "Dugbe, Ibadan",
    delivery_latitude: 7.3878,
    delivery_longitude: 3.8796,
    sender_name: "Controlled Sender",
    sender_phone: "08000000000",
    recipient_name: "Controlled Receiver",
    recipient_phone: "08000000001",
    payer: "sender",
    payment_method: "online",
    delivery_status: "assigned",
    payment_status: "paid",
    distance_meters: 4_000,
    quoted_amount_minor: 10_000,
    currency: "NGN",
  });
  await insertFixture("delivery_packages", {
    order_id: orderId,
    category: "parcel",
    size: "small",
    description: "Controlled mobile rider acceptance parcel",
    weight_grams: 1_000,
    length_mm: 250,
    width_mm: 180,
    height_mm: 120,
  });
  await insertFixture("delivery_status_events", {
    order_id: orderId,
    previous_status: null,
    new_status: "assigned",
    actor_id: administrator.id,
    actor_type: "admin",
    metadata: { fixture: true },
  });
  await insertFixture("payment_intents", {
    id: paymentIntentId,
    order_id: orderId,
    provider: "paystack",
    provider_reference: `rider-fixture-${orderId}`,
    amount_minor: 10_000,
    currency: "NGN",
    status: "paid",
    idempotency_key: randomUUID(),
    last_provider_status: "success",
    last_verified_at: new Date().toISOString(),
  });
  await insertFixture("payment_transactions", {
    payment_intent_id: paymentIntentId,
    order_id: orderId,
    provider_transaction_id: `rider-test-${orderId}`,
    amount_minor: 10_000,
    currency: "NGN",
    status: "paid",
    immutable_payload: { domain: "test", fixture: true },
  });

  const fixture: RiderFixture = { orderId, quoteId, pricingRuleId, paymentIntentId };
  if (withRun) {
    const vehicleId = randomUUID();
    const runId = randomUUID();
    const deliveryAssignmentId = randomUUID();
    await insertFixture("fleet_vehicles", {
      id: vehicleId,
      code: `E2E-RIDER-${suffix}`,
      registration_number: `TST ${suffix.slice(0, 3)} RT`,
      manufacturer: "Honda",
      model: "Controlled test motorcycle",
      model_year: 2024,
      operational_status: "assigned",
      assigned_rider_id: rider.id,
      max_active_assignments: 2,
      safety_status: "cleared",
      max_payload_weight_grams: 18_000,
      cargo_length_mm: 500,
      cargo_width_mm: 400,
      cargo_height_mm: 400,
      capacity_verified_at: new Date().toISOString(),
      capacity_verified_by: administrator.id,
      created_by: administrator.id,
    });
    await insertFixture("delivery_runs", {
      id: runId,
      run_reference: `RUN-RIDER-${suffix}`,
      rider_id: rider.id,
      vehicle_id: vehicleId,
      status: "active",
      scheduled_start_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      compliance_confirmed_at: new Date().toISOString(),
      compliance_confirmed_by: administrator.id,
      compliance_notes: "Controlled rider return workflow",
      idempotency_key: randomUUID(),
      created_by: administrator.id,
    });
    await insertFixture("delivery_assignments", {
      id: deliveryAssignmentId,
      order_id: orderId,
      vehicle_id: vehicleId,
      rider_id: rider.id,
      assigned_by: administrator.id,
      score_snapshot: { fixture: true },
      delivery_run_id: runId,
    });
    await insertFixture("run_assignments", {
      run_id: runId,
      order_id: orderId,
      delivery_assignment_id: deliveryAssignmentId,
      status: "assigned",
      package_weight_grams: 1_000,
      package_volume_mm3: 5_400_000,
      compatibility_snapshot: { fixture: true },
      route_snapshot: { fixture: true },
      idempotency_key: randomUUID(),
    });
    await insertFixture("delivery_run_stops", [{
      run_id: runId,
      order_id: orderId,
      stop_type: "pickup",
      sequence: 1,
      status: "next",
      address: "Bodija, Ibadan",
      latitude: 7.435,
      longitude: 3.91,
    }, {
      run_id: runId,
      order_id: orderId,
      stop_type: "dropoff",
      sequence: 2,
      status: "pending",
      address: "Dugbe, Ibadan",
      latitude: 7.3878,
      longitude: 3.8796,
    }]);
    fixture.runId = runId;
    fixture.vehicleId = vehicleId;
  }
  riderFixtures.push(fixture);
  return fixture;
}

async function cleanupRiderFixture(fixture: RiderFixture) {
  const deleteBy = async (table: string, column: string, value: string) => {
    const result = await admin.from(table).delete().eq(column, value);
    if (result.error) throw result.error;
  };
  for (const table of ["payment_refunds", "payment_disputes", "payment_reconciliations"]) await deleteBy(table, "payment_intent_id", fixture.paymentIntentId);
  for (const table of ["delivery_incidents", "redelivery_requests", "delivery_attempts", "delivery_waiting_sessions", "delivery_expense_reports", "parcel_custody_events", "delivery_proofs", "payment_transactions"]) await deleteBy(table, "order_id", fixture.orderId);
  const notificationCleanup = await admin.from("notifications").delete().eq("order_id", fixture.orderId);
  if (notificationCleanup.error?.code === "23503") return;
  if (notificationCleanup.error) throw notificationCleanup.error;
  if (fixture.runId) {
    await deleteBy("delivery_run_stops", "run_id", fixture.runId);
    await deleteBy("run_assignments", "run_id", fixture.runId);
  }
  await deleteBy("delivery_assignments", "order_id", fixture.orderId);
  await deleteBy("payment_checkout_sessions", "payment_intent_id", fixture.paymentIntentId);
  await deleteBy("payment_intents", "id", fixture.paymentIntentId);
  await deleteBy("delivery_status_events", "order_id", fixture.orderId);
  await deleteBy("delivery_packages", "order_id", fixture.orderId);
  await deleteBy("audit_logs", "resource_id", fixture.orderId);
  await deleteBy("delivery_orders", "id", fixture.orderId);
  if (fixture.runId) await deleteBy("delivery_runs", "id", fixture.runId);
  if (fixture.vehicleId) await deleteBy("fleet_vehicles", "id", fixture.vehicleId);
  await deleteBy("quotes", "id", fixture.quoteId);
  await deleteBy("pricing_rules", "id", fixture.pricingRuleId);
}

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
  const { data: auditReferences, error: auditLookupError } = await admin.from("staff_audit_events")
    .select("id")
    .or(`actor_id.eq.${account.id},target_user_id.eq.${account.id}`)
    .limit(1);
  if (auditLookupError) throw auditLookupError;
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
  if (auditReferences?.length) {
    const disabled = await admin.auth.admin.updateUserById(account.id, { ban_duration: "876000h" });
    if (disabled.error) throw disabled.error;
    return;
  }
  const deleted = await admin.auth.admin.deleteUser(account.id);
  if (deleted.error?.message.includes("notification_delivery_attempts") || deleted.error?.message.includes("still referenced")) {
    const disabled = await admin.auth.admin.updateUserById(account.id, { ban_duration: "876000h" });
    if (disabled.error) throw disabled.error;
    return;
  }
  if (deleted.error) throw deleted.error;
}

async function login(page: Page, account: TestAccount, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function clearBrowserSession(page: Page) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function authenticateSuperAdmin(page: Page) {
  const account = accounts.find((item) => item.role === "super_admin")!;
  await login(page, account, /\/staff\/mfa/);
  const setupSecret = page.locator("code").first();
  if (!superAdminMfaSecret) {
    await expect(setupSecret).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await setupSecret.textContent())?.trim() ?? "", {
      message: "MFA enrollment should render its generated setup secret",
      timeout: 15_000,
    }).not.toBe("");
    superAdminMfaSecret = (await setupSecret.textContent())?.trim() ?? "";
  }
  if (!superAdminMfaSecret) {
    const status = (await page.getByRole("status").textContent().catch(() => null))?.trim() ?? "No MFA status was rendered";
    throw new Error(`Controlled Super Admin MFA enrollment did not provide a setup secret: ${status}`);
  }
  if (Date.now() % 30_000 > 27_000) await page.waitForTimeout(3_500);
  await page.getByLabel("Six-digit authenticator code").fill(totp(superAdminMfaSecret));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
  await expect(page.getByRole("heading", { level: 1, name: "Super Admin Dashboard" })).toBeVisible();
}

async function waitForLocalInvitationLink(email: string) {
  const mailboxUrl = "http://127.0.0.1:54324/api/v1/messages";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const mailboxResponse = await fetch(mailboxUrl);
    if (mailboxResponse.ok) {
      const mailbox = await mailboxResponse.json() as { messages?: MailpitMessage[] };
      const message = mailbox.messages?.find((item) => item.To?.some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase()));
      if (message) {
        const detailResponse = await fetch(`http://127.0.0.1:54324/api/v1/message/${encodeURIComponent(message.ID)}`);
        if (detailResponse.ok) {
          const detail = await detailResponse.json() as { HTML?: string; Text?: string };
          const content = `${detail.HTML ?? ""}\n${detail.Text ?? ""}`.replaceAll("&amp;", "&");
          const link = content.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0];
          if (link) return link;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The isolated local mailbox did not receive the invitation for ${email}`);
}

async function expectCurrentMobilePage(page: Page, label: string, workspace = true) {
  if (workspace) await expect(page.locator("main[data-workspace-content]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const audit = await page.evaluate(() => {
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const undersizedInteractiveControls = [...document.querySelectorAll<HTMLElement>("button, input, select, textarea, [role='button'], summary, a[href]")]
      .filter((element) => {
        const target = element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
          ? element.closest<HTMLElement>("label") ?? element.labels?.item(0) ?? element
          : element;
        const style = getComputedStyle(target);
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (target.classList.contains("sr-only") && !target.matches(":focus")) return false;
        const box = target.getBoundingClientRect();
        if (!box.width || !box.height) return false;
        return box.width < 40 || box.height < 40;
      })
      .map((element) => {
        const target = element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
          ? element.closest<HTMLElement>("label") ?? element.labels?.item(0) ?? element
          : element;
        const box = target.getBoundingClientRect();
        return {
          tag: element.tagName,
          text: element.getAttribute("aria-label") ?? target.textContent?.trim().slice(0, 50) ?? "",
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      });
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      duplicateIds,
      undersizedInteractiveControls,
    };
  });
  expect(audit.documentWidth, `${label} document overflow`).toBeLessThanOrEqual(audit.viewportWidth);
  expect(audit.bodyWidth, `${label} body overflow`).toBeLessThanOrEqual(audit.viewportWidth);
  expect(audit.duplicateIds, `${label} should not expose duplicate element IDs`).toEqual([]);
  expect(audit.undersizedInteractiveControls, `${label} controls should provide at least a 40px touch target`).toEqual([]);
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
  await expectCurrentMobilePage(page, path);
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
  for (const fixture of [...riderFixtures].reverse()) await cleanupRiderFixture(fixture);
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
  for (const account of invitedAccounts) {
    await removeAccount(account);
  }
  for (const account of accounts) await removeAccount(account);
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Authenticated workspace audit is mobile-first");
  test.skip(!canRunLiveRoleChecks, "Live role checks are not configured");
  expect(page.viewportSize()?.width).toBe(testInfo.project.name === "mobile-375" ? 375 : 390);
});

test("customer keeps a customer-only mobile workspace", async ({ page }) => {
  test.setTimeout(240_000);
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
  await page.getByLabel("Current password").fill(account.password);
  await page.getByLabel("New password").fill(`Updated-${randomBytes(18).toString("base64url")}!Aa1`);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated securely");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));

  await page.getByLabel("Open My Dovid menu").click();
  const logOut = page.getByRole("button", { name: "Log out" });
  const logOutBounds = await logOut.boundingBox();
  expect(logOutBounds).not.toBeNull();
  await page.touchscreen.tap(logOutBounds!.x + logOutBounds!.width / 2, logOutBounds!.y + logOutBounds!.height / 2);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("status").filter({ hasText: "You’re signed out. See you again soon." })).toBeVisible();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
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

  let assistedPayload: Record<string, unknown> | undefined;
  await page.route("**/api/maps/places**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/maps/places") {
      const pickup = url.searchParams.get("input")?.toLowerCase().includes("bodija");
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ suggestions: [{ placeId: pickup ? "assisted-pickup" : "assisted-destination", description: pickup ? "Bodija, Ibadan" : "Dugbe, Ibadan", mainText: pickup ? "Bodija" : "Dugbe", secondaryText: "Ibadan, Oyo, Nigeria" }] }) });
    }
    const pickup = url.pathname.endsWith("assisted-pickup");
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ address: pickup ? "Bodija, Ibadan, Nigeria" : "Dugbe, Ibadan, Nigeria", coordinates: pickup ? { latitude: 7.435, longitude: 3.91 } : { latitude: 7.3878, longitude: 3.8796 } }) });
  });
  await page.route("**/api/admin/assisted-bookings**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/quote")) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ quote: { amountMinor: 250000, currency: "NGN", distanceMeters: 5200, duration: "1200s" }, reviewUrl: "https://example.test/assisted/quote/controlled-test", verificationCode: "482913", whatsappUrl: "https://wa.me/2348000000000", automatedMessageSent: false }) });
    }
    assistedPayload = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "controlled-assisted-draft" }) });
  });
  await page.goto("/admin/whatsapp-bookings");
  await page.getByLabel("Customer name").fill("Assisted Test Customer");
  await page.getByLabel("Customer phone").fill("08000000000");
  await page.getByLabel("Sender name").fill("Assisted Sender");
  await page.getByLabel("Sender phone").fill("08000000000");
  await page.getByLabel("Recipient name").fill("Assisted Receiver");
  await page.getByLabel("Recipient phone").fill("08000000001");
  await page.getByRole("button", { name: "Continue to delivery details" }).click();
  await page.getByLabel("Pickup address").fill("Bodija");
  await page.getByRole("button", { name: /Bodija/ }).click();
  await page.getByLabel("Destination address").fill("Dugbe");
  await page.getByRole("button", { name: /Dugbe/ }).click();
  await page.getByLabel("What is being sent?").fill("A controlled assisted-booking acceptance parcel");
  await page.getByRole("button", { name: "Continue to payment choices" }).click();
  await page.getByLabel("Who pays?").selectOption("receiver_before_delivery");
  await page.getByRole("button", { name: "Create request and check availability" }).click();
  await expect(page.getByText("Secure customer review link created.")).toBeVisible();
  await expect(page.getByText("No automated message was sent.")).toBeVisible();
  expect(assistedPayload).not.toHaveProperty("customerEmail");
  expect(assistedPayload?.payer).toBe("receiver_before_delivery");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await page.unroute("**/api/maps/places**");
  await page.unroute("**/api/admin/assisted-bookings**");

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
  await page.getByRole("button", { name: "Save operating rules" }).click();
  const settingsDialog = page.getByRole("dialog");
  await expect(settingsDialog).toContainText("previous and new values will be saved together in the audit history");
  await expect(settingsDialog.getByRole("button", { name: "Save operating rules" })).toBeDisabled();
  const dialogBounds = await settingsDialog.boundingBox();
  expect(dialogBounds, "operating rules dialog bounds").not.toBeNull();
  expect(dialogBounds!.x, "operating rules dialog left edge").toBeGreaterThanOrEqual(0);
  expect(dialogBounds!.x + dialogBounds!.width, "operating rules dialog right edge").toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "operating rules dialog overflow").toBeLessThanOrEqual(page.viewportSize()!.width);
  await settingsDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(settingsDialog).toBeHidden();
});

test("administrator creates and completes the audited service-zone lifecycle on mobile", async ({ page }) => {
  test.setTimeout(240_000);
  test.skip(!canUseAdminClient, "The full zone lifecycle runs only against the isolated local Supabase stack");
  const account = accounts.find((item) => item.role === "admin")!;
  const viewportCode = test.info().project.name === "mobile-375" ? "375" : "390";
  const zoneCode = `E2E${viewportCode}${fixtureRunCode}`;
  const zoneName = `Mobile ${viewportCode} validation zone`;
  const boundary = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[5, 9], [5.01, 9], [5.01, 9.01], [5, 9.01], [5, 9]]],
    },
  };

  async function confirmZoneAction(buttonName: string, reason: string, confirmLabel: string) {
    await page.getByRole("button", { name: buttonName, exact: true }).click();
    const dialog = page.getByTestId("reason-dialog");
    await expect(dialog).toBeVisible();
    const reasonField = dialog.locator("textarea");
    await expect(reasonField).toHaveCount(1);
    await reasonField.fill(reason);
    const dialogBox = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(dialogBox, `${buttonName} dialog should be measurable`).not.toBeNull();
    expect(dialogBox!.x, `${buttonName} dialog left edge`).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width, `${buttonName} dialog right edge`).toBeLessThanOrEqual(viewport!.width);
    for (const [controlName, control] of [["reason", reasonField], ["cancel", dialog.getByRole("button", { name: "Cancel" })], ["confirm", dialog.getByRole("button", { name: confirmLabel, exact: true })]] as const) {
      expect((await control.boundingBox())?.height ?? 0, `${buttonName} dialog ${controlName} touch target`).toBeGreaterThanOrEqual(40);
    }
    await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  try {
    await login(page, account, /\/admin(?:\?|$)/);
    // Map rendering is covered by the preceding workspace test. Keep this
    // lifecycle test deterministic while exercising GeoJSON import and every
    // audited server transition.
    await page.route("https://maps.googleapis.com/**", (route) => route.abort());
    await page.goto("/admin/coverage");
    const mapPanel = page.getByLabel("Ibadan service zone map");
    await expect(mapPanel.locator(".gm-style").or(mapPanel.getByRole("alert"))).toBeVisible({ timeout: 30_000 });
    const addZone = page.locator("details").filter({ hasText: "Add a service zone" }).first();
    await addZone.locator("summary").click();
    await expectCurrentMobilePage(page, "expanded service-zone creation");
    await addZone.getByLabel("Zone name").fill(zoneName);
    await addZone.getByLabel("Stable code").fill(zoneCode);
    await addZone.getByLabel("Initial eligibility").selectOption("manual_approval");
    await addZone.getByLabel("Priority").fill("900");
    await addZone.getByLabel("Boundary source or evidence (optional)").fill("Controlled mobile acceptance geometry");
    await addZone.getByLabel("Planning notes (optional)").fill("Transaction-scoped validation zone; not real operating geography.");
    await addZone.getByLabel("Why is this zone needed?").fill("Validate the complete mobile zone-management workflow");
    const createResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/admin/coverage/zones" && response.request().method() === "POST");
    await addZone.getByRole("button", { name: "Create inactive draft" }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status(), `zone creation response: ${await createResponse.text()}`).toBe(201);
    await expect(page.getByRole("status")).toContainText(`${zoneName} was created as an inactive draft`);
    await expect(page.getByText(`${zoneCode} · ${zoneName}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Not live for zone-specific bookings", { exact: true })).toBeVisible();
    await addZone.locator("summary").click();

    await page.getByLabel("Import GeoJSON").setInputFiles({
      name: `${zoneCode.toLowerCase()}.geojson`,
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify(boundary)),
    });
    await expect(page.getByRole("status")).toContainText("GeoJSON imported into the draft");
    await confirmZoneAction("Save draft", "Attach the controlled reviewed boundary", "Save draft");
    await expect(page.getByRole("status")).toContainText("Draft saved as draft");
    await confirmZoneAction("Request review", "Review controlled boundary and operating evidence", "Request review");
    await expect(page.getByRole("status")).toContainText("Zone review completed and recorded");
    await confirmZoneAction("Approve", "Approve controlled boundary after mobile review", "Approve zone");
    await expect(page.getByRole("status")).toContainText("Zone approve completed and recorded");
    await confirmZoneAction("Activate", "Activate only for isolated acceptance testing", "Activate zone");
    await expect(page.getByText("Live for eligible customers", { exact: true })).toBeVisible();
    await confirmZoneAction("Suspend", "Suspend after controlled activation validation", "Suspend zone");
    await expect(page.getByRole("status")).toContainText("Zone suspend completed and recorded");

    await confirmZoneAction("Request review", "Review suspended zone before controlled reactivation", "Request review");
    await confirmZoneAction("Approve", "Approve suspended zone for controlled reactivation", "Approve zone");
    await confirmZoneAction("Activate", "Reactivate only to validate material change safety", "Activate zone");
    await page.getByLabel("Priority").last().fill("901");
    await confirmZoneAction("Save draft", "Change priority and require a fresh approval", "Save draft");
    await expect(page.getByText("Not live for zone-specific bookings", { exact: true })).toBeVisible();
    await expect(page.getByText("Current status").locator("..")).toContainText("draft");
    await expectCurrentMobilePage(page, "material zone edit returned to draft");

    const { data: zone, error: zoneError } = await admin.from("service_zones").select("id,active,operational_status,boundary_geojson").eq("code", zoneCode).single();
    if (zoneError) throw zoneError;
    expect(zone.active).toBe(false);
    expect(zone.operational_status).toBe("draft");
    expect(zone.boundary_geojson).toEqual(boundary);
    const [{ count: historyCount, error: historyError }, { data: auditRows, error: auditError }] = await Promise.all([
      admin.from("service_zone_change_history").select("id", { count: "exact", head: true }).eq("zone_id", zone.id).not("change_reason", "is", null),
      admin.from("audit_logs").select("action").eq("resource_type", "service_zone").eq("resource_id", zone.id),
    ]);
    if (historyError) throw historyError;
    if (auditError) throw auditError;
    expect(historyCount ?? 0).toBeGreaterThanOrEqual(9);
    expect((auditRows ?? []).map((row) => row.action)).toEqual(expect.arrayContaining(["service_zone.created", "service_zone.draft_saved", "service_zone.review", "service_zone.approve", "service_zone.activate", "service_zone.suspend"]));
  } finally {
    const { data: disposable } = await admin.from("service_zones").select("id").eq("code", zoneCode).maybeSingle();
    if (disposable?.id) {
      const cleanup = await admin.from("service_zones").delete().eq("id", disposable.id);
      if (cleanup.error) throw cleanup.error;
    }
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
  await expect(page.getByRole("heading", { name: "Automatic capacity is not ready" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage riders", exact: true })).toBeVisible();
  await expectCurrentMobilePage(page, "dispatch readiness summary");
  const addBike = page.locator("details").filter({ hasText: "Add a motorcycle" });
  await addBike.locator("summary").click();
  await expectCurrentMobilePage(page, "expanded motorcycle registration");
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
  await expectCurrentMobilePage(page, "expanded motorcycle assignment");
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
  await expect(page.getByRole("heading", { name: "Automatic capacity is available" })).toBeVisible();
  await expectCurrentMobilePage(page, "dispatch capacity available");

  await page.goto("/admin/run-operations");
  const runCreator = page.locator("details").filter({ hasText: "Create a compliant delivery run" }).first();
  await runCreator.locator("summary").click();
  await expectCurrentMobilePage(page, "expanded delivery-run creation");
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

test("staff invitation, identity approval and trusted role routing complete on mobile", async ({ page }) => {
  test.skip(canUseProvisioner, "Invitation email acceptance runs only against the isolated local Supabase mailbox");
  test.setTimeout(240_000);
  const intendedRole = test.info().project.name === "mobile-375" ? "admin" : "rider";
  const email = `mobile-invite-${intendedRole}-${Date.now()}@example.com`;
  const password = `Invite-${randomBytes(18).toString("base64url")}!Aa1`;

  await authenticateSuperAdmin(page);
  const teamResponse = await page.goto("/admin/team");
  expect(teamResponse?.status(), "team management should load after Super Admin MFA").toBeLessThan(400);
  await expect(page).toHaveURL(/\/admin\/team(?:\?|$)/);
  await expect(page.getByRole("heading", { level: 1, name: "Team management" })).toBeVisible();
  const invitePanel = page.locator("details").filter({ hasText: "Invite a team member" }).first();
  await invitePanel.locator(":scope > summary").click();
  await invitePanel.getByLabel("Work email").fill(email);
  await invitePanel.getByLabel("Role").selectOption(intendedRole);
  if (intendedRole === "admin") {
    const permissionPanel = invitePanel.locator("details").filter({ hasText: "Choose administrator permissions" });
    await permissionPanel.locator("summary").click();
    await permissionPanel.locator('input[type="checkbox"][value="staff.view"]').check();
  }
  const invitationResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/team/invitations") && response.request().method() === "POST");
  await invitePanel.getByRole("button", { name: new RegExp(`Send ${intendedRole} invitation`, "i") }).click();
  expect((await invitationResponse).status()).toBe(201);
  await expect(page.getByRole("status")).toContainText(`${intendedRole === "admin" ? "Admin" : "Rider"} invitation prepared`);
  await expect(page.getByRole("status")).toContainText("Access stays inactive until the invitation is accepted and a Super Admin completes the approval");
  await expectCurrentMobilePage(page, "staff invitation confirmation");

  const { data: invitation, error: invitationError } = await admin.from("staff_invitations")
    .select("id,auth_user_id,status")
    .eq("email", email)
    .single();
  if (invitationError || !invitation?.auth_user_id) throw invitationError ?? new Error("Invitation record was not created");
  invitedAccounts.push({ id: invitation.auth_user_id, email, password, role: intendedRole });
  expect(invitation.status).toBe("sent");

  const invitationLink = await waitForLocalInvitationLink(email);
  await page.goto(invitationLink);
  await expect(page).toHaveURL(/\/staff\/setup(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Secure your Dovid account" })).toBeVisible();
  await expectCurrentMobilePage(page, `${intendedRole} invitation setup`, false);
  await expect(page.getByLabel("Current password")).toHaveCount(0);
  await expect(page.getByLabel("Staff onboarding progress")).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(password);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated securely");
  await page.getByLabel("First name").fill("Mobile");
  await page.getByLabel("Last name").fill(intendedRole === "admin" ? "Administrator" : "Rider");
  await page.getByLabel("Preferred name (optional)").fill(intendedRole === "admin" ? "Mobi Admin" : "Mobi Rider");
  if (intendedRole === "rider") await page.getByLabel("Mobile phone").fill("08012345678");
  await page.getByRole("button", { name: "Save details and confirm invitation" }).click();
  await expect(page.getByRole("heading", { name: "Invitation confirmed" })).toBeVisible();
  await expect(page.getByText("You do not need multifactor authentication.")).toBeVisible();
  await expectCurrentMobilePage(page, `${intendedRole} awaiting approval`, false);

  const { data: pendingMembership, error: pendingMembershipError } = await admin.from("staff_memberships")
    .select("staff_role,status")
    .eq("user_id", invitation.auth_user_id)
    .single();
  if (pendingMembershipError) throw pendingMembershipError;
  expect(pendingMembership).toEqual({ staff_role: intendedRole, status: "pending" });

  await clearBrowserSession(page);
  await authenticateSuperAdmin(page);
  await page.goto("/admin/team");
  const memberCard = page.locator("details").filter({ hasText: email }).first();
  await memberCard.locator(":scope > summary").click();
  await expect(memberCard).toContainText("Pending");
  await memberCard.getByLabel("Verification method").fill("Controlled in-person identity check");
  await memberCard.getByLabel("Verification reference").fill(`E2E-${intendedRole}-${test.info().project.name}`);
  await memberCard.getByLabel("Activation reason").fill("Controlled mobile onboarding acceptance completed");
  await memberCard.getByRole("button", { name: "Approve and activate" }).click();
  await expect(page.getByRole("status")).toContainText("Staff access activated");
  await expectCurrentMobilePage(page, `${intendedRole} activation confirmation`);

  await clearBrowserSession(page);
  await login(page, invitedAccounts.at(-1)!, intendedRole === "admin" ? /\/admin(?:\?|$)/ : /\/rider(?:\?|$)/);
  await expect(page).not.toHaveURL(/\/staff\/mfa/);
  await expect(page.getByRole("heading", { level: 1, name: intendedRole === "admin" ? "Admin Dashboard" : "Rider Dashboard" })).toBeVisible();
  await expectCurrentMobilePage(page, `${intendedRole} trusted role workspace`);

  const { data: activeMembership, error: activeMembershipError } = await admin.from("staff_memberships")
    .select("staff_role,status,identity_verified_at,identity_verification_method")
    .eq("user_id", invitation.auth_user_id)
    .single();
  if (activeMembershipError) throw activeMembershipError;
  expect(activeMembership.staff_role).toBe(intendedRole);
  expect(activeMembership.status).toBe("active");
  expect(activeMembership.identity_verified_at).toBeTruthy();
  expect(activeMembership.identity_verification_method).toBe("Controlled in-person identity check");
});

test("Super Admin completes MFA and controls promotions and immutable rate-card drafts on mobile", async ({ page }) => {
  test.skip(canUseProvisioner, "The deployed provisioner intentionally cannot create Super Admin identities");
  test.setTimeout(240_000);
  await authenticateSuperAdmin(page);
  await expect(page.getByRole("heading", { name: "Super Admin Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not ready for real deliveries" })).toBeVisible();
  await expect(page.getByText("0 free slots")).toBeVisible();
  await expect(page.getByText(/Physical checks and founder approval must still be completed outside the software/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare motorcycles" })).toBeVisible();
  await expectCurrentMobilePage(page, "Super Admin launch readiness");

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

test("rider completes a paid pickup and handover with proof on mobile", async ({ page }) => {
  test.skip(!canUseAdminClient, "The full rider handover fixture runs only against the isolated local Supabase stack");
  test.setTimeout(240_000);
  const fixture = await createRiderFixture();
  const rider = accounts.find((item) => item.role === "rider")!;
  await login(page, rider, /\/rider(?:\?|$)/);
  await page.goto(`/rider/orders/${fixture.orderId}`);
  await expect(page.getByText(/Release the parcel only when payment status is paid/)).toBeVisible();
  await expectCurrentMobilePage(page, "rider paid-delivery operations");

  const costSection = page.locator("details").filter({ hasText: "Request an additional cost" });
  await costSection.locator("summary").click();
  await costSection.getByLabel("Cost type").selectOption("toll_road_access");
  await costSection.getByLabel("Amount (NGN)").fill("500");
  await costSection.getByLabel("What happened?").fill("Controlled toll-road acceptance expense");
  await costSection.getByRole("button", { name: "Send cost for review" }).click();
  await expect(page.getByRole("status")).toContainText("did not mark the delivery as failed");
  await page.getByRole("button", { name: "Dismiss message" }).click();

  for (const [button, next] of [
    ["Start pickup journey", "Confirm pickup"],
    ["Confirm pickup", "Start delivery journey"],
    ["Start delivery journey", "Arrived at destination"],
  ] as const) {
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByRole("button", { name: next })).toBeVisible();
  }
  await page.getByRole("button", { name: "Arrived at destination" }).click();
  await expect(page.getByText("Waiting time", { exact: true })).toBeVisible();
  await expect(page.getByText(/of free waiting time remains/)).toBeVisible();
  await page.getByRole("button", { name: "Stop waiting timer" }).click();
  await expect(page.getByRole("status")).toContainText("Waiting time recorded");
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await expect(page.getByRole("heading", { name: "Confirm the recipient before handover" })).toBeVisible();
  await expectCurrentMobilePage(page, "rider handover confirmation");
  await page.getByLabel("Handover notes (optional)").fill("Recipient checked the controlled parcel");
  await page.getByLabel(/I checked the recipient's identity/).check();
  await page.getByRole("button", { name: "Record recipient confirmation" }).click();
  await expect(page.getByRole("heading", { name: "Recipient confirmation recorded" })).toBeVisible();
  await expectCurrentMobilePage(page, "recorded recipient confirmation");
  await page.getByRole("button", { name: "Complete delivery" }).click();
  await expect.poll(async () => {
    const { data } = await admin.from("delivery_orders").select("delivery_status").eq("id", fixture.orderId).single();
    return data?.delivery_status;
  }).toBe("delivered");
  await expect(page.getByText("delivered", { exact: true }).first()).toBeVisible();
  await expectCurrentMobilePage(page, "completed rider delivery");
  const [{ count: proofCount }, { count: handoverCount }, { count: expenseCount }] = await Promise.all([
    admin.from("delivery_proofs").select("id", { count: "exact", head: true }).eq("order_id", fixture.orderId),
    admin.from("parcel_custody_events").select("id", { count: "exact", head: true }).eq("order_id", fixture.orderId).eq("event_type", "handover_completed"),
    admin.from("delivery_expense_reports").select("id", { count: "exact", head: true }).eq("order_id", fixture.orderId),
  ]);
  expect(proofCount).toBe(1);
  expect(handoverCount).toBe(1);
  expect(expenseCount).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("rider reports a missed delivery and completes an authorized return on mobile", async ({ page }) => {
  test.skip(!canUseAdminClient, "The full rider return fixture runs only against the isolated local Supabase stack");
  test.setTimeout(240_000);
  const fixture = await createRiderFixture({ withRun: true });
  const rider = accounts.find((item) => item.role === "rider")!;
  const administrator = accounts.find((item) => item.role === "admin")!;
  await login(page, rider, /\/rider(?:\?|$)/);
  await page.goto(`/rider/orders/${fixture.orderId}`);
  await page.getByRole("button", { name: "Start pickup journey" }).click();
  await expect(page.getByRole("button", { name: "Confirm pickup" })).toBeVisible();
  const failureSection = page.locator("details").filter({ hasText: "Could not deliver this parcel" });
  await failureSection.locator("summary").click();
  await failureSection.getByLabel("What stopped the delivery?").selectOption("recipient_unavailable");
  await failureSection.getByLabel("What happened?").fill("Recipient could not be reached at the address");
  await failureSection.getByLabel("Private notes for dispatch").fill("Called twice using the verified delivery number");
  await expectCurrentMobilePage(page, "rider missed-delivery report");
  await failureSection.getByRole("button", { name: "Send issue to dispatch" }).click();
  await expect(page.getByRole("status")).toContainText("Delivery issue recorded");

  await expect.poll(async () => {
    const { data } = await admin.from("delivery_attempts").select("id,status").eq("order_id", fixture.orderId).maybeSingle();
    return data?.status;
  }).toBe("recipient_unavailable");

  await page.getByLabel("Open Rider workspace menu").click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await login(page, administrator, /\/admin(?:\?|$)/);
  await page.goto("/admin/run-operations");
  const attemptCard = page.locator("details").filter({ hasText: `DOV-RIDER-${fixture.orderId.slice(0, 8).toUpperCase()}` }).last();
  await attemptCard.locator("summary").click();
  await expectCurrentMobilePage(page, "admin failed-delivery resolution");
  await attemptCard.getByLabel("What should happen next?").selectOption("return_to_sender");
  await attemptCard.getByLabel("Who caused the failed attempt?").selectOption("customer");
  await attemptCard.getByLabel("Decision reason and verification evidence").fill("Controlled return authorized after verified missed delivery");
  await attemptCard.getByRole("button", { name: "Save reviewed resolution" }).click();
  await expect(page.getByRole("status")).toContainText("separate approval and verified payment");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));

  await page.getByLabel("Open Dovid admin menu").click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await login(page, rider, /\/rider(?:\?|$)/);
  await page.goto(`/rider/orders/${fixture.orderId}`);
  await expect(page.getByText("Return authorized by dispatch", { exact: false })).toBeVisible();
  await expectCurrentMobilePage(page, "rider authorized return");
  await page.getByLabel("Return notes (optional)").fill("Sender checked the parcel condition");
  await page.getByRole("button", { name: "Confirm parcel returned" }).click();
  await expect.poll(async () => {
    const { data } = await admin.from("delivery_orders").select("delivery_status").eq("id", fixture.orderId).single();
    return data?.delivery_status;
  }).toBe("cancelled");
  const [{ count: returnCount }, { data: runAssignment }] = await Promise.all([
    admin.from("parcel_custody_events").select("id", { count: "exact", head: true }).eq("order_id", fixture.orderId).eq("event_type", "returned_to_sender"),
    admin.from("run_assignments").select("status,released_at").eq("order_id", fixture.orderId).single(),
  ]);
  expect(returnCount).toBe(1);
  expect(runAssignment?.status).toBe("returned");
  expect(runAssignment?.released_at).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});
