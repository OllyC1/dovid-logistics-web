// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReturnToSenderForm } from "@/components/rider/return-to-sender-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

describe("ReturnToSenderForm", () => {
  it("shows a mobile-friendly custody confirmation with the known sender", () => {
    render(<ReturnToSenderForm orderId="order-1" expectedSenderName="Bola Sender" />);
    expect(screen.getByRole("heading", { name: "Complete the return to sender" })).toBeTruthy();
    const recipient = screen.getByLabelText("Name of person accepting the return") as HTMLInputElement;
    expect(recipient.value).toBe("Bola Sender");
    expect(recipient.required).toBe(true);
    expect(screen.getByRole("button", { name: "Confirm parcel returned" })).toBeTruthy();
    expect(screen.getByText(/Dispatch has authorized this return/i)).toBeTruthy();
  });
});
