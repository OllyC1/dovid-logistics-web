// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UnsupportedBrowserNotice } from "@/app/layout";

afterEach(cleanup);

describe("UnsupportedBrowserNotice", () => {
  it("stays out of the supported-browser UI and provides plain-CSS recovery actions", () => {
    const { container } = render(<UnsupportedBrowserNotice />);

    expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("Please update your browser");
    expect(screen.getByRole("link", { name: "Update Chrome on Android", hidden: true })).toHaveAttribute(
      "href",
      "https://play.google.com/store/apps/details?id=com.android.chrome",
    );
    expect(screen.getByRole("link", { name: "Get help on WhatsApp", hidden: true })).toHaveAttribute(
      "href",
      "https://wa.me/2347072232323",
    );
    expect(screen.getByRole("link", { name: "Call Dovid Logistics", hidden: true })).toHaveAttribute(
      "href",
      "tel:+2347072232323",
    );

    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("@supports not ((color: oklch(50% 0.1 30)) and (font-size: 1cap))");
    expect(css).toContain("top: 0");
    expect(css).toContain("right: 0");
    expect(css).toContain("bottom: 0");
    expect(css).toContain("left: 0");
    expect(css).not.toContain("inset: 0");
    expect(css).toContain("min-height: 52px");
  });
});
