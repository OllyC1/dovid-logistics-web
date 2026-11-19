// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ApplicationError from "@/app/error";
import Loading from "@/app/loading";
import NotFound from "@/app/not-found";

afterEach(cleanup);

describe("application recovery states", () => {
  it("shows an immediate accessible loading state", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { name: "Loading your page…" })).toBeVisible();
  });

  it("lets a customer retry an unexpected route failure", () => {
    const retry = vi.fn();
    render(<ApplicationError error={new Error("internal detail")} retry={retry} />);
    expect(screen.queryByText("internal detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("offers useful destinations from a missing page", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "We cannot find that page" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Book a delivery" })).toHaveAttribute("href", "/book");
    expect(screen.getByRole("link", { name: "Track a delivery" })).toHaveAttribute("href", "/track");
  });
});
