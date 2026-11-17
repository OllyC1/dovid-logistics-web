import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dispatch mobile layout", () => {
  const source = readFileSync("src/components/admin/dispatch-console.tsx", "utf8");
  const runSource = readFileSync("src/components/admin/run-operations-console.tsx", "utf8");
  const rateCardsSource = readFileSync("src/app/(admin)/admin/rate-cards/page.tsx", "utf8");
  const riderOperationsSource = readFileSync("src/components/rider/delivery-operations-forms.tsx", "utf8");
  const provisionerSource = readFileSync("src/app/api/internal/e2e/accounts/route.ts", "utf8");

  it("stacks dense bike controls before the small-screen breakpoint", () => {
    expect(source).not.toContain('className="grid grid-cols-2 gap-3"');
    expect(source).not.toContain('className="grid grid-cols-3 gap-2"');
    expect(source).toContain('className="grid gap-3 sm:grid-cols-2"');
    expect(source).toContain('className="grid gap-3 sm:grid-cols-3"');
  });

  it("keeps cargo measurements labelled for touch and assistive technology", () => {
    expect(source).toContain("Cargo space in millimetres");
    expect(source).toContain(">Length<input");
    expect(source).toContain(">Width<input");
    expect(source).toContain(">Height<input");
  });

  it("keeps route controls below long stop addresses on narrow screens", () => {
    expect(runSource).toContain('grid-cols-[auto_minmax(0,1fr)]');
    expect(runSource).toContain('className="col-start-2 flex flex-wrap gap-2"');
    expect(runSource).toContain("Move up");
    expect(runSource).toContain("Move down");
  });

  it("renders saved rate bands as cards instead of a scrolling table on mobile", () => {
    expect(rateCardsSource).toContain('className="mt-5 grid gap-3 sm:hidden"');
    expect(rateCardsSource).toContain('className="mt-5 hidden overflow-x-auto sm:block"');
    expect(rateCardsSource).toContain("Beyond-band rate");
  });

  it("uses field-friendly units while preserving server units", () => {
    expect(riderOperationsSource).toContain('name="amountNaira"');
    expect(riderOperationsSource).toContain('Number(form.get("amountNaira")) * 100');
    expect(riderOperationsSource).toContain('name="waitingMinutes"');
    expect(riderOperationsSource).toContain('Number(form.get("waitingMinutes") || 0) * 60');
    expect(riderOperationsSource).not.toContain('placeholder="Amount in kobo"');
    expect(riderOperationsSource).not.toContain('placeholder="Waiting time in seconds"');
  });

  it("keeps authenticated test provisioning short-lived and origin-bound", () => {
    expect(provisionerSource).toContain("E2E_ACCOUNT_PROVISIONING_EXPIRES_AT");
    expect(provisionerSource).toContain("remainingMs > 60 * 60 * 1000");
    expect(provisionerSource).toContain("publicEnv.NEXT_PUBLIC_APP_URL");
    expect(provisionerSource).toContain('request.headers.get("host")');
    expect(provisionerSource).toContain('request.headers.get("x-forwarded-host")');
    expect(provisionerSource).toContain("requestHosts.includes(expectedHost)");
    expect(provisionerSource).toContain("Buffer.byteLength(expected) < 32");
  });
});
