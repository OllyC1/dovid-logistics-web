// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { afterEach } from "vitest";
import { ActionFeedback } from "@/components/ui/action-feedback";

afterEach(cleanup);

describe("ActionFeedback", () => {
  it("announces an in-progress action immediately", () => {
    render(<ActionFeedback feedback={null} pending pendingText="Updating dispatch…" />);
    expect(screen.getByRole("status").textContent).toContain("Updating dispatch…");
  });

  it("announces errors assertively and can be dismissed", () => {
    const onDismiss = vi.fn();
    render(<ActionFeedback feedback={{ text: "Check your connection and try again.", ok: false }} onDismiss={onDismiss} />);
    expect(screen.getByRole("alert").textContent).toContain("Check your connection");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("keeps success feedback available to assistive technology", () => {
    render(<ActionFeedback feedback={{ text: "Delivery run completed and audited.", ok: true }} />);
    const feedback = screen.getByRole("status");
    expect(feedback.textContent).toContain("completed and audited");
    expect(feedback.className).toContain("pointer-events-none");
    expect(feedback.className).toContain("z-[70]");
  });

  it("leaves only its explicit dismiss control interactive", () => {
    render(<ActionFeedback feedback={{ text: "Saved.", ok: true }} onDismiss={() => undefined} />);
    expect(screen.getByRole("button", { name: "Dismiss message" }).className).toContain("pointer-events-auto");
  });
});
