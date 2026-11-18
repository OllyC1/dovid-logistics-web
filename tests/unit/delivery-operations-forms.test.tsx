// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DeliveryOperationsForms } from "@/components/rider/delivery-operations-forms";

afterEach(cleanup);

describe("DeliveryOperationsForms", () => {
  it("keeps normal delivery controls available before a return is authorized", () => {
    render(<DeliveryOperationsForms orderId="order-1" runId="run-1" />);

    expect(screen.getByRole("heading", { name: "Report an operating expense" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Report a failed or missed attempt" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recipient waiting timer" })).toBeTruthy();
  });

  it("removes receiver-only actions while a parcel is returning to its sender", () => {
    render(<DeliveryOperationsForms orderId="order-1" runId="run-1" returnInProgress />);

    expect(screen.getByRole("heading", { name: "Report an operating expense" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Report a failed or missed attempt" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recipient waiting timer" })).toBeNull();
    expect(screen.getByRole("option", { name: "Return journey" })).toBeTruthy();
  });
});
