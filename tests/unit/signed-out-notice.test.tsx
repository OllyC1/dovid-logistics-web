// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SignedOutNotice } from "@/components/account/signed-out-notice";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("SignedOutNotice", () => {
  it("confirms sign-out and removes the one-time URL marker", async () => {
    window.history.replaceState(null, "", "/?signedOut=1");
    render(<SignedOutNotice />);

    expect(await screen.findByText("You’re signed out. See you again soon.")).toBeTruthy();
    await waitFor(() => expect(window.location.search).toBe(""));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(screen.queryByText("You’re signed out. See you again soon.")).toBeNull();
  });

  it("renders server-provided sign-out success immediately", () => {
    render(<SignedOutNotice initialStatus="success" />);
    expect(screen.getByText("You’re signed out. See you again soon.")).toBeTruthy();
  });

  it("does not claim success when sign-out could not be confirmed", () => {
    render(<SignedOutNotice initialStatus="error" />);
    expect(screen.getByRole("alert").textContent).toContain("couldn’t confirm sign-out");
  });
});
