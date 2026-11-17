// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReasonDialog } from "@/components/ui/reason-dialog";

describe("ReasonDialog", () => {
  it("requires an auditable reason and submits it from a mobile-friendly dialog", () => {
    const onConfirm = vi.fn();
    render(<ReasonDialog open title="Suspend this account?" description="Record the verified reason." confirmLabel="Suspend account" pending={false} onCancel={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByRole("dialog", { name: "Suspend this account?" })).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Suspend account" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Operational reason"), { target: { value: "Identity review completed" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith("Identity review completed");
  });
});
