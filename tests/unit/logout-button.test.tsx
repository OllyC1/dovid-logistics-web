// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const formStatus = vi.hoisted(() => vi.fn());
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: formStatus,
}));

import { LogoutButton } from "@/components/account/logout-button";

beforeEach(() => formStatus.mockReturnValue({ pending: false }));
afterEach(() => {
  cleanup();
  formStatus.mockReset();
});

describe("LogoutButton", () => {
  it("is a mobile-sized submit action", () => {
    render(<LogoutButton />);
    const button = screen.getByRole("button", { name: "Log out" });
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.className).toContain("min-h-12");
  });

  it("announces progress and prevents repeat submissions", () => {
    formStatus.mockReturnValue({ pending: true });
    render(<LogoutButton />);
    const button = screen.getByRole("button", { name: "Signing out…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});
