// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivateRateCardButton } from "@/components/admin/activate-rate-card-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("ActivateRateCardButton", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requires and sends an auditable approval reason", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ active: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    render(<ActivateRateCardButton id="rate-card-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Activate rate card" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Operational reason"), { target: { value: "Founder approved the reviewed Ibadan standard rate." } });
    fireEvent.click(confirm);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual({ reason: "Founder approved the reviewed Ibadan standard rate." });
    expect((await screen.findByRole("status")).textContent).toContain("recorded in pricing history");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
