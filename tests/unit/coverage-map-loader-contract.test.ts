import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("coverage map loader", () => {
  it("uses Google's asynchronous Maps JavaScript loading mode", () => {
    const source = readFileSync("src/components/admin/coverage-editor.tsx", "utf8");
    expect(source).toContain("&loading=async");
  });
  it("fits the selected saved boundary into the map viewport", () => {
    const source = readFileSync("src/components/admin/coverage-editor.tsx", "utf8");
    expect(source).toContain("fitBoundary.current = true");
    expect(source).toContain("map.current.fitBounds(bounds, 48)");
  });
});
